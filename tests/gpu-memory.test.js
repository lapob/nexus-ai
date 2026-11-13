const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { VramGate, evaluateVram, parseSnapshot, readWindowsSnapshot, requiredVramMb, windowsProbeScript } = require('../src/voice/gpu-memory');
const { createQwen3SpeechService, FallbackSpeechService } = require('../src/voice/qwen3-speech');

// Snapshots measured on the RX 9070 XT 16 GB, 12/11/2026.
const LLM_14B_32K = { totalMb: 16_304, usedMb: 14_122, sharedMb: 2_619, ownDedicatedMb: 0, ownSharedMb: 0 };
const LLM_10GB_WITH_TTS = { totalMb: 16_304, usedMb: 13_000, sharedMb: 260, ownDedicatedMb: 1_200, ownSharedMb: 20 };

test('la regola VRAM nega Qwen3 con qwen3:14b a 32K e lo ammette con un LLM da ~10 GB', () => {
  const spill = evaluateVram(LLM_14B_32K, requiredVramMb('gguf', '0.6b'));
  assert.equal(spill.allowed, false);
  assert.equal(spill.reason, 'spill');
  const ok = evaluateVram(LLM_10GB_WITH_TTS, requiredVramMb('gguf', '1.7b'));
  assert.equal(ok.allowed, true, 'la VRAM del worker stesso conta come disponibile');
  assert.equal(ok.freeMb, 4_504);
  const full = evaluateVram({ ...LLM_10GB_WITH_TTS, ownDedicatedMb: 0, usedMb: 15_000 }, requiredVramMb('gguf', '0.6b'));
  assert.deepEqual([full.allowed, full.reason], [false, 'full']);
  assert.equal(evaluateVram({ ...LLM_10GB_WITH_TTS, usedMb: 12_000 }, requiredVramMb('torch', '1.7b')).allowed, true);
  assert.equal(evaluateVram({ ...LLM_10GB_WITH_TTS, ownDedicatedMb: 0 }, requiredVramMb('torch', '1.7b')).allowed, false);
  assert.deepEqual(evaluateVram(null, 1_000), { allowed: true, reason: 'unknown' }, 'senza contatori non si blocca la voce');
  assert.equal(requiredVramMb('cuda', '7b'), requiredVramMb('torch', '0.6b'));
});

test('lo snapshot dei contatori viene validato', () => {
  assert.deepEqual(parseSnapshot(JSON.stringify(LLM_14B_32K)), LLM_14B_32K);
  assert.equal(parseSnapshot('not json'), null);
  assert.equal(parseSnapshot(JSON.stringify({ ...LLM_14B_32K, totalMb: 0 })), null);
  assert.equal(parseSnapshot(JSON.stringify({ ...LLM_14B_32K, usedMb: -1 })), null);
  assert.equal(parseSnapshot(JSON.stringify({ totalMb: 16_000 })), null);
  assert.match(windowsProbeScript(4242), /\$ids=@\(4242\)/);
  assert.match(windowsProbeScript('1; calc'), /\$ids=@\(0\)/, 'il PID entra nello script solo come intero');
});

test('la lettura Windows usa PowerShell senza profilo e tollera errori', async () => {
  const calls = [];
  const good = await readWindowsSnapshot({ ownPid: 7, runFile: (file, args, options, done) => { calls.push({ file, args, options }); done(null, JSON.stringify(LLM_14B_32K)); } });
  assert.deepEqual(good, LLM_14B_32K);
  assert.equal(calls[0].file, 'powershell.exe');
  assert.ok(calls[0].args.includes('-NoProfile'));
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(await readWindowsSnapshot({ runFile: (_f, _a, _o, done) => done(new Error('timeout')) }), null);
  assert.equal(await readWindowsSnapshot({ runFile: () => { throw new Error('ENOENT'); } }), null);
});

test('il gate segnala i cambi di verdetto e non gira fuori da Windows', async () => {
  let snapshot = LLM_10GB_WITH_TTS;
  const changes = [];
  const pids = [];
  const gate = new VramGate({ requiredMb: 1_250, platform: 'win32', ownPid: () => 99,
    readSnapshot: async ({ ownPid }) => { pids.push(ownPid); return snapshot; }, onChange: (v) => changes.push(v.allowed) });
  assert.equal(gate.allowed(), true);
  await gate.refresh();
  assert.deepEqual(changes, []);
  snapshot = LLM_14B_32K;
  await gate.refresh();
  assert.equal(gate.allowed(), false);
  snapshot = LLM_10GB_WITH_TTS;
  await gate.refresh();
  assert.deepEqual(changes, [false, true]);
  assert.deepEqual(pids, [99, 99, 99]);
  let release;
  const slow = new VramGate({ requiredMb: 1_250, platform: 'win32', intervalMs: 60_000,
    readSnapshot: () => new Promise((resolve) => { release = () => resolve(LLM_10GB_WITH_TTS); }), onChange: (v) => changes.push(`slow:${v.reason}`) });
  assert.equal(slow.start(), true);
  assert.deepEqual(slow.verdict, { allowed: false, reason: 'pending' }, 'prima della prima lettura parla Kokoro');
  release();
  await slow.inflight;
  assert.equal(slow.allowed(), true);
  assert.equal(changes.at(-1), 'slow:ok', 'il passaggio a consentito riscalda Qwen3');
  slow.stop();
  const linux = new VramGate({ requiredMb: 1_250, platform: 'linux', readSnapshot: async () => { throw new Error('unused'); } });
  assert.equal(linux.start(), false);
  assert.equal((await linux.refresh()).reason, 'unknown');
});

// #region Integrazione con il servizio e il fallback

function runtime(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-qwen3-vram-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of ['.venv/Scripts/python.exe', 'worker.py', 'models/Qwen3-TTS-12Hz-0.6B-Base/model.safetensors',
    'models/Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/model.safetensors', 'voices/nexus-male-reference.wav']) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), '');
  }
  return root;
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 4321;
  child.stdin = { write() { return true; } };
  return child;
}

test('con VRAM piena la voce passa a Kokoro e il worker Qwen3 inattivo viene chiuso', async (t) => {
  let snapshot = LLM_10GB_WITH_TTS;
  const gate = new VramGate({ requiredMb: 1_250, platform: 'win32', readSnapshot: async ({ ownPid }) => ({ ...snapshot, ownPid }) });
  gate.start = () => true;
  const terminated = [];
  const spawned = [];
  const qwen3 = createQwen3SpeechService({ runtime: 'torch', enabled: true, runtimeDirectory: runtime(t), vramGate: gate,
    spawnProcess: () => { const child = fakeChild(); spawned.push(child); return child; },
    terminateProcess: (child) => { terminated.push(child); return true; } });
  t.after(() => qwen3.shutdown());
  const kokoro = { capabilities: () => ({ available: true, backend: 'kokoro-onnx', languages: ['it'] }),
    synthesize: async () => ({ backend: 'kokoro-onnx', audio: Buffer.alloc(0) }) };
  const voice = new FallbackSpeechService({ primary: qwen3, fallback: kokoro });

  assert.equal(qwen3.capabilities().available, true);
  assert.equal(voice.capabilities().backend, 'qwen3-tts');
  assert.equal(qwen3.warmUp(), true);
  assert.equal(spawned.length, 1);
  snapshot = LLM_14B_32K;
  await gate.refresh();
  assert.equal(terminated.length, 1, 'il worker caldo restituisce la VRAM all’LLM');
  assert.equal(qwen3.child, null);
  const caps = qwen3.capabilities();
  assert.equal(caps.available, false);
  assert.equal(caps.unavailableReason, 'vram-spill');
  assert.equal(voice.capabilities().backend, 'kokoro-onnx');
  assert.equal((await voice.synthesize({ text: 'Ciao.', language: 'it' })).backend, 'kokoro-onnx');
  assert.equal(spawned.length, 1, 'Qwen3 non viene riavviato con la VRAM piena');
  snapshot = LLM_10GB_WITH_TTS;
  await gate.refresh();
  assert.equal(spawned.length, 2, 'tornata la VRAM, il worker si riscalda');
  assert.equal(voice.capabilities().backend, 'qwen3-tts');
});

test('il gate non chiude il worker durante una sintesi e si ferma allo shutdown', (t) => {
  const gate = { allowed: () => true, start: () => true, stopped: 0, stop() { this.stopped += 1; } };
  const terminated = [];
  const qwen3 = createQwen3SpeechService({ enabled: true, runtimeDirectory: runtime(t), vramGate: gate,
    spawnProcess: fakeChild, terminateProcess: (child) => { terminated.push(child); return true; } });
  qwen3.ensureWorker();
  qwen3.pending.set('busy', { child: qwen3.child });
  assert.equal(qwen3.releaseIdleWorker(), false);
  assert.equal(gate.ownPid(), 4321);
  qwen3.pending.clear();
  qwen3.shutdown();
  assert.equal(gate.stopped, 1);
  assert.equal(createQwen3SpeechService({ enabled: false, vramGate: gate }).vramGate, null, 'opzione spenta: nessuna sonda');
  assert.equal(createQwen3SpeechService({ enabled: true, vramGate: false }).vramGate, null);
});

// #endregion
