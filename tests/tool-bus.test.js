const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolBus } = require('../src/agents/tool-bus');

test('Tool Bus rifiuta duplicati, strumenti privati pubblici e consenso mancante', async () => {
  const bus = new ToolBus({ audience: 'public' })
    .register({ id: 'safe-search', audience: 'public', risk: 'low', invoke: ({ q }) => q })
    .register({ id: 'device-action', audience: 'private', risk: 'high', requiresConsent: true, invoke: () => true });
  assert.throws(() => bus.register({ id: 'safe-search', invoke() {} }), /già registrato/);
  assert.deepEqual(bus.capabilities().map(({ id }) => id), ['safe-search']);
  assert.equal(await bus.invoke('safe-search', { q: 'ok' }), 'ok');
  await assert.rejects(bus.invoke('device-action', {}), { code: 'TOOL_UNAVAILABLE' });
});

test('Tool Bus privato applica consenso e annullamento', async () => {
  const bus = new ToolBus().register({ id: 'write-workspace', requiresConsent: true, invoke: () => 'done' });
  await assert.rejects(bus.invoke('write-workspace', {}), { code: 'TOOL_CONSENT_REQUIRED' });
  assert.equal(await bus.invoke('write-workspace', {}, { approved: true }), 'done');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(bus.invoke('write-workspace', {}, { approved: true, signal: controller.signal }), { code: 'ABORT_ERR' });
});
