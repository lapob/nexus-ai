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

test('reset annulla il caricamento precedente senza sovrapporlo al successivo o pubblicare readiness tardiva', async () => {
  let release, context, calls = 0;
  const warmup = createWarmupSingleflight(async (_, lifecycle) => {
    calls++; context = lifecycle;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return { warmed: true };
  });
  const first = warmup.run();
  await new Promise(setImmediate);
  warmup.reset();
  assert.equal(context.signal.aborted, true);
  assert.equal(warmup.status().ready, false);
  assert.equal(warmup.run(), first, 'Wait for old ownership to finish before retrying');
  release();
  await assert.rejects(first, { code: 'AI_REQUEST_CANCELLED' });
  assert.equal(warmup.status().status, 'idle');
  await warmup.run();
  assert.equal(calls, 2); assert.equal(warmup.status().ready, true);
});

test('inizializzare il provider appartenente al warm-up conserva la sua sola esecuzione', async () => {
  let context;
  const warmup = createWarmupSingleflight(async (_, lifecycle) => {
    context = lifecycle;
    warmup.reset({ preservePending: true });
    lifecycle.assertCurrent();
    return { warmed: true };
  });
  await warmup.run();
  assert.equal(context.signal.aborted, false);
  assert.equal(warmup.status().ready, true);
});

test('reset prima della microtask impedisce persino un caricamento già accodato', async () => {
  let calls = 0;
  const warmup = createWarmupSingleflight(async () => { calls++; });
  const pending = warmup.run(); warmup.reset();
  await assert.rejects(pending, { code: 'AI_REQUEST_CANCELLED' });
  assert.equal(calls, 0); assert.equal(warmup.status().ready, false);
});

test('riusa la residenza soltanto per turni rapidi su runtime a slot singolo', () => {
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 1, mode: 'fast', fastModel: 'fast', primaryModel: 'primary' }), {
    reuseLoadedModel: true,
    reusableModels: ['fast', 'primary']
  });
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 1, mode: 'deep', fastModel: 'fast', primaryModel: 'primary' }), {});
  assert.deepEqual(residentModelOptions({ maxLoadedModels: 2, mode: 'fast', fastModel: 'fast', primaryModel: 'primary' }), {});
});

const { warmupRetryDelay } = require('../src/application/runtime-warmup-policy');
const { createAdaptiveSettingsResolver } = require('../src/application/runtime-warmup-policy');

test('la cache adattiva cambia con la configurazione e un completamento vecchio non cancella quella nuova', async () => {
  let settings = { ai: { model: 'A' } }, release, calls = 0;
  const resolver = createAdaptiveSettingsResolver({ getSettings: () => settings, resolve: async (input, { assertCurrent }) => {
    calls++;
    if (input.ai.model === 'A') await new Promise(resolve => { release = resolve; });
    assertCurrent(); return input;
  } });
  const old = resolver(); assert.equal(resolver(), old);
  await new Promise(setImmediate);
  settings = { ai: { model: 'B' } };
  const current = resolver(); assert.equal((await current).ai.model, 'B');
  release(); await assert.rejects(old, { code: 'AI_REQUEST_CANCELLED' });
  assert.equal(resolver(), current); assert.equal(calls, 2);
});

test('una selezione adattiva valida aggiorna la chiave senza ripetere catalogo e inizializzazione', async () => {
  let settings = { ai: { model: 'auto' } }, calls = 0, ownerChecks = 0;
  const resolver = createAdaptiveSettingsResolver({ getSettings: () => settings, resolve: async (_, { assertCurrent, warmupContext }) => {
    calls++; assert.ok(warmupContext); assertCurrent(); settings = { ai: { model: 'selected' } }; return settings;
  } });
  const owner = { assertCurrent() { ownerChecks++; } };
  const first = resolver(owner); await first;
  assert.equal(resolver(owner), first); assert.equal(calls, 1); assert.ok(ownerChecks >= 2);
});

test('un errore della selezione adattiva non viene conservato come risultato valido', async () => {
  let calls = 0; const settings = { ai: { model: 'A' } };
  const resolver = createAdaptiveSettingsResolver({ getSettings: () => settings, resolve: async () => {
    if (++calls === 1) throw Error('catalog unavailable'); return settings;
  } });
  await assert.rejects(resolver(), /unavailable/); await resolver(); assert.equal(calls, 2);
});

test('recupera timeout persistenti senza ritentare errori permanenti', () => {
  const policy = runtimeWarmupPolicy({ serverMode: true });
  assert.equal(warmupRetryDelay({ code: 'AI_PROVIDER_TIMEOUT' }, 3, policy), 60000);
  assert.equal(warmupRetryDelay({ retryable: true }, 100, policy), 60000);
  assert.equal(warmupRetryDelay({ code: 'AI_MODEL_NOT_FOUND' }, 3, policy), null);
  assert.equal(warmupRetryDelay({}, 0, policy), 5000);
});
