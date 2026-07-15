const test = require('node:test');
const assert = require('node:assert/strict');
const { CHANNELS, parseChatRequest, parseRelativeNotePath } = require('../src/application/ipc-contracts');

test('espone canali IPC univoci e immutabili', () => {
  assert.equal(new Set(Object.values(CHANNELS)).size, Object.keys(CHANNELS).length);
  assert.equal(Object.isFrozen(CHANNELS), true);
});

test('normalizza e limita il payload chat', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const payload = parseChatRequest({ question: '  test  ', mode: 'deep', history });
  assert.equal(payload.question, 'test');
  assert.equal(payload.history.length, 8);
  assert.throws(() => parseChatRequest({}), /obbligatoria/);
  assert.throws(() => parseRelativeNotePath(''), /obbligatorio/);
});

