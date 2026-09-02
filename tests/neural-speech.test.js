const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KOKORO_LANGUAGES, NeuralSpeechService, addWavePreroll } = require('../src/voice/neural-speech');

test('aggiunge un preroll PCM valido senza alterare i campioni della voce', () => {
  const samples = Buffer.from([1, 0, 2, 0]);
  const wave = Buffer.alloc(44 + samples.length);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVE', 8);
  wave.write('fmt ', 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(24_000, 24);
  wave.writeUInt32LE(48_000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(samples.length, 40);
  samples.copy(wave, 44);

  const result = addWavePreroll(wave, 100);
  assert.equal(result.readUInt32LE(4), result.length - 8);
  assert.equal(result.readUInt32LE(40), samples.length + 4_800);
  assert.deepEqual(result.subarray(result.length - samples.length), samples);
  assert.ok(result.subarray(44, result.length - samples.length).every((byte) => byte === 0));
});

test('la voce neurale richiede runtime e preset locali completi', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-neural-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pythonRoot = path.join(root, 'python-runtime');
  const service = new NeuralSpeechService({ runtimeDirectory: root, pythonRuntimeDirectory: pythonRoot });
  assert.equal(service.capabilities().available, false);
  for (const relative of [
    '.venv/Lib/site-packages/.keep',
    'python-runtime/python.exe',
    'worker.py',
    'models/kokoro-v1.0.onnx',
    'models/voices-v1.0.bin'
  ]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '');
  }
  const capabilities = service.capabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.backend, 'kokoro-onnx');
  assert.deepEqual(capabilities.genders, ['male', 'female']);
  assert.deepEqual(capabilities.languages, KOKORO_LANGUAGES);
});

test('il worker Kokoro usa voce e fonemizzazione della lingua richiesta', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'kokoro', 'worker.py'), 'utf8');
  for (const language of KOKORO_LANGUAGES) assert.match(worker, new RegExp(`"${language}"\\s*:`));
  assert.match(worker, /lang=profile\["lang"\]/u);
  assert.doesNotMatch(worker, /lang="it"/u);
  assert.ok(worker.includes('re.split(r"(?<=[.!?;:。！？；：])\\s+", text)'));
});

test('rimuove l’audio temporaneo quando il worker segnala un errore', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-neural-error-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'partial.wav');
  fs.writeFileSync(output, 'parziale');
  const service = new NeuralSpeechService();
  let rejected;
  const rejection = new Promise((resolve) => { rejected = resolve; });
  service.pending.set('request-1', {
    resolve() {},
    reject: rejected,
    timer: setTimeout(() => {}, 10_000),
    output,
    child: {}
  });

  service.consume(Buffer.from('{"id":"request-1","ok":false}\n'));
  const error = await rejection;
  assert.match(error.message, /non riuscita/i);
  assert.equal(fs.existsSync(output), false);
  assert.equal(service.pending.size, 0);
});

test('stop interrompe subito richieste pendenti e rimuove i file parziali', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-neural-stop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'pending.wav');
  fs.writeFileSync(output, 'audio incompleto');
  const service = new NeuralSpeechService();
  let killed = false;
  const child = { kill() { killed = true; } };
  service.child = child;
  const rejection = new Promise((resolve) => {
    service.pending.set('request-stop', {
      resolve() {},
      reject: resolve,
      timer: setTimeout(() => {}, 10_000),
      output,
      child
    });
  });

  assert.equal(service.stop(), true);
  const error = await rejection;
  assert.match(error.message, /interrotta/i);
  assert.equal(killed, true);
  assert.equal(service.child, null);
  assert.equal(service.pending.size, 0);
  assert.equal(fs.existsSync(output), false);
});

test('stop senza worker cancella comunque una richiesta orfana', async () => {
  const service = new NeuralSpeechService();
  const rejection = new Promise((resolve) => {
    service.pending.set('orphan', {
      resolve() {},
      reject: resolve,
      timer: setTimeout(() => {}, 10_000),
      output: '',
      child: {}
    });
  });

  assert.equal(service.stop(), true);
  const error = await rejection;
  assert.match(error.message, /interrotta/i);
  assert.equal(service.pending.size, 0);
});

test('il segnale ready abilita Kokoro e stop conserva il worker inattivo', () => {
  const service = new NeuralSpeechService();
  let killed = false;
  const child = { kill() { killed = true; } };
  service.child = child;

  service.consume(Buffer.from('{"type":"ready"}\n'));

  assert.equal(service.ready, true);
  assert.equal(service.stop(), false);
  assert.equal(service.child, child);
  assert.equal(killed, false);
});

test('la prima richiesta attende il segnale ready e può essere interrotta', async () => {
  const service = new NeuralSpeechService();
  let killed = false;
  const child = { kill() { killed = true; } };
  service.child = child;
  const waiting = service.waitUntilReady(child, 5_000);
  assert.equal(service.stop(), true);
  await assert.rejects(waiting, /interrotta/i);
  assert.equal(killed, true);
  assert.equal(service.child, null);
});

test('gli eventi tardivi di un worker interrotto non alterano quello nuovo', async () => {
  const service = new NeuralSpeechService();
  const previous = { kill() {} };
  const current = { kill() {} };
  service.child = previous;
  const oldWaiting = service.waitUntilReady(previous, 5_000);
  service.stop();
  await assert.rejects(oldWaiting, /interrotta/i);

  service.child = current;
  const currentWaiting = service.waitUntilReady(current, 5_000);
  // Simula stdout ed exit consegnati in ritardo dal processo già terminato.
  service.consume(Buffer.from('{"type":"ready"}\n'), previous);
  service.settleReadyWaiters(new Error('vecchio worker terminato'), previous);
  assert.equal(service.ready, false);
  assert.equal(service.readyWaiters.size, 1);

  service.consume(Buffer.from('{"type":"ready"}\n'), current);
  await currentWaiting;
  assert.equal(service.ready, true);
  assert.equal(service.readyWaiters.size, 0);
});

test('due richieste identiche condividono una sola sintesi audio', async () => {
  const service = new NeuralSpeechService();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  service.synthesizeOnce = async () => {
    calls += 1;
    await gate;
    return { backend: 'test', mimeType: 'audio/wav', audio: Buffer.from('audio') };
  };

  const first = service.synthesize({ text: 'La stessa risposta', gender: 'female', language: 'it' });
  const second = service.synthesize({ text: '  La stessa   risposta  ', gender: 'female', language: 'it' });
  assert.equal(calls, 1);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left, right);
  assert.equal(service.inflightSynthesis.size, 0);
});

test('riusa l audio neurale recente senza una seconda inferenza', async () => {
  const service = new NeuralSpeechService();
  let calls = 0;
  service.synthesizeOnce = async () => {
    calls += 1;
    return { backend: 'test', mimeType: 'audio/wav', audio: Buffer.from('audio-cache') };
  };
  const first = await service.synthesize({ text: 'Risposta ripetibile', gender: 'male', language: 'it' });
  const second = await service.synthesize({ text: 'Risposta ripetibile', gender: 'male', language: 'it' });
  assert.equal(calls, 1);
  assert.equal(second, first);
  service.shutdown();
  assert.equal(service.audioCache.size, 0);
});

test('shutdown termina anche un worker Kokoro caldo e inattivo', () => {
  let service;
  let killed = false;
  const child = {
    pid: 7201,
    kill(signal) {
      assert.equal(service.child, child);
      assert.equal(signal, 'SIGKILL');
      killed = true;
      return true;
    }
  };
  service = new NeuralSpeechService({
    platform: 'win32',
    runTaskkill(command, args) {
      assert.equal(command, 'taskkill.exe');
      assert.deepEqual(args, ['/pid', '7201', '/t', '/f']);
      assert.equal(service.child, child);
      return { status: 1 };
    }
  });
  service.child = child;
  service.ready = true;
  assert.equal(service.shutdown(), true);
  assert.equal(killed, true);
  assert.equal(service.child, null);
  assert.equal(service.ready, false);
});

test('shutdown Kokoro è definitivo e idempotente', async () => {
  const service = new NeuralSpeechService();
  assert.equal(service.shutdown(), false);
  assert.equal(service.shutdown(), false);
  assert.equal(service.warmUp(), false);
  await assert.rejects(service.synthesize({ text: 'Non ripartire' }), /terminata/i);
});
