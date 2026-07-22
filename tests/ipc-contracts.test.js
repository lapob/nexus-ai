const test = require('node:test');
const assert = require('node:assert/strict');
const { CHANNELS, parseChatRequest, parseEmbeddingRequest, parseModelName, parseRelativeNotePath, parseRequestId } = require('../src/application/ipc-contracts');

test('espone canali IPC univoci e immutabili', () => {
  assert.equal(new Set(Object.values(CHANNELS)).size, Object.keys(CHANNELS).length);
  assert.equal(Object.isFrozen(CHANNELS), true);
});

test('valida requestId, modello ed embedding prima del runtime AI', () => { assert.equal(parseRequestId('req-1'), 'req-1'); assert.equal(parseModelName('qwen3:8b'), 'qwen3:8b'); assert.deepEqual(parseEmbeddingRequest({ input: ['a', 'b'], model: 'embed:1' }), { input: ['a', 'b'], model: 'embed:1' }); assert.throws(() => parseModelName('../bad model'), /non valido/); assert.throws(() => parseEmbeddingRequest({ input: [] }), /non valido/); });

test('normalizza e limita il payload chat', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const payload = parseChatRequest({ question: '  test  ', mode: 'deep', history });
  assert.equal(payload.question, 'test');
  assert.equal(payload.history.length, 8);
  assert.throws(() => parseChatRequest({}), /obbligatoria/);
  assert.throws(() => parseRelativeNotePath(''), /obbligatorio/);
});
