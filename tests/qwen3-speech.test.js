const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { QWEN3_LANGUAGES, Qwen3SpeechService, Qwen3GgufSpeechService, FallbackSpeechService, createQwen3SpeechService, qwen3Option,
  waveFromPcm } = require('../src/voice/qwen3-speech');
const { pcmWave } = require('../src/voice/speech-segments');

// #region Fixture: runtime finto e worker JSONL simulato

function runtime(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-qwen3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of ['.venv/Scripts/python.exe', 'worker.py', 'models/Qwen3-TTS-12Hz-0.6B-Base/model.safetensors',
    'models/Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/model.safetensors', 'voices/nexus-male-reference.wav']) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), '');
  }
  return root;
}

function fakeWorker(respond) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.lines = [];
  child.send = (event) => child.stdout.write(`${JSON.stringify(event)}\n`);
  child.stdin = { write(text) { for (const line of text.split('\n').filter(Boolean)) { const event = JSON.parse(line); child.lines.push(event); respond(event, child); } return true; } };
  setImmediate(() => child.send({ type: 'ready', sampleRate: 24_000, model: 'Qwen3-TTS-12Hz-0.6B-Base', vramReservedMb: 2100 }));
  return child;
}

function service(t, respond, extra = {}) {
  const terminated = [];
  const spawned = [];
  const instance = new Qwen3SpeechService({ enabled: true, runtimeDirectory: runtime(t), cancelGraceMs: 50,
    spawnProcess: () => { const child = fakeWorker(respond); spawned.push(child); return child; },
    terminateProcess: (child) => { terminated.push(child); child.exitCode = 1; setImmediate(() => child.emit('exit', 1)); return true; }, ...extra });
  t.after(() => instance.shutdown());
  return { instance, terminated, spawned };
}

const pcm = Buffer.alloc(960, 1).toString('base64');

function completes(event, child) {
  if (event.type === 'cancel') return;
  setImmediate(() => {
    child.send({ id: event.id, type: 'chunk', seq: 0, pcm });
    fs.writeFileSync(event.output, waveFromPcm(Buffer.alloc(1920, 2), 24_000));
    child.send({ id: event.id, ok: true, firstChunkMs: 180, totalMs: 700, audioMs: 1500, vramPeakMb: 2300 });
  });
}

// #endregion

test('Qwen3 è spento per impostazione predefinita e si attiva solo con l’opzione esplicita', () => {
  assert.deepEqual(qwen3Option({}), { enabled: false, size: '0.6b', runtime: 'torch' });
  assert.deepEqual(qwen3Option({ NEXUS_VOICE_ENGINE: 'qwen3', NEXUS_QWEN3_SIZE: '1.7B' }), { enabled: true, size: '1.7b', runtime: 'torch' });
  assert.equal(qwen3Option({ NEXUS_VOICE_ENGINE: 'qwen3', NEXUS_QWEN3_RUNTIME: 'GGUF' }).runtime, 'gguf');
  assert.equal(qwen3Option({ NEXUS_VOICE_ENGINE: 'qwen3', NEXUS_QWEN3_RUNTIME: 'cuda' }).runtime, 'torch');
  assert.equal(qwen3Option({ NEXUS_VOICE_ENGINE: 'qwen3', NEXUS_QWEN3_SIZE: '../7b' }).size, '0.6b');
  assert.equal(qwen3Option({ NEXUS_VOICE_ENGINE: 'kokoro' }).enabled, false);
});

test('le capability richiedono opzione, venv, pesi, tokenizer e voce di riferimento', (t) => {
  const root = runtime(t);
  assert.equal(new Qwen3SpeechService({ runtimeDirectory: root }).capabilities().available, false);
  const enabled = new Qwen3SpeechService({ runtimeDirectory: root, enabled: true });
  const capabilities = enabled.capabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.backend, 'qwen3-tts');
  assert.equal(capabilities.streaming, true);
  assert.ok(capabilities.languages.includes('it'));
  fs.rmSync(path.join(root, 'voices', 'nexus-male-reference.wav'));
  assert.equal(enabled.capabilities().available, false);
});

test('consegna i blocchi in streaming come WAV PCM validi e poi l’audio completo', async (t) => {
  const { instance } = service(t, completes);
  const chunks = [];
  const result = await instance.synthesize({ text: 'Ciao, come stai?', language: 'it', onChunk: (chunk) => chunks.push(chunk) });
  assert.equal(result.backend, 'qwen3-tts');
  assert.equal(chunks.length, 1);
  assert.equal(pcmWave(chunks[0].audio).data.length, 960);
  assert.equal(pcmWave(result.audio).data.length, 1920);
  assert.equal(result.metrics.firstChunkMs, 180);
  assert.equal(result.metrics.vramPeakMb, 2300);
  assert.equal(instance.readyInfo.vramReservedMb, 2100);
  const request = instance.child.lines.find((line) => line.text);
  assert.match(path.basename(request.output), /^nexus-qwen3-[a-f0-9-]{36}\.wav$/);
  assert.equal(fs.existsSync(request.output), false, 'il WAV temporaneo va rimosso');
});

test('il barge-in annulla la generazione senza spegnere il worker caldo', async (t) => {
  const { instance, terminated } = service(t, (event, child) => {
    if (event.type === 'cancel') setImmediate(() => child.send({ id: event.id, ok: false, cancelled: true }));
    else setImmediate(() => child.send({ id: event.id, type: 'chunk', seq: 0, pcm }));
  });
  let resolveFirst;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const speaking = instance.synthesize({ text: 'Una frase lunga da interrompere.', onChunk: resolveFirst });
  await first;
  const worker = instance.child;
  assert.equal(instance.stop(), true);
  await assert.rejects(speaking, (error) => error.code === 'VOICE_CANCELLED');
  assert.equal(terminated.length, 0);
  assert.equal(instance.child, worker);
  assert.ok(worker.lines.some((line) => line.type === 'cancel'));
  assert.equal(instance.stop(), false, 'senza sintesi attiva stop non fa nulla');
});

test('se il worker non conferma l’annullamento entro la grazia viene terminato', async (t) => {
  const { instance, terminated } = service(t, (event, child) => {
    if (!event.type) setImmediate(() => child.send({ id: event.id, type: 'chunk', seq: 0, pcm }));
  });
  let resolveFirst;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const speaking = instance.synthesize({ text: 'Non rispondo al cancel.', onChunk: resolveFirst });
  await first;
  instance.stop();
  await assert.rejects(speaking, (error) => error.code === 'VOICE_CANCELLED');
  assert.equal(terminated.length, 1);
  assert.equal(instance.child, null);
});

test('rifiuta lingue non supportate e testi oltre il limite prima di avviare il worker', async (t) => {
  const { instance, spawned } = service(t, completes);
  await assert.rejects(instance.synthesize({ text: 'Hola', language: 'hi' }), /Lingua/);
  await assert.rejects(instance.synthesize({ text: 'x'.repeat(521) }), /troppo lungo/);
  assert.equal(spawned.length, 0);
  assert.deepEqual([...QWEN3_LANGUAGES].sort(), [...QWEN3_LANGUAGES]);
});

// #region Runtime GGUF (llama.cpp Vulkan + ONNX DirectML)

function ggufRuntime(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-qwen3-gguf-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const model = 'models/Qwen3-TTS-12Hz-0.6B-Base';
  for (const relative of ['.venv/Scripts/python.exe', 'worker.py', 'src/qwen3_tts_gguf/inference/bin/llama.dll',
    `${model}/qwen3_tts_talker.q5_k.gguf`, `${model}/qwen3_tts_predictor.q8_0.gguf`, `${model}/qwen3_tts_decoder.fp16.onnx`,
    `${model}/qwen3_tts_codec_encoder.fp16.onnx`, `${model}/qwen3_tts_speaker_encoder.fp16.onnx`, `${model}/tokenizer.json`,
    'shared-voices/nexus-male-reference.wav']) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), '');
  }
  return root;
}

test('il runtime GGUF richiede DLL llama.cpp, GGUF, ONNX, tokenizer e voce condivisa', (t) => {
  const root = ggufRuntime(t);
  const voicesDirectory = path.join(root, 'shared-voices');
  assert.equal(new Qwen3GgufSpeechService({ runtimeDirectory: root, voicesDirectory }).capabilities().available, false);
  const gguf = createQwen3SpeechService({ runtime: 'gguf', runtimeDirectory: root, voicesDirectory, enabled: true });
  assert.ok(gguf instanceof Qwen3GgufSpeechService);
  const capabilities = gguf.capabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.backend, 'qwen3-tts');
  assert.equal(capabilities.runtime, 'gguf');
  assert.equal(capabilities.streaming, true);
  for (const missing of ['src/qwen3_tts_gguf/inference/bin/llama.dll', 'models/Qwen3-TTS-12Hz-0.6B-Base/qwen3_tts_decoder.fp16.onnx']) {
    const file = path.join(root, missing);
    fs.rmSync(file);
    assert.equal(gguf.capabilities().available, false, missing);
    fs.writeFileSync(file, '');
  }
  // Il 1.7B non esportato non è disponibile: la voce resta Kokoro.
  assert.equal(createQwen3SpeechService({ runtime: 'gguf', runtimeDirectory: root, voicesDirectory, enabled: true, size: '1.7b' }).capabilities().available, false);
  assert.ok(!(createQwen3SpeechService({ runtime: 'torch', runtimeDirectory: root }) instanceof Qwen3GgufSpeechService));
});

test('il worker GGUF riceve voci e provider ONNX e usa lo stesso protocollo di streaming e barge-in', async (t) => {
  const root = ggufRuntime(t);
  const spawned = [];
  const instance = new Qwen3GgufSpeechService({ enabled: true, runtimeDirectory: root, voicesDirectory: path.join(root, 'shared-voices'),
    onnxProvider: 'ROCM', cancelGraceMs: 50,
    spawnProcess: (command, args, options) => {
      const child = fakeWorker((event, worker) => {
        if (event.type === 'cancel') setImmediate(() => worker.send({ id: event.id, ok: false, cancelled: true }));
        else if (event.text.startsWith('Lunga')) setImmediate(() => worker.send({ id: event.id, type: 'chunk', seq: 0, pcm }));
        else completes(event, worker);
      });
      spawned.push({ command, args, options, child });
      return child;
    },
    terminateProcess: () => true });
  t.after(() => instance.shutdown());
  const chunks = [];
  const result = await instance.synthesize({ text: 'Ciao.', language: 'it', onChunk: (chunk) => chunks.push(chunk) });
  assert.equal(result.backend, 'qwen3-tts');
  assert.equal(chunks.length, 1);
  assert.equal(pcmWave(result.audio).data.length, 1920);
  const { command, args, options } = spawned[0];
  assert.equal(command, path.join(root, '.venv', 'Scripts', 'python.exe'));
  assert.deepEqual(args, ['-I', path.join(root, 'worker.py')]);
  assert.equal(options.env.NEXUS_QWEN3_VOICES, path.join(root, 'shared-voices'));
  assert.equal(options.env.NEXUS_QWEN3_ONNX_PROVIDER, 'DML', 'provider non ammesso → DirectML');
  assert.equal(options.env.GGML_VK_VISIBLE_DEVICES, '0', 'solo la GPU dedicata, non la iGPU');
  assert.equal(new Qwen3GgufSpeechService({ runtimeDirectory: root, vulkanDevices: '0;calc' }).workerEnv().GGML_VK_VISIBLE_DEVICES, '0');
  assert.equal(options.env.NEXUS_QWEN3_ROOT, root);
  assert.equal(options.env.HF_HUB_OFFLINE, '1');
  let resolveFirst;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const speaking = instance.synthesize({ text: 'Lunga frase da interrompere.', onChunk: resolveFirst });
  await first;
  assert.equal(instance.stop(), true);
  await assert.rejects(speaking, (error) => error.code === 'VOICE_CANCELLED');
  assert.equal(spawned.length, 1, 'il worker resta caldo dopo il barge-in');
});

test('il worker GGUF valida richieste e blocchi senza importare il motore', (t) => {
  const { spawnSync } = require('node:child_process');
  const manifest = require('../config/python-runtime.json');
  const python = process.platform === 'win32' ? path.join(__dirname, '..', manifest.runtimeDirectory, 'python.exe') : 'python3';
  if (process.platform === 'win32' && !fs.existsSync(python)) return t.skip('Python portabile non installato');
  const ggufWorker = path.join(__dirname, '..', 'src', 'voice', 'qwen3-gguf-worker.py');
  const code = `import runpy,sys,tempfile,pathlib,uuid
module=runpy.run_path(sys.argv[1])
identifier=str(uuid.uuid4())
base={"id":identifier,"text":"Perché la qualità conta?","language":"it","gender":"male","output":str(pathlib.Path(tempfile.gettempdir())/f"nexus-qwen3-{identifier}.wav")}
assert module["validate_request"](base)[3] == "male"
for invalid in [{**base,"text":" "},{**base,"text":"x"*521},{**base,"language":"hi"},{**base,"gender":"robot"},{**base,"id":"../x"},{**base,"output":str(pathlib.Path(tempfile.gettempdir())/"unrelated.wav")}]:
    try: module["validate_request"](invalid)
    except ValueError: pass
    else: raise AssertionError("unsafe request accepted")
assert module["chunk_plan"](4, 12) == (4, 12)
assert module["chunk_plan"](0, 2) == (1, 2)
assert module["chunk_plan"](6, 3) == (6, 6)
assert module["MAX_FRAMES"] == 720
for name in ("qwen3_tts_gguf", "onnxruntime", "numpy"):
    assert name not in sys.modules, name
print("qwen3 gguf worker boundaries PASS")`;
  const result = spawnSync(python, ['-I', '-c', code, ggufWorker], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (result.error?.code === 'ENOENT') return t.skip('Python 3 non installato');
  assert.equal(result.status, 0, result.stderr);
});

// #endregion

// #region Fallback automatico

function fakeEngine(name, { languages = ['it'], available = true, fail = null } = {}) {
  return {
    calls: 0, stopped: 0, warmed: 0, shut: 0,
    capabilities() { return { available, backend: name, languages }; },
    async synthesize() { this.calls += 1; if (fail) throw fail(); return { backend: name, audio: Buffer.alloc(0) }; },
    stop() { this.stopped += 1; return true; }, warmUp() { this.warmed += 1; return true; }, shutdown() { this.shut += 1; return true; }
  };
}

test('il fallback usa Qwen3 quando pronto e ricade su Kokoro in caso di errore', async () => {
  const primary = fakeEngine('qwen3-tts', { fail: () => new Error('ROCm non disponibile') });
  const fallback = fakeEngine('kokoro-onnx', { languages: ['it', 'hi'] });
  let now = 1_000;
  const voice = new FallbackSpeechService({ primary, fallback, failureLimit: 2, cooldownMs: 10_000, now: () => now });
  assert.equal(voice.capabilities().backend, 'qwen3-tts');
  assert.equal((await voice.synthesize({ text: 'a', language: 'it' })).backend, 'kokoro-onnx');
  assert.equal((await voice.synthesize({ text: 'b', language: 'it' })).backend, 'kokoro-onnx');
  assert.equal(primary.calls, 2);
  // Dopo due errori consecutivi Qwen3 resta escluso per il raffreddamento.
  await voice.synthesize({ text: 'c', language: 'it' });
  assert.equal(primary.calls, 2);
  assert.equal(voice.capabilities().backend, 'kokoro-onnx');
  now += 10_001;
  await voice.synthesize({ text: 'd', language: 'it' });
  assert.equal(primary.calls, 3);
});

test('il fallback non sostituisce una sintesi annullata e instrada le lingue non coperte', async () => {
  const primary = fakeEngine('qwen3-tts', { fail: () => Object.assign(new Error('stop'), { code: 'VOICE_CANCELLED' }) });
  const fallback = fakeEngine('kokoro-onnx', { languages: ['it', 'hi'] });
  const voice = new FallbackSpeechService({ primary, fallback });
  await assert.rejects(voice.synthesize({ text: 'a', language: 'it' }), (error) => error.code === 'VOICE_CANCELLED');
  assert.equal(fallback.calls, 0);
  await voice.synthesize({ text: 'b', language: 'hi' });
  assert.equal(fallback.calls, 1);
  assert.deepEqual(voice.capabilities().languages, ['hi', 'it']);
  assert.equal(voice.stop(), true);
  assert.equal(primary.stopped + fallback.stopped, 2, 'stop raggiunge entrambi i motori');
  voice.warmUp();
  voice.shutdown();
  assert.equal(primary.warmed + fallback.warmed + primary.shut + fallback.shut, 4);
});

// #endregion

test('il worker Qwen3 valida richieste e destinazione senza importare torch', (t) => {
  const { spawnSync } = require('node:child_process');
  const manifest = require('../config/python-runtime.json');
  const python = process.platform === 'win32' ? path.join(__dirname, '..', manifest.runtimeDirectory, 'python.exe') : 'python3';
  if (process.platform === 'win32' && !fs.existsSync(python)) return t.skip('Python portabile non installato');
  const worker = path.join(__dirname, '..', 'src', 'voice', 'qwen3-worker.py');
  const code = `import runpy,sys,tempfile,pathlib,uuid
module=runpy.run_path(sys.argv[1])
identifier=str(uuid.uuid4())
base={"id":identifier,"text":"Perché la qualità conta?","language":"it","gender":"female","output":str(pathlib.Path(tempfile.gettempdir())/f"nexus-qwen3-{identifier}.wav")}
assert module["validate_request"](base)[2] == "it"
for invalid in [{**base,"text":"x"*521},{**base,"language":"hi"},{**base,"gender":"robot"},{**base,"id":"../x"},{**base,"output":str(pathlib.Path(tempfile.gettempdir())/"unrelated.wav")}]:
    try: module["validate_request"](invalid)
    except ValueError: pass
    else: raise AssertionError("unsafe request accepted")
assert "torch" not in sys.modules
print("qwen3 worker boundaries PASS")`;
  const result = spawnSync(python, ['-I', '-c', code, worker], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (result.error?.code === 'ENOENT') return t.skip('Python 3 non installato');
  assert.equal(result.status, 0, result.stderr);
});
