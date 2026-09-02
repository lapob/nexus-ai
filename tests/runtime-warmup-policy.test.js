const test = require('node:test');
const assert = require('node:assert/strict');
const { createWarmupSingleflight, keepWarmIntervalMs, residentModelOptions, runtimeWarmupPolicy } = require('../src/application/runtime-warmup-policy');

test('il server headless preriscalda anche un runtime Ollama esterno', () => {
  const policy = runtimeWarmupPolicy({ serverMode: true, managedRuntimeAvailable: false, performanceLevel: 4, keepAlive: '15m' });
  assert.equal(policy.enabled, true);
  assert.equal(policy.keepWarm, true);
  assert.equal(policy.startImmediately, true);
  assert.equal(policy.requiresReadiness, true);
  assert.equal(policy.idleSeconds, 0);
  assert.deepEqual(policy.retryDelaysMs, [5_000, 15_000, 30_000]);
});

test('un client pubblico non avvia inferenza o warm-up locale', () => {
  const policy = runtimeWarmupPolicy({ publicClientMode: true, serverMode: false, managedRuntimeAvailable: true, performanceLevel: 5 });
  assert.equal(policy.enabled, false);
  assert.equal(policy.keepWarm, false);
  assert.equal(policy.startImmediately, false);
  assert.equal(policy.requiresReadiness, false);
});

test('il refresh precede keep-alive senza polling aggressivo', () => {
  assert.equal(keepWarmIntervalMs('3m'), 108_000);
  assert.equal(keepWarmIntervalMs('15m'), 540_000);
  assert.equal(keepWarmIntervalMs('1h'), 600_000);
});

test('warm-up concorrenti condividono una singola esecuzione e readiness diventa vera soltanto al termine', async () => {
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let clock = 10;
  const warmup = createWarmupSingleflight(async () => { calls += 1; await blocked; return { warmed: true }; }, { now: () => ++clock });

  const first = warmup.run();
  const second = warmup.run();
  assert.strictEqual(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(warmup.status(), { status: 'warming', ready: false, startedAt: 11, completedAt: 0, inFlight: true });

  release();
  await first;
  assert.equal(warmup.status().ready, true);
  assert.equal(warmup.status().inFlight, false);
});

test('un warm-up fallito non dichiara il runtime pronto e può essere ritentato', async () => {
  let calls = 0;
  const warmup = createWarmupSingleflight(async () => {
    calls += 1;
    if (calls === 1) throw new Error('runtime offline');
    return { warmed: true };
  });
  await assert.rejects(() => warmup.run(), /offline/);
  assert.equal(warmup.status().ready, false);
  await warmup.run();
  assert.equal(calls, 2);
  assert.equal(warmup.status().ready, true);
});

test('inoltra le opzioni del mantenimento alla singola esecuzione condivisa', async () => {
  const received = [];
  const warmup = createWarmupSingleflight(async (options) => { received.push(options); return { warmed: true }; });
  const first = warmup.run({ preserveLoadedModel: true });
  const second = warmup.run({ preserveLoadedModel: false });
  assert.equal(first, second);
  await first;
  assert.deepEqual(received, [{ preserveLoadedModel: true }]);
});

test('riusa la residenza soltanto per turni rapidi su runtime a slot singolo', () => {
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 1, mode: 'fast', fastModel: 'fast', primaryModel: 'primary' }), {
    reuseLoadedModel: true,
    reusableModels: ['fast', 'primary']
  });
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 1, mode: 'deep', fastModel: 'fast', primaryModel: 'primary' }), {});
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 2, mode: 'fast', fastModel: 'fast', primaryModel: 'primary' }), {});
});
