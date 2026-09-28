const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CHANNELS, parseRequestId, parseTrainingExample } = require('../src/application/ipc-contracts');

function handlers({ decision = 0, distributionMode = 'developer' } = {}) {
  const source = fs.readFileSync(require.resolve('../src/application/register-ipc'), 'utf8');
  const start = source.indexOf('  ipcMain.handle(CHANNELS.responseRating,');
  const end = source.indexOf('  ipcMain.handle(CHANNELS.trainingStats,', start);
  assert.ok(start > 0 && end > start);
  const registered = new Map(), saved = [], sent = [], logs = [], dialogs = [];
  vm.runInNewContext(source.slice(start, end), {
    CHANNELS, parseRequestId, parseTrainingExample, distributionMode,
    assertTrustedSender() {},
    ipcMain: { handle: (name, handler) => registered.set(name, handler) },
    BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false }) },
    dialog: { showMessageBox: async (_parent, options) => { dialogs.push(options); return { response: decision }; } },
    logger: { info: (_message, metadata) => logs.push(metadata) },
    getSettings: () => ({}), ensureRuntime: async () => {},
    aiRuntime: { submitFeedback: async example => { sent.push(example); return { id: 'public' }; } },
    trainingStore: { append: example => { saved.push(example); return { status: 'saved', id: 'local' }; } }
  });
  return { registered, saved, sent, logs, dialogs };
}
const example = { requestId: 'test-1', prompt: 'Domanda sintetica', response: 'Risposta sintetica', model: 'qwen3:8b', mode: 'fast' };

test('un voto conserva solo metadati e non autorizza training o rete', () => {
  const h = handlers();
  h.registered.get(CHANNELS.responseRating)({ sender: {} }, { ...example, rating: 'up', target: 'current' });
  assert.deepEqual(Object.keys(h.logs[0]).sort(), ['rating', 'requestId', 'target']);
  assert.equal(h.saved.length + h.sent.length + h.dialogs.length, 0);
  assert.throws(() => h.registered.get(CHANNELS.responseRating)({}, { ...example, rating: 'anything', target: 'current' }));
});
for (const distributionMode of ['developer', 'public']) {
  test(`annullare il consenso non salva e non invia (${distributionMode})`, async () => {
    const h = handlers({ distributionMode });
    const result = await h.registered.get(CHANNELS.trainingExample)({ sender: {} }, example);
    assert.equal(result.status, 'cancelled');
    assert.equal(h.saved.length + h.sent.length, 0);
    assert.equal(h.dialogs[0].defaultId, h.dialogs[0].cancelId);
  });
  test(`il consenso esplicito raggiunge soltanto la destinazione dichiarata (${distributionMode})`, async () => {
    const h = handlers({ distributionMode, decision: 1 });
    await h.registered.get(CHANNELS.trainingExample)({ sender: {} }, example);
    const records = distributionMode === 'public' ? h.sent : h.saved;
    assert.equal(records.length, 1);
    assert.equal(records[0].consent, true);
    assert.equal(distributionMode === 'public' ? h.saved.length : h.sent.length, 0);
  });
}

test('il provider rifiuta contributi senza consenso prima di aprire una sessione', async () => {
  const { NexusServiceProvider } = require('../src/ai/providers/nexus-service-provider');
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://example.com' } });
  provider.ensureToken = () => { throw new Error('La rete non deve essere usata'); };
  await assert.rejects(provider.submitFeedback(example), /Consenso esplicito/);
  await assert.rejects(provider.submitFeedback({ ...example, consent: 'true' }), /Consenso esplicito/);
});
