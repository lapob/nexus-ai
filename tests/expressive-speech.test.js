const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CHATTERBOX_LANGUAGES, ExpressiveSpeechService } = require('../src/voice/expressive-speech');

test('la voce espressiva richiede runtime, cache e riferimenti completi', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-expressive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pythonRoot = path.join(root, 'python-runtime');
  const service = new ExpressiveSpeechService({
    runtimeDirectory: root,
    pythonRuntimeDirectory: pythonRoot
  });
  assert.equal(service.capabilities().available, false);
  for (const relative of [
    '.venv/Lib/site-packages/.keep',
    'models/hub/.keep',
    'voices/nexus-male-reference.wav',
    'voices/nexus-female-reference.wav',
    'worker.py',
    'python-runtime/python.exe'
  ]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '');
  }
  assert.equal(service.capabilities().available, true);
  assert.deepEqual(service.capabilities().languages, CHATTERBOX_LANGUAGES);
  service.enabled = false;
  assert.equal(service.capabilities().available, false);
});

test('stop interrompe una sintesi espressiva pendente', async () => {
  const service = new ExpressiveSpeechService();
  let killed = false;
  const child = { kill() { killed = true; } };
  service.child = child;
  const rejection = new Promise((resolve) => {
    service.pending.set('expressive', {
      resolve() {},
      reject: resolve,
      timer: setTimeout(() => {}, 10_000),
      output: '',
      child
    });
  });
  assert.equal(service.stop(), true);
  const error = await rejection;
  assert.match(error.message, /interrotta/i);
  assert.equal(killed, true);
});
test('shutdown termina anche un worker espressivo inattivo', () => {
  let service;
  let killed = false;
  const child = {
    pid: 7301,
    kill(signal) {
      assert.equal(service.child, child);
      assert.equal(signal, 'SIGKILL');
      killed = true;
      return true;
    }
  };
  service = new ExpressiveSpeechService({
    platform: 'win32',
    runTaskkill(command, args) {
      assert.equal(command, 'taskkill.exe');
      assert.deepEqual(args, ['/pid', '7301', '/t', '/f']);
      assert.equal(service.child, child);
      return { status: 1 };
    }
  });
  service.child = child;
  assert.equal(service.shutdown(), true);
  assert.equal(killed, true);
  assert.equal(service.child, null);
});

test('shutdown cancella richieste orfane e impedisce di riavviare la voce', async () => {
  const service = new ExpressiveSpeechService();
  const rejection = new Promise((resolve) => {
    service.pending.set('orphan', {
      resolve() {}, reject: resolve, timer: setTimeout(() => {}, 10_000), output: '', child: {}
    });
  });

  assert.equal(service.shutdown(), true);
  assert.match((await rejection).message, /terminata/i);
  assert.equal(service.pending.size, 0);
  assert.equal(service.shutdown(), false);
  await assert.rejects(service.synthesize({ text: 'Non ripartire' }), /terminata/i);
});

test('ignora gli eventi tardivi del worker espressivo precedente', () => {
  const service = new ExpressiveSpeechService();
  const previous = { kill() {} };
  const current = { kill() {} };
  service.child = current;
  service.buffer = 'inizio';

  service.consume(Buffer.from('{"id":"vecchio","ok":true}\n'), previous);
  assert.equal(service.buffer, 'inizio');

  service.consume(Buffer.from(' riga\n'), current);
  assert.equal(service.buffer, '');
});
