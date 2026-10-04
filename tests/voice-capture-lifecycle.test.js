/** @module tests/voice-capture-lifecycle
 * @description Stop and overlapping microphone requests release only their own streams.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

function fixture() {
  const requests = [];
  let contexts = 0;
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContext {
    constructor() { contexts++; this.state = 'running'; this.sampleRate = 48_000; }
    createAnalyser() { return { ...node(), frequencyBinCount: 512,
      getByteFrequencyData(data) { data.fill(0); }, getByteTimeDomainData(data) { data.fill(128); } }; }
    createMediaStreamSource() { return node(); }
    createScriptProcessor() { return node(); }
    createGain() { return { ...node(), gain: { value: 0 } }; }
    async close() { this.state = 'closed'; }
  }
  const source = fs.readFileSync(require.resolve('../src/renderer/systems/VoiceRecognition.ts'), 'utf8')
    .replace("import { normalizedVoiceLevel, smoothVoiceLevel, trimVoiceSignal } from './AudioEnvelope';",
      "const { normalizedVoiceLevel, smoothVoiceLevel, trimVoiceSignal } = require('./AudioEnvelope');")
    .replace('export class VoiceRecognition', 'class VoiceRecognition');
  const code = stripTypeScriptTypes(source) + '\nexports.VoiceRecognition = VoiceRecognition;';
  const exports = {};
  vm.runInNewContext(code, { exports, AudioContext, Uint8Array, Float32Array,
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => requests.push(resolve)) } },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    require: () => ({ normalizedVoiceLevel: () => 0, smoothVoiceLevel: () => 0, trimVoiceSignal: input => input }) });
  const stream = () => {
    let stops = 0;
    return { getTracks: () => [{ stop: () => { stops++; } }], stops: () => stops };
  };
  return { voice: new exports.VoiceRecognition(), requests, stream, contexts: () => contexts };
}

test('Stop before microphone permission resolves releases the late stream without creating WebAudio', async () => {
  const f = fixture();
  const pending = f.voice.start();
  await f.voice.stop();
  const stale = f.stream();
  f.requests[0](stale);
  await pending;
  assert.equal(stale.stops(), 1);
  assert.equal(f.contexts(), 0);
  assert.equal(f.voice.stream, null);
});

test('an older request cannot replace or stop the microphone of a newer activation', async () => {
  const f = fixture();
  const older = f.voice.start();
  const newer = f.voice.start();
  const active = f.stream();
  f.requests[1](active);
  await newer;
  const stale = f.stream();
  f.requests[0](stale);
  await older;
  assert.equal(stale.stops(), 1);
  assert.equal(active.stops(), 0);
  assert.equal(f.voice.stream, active);
  assert.equal(f.contexts(), 1);
  await f.voice.stop();
  assert.equal(active.stops(), 1);
});
