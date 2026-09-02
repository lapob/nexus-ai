const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adaptiveModelSelection,
  canonicalModelId,
  developmentProfile,
  MODEL_PROFILES,
  modelMemoryBudget,
  modelSuitability,
  profileModels,
  provisioningStatus,
  publicModelName,
  isUserSelectableModel,
  recommendedProfile
} = require('../src/ai/model-manifest');

const GIB = 1024 ** 3;

test('seleziona profili differenti in base alle risorse reali', () => {
  assert.equal(recommendedProfile({ totalMemoryBytes: 8 * GIB, cpuThreads: 4 }), 'lite');
  assert.equal(recommendedProfile({ totalMemoryBytes: 16 * GIB, cpuThreads: 8 }), 'essential');
  assert.equal(recommendedProfile({ totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 }), 'complete');
  assert.equal(recommendedProfile({ totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 16 * GIB, cpuThreads: 16 }), 'ultra');
});

test('anche il profilo Ultra usa il modello generalista che supera i benchmark', () => {
  assert.equal(MODEL_PROFILES.ultra.main, 'qwen3:14b');
  assert.equal(MODEL_PROFILES.ultra.fast, 'qwen3:14b');
});

test('calcola soltanto i modelli mancanti senza duplicare ruoli', () => {
  assert.deepEqual(profileModels(MODEL_PROFILES.lite), ['qwen3:1.7b', 'qwen3-embedding:0.6b']);
  assert.deepEqual(profileModels(MODEL_PROFILES.essential), ['qwen3:8b', 'qwen3:4b', 'qwen3-embedding:0.6b']);
  const status = provisioningStatus(
    [{ id: 'qwen3:8b' }],
    { totalMemoryBytes: 16 * GIB, cpuThreads: 8, freeDiskBytes: 50 * GIB }
  );
  const essential = status.profiles.find((profile) => profile.id === 'essential');
  assert.deepEqual(essential.missing, ['qwen3:4b', 'qwen3-embedding:0.6b']);
  assert.equal(essential.compatible, true);
  assert.equal(essential.complete, false);
  assert.equal(essential.downloadBytes > 0, true);
});

test('segnala i modelli troppo pesanti senza impedirne la scelta manuale', () => {
  const hardware = { totalMemoryBytes: 8 * GIB, cpuThreads: 4 };
  assert.equal(modelSuitability('qwen3:14b', hardware).compatible, false);
  assert.equal(modelSuitability('qwen3:1.7b', hardware).recommended, true);
});

test('la workstation di sviluppo principale usa il profilo massimo già presente', () => {
  const installed = ['qwen3:14b', 'qwen3:8b', 'qwen3-embedding:0.6b'];
  assert.equal(developmentProfile(
    { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 },
    installed
  ), 'complete');
});

test('una workstation Ultra completa seleziona automaticamente il profilo massimo', () => {
  const installed = ['qwen3:30b', 'qwen3:8b', 'qwen3-embedding:0.6b'];
  assert.equal(developmentProfile(
    { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 16 * GIB, cpuThreads: 16 },
    installed
  ), 'ultra');
});

test('un PC di sviluppo secondario preferisce un profilo compatibile già completo', () => {
  const installed = ['qwen3:4b', 'qwen3:1.7b', 'qwen3-embedding:0.6b'];
  assert.equal(developmentProfile(
    { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 },
    installed
  ), 'lite');
});

test('normalizza registry, maiuscole e digest senza confondere tag differenti', () => {
  assert.equal(canonicalModelId('registry.ollama.ai/library/QWEN3:8B@sha256:abc'), 'qwen3:8b');
  assert.equal(canonicalModelId('qwen3'), 'qwen3:latest');
  assert.notEqual(canonicalModelId('qwen3'), canonicalModelId('qwen3:8b'));
  const status = provisioningStatus(
    [{ name: 'registry.ollama.ai/library/QWEN3:8B@sha256:abc' }],
    { totalMemoryBytes: 16 * GIB, cpuThreads: 8 }
  );
  assert.equal(status.profiles.find((profile) => profile.id === 'essential').missing.includes('qwen3:8b'), false);
});

test('espone nomi prodotto NEXUSNXS senza alterare gli identificatori runtime', () => {
  assert.equal(publicModelName('qwen3:1.7b'), 'NexusNXS Nano');
  assert.equal(publicModelName('qwen3:4b'), 'NexusNXS Pulse');
  assert.equal(publicModelName('qwen3:8b'), 'NexusNXS Core');
  assert.equal(publicModelName('qwen3:14b'), 'NexusNXS Prime');
  assert.equal(publicModelName('qwen3:30b'), 'NexusNXS Ultra');
  assert.equal(isUserSelectableModel('qwen3:30b'), false);
  assert.equal(publicModelName('qwen3-embedding:0.6b'), 'NexusNXS Memory');
  assert.equal(publicModelName('provider/custom:1b'), 'provider/custom:1b');
  assert.equal(isUserSelectableModel('nexus-nexus-personal:latest'), false);
  assert.equal(isUserSelectableModel('qwen3:8b'), true);
});

test('sceglie modelli usando dimensioni reali e risorse, senza dipendere dal nome', () => {
  const models = [
    { id: 'vendor/tiny', size: 1.4 * GIB, capabilities: { chat: true } },
    { id: 'vendor/mid', size: 2.5 * GIB, capabilities: { chat: true } },
    { id: 'vendor/large', size: 5.2 * GIB, capabilities: { chat: true } }
  ];
  const lite = adaptiveModelSelection(models, { totalMemoryBytes: 8 * GIB, cpuThreads: 4 });
  const mainstream = adaptiveModelSelection(models, { totalMemoryBytes: 16 * GIB, cpuThreads: 8 });
  assert.equal(lite.chatModel, 'vendor/tiny');
  assert.equal(lite.fastModel, 'vendor/tiny');
  assert.equal(mainstream.chatModel, 'vendor/large');
  assert.equal(mainstream.fastModel, 'vendor/mid');
  assert.ok(modelMemoryBudget({ totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 })
    > modelMemoryBudget({ totalMemoryBytes: 8 * GIB, cpuThreads: 4 }));
});

test('mantiene il modello MoE Ultra sperimentale fuori dalla selezione automatica', () => {
  const models = [
    { id: 'qwen3:8b', size: 5.2 * GIB, capabilities: { chat: true } },
    { id: 'qwen3:14b', size: 9.2 * GIB, capabilities: { chat: true } },
    { id: 'qwen3:30b', size: 19 * GIB, capabilities: { chat: true } }
  ];
  const ultra = adaptiveModelSelection(models, { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 16 * GIB, cpuThreads: 16 });
  const ordinary = adaptiveModelSelection(models, { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 });
  assert.notEqual(ultra.chatModel, 'qwen3:30b');
  assert.equal(ultra.fastModel, 'qwen3:14b');
  assert.notEqual(ordinary.chatModel, 'qwen3:30b');
  assert.equal(modelSuitability('qwen3:30b', { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 16 * GIB, cpuThreads: 16 }).compatible, true);
  assert.equal(modelSuitability('qwen3:30b', { totalMemoryBytes: 32 * GIB, gpuMemoryBytes: 12 * GIB, cpuThreads: 16 }).compatible, false);
});
