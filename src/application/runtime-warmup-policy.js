/**
 * @module application/runtime-warmup-policy
 * @description Mantiene pronto soltanto il modello rapido, senza coinvolgere i client pubblici.
 */

function keepWarmIntervalMs(keepAlive = '10m') {
  const match = String(keepAlive || '').trim().match(/^(\d+)([smh])$/i);
  const amount = match ? Number(match[1]) : 10;
  const unitMs = !match || match[2].toLowerCase() === 'm' ? 60_000
    : match[2].toLowerCase() === 'h' ? 3_600_000 : 1_000;
  const keepAliveMs = Math.max(60_000, amount * unitMs);
  // Il refresh precede la scadenza senza trasformarsi in polling aggressivo.
  return Math.max(60_000, Math.min(10 * 60_000, Math.floor(keepAliveMs * 0.6)));
}

function residentModelOptions({ maxLoadedModels = 1, mode = 'fast', fastModel, primaryModel } = {}) {
  const fast = String(fastModel || '').trim();
  const primary = String(primaryModel || '').trim();
  if (Number(maxLoadedModels) > 1 || mode === 'deep' || !fast || !primary || fast === primary) return Object.freeze({});
  return Object.freeze({
    reuseLoadedModel: true,
    reusableModels: Object.freeze([fast, primary])
  });
}

function createWarmupSingleflight(task, { now = () => Date.now() } = {}) {
  if (typeof task !== 'function') throw new TypeError('Il task di warm-up deve essere una funzione.');
  let inFlight = null;
  let state = Object.freeze({ status: 'idle', ready: false, startedAt: 0, completedAt: 0 });

  const reset = () => {
    state = Object.freeze({ status: 'idle', ready: false, startedAt: 0, completedAt: 0 });
  };
  const status = () => ({ ...state, inFlight: Boolean(inFlight) });
  const run = (...argumentsForTask) => {
    if (inFlight) return inFlight;
    const startedAt = now();
    state = Object.freeze({ status: 'warming', ready: state.ready, startedAt, completedAt: 0 });
    inFlight = Promise.resolve()
      .then(() => task(...argumentsForTask))
      .then((result) => {
        if (result?.warmed === false) throw Object.assign(new Error('Il runtime AI non ha completato il warm-up.'), { code: 'AI_WARMUP_INCOMPLETE' });
        state = Object.freeze({ status: 'ready', ready: true, startedAt, completedAt: now() });
        return result;
      })
      .catch((error) => {
        state = Object.freeze({ status: 'failed', ready: false, startedAt, completedAt: now() });
        throw error;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  return Object.freeze({ reset, run, status });
}

function runtimeWarmupPolicy({ publicClientMode = false, serverMode = false, managedRuntimeAvailable = false, performanceLevel = 1, keepAlive = '10m' } = {}) {
  const enabled = publicClientMode !== true && (serverMode === true || managedRuntimeAvailable === true);
  return Object.freeze({
    enabled,
    // Il server espone subito il listener, ma non deve dichiarare pronta
    // l'inferenza finché il preload reale non è terminato. Il client grafico
    // conserva invece il warm-up differito per non contendere il primo paint.
    startImmediately: enabled && serverMode === true,
    requiresReadiness: enabled && serverMode === true,
    delayMs: serverMode ? 250 : performanceLevel >= 3 ? 4_500 : 6_500,
    idleSeconds: serverMode ? 0 : 2,
    keepWarm: enabled && (serverMode || performanceLevel >= 2),
    keepWarmIntervalMs: keepWarmIntervalMs(keepAlive),
    // Retry limitati e distanziati: recuperano un runtime appena avviato senza
    // trasformare /readyz o i client pubblici in un polling del modello.
    retryDelaysMs: Object.freeze(serverMode ? [5_000, 15_000, 30_000] : [])
  });
}

module.exports = { createWarmupSingleflight, keepWarmIntervalMs, residentModelOptions, runtimeWarmupPolicy };
