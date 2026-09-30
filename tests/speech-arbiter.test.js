const test = require('node:test');
const assert = require('node:assert/strict');
const { SpeechArbiter, RemoteSpeechQueue, primaryLanguage } = require('../src/voice/speech-arbiter');

function service(name, languages, task = async ({ language }) => ({ backend: name, language })) {
  return {
    stops: 0,
    capabilities: () => ({ available: true, languages }),
    stop() { this.stops += 1; return true; },
    synthesize: task
  };
}

test('seleziona Kokoro multilingua e ferma sempre entrambi i motori', async () => {
  const neural = service('kokoro', ['it', 'en', 'es']);
  const expressive = service('chatterbox', ['it', 'en', 'de']);
  const arbiter = new SpeechArbiter({ neural, expressive });
  const result = await arbiter.synthesize({ engine: 'neural', language: 'en-US', text: 'Hello' });
  assert.deepEqual(result, { backend: 'kokoro', language: 'en' });
  assert.equal(neural.stops, 1);
  assert.equal(expressive.stops, 1);
});

test('usa il motore espressivo quando Kokoro non supporta la lingua', async () => {
  const arbiter = new SpeechArbiter({ neural: service('kokoro', ['it']), expressive: service('chatterbox', ['de']) });
  assert.equal((await arbiter.synthesize({ language: 'de', text: 'Hallo' })).backend, 'chatterbox');
});

test('una nuova richiesta invalida il risultato vocale precedente', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const neural = service('kokoro', ['it'], async () => { await gate; return { backend: 'kokoro' }; });
  const arbiter = new SpeechArbiter({ neural });
  const first = arbiter.synthesize({ text: 'Prima' });
  const second = arbiter.synthesize({ text: 'Seconda' });
  release();
  await assert.rejects(first, (error) => error.code === 'VOICE_CANCELLED');
  assert.equal((await second).backend, 'kokoro');
});

test('rifiuta codici lingua non validi o non supportati', async () => {
  assert.equal(primaryLanguage('pt-BR'), 'pt');
  assert.throws(() => primaryLanguage('../it'));
  const arbiter = new SpeechArbiter({ neural: service('kokoro', ['it']) });
  await assert.rejects(arbiter.synthesize({ language: 'ko', text: '안녕하세요' }), /non disponibile/);
});

function controlledEngine() {
  const calls = [];
  let pending;
  return {
    calls, stops: 0,
    capabilities: () => ({ available: true, languages: ['it', 'en'] }),
    synthesize(options) {
      calls.push(options);
      assert.equal(pending, undefined, 'inferences must not overlap');
      return new Promise((resolve, reject) => { pending = { resolve, reject }; });
    },
    finish() { const active = pending; pending = undefined; active.resolve({ audio: Buffer.from('wave') }); },
    fail() { const active = pending; pending = undefined; active.reject(new Error('engine failure')); },
    stop() { this.stops++; if (pending) { const active = pending; pending = undefined; active.reject(new Error('interrotta')); } },
    shutdown() { this.stop(); }
  };
}
const tick = () => new Promise(setImmediate);

test('guest distinti attendono avvio, inferenza e risultato senza fermarsi a vicenda', async () => {
  const neural = controlledEngine();
  const queue = new RemoteSpeechQueue({ neural });
  const a = queue.synthesize({ owner: 'a', text: 'Prima', language: 'it-IT' });
  const b = queue.synthesize({ owner: 'b', text: 'Seconda', language: 'en-US' });
  assert.equal(neural.calls.length, 1);
  assert.equal(neural.calls[0].language, 'it');
  neural.finish(); await a; await tick();
  assert.equal(neural.calls.length, 2);
  assert.equal(neural.calls[1].language, 'en');
  neural.finish(); await b;
  assert.equal(neural.stops, 0);
  queue.shutdown();
});

test('annullare un guest in attesa non ferma il guest attivo', async () => {
  const neural = controlledEngine(); const queue = new RemoteSpeechQueue({ neural });
  const abort = new AbortController();
  const a = queue.synthesize({ owner: 'a', text: 'Prima' });
  const b = queue.synthesize({ owner: 'b', text: 'Seconda', signal: abort.signal });
  const rejected = assert.rejects(b, { name: 'AbortError' });
  abort.abort(); await rejected;
  assert.equal(neural.stops, 0);
  neural.finish(); await a; await tick();
  assert.equal(neural.calls.length, 1); queue.shutdown();
});

test('annullamento attivo non attiva fallback e lascia procedere il guest seguente', async () => {
  const neural = controlledEngine(); const expressive = controlledEngine();
  const queue = new RemoteSpeechQueue({ neural, expressive });
  const abort = new AbortController();
  const a = queue.synthesize({ owner: 'a', text: 'Prima', signal: abort.signal });
  const rejected = assert.rejects(a, { name: 'AbortError' });
  const b = queue.synthesize({ owner: 'b', text: 'Seconda' });
  abort.abort(); await rejected; await tick();
  assert.equal(expressive.calls.length, 0);
  assert.equal(neural.calls.length, 2);
  neural.finish(); await b; queue.shutdown();
});

test('lo slot resta riservato durante fallback e recupero da errore', async () => {
  const neural = controlledEngine(); const expressive = controlledEngine();
  const queue = new RemoteSpeechQueue({ neural, expressive });
  const a = queue.synthesize({ owner: 'a', text: 'Prima' });
  const b = queue.synthesize({ owner: 'b', text: 'Seconda' });
  neural.fail(); await tick();
  assert.equal(expressive.calls.length, 1); assert.equal(neural.calls.length, 1);
  expressive.finish(); await a; await tick();
  assert.equal(neural.calls.length, 2); neural.finish(); await b; queue.shutdown();
});

test('limiti per proprietario, capacita e shutdown rifiutano senza interferenze', async () => {
  const neural = controlledEngine(); const queue = new RemoteSpeechQueue({ neural, capacity: 2 });
  const a = queue.synthesize({ owner: 'a', text: 'Prima' });
  await assert.rejects(queue.synthesize({ owner: 'a', text: 'Doppia' }), { code: 'VOICE_BUSY' });
  const b = queue.synthesize({ owner: 'b', text: 'Seconda' });
  await assert.rejects(queue.synthesize({ owner: 'c', text: 'Terza' }), { code: 'VOICE_BUSY' });
  const rejected = Promise.all([assert.rejects(a, { name: 'AbortError' }), assert.rejects(b, { name: 'AbortError' })]);
  queue.shutdown(); queue.shutdown(); await rejected;
  await assert.rejects(queue.synthesize({ owner: 'd', text: 'Tardi' }), { code: 'VOICE_STOPPED' });
});

test('stop desktop e sintetizzatore guest dedicato rimangono indipendenti', async () => {
  const local = controlledEngine(); const remote = controlledEngine();
  const desktop = new SpeechArbiter({ neural: local }); const queue = new RemoteSpeechQueue({ neural: remote });
  const guest = queue.synthesize({ owner: 'guest', text: 'Pubblico' });
  const localJob = desktop.synthesize({ text: 'Privato' });
  const rejected = assert.rejects(localJob);
  desktop.stop(); await rejected;
  assert.equal(remote.stops, 0); remote.finish(); await guest; queue.shutdown();
});
