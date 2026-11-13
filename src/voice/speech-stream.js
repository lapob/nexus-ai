/**
 * @module voice/speech-stream
 * @description Inoltro al renderer dei blocchi audio di una sintesi in streaming.
 * Ogni blocco è una WAV PCM autonoma legata a uno streamId scelto dal renderer:
 * il player li accoda senza pause e scarta quelli di stream ormai interrotti.
 */

const STREAM_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

// #region Relay dei blocchi

/** Restituisce null se lo streaming non è stato richiesto o l'id non è valido. */
function createChunkRelay({ stream, streamId, send }) {
  if (stream !== true || !STREAM_ID.test(String(streamId || '')) || typeof send !== 'function') return null;
  let seq = 0;
  return {
    get count() { return seq; },
    onChunk(chunk) {
      const audio = chunk?.audio;
      if (!Buffer.isBuffer(audio) && !(audio instanceof Uint8Array)) return;
      if (audio.byteLength <= 44 || audio.byteLength > MAX_CHUNK_BYTES) return;
      send({ streamId, seq: seq++, mimeType: 'audio/wav', audio });
    }
  };
}

/** Se almeno un blocco è partito, la risposta non ripete l'audio già inviato. */
async function synthesizeWithRelay({ synthesize, relay, options }) {
  const result = await synthesize(relay ? { ...options, onChunk: relay.onChunk } : options);
  if (relay && relay.count > 0) return { backend: result?.backend || null, mimeType: 'audio/wav', streamed: true, chunks: relay.count };
  return result;
}

// #endregion

module.exports = { STREAM_ID, MAX_CHUNK_BYTES, createChunkRelay, synthesizeWithRelay };
