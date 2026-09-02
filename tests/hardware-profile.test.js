const test = require('node:test');
const assert = require('node:assert/strict');
const { GIB, classifyHardware, parseNvidiaSmi, runtimeTuning } = require('../src/ai/hardware-profile');

test('classifica in modo conservativo un computer con poche risorse', () => {
  const profile = classifyHardware({ totalMemoryBytes: 8 * GIB, cpuThreads: 4, gpuMemoryBytes: 0 });
  assert.equal(profile.tier, 'lite');
  assert.equal(profile.performanceLevel, 1);
  assert.equal(profile.accelerated, false);
});

test('usa RAM, CPU e memoria grafica per i livelli superiori', () => {
  const balanced = classifyHardware({ totalMemoryBytes: 16 * GIB, cpuThreads: 8, gpuMemoryBytes: 4 * GIB });
  const performance = classifyHardware({ totalMemoryBytes: 32 * GIB, cpuThreads: 16, gpuMemoryBytes: 12 * GIB });
  assert.equal(balanced.tier, 'balanced');
  assert.equal(balanced.performanceLevel, 3);
  assert.equal(performance.tier, 'performance');
  assert.equal(performance.performanceLevel, 4);
  assert.equal(classifyHardware({ totalMemoryBytes: 64 * GIB, cpuThreads: 24, gpuMemoryBytes: 24 * GIB }).performanceLevel, 5);
  assert.equal(classifyHardware({ totalMemoryBytes: 32 * GIB, cpuThreads: 16, gpuMemoryBytes: 16 * GIB }).performanceLevel, 5);
});

test('mantiene un profilo prudente sulle soglie hardware borderline', () => {
  assert.equal(classifyHardware({ totalMemoryBytes: 12 * GIB, cpuThreads: 8, gpuMemoryBytes: 4 * GIB }).tier, 'lite');
  assert.equal(classifyHardware({ totalMemoryBytes: 24 * GIB, cpuThreads: 12, gpuMemoryBytes: 8 * GIB }).tier, 'balanced');
});

test('non promuove un PC con molta RAM ma CPU debole e nessuna GPU', () => {
  assert.equal(classifyHardware({ totalMemoryBytes: 32 * GIB, cpuThreads: 4, gpuMemoryBytes: 0 }).tier, 'lite');
});

test('legge nome e VRAM reale dall’output NVIDIA SMI', () => {
  assert.deepEqual(parseNvidiaSmi('NVIDIA RTX 4070, 12282\n'), [{
    Name: 'NVIDIA RTX 4070',
    AdapterRAM: 12282 * 1024 ** 2
  }]);
  assert.deepEqual(parseNvidiaSmi('output non valido'), []);
});


test('adatta contesto, output e permanenza del modello al computer', () => {
  const lite = runtimeTuning({ totalMemoryBytes: 8 * GIB, cpuThreads: 4 });
  const balanced = runtimeTuning({ totalMemoryBytes: 16 * GIB, cpuThreads: 8, gpuMemoryBytes: 4 * GIB });
  const performance = runtimeTuning({ totalMemoryBytes: 32 * GIB, cpuThreads: 16, gpuMemoryBytes: 16 * GIB });
  const maximum = runtimeTuning({ totalMemoryBytes: 64 * GIB, cpuThreads: 24, gpuMemoryBytes: 24 * GIB });
  const efficient = runtimeTuning({ totalMemoryBytes: 12 * GIB, cpuThreads: 8 });

  assert.deepEqual(
    [lite.contextTokens, balanced.contextTokens, performance.contextTokens],
    [1536, 4096, 16384]
  );
  assert.equal(maximum.contextTokens, 17408);
  assert.ok(lite.quickTokens < balanced.quickTokens);
  assert.equal(efficient.performanceLevel, 2);
  assert.ok(lite.contextTokens < efficient.contextTokens);
  assert.ok(balanced.deepTokens < performance.deepTokens);
  assert.ok(performance.deepTokens >= 4096);
  assert.equal(lite.keepAlive, '3m');
  assert.equal(maximum.keepAlive, '15m');
  assert.ok(lite.quickTimeoutMs > performance.quickTimeoutMs);
  assert.ok(lite.deepTimeoutMs > lite.quickTimeoutMs);
  assert.equal(performance.deepTimeoutMs, 240_000);
  assert.equal(performance.parallelRequests, 1);
  assert.equal(performance.maxLoadedModels, 1);
  assert.equal(maximum.maxLoadedModels, 2);
});
