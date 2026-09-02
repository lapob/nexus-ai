/**
 * @module infrastructure/storage/availability-monitor
 * @description Campiona la disponibilita pubblica senza conservare richieste, IP o dati utente.
 */
const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;

// #region 01 - Campionamento e riepilogo privacy-safe

function percentile(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1))];
}

function endpointId(value) {
  const endpoint = new URL(String(value));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Il monitor accetta soltanto endpoint HTTPS pubblici senza credenziali o query.');
  }
  return `${endpoint.hostname}${endpoint.pathname}`.replace(/\/$/, '') || endpoint.hostname;
}

function normalizeSample(value) {
  const at = Number(value?.at);
  const latencyMs = Number(value?.latencyMs);
  const status = Number(value?.status);
  const endpoint = String(value?.endpoint || '').trim().slice(0, 160);
  if (!Number.isFinite(at) || at <= 0 || !endpoint || !Number.isFinite(latencyMs) || latencyMs < 0) return null;
  return Object.freeze({
    schemaVersion: 1,
    at: Math.round(at),
    endpoint,
    ok: value?.ok === true,
    status: Number.isInteger(status) ? Math.max(0, Math.min(599, status)) : 0,
    latencyMs: Math.round(Math.min(latencyMs, 120_000))
  });
}

async function collectAvailabilitySample({ endpoints = [], fetchImpl = globalThis.fetch, now = () => Date.now(), timeoutMs = 5_000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch non disponibile per il monitor di disponibilita.');
  const capturedAt = now();
  return Promise.all(endpoints.map(async (value) => {
    const endpoint = endpointId(value);
    const startedAt = now();
    try {
      const response = await fetchImpl(value, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      return normalizeSample({ at: capturedAt, endpoint, ok: response.ok, status: response.status, latencyMs: now() - startedAt });
    } catch {
      return normalizeSample({ at: capturedAt, endpoint, ok: false, status: 0, latencyMs: now() - startedAt });
    }
  }));
}

function readAvailabilitySamples(filePath, { now = Date.now(), windowDays = 30 } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const cutoff = now - Math.max(1, Number(windowDays) || 30) * DAY_MS;
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const sample = normalizeSample(JSON.parse(line));
      return sample && sample.at >= cutoff && sample.at <= now + 60_000 ? [sample] : [];
    } catch { return []; }
  });
}

function availabilitySummary(samples = [], { targetPercent = 99.5, windowDays = 30, minimumSamples = 1_000, minimumCoveragePercent = 95, now = Date.now() } = {}) {
  const normalized = samples.map(normalizeSample).filter(Boolean);
  const byEndpoint = new Map();
  for (const sample of normalized) {
    const rows = byEndpoint.get(sample.endpoint) || [];
    rows.push(sample);
    byEndpoint.set(sample.endpoint, rows);
  }
  const requiredCoverageMs = Math.max(1, Number(windowDays) || 30) * DAY_MS * Math.max(0.5, Math.min(1, Number(minimumCoveragePercent) / 100 || 0.95));
  const endpoints = [...byEndpoint.entries()].map(([endpoint, rows]) => {
    const ordered = rows.sort((left, right) => left.at - right.at);
    const successful = ordered.filter((row) => row.ok);
    return {
      endpoint,
      samples: ordered.length,
      availabilityPercent: Number((successful.length / ordered.length * 100).toFixed(4)),
      p95LatencyMs: percentile(successful.map((row) => row.latencyMs), 0.95),
      firstSampleAt: ordered[0]?.at || 0,
      lastSampleAt: ordered.at(-1)?.at || 0,
      coverageMs: ordered.length > 1 ? ordered.at(-1).at - ordered[0].at : 0
    };
  });
  const measured = endpoints.length > 0 && endpoints.every((entry) => entry.samples >= minimumSamples && entry.coverageMs >= requiredCoverageMs);
  const availabilityPercent = endpoints.length ? Math.min(...endpoints.map((entry) => entry.availabilityPercent)) : 0;
  const allowedErrorPercent = Math.max(0.0001, 100 - Number(targetPercent));
  const actualErrorPercent = Math.max(0, 100 - availabilityPercent);
  const consumedPercent = Math.max(0, actualErrorPercent / allowedErrorPercent * 100);
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    windowDays,
    targetPercent,
    measured,
    status: !measured ? 'not-measured' : availabilityPercent >= targetPercent ? 'pass' : 'fail',
    availabilityPercent,
    errorBudget: Object.freeze({
      allowedErrorPercent: Number(allowedErrorPercent.toFixed(4)),
      actualErrorPercent: Number(actualErrorPercent.toFixed(4)),
      consumedPercent: Number(consumedPercent.toFixed(2)),
      remainingPercent: Number(Math.max(0, 100 - consumedPercent).toFixed(2)),
      burnRate: Number((actualErrorPercent / allowedErrorPercent).toFixed(2))
    }),
    endpoints
  });
}

// #endregion
// #region 02 - Persistenza e ciclo residente

function persistAvailability(filePath, samples, { maxRows = 150_000 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readAvailabilitySamples(filePath, { windowDays: 45 });
  const merged = [...existing, ...samples.map(normalizeSample).filter(Boolean)].slice(-Math.max(1_000, Number(maxRows) || 150_000));
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, merged.map((row) => JSON.stringify(row)).join('\n') + (merged.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return merged;
}

function createAvailabilityMonitor({
  endpoints,
  historyPath,
  reportPath,
  targetPercent = 99.5,
  windowDays = 30,
  minimumSamples = 1_000,
  minimumCoveragePercent = 95,
  intervalMs = 60_000,
  timeoutMs = 5_000,
  fetchImpl = globalThis.fetch,
  onStateChange = null,
  logger = null
} = {}) {
  let timer = null;
  let initialTimer = null;
  let inFlight = null;
  let lastState = '';
  const run = () => {
    if (inFlight) return inFlight;
    inFlight = collectAvailabilitySample({ endpoints, timeoutMs, fetchImpl })
      .then((samples) => {
        const history = persistAvailability(historyPath, samples);
        const report = availabilitySummary(history, { targetPercent, windowDays, minimumSamples, minimumCoveragePercent });
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        const state = samples.every((sample) => sample?.ok) ? 'online' : 'degraded';
        if (state !== lastState) {
          const previous = lastState;
          lastState = state;
          try {
            onStateChange?.(Object.freeze({ state, previous, failedEndpoints: samples.filter((sample) => !sample?.ok).length }));
          } catch (error) { logger?.warn?.('Consumer stato disponibilita isolato dopo un errore.', { error }); }
        }
        return report;
      })
      .catch((error) => {
        logger?.warn?.('Campione disponibilita non riuscito.', { error });
        return null;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  return Object.freeze({
    run,
    start({ initialDelayMs = 15_000 } = {}) {
      if (timer) return false;
      initialTimer = setTimeout(() => {
        initialTimer = null;
        run();
      }, Math.max(0, Number(initialDelayMs) || 0));
      initialTimer.unref?.();
      timer = setInterval(run, Math.max(30_000, Number(intervalMs) || 60_000));
      timer.unref?.();
      return true;
    },
    async stop() {
      if (timer) clearInterval(timer);
      if (initialTimer) clearTimeout(initialTimer);
      timer = null;
      initialTimer = null;
      await inFlight;
    },
    status: () => ({ running: Boolean(timer), inFlight: Boolean(inFlight), state: lastState || 'unknown' })
  });
}

// #endregion

module.exports = {
  DAY_MS,
  availabilitySummary,
  collectAvailabilitySample,
  createAvailabilityMonitor,
  endpointId,
  normalizeSample,
  persistAvailability,
  readAvailabilitySamples
};
