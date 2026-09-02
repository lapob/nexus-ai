/**
 * @module application/shutdown-coordinator
 * @description Arresto a fasi con timeout isolati e chiusura garantita degli store.
 */

// #region 01 — Operazioni isolate

function normalizeOperation(operation, fallbackLabel) {
  if (typeof operation === 'function') return { label: fallbackLabel, run: operation };
  return {
    label: String(operation?.label || fallbackLabel),
    run: typeof operation?.run === 'function'
      ? operation.run
      : typeof operation?.close === 'function'
        ? operation.close
        : async () => {}
  };
}

async function settleWithTimeout(operation, {
  logger,
  timeoutMs = 2_500,
  fallbackLabel = 'servizio'
} = {}) {
  const normalized = normalizeOperation(operation, fallbackLabel);
  let timer = null;
  const execution = Promise.resolve().then(normalized.run);
  // Il ramo di errore resta osservato anche dopo un timeout: una Promise lenta
  // non deve produrre rejection non gestite mentre il processo sta uscendo.
  execution.catch(() => {});
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'timeout', label: normalized.label }), Math.max(1, timeoutMs));
  });
  try {
    const result = await Promise.race([
      execution.then(
        () => ({ status: 'fulfilled', label: normalized.label }),
        (error) => ({ status: 'rejected', label: normalized.label, error })
      ),
      timeout
    ]);
    if (result.status === 'timeout') {
      logger?.warn?.(`Arresto ${normalized.label} oltre il tempo previsto.`, { timeoutMs });
    } else if (result.status === 'rejected') {
      logger?.warn?.(`Arresto ${normalized.label} incompleto.`, { error: result.error });
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function settlePhase(operations, options) {
  return Promise.all((operations || []).map((operation, index) => settleWithTimeout(operation, {
    ...options,
    fallbackLabel: `${options?.fallbackLabel || 'operazione'} ${index + 1}`
  })));
}

// #endregion
// #region 02 — Coordinamento a fasi

async function coordinateShutdown({
  services = [],
  stores = [],
  finalizers = [],
  logger,
  serviceTimeoutMs = 2_500,
  storeTimeoutMs = 1_500,
  finalizerTimeoutMs = 1_000
} = {}) {
  let serviceResults = [];
  let storeResults = [];
  let finalizerResults = [];
  try {
    serviceResults = await settlePhase(services, {
      logger,
      timeoutMs: serviceTimeoutMs,
      fallbackLabel: 'servizio'
    });
  } finally {
    // Gli store vengono tentati anche se un servizio lancia o non termina. È
    // il requisito che evita WAL/lock persistenti durante un arresto degradato.
    try {
      storeResults = await settlePhase(stores, {
        logger,
        timeoutMs: storeTimeoutMs,
        fallbackLabel: 'store'
      });
    } finally {
      finalizerResults = await settlePhase(finalizers, {
        logger,
        timeoutMs: finalizerTimeoutMs,
        fallbackLabel: 'finalizzatore'
      });
    }
  }
  return { serviceResults, storeResults, finalizerResults };
}

module.exports = { coordinateShutdown, settleWithTimeout };

// #endregion
