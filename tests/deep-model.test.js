const test = require('node:test');
const assert = require('node:assert/strict');
const { explicitDeepModel, resolveDeepModel, DEEP_MODEL_REQUEST } = require('../src/application/deep-model');
const { DEEP_MODEL, adaptiveModelSelection } = require('../src/ai/model-manifest');

const installed = [{ id: 'qwen3:14b' }, { id: DEEP_MODEL }];

test('il modello profondo risponde solo alla richiesta esplicita "Approfondito"', () => {
  assert.equal(explicitDeepModel({ requestedMode: 'deep', installedModels: installed }), DEEP_MODEL);
  assert.equal(explicitDeepModel({ requestedMode: 'fast', installedModels: installed }), null);
  assert.equal(explicitDeepModel({ requestedMode: undefined, installedModels: installed }), null, 'l’escalation automatica non lo usa');
});

test('ospiti pubblici e client pubblico non usano mai il modello profondo', () => {
  assert.equal(explicitDeepModel({ requestedMode: 'deep', publicGuest: true, installedModels: installed }), null);
  assert.equal(explicitDeepModel({ requestedMode: 'deep', distributionMode: 'public', installedModels: installed }), null);
});

test('se non è installato si resta sul percorso ordinario, senza download', async () => {
  assert.equal(explicitDeepModel({ requestedMode: 'deep', installedModels: [{ id: 'qwen3:14b' }] }), null);
  let listed = 0;
  assert.equal(await resolveDeepModel({ requestedMode: 'fast' }, async () => { listed += 1; return installed; }), null);
  assert.equal(listed, 0, 'nessun elenco modelli per le richieste rapide');
  assert.equal(await resolveDeepModel({ requestedMode: 'deep' }, async () => installed), DEEP_MODEL);
  assert.equal(await resolveDeepModel({ requestedMode: 'deep' }, async () => { throw new Error('runtime giù'); }), null);
});

test('budget del turno adatto a ~10 token/s e niente thinking', () => {
  assert.equal(DEEP_MODEL_REQUEST.think, false);
  assert.ok(DEEP_MODEL_REQUEST.timeoutMs >= DEEP_MODEL_REQUEST.maxTokens / 10 * 1000 * 1.5);
});

test('un modello di prova installato non diventa il principale in automatico', () => {
  const { automaticChatCandidates } = require('../src/ai/model-manifest');
  const hardware = { totalMemoryBytes: 32 * 2 ** 30, gpuMemoryBytes: 16 * 2 ** 30, cpuThreads: 16, performanceLevel: 5 };
  const models = [{ id: 'qwen3:8b', size: 5_225_388_164 }, { id: 'qwen3:14b', size: 9_276_198_565 }, { id: 'gpt-oss:20b', size: 13_793_000_000 }, { id: 'qwen3-vl:8b', size: 6_100_000_000 }];
  assert.deepEqual(automaticChatCandidates(models).map((m) => m.id), ['qwen3:8b', 'qwen3:14b']);
  assert.equal(adaptiveModelSelection(automaticChatCandidates(models), hardware).chatModel, 'qwen3:14b');
  assert.equal(automaticChatCandidates([{ id: 'gpt-oss:20b', size: 1 }]).length, 1, 'senza modelli del catalogo resta ciò che c’è');
});

test('su 16 GB di VRAM la selezione automatica resta sul 14B', () => {
  const hardware = { totalMemoryBytes: 32 * 2 ** 30, gpuMemoryBytes: 16 * 2 ** 30, cpuThreads: 16, performanceLevel: 5 };
  const models = [{ id: 'qwen3:14b', size: 9_276_198_565 }, { id: DEEP_MODEL, size: 17_741_872_132 }];
  assert.equal(adaptiveModelSelection(models, hardware).chatModel, 'qwen3:14b');
});
