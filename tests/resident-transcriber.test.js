const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ResidentTranscriber, verifyResidentFiles, detectedLanguage } = require('../src/voice/resident-transcriber');

function wave() {
  const audio = Buffer.alloc(32044); audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(32000, 40); return audio;
}
function fixture(t, overrides = {}) {
  const launches = [], calls = [], children = []; let terminated = 0;
  const candidate = new ResidentTranscriber({ directory: path.resolve('vendor/whisper/windows-x64'),
    verify: async directory => directory, allocatePort: async () => 44800, isPortFree: async () => true,
    spawn(executable, args, options) {
      launches.push({ executable, args, options }); const child = new EventEmitter();
      children.push(child); return child;
    },
    terminate(child) { ++terminated; queueMicrotask(() => child.emit('exit', 0)); },
    request: async (url, options) => {
      calls.push({ url, options });
      return Response.json(url.endsWith('/health') ? { status: 'ok' } : { text: 'Descrivimi il sistema solare.', language: 'italian' });
    }, ...overrides });
  t.after(() => candidate.shutdown());
  return { candidate, launches, calls, children, get terminated() { return terminated; } };
}

test('resident reuses one owned CPU context and only sends bounded audio/language', async t => {
  const f = fixture(t);
  assert.equal(await f.candidate.warmUp(), true);
  for (let i = 0; i < 2; ++i) {
    const result = await f.candidate.transcribeAudio({ audio: wave(), language: 'auto', prompt: 'private' });
    assert.equal(result.language, 'it'); assert.equal(result.confidence, null);
  }
  assert.equal(f.launches.length, 1);
  assert.ok(f.launches[0].args.includes('-ng'));
  assert.ok(!f.launches[0].args.includes('--convert'));
  assert.deepEqual([...f.calls[1].options.body.keys()], ['file', 'language', 'response_format']);
  assert.equal(f.calls[1].options.body.get('file').name, 'audio.wav');
  assert.equal(f.calls[1].options.redirect, 'error');
  assert.match(f.calls[0].url, /^http:\/\/127\.0\.0\.1:44800\/[a-f0-9]{64}\/health$/);
  assert.doesNotMatch(JSON.stringify(f.candidate.state()), /127\.0\.0\.1|[a-f0-9]{64}/);
});

test('invalid PCM and languages fail before starting a runtime', async t => {
  const f = fixture(t), invalid = wave(); invalid.writeUInt16LE(2, 22);
  for (const audio of [Buffer.alloc(44), invalid, Buffer.alloc(2000001)]) {
    await assert.rejects(f.candidate.transcribeAudio({ audio }), { code: 'VOICE_INVALID_AUDIO' });
  }
  await assert.rejects(f.candidate.transcribeAudio({ audio: wave(), language: '../it' }), { code: 'VOICE_INVALID_LANGUAGE' });
  assert.equal(f.launches.length, 0);
});

test('foreground joins preparation without a second decoder', async t => {
  let release;
  const f = fixture(t, { verify: () => new Promise(resolve => { release = resolve; }) });
  const warm = f.candidate.warmUp();
  const request = f.candidate.transcribeAudio({ audio: wave() });
  await assert.rejects(f.candidate.transcribeAudio({ audio: wave() }), { code: 'VOICE_BUSY' });
  release(path.resolve('vendor/whisper/windows-x64')); await warm; await request;
  assert.equal(f.launches.length, 1);
});

test('abort waits for native death; later turns receive a fresh secret and context', async t => {
  let entered; const ready = new Promise(resolve => { entered = resolve; });
  const f = fixture(t, { request: async (url, options) => {
    if (url.endsWith('/health')) return Response.json({ status: 'ok' });
    entered(); return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const controller = new AbortController();
  const pending = f.candidate.transcribeAudio({ audio: wave(), signal: controller.signal });
  await ready; controller.abort(); await assert.rejects(pending, { code: 'VOICE_CANCELLED' });
  assert.equal(f.terminated, 1); assert.equal(f.candidate.state().ready, false);
  assert.equal(await f.candidate.warmUp(), true); assert.equal(f.launches.length, 2);
  assert.notEqual(f.launches[0].options.env.LLAMA_API_KEY, f.launches[1].options.env.LLAMA_API_KEY);
});

test('unconfirmed termination blocks another runtime instead of spawning duplicates', async t => {
  const f = fixture(t, { stopMs: 60, terminate: () => {} });
  await f.candidate.warmUp();
  await assert.rejects(f.candidate.shutdown(), { code: 'VOICE_STOP_FAILED' });
  await assert.rejects(f.candidate.warmUp(), { code: 'VOICE_STOP_FAILED' }); assert.equal(f.launches.length, 1);
  // Permit the test fixture to confirm termination for its final cleanup.
  f.children[0].emit('close', 0);
});

test('shutdown during hashing cannot revive a late process', async t => {
  let release; const f = fixture(t, { verify: () => new Promise(resolve => { release = resolve; }) });
  const starting = f.candidate.warmUp(), stopping = f.candidate.shutdown();
  release(path.resolve('vendor/whisper/windows-x64')); await Promise.all([starting, stopping]);
  assert.equal(f.launches.length, 0);
  await assert.rejects(f.candidate.transcribeAudio({ audio: wave() }), { code: 'VOICE_CANCELLED' });
});

test('malformed or oversized native responses close the owned process', async t => {
  for (const response of [Response.json({ text: 42 }), Response.json({ text: 'x'.repeat(70000) }), new Response('<html>bad</html>')]) {
    const f = fixture(t, { request: async url => url.endsWith('/health') ? Response.json({ status: 'ok' }) : response });
    await assert.rejects(f.candidate.transcribeAudio({ audio: wave() }), { code: 'VOICE_INVALID_RESULT' });
    assert.equal(f.terminated, 1);
  }
});

test('no speech does not force expensive model reload; unknown confidence/language stay unknown', async t => {
  const f = fixture(t, { request: async url => Response.json(url.endsWith('/health') ? { status: 'ok' } : { text: '[silence]' }) });
  await assert.rejects(f.candidate.transcribeAudio({ audio: wave() }), { code: 'VOICE_NO_SPEECH' });
  assert.equal(f.terminated, 0); assert.equal(f.candidate.state().ready, true);
  assert.equal(detectedLanguage('italian', 'auto'), 'it');
  assert.equal(detectedLanguage('invented', 'auto'), 'und');
  assert.equal(detectedLanguage('english', 'it-IT'), 'it');
});

test('integrity checks reject substituted files and unknown dynamically loaded DLLs', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-asr-integrity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const digest = crypto.createHash('sha256').update('fixture').digest('hex');
  const policy = { residentFiles: { 'whisper-server.exe': digest, 'ggml.dll': digest }, model: { file: 'ggml-base.bin', sha256: digest } };
  for (const name of ['whisper-server.exe', 'ggml.dll', 'ggml-base.bin']) fs.writeFileSync(path.join(directory, name), 'fixture');
  assert.equal(await verifyResidentFiles(directory, undefined, policy), fs.realpathSync(directory));
  fs.writeFileSync(path.join(directory, 'ggml.dll'), 'substitution');
  await assert.rejects(verifyResidentFiles(directory, undefined, policy), { code: 'VOICE_INTEGRITY_FAILED' });
  fs.writeFileSync(path.join(directory, 'ggml.dll'), 'fixture'); fs.writeFileSync(path.join(directory, 'extra.dll'), 'fixture');
  await assert.rejects(verifyResidentFiles(directory, undefined, policy), { code: 'VOICE_INTEGRITY_FAILED' });
});
