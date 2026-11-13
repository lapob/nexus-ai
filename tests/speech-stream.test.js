const test = require('node:test');
const assert = require('node:assert/strict');
const { createChunkRelay, synthesizeWithRelay, MAX_CHUNK_BYTES } = require('../src/voice/speech-stream');
const { FallbackSpeechService, waveFromPcm } = require('../src/voice/qwen3-speech');
const { SpeechArbiter } = require('../src/voice/speech-arbiter');

const wav = (bytes = 960) => waveFromPcm(Buffer.alloc(bytes, 1), 24_000);

test('il relay si attiva solo con stream esplicito e un id valido', () => {
  const send = () => {};
  assert.equal(createChunkRelay({ stream: false, streamId: 'abcdefgh-1234', send }), null);
  assert.equal(createChunkRelay({ stream: true, streamId: '../../x', send }), null);
  assert.equal(createChunkRelay({ stream: true, streamId: 'short', send }), null);
  assert.ok(createChunkRelay({ stream: true, streamId: 'abcdefgh-1234', send }));
});

test('il relay numera i blocchi e scarta audio vuoto o troppo grande', () => {
  const sent = [];
  const relay = createChunkRelay({ stream: true, streamId: 'stream-0001', send: (payload) => sent.push(payload) });
  relay.onChunk({ audio: wav() });
  relay.onChunk({ audio: Buffer.alloc(10) });
  relay.onChunk({ audio: Buffer.alloc(MAX_CHUNK_BYTES + 1) });
  relay.onChunk({ audio: 'non-audio' });
  relay.onChunk({ audio: wav() });
  assert.deepEqual(sent.map((item) => [item.streamId, item.seq, item.mimeType]), [['stream-0001', 0, 'audio/wav'], ['stream-0001', 1, 'audio/wav']]);
  assert.equal(relay.count, 2);
});

test('con blocchi inviati la risposta non ripete l’audio; senza relay resta invariata', async () => {
  const relay = createChunkRelay({ stream: true, streamId: 'stream-0002', send: () => {} });
  const streamed = await synthesizeWithRelay({ relay, options: { text: 'ciao' },
    synthesize: async (request) => { request.onChunk({ audio: wav() }); return { backend: 'qwen3-tts', audio: wav(4000) }; } });
  assert.deepEqual(streamed, { backend: 'qwen3-tts', mimeType: 'audio/wav', streamed: true, chunks: 1 });
  const whole = await synthesizeWithRelay({ relay: null, options: { text: 'ciao' },
    synthesize: async (request) => { assert.equal(request.onChunk, undefined); return { backend: 'kokoro-onnx', audio: wav() }; } });
  assert.equal(whole.backend, 'kokoro-onnx');
  assert.ok(whole.audio);
});

function engine(name, behaviour) {
  return { calls: [], capabilities: () => ({ available: true, backend: name, languages: ['it'] }),
    async synthesize(options) { this.calls.push(options); return behaviour(options); }, stop() { return false; } };
}

test('in streaming Kokoro di ripiego consegna il segmento intero come blocco', async () => {
  const primary = engine('qwen3-tts', () => { throw new Error('GPU non disponibile'); });
  const fallback = engine('kokoro-onnx', () => ({ backend: 'kokoro-onnx', mimeType: 'audio/wav', audio: wav() }));
  const voice = new FallbackSpeechService({ primary, fallback });
  const chunks = [];
  await voice.synthesize({ text: 'ciao', language: 'it', onChunk: (chunk) => chunks.push(chunk) });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].backend, 'kokoro-onnx');
  assert.equal(fallback.calls[0].onChunk, undefined, 'Kokoro non riceve il callback');
});

test('se Qwen3 cade dopo aver già parlato non ripete la frase con Kokoro', async () => {
  const primary = engine('qwen3-tts', (options) => { options.onChunk({ audio: wav() }); throw new Error('worker terminato'); });
  const fallback = engine('kokoro-onnx', () => ({ backend: 'kokoro-onnx', audio: wav() }));
  const voice = new FallbackSpeechService({ primary, fallback });
  const chunks = [];
  await assert.rejects(voice.synthesize({ text: 'ciao', language: 'it', onChunk: (chunk) => chunks.push(chunk) }), /worker terminato/);
  assert.equal(chunks.length, 1);
  assert.equal(fallback.calls.length, 0);
});

test('l’arbitro inoltra il callback di streaming a ogni segmento in ordine', async () => {
  const order = [];
  const neural = engine('qwen3-tts', (options) => { order.push(options.text.length); options.onChunk?.({ audio: wav() }); return { backend: 'qwen3-tts', mimeType: 'audio/wav', audio: wav() }; });
  const arbiter = new SpeechArbiter({ neural });
  const relayed = [];
  const relay = createChunkRelay({ stream: true, streamId: 'stream-0003', send: (payload) => relayed.push(payload.seq) });
  const long = `${'Questa è una frase di prova abbastanza lunga. '.repeat(6)}Fine.`;
  const result = await synthesizeWithRelay({ relay, options: { text: long, language: 'it' }, synthesize: (request) => arbiter.synthesize(request) });
  assert.equal(result.streamed, true);
  assert.ok(order.length >= 2, 'il testo lungo è diviso in più segmenti');
  assert.deepEqual(relayed, order.map((_, index) => index));
});
