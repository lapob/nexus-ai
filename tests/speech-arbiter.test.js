const test = require('node:test');
const assert = require('node:assert/strict');
const { SpeechArbiter, primaryLanguage } = require('../src/voice/speech-arbiter');

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
