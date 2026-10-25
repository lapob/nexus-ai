/** @module voice/speech-segments Bounded complete speech without silent truncation. */
// #region Text boundaries
const MAX_SPEECH_TEXT = 4000;
const MAX_SPEECH_AUDIO = 16 * 1024 * 1024;

function speechChunks(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_SPEECH_TEXT) throw Object.assign(new Error('Testo vocale mancante o troppo lungo.'), { code: 'VOICE_TEXT_INVALID' });
  const chunks = [];
  while (text) {
    const limit = chunks.length ? 520 : 180;
    if (text.length <= limit) { chunks.push(text); break; }
    let end = 0;
    for (const match of text.slice(0, limit + 1).matchAll(/[.!?。！？;:]\s+/g)) if (match.index >= 60) end = match.index + 1;
    if (!end) end = text.lastIndexOf(' ', limit);
    if (end < 40) end = limit;
    if (/[\uD800-\uDBFF]/.test(text[end - 1])) --end;
    chunks.push(text.slice(0, end).trimEnd()); text = text.slice(end).trimStart();
  }
  return chunks;
}
// #endregion
// #region PCM assembly for clients that request one complete WAV
function pcmWave(audio) {
  const wave = Buffer.from(audio || []);
  if (wave.length < 44 || wave.length > MAX_SPEECH_AUDIO || wave.toString('ascii', 0, 4) !== 'RIFF'
    || wave.toString('ascii', 8, 12) !== 'WAVE' || wave.readUInt32LE(4) + 8 !== wave.length) throw new Error('Audio vocale non valido.');
  let format, data;
  for (let offset = 12; offset + 8 <= wave.length;) {
    const size = wave.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > wave.length) throw new Error('Audio vocale incompleto.');
    const name = wave.toString('ascii', offset, offset + 4);
    if (name === 'fmt ') { if (format || size < 16 || size > 64) throw new Error('Formato vocale non valido.'); format = wave.subarray(start, start + 16); }
    if (name === 'data') { if (data) throw new Error('Audio vocale ambiguo.'); data = wave.subarray(start, start + size); }
    offset = start + size + (size % 2);
  }
  if (!format || !data || !data.length || format.readUInt16LE(0) !== 1 || format.readUInt16LE(14) !== 16) throw new Error('Formato vocale PCM richiesto.');
  const channels = format.readUInt16LE(2), rate = format.readUInt32LE(4), align = format.readUInt16LE(12);
  if (channels < 1 || channels > 2 || rate < 8000 || rate > 96000 || align !== channels * 2
    || format.readUInt32LE(8) !== rate * align || data.length % align) throw new Error('Campioni vocali non validi.');
  return { format, data };
}

function joinSpeechWaves(results) {
  const parts = results.map(result => pcmWave(result.audio));
  if (!parts.length || parts.some(part => !part.format.equals(parts[0].format))) throw new Error('Formati vocali incompatibili.');
  const size = parts.reduce((sum, part) => sum + part.data.length, 0);
  if (size + 44 > MAX_SPEECH_AUDIO) throw new Error('Risposta vocale troppo grande.');
  const wave = Buffer.alloc(44); wave.write('RIFF'); wave.writeUInt32LE(size + 36, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); parts[0].format.copy(wave, 20); wave.write('data', 36); wave.writeUInt32LE(size, 40);
  return { ...results[0], audio: Buffer.concat([wave, ...parts.map(part => part.data)], size + 44) };
}

async function synthesizeSpeechSegments({ text, synthesize, cancelled = () => false, onChunk }) {
  const chunks = speechChunks(text), results = []; let bytes = 0;
  for (let index = 0; index < chunks.length; ++index) {
    if (cancelled()) throw Object.assign(new Error('Sintesi vocale annullata.'), { name: 'AbortError', code: 'VOICE_CANCELLED' });
    const result = await synthesize(chunks[index]);
    if (cancelled()) throw Object.assign(new Error('Sintesi vocale annullata.'), { name: 'AbortError', code: 'VOICE_CANCELLED' });
    bytes += Number(result?.audio?.byteLength || 0);
    if (bytes > MAX_SPEECH_AUDIO) throw new Error('Risposta vocale troppo grande.');
    if (onChunk) await onChunk(result, index);
    else results.push(result);
  }
  if (onChunk) return { streamed: true, segments: chunks.length };
  return results.length === 1 ? results[0] : joinSpeechWaves(results);
}
module.exports = { MAX_SPEECH_TEXT, MAX_SPEECH_AUDIO, pcmWave, speechChunks, joinSpeechWaves, synthesizeSpeechSegments };
// #endregion
