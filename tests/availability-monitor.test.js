const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DAY_MS,
  availabilitySummary,
  collectAvailabilitySample,
  createAvailabilityMonitor,
  endpointId,
  formatAvailabilityReport,
  persistAvailability,
  readAvailabilitySamples
} = require('../src/infrastructure/storage/availability-monitor');

test('il rapporto distingue HTTP 503, errore di rete e SLO non misurato', () => {
  const rows = [
    { at: Date.now(), endpoint: 'nexusnxs.com', ok: true, status: 200, latencyMs: 100 },
    { at: Date.now(), endpoint: 'ai.nexusnxs.com/healthz', ok: false, status: 503, latencyMs: 120 },
    { at: Date.now(), endpoint: 'ai.nexusnxs.com/readyz', ok: false, status: 0, latencyMs: 5000 }
  ];
  const report = availabilitySummary(rows);
  const output = formatAvailabilityReport(report, rows);
  assert.match(output, /degraded; SLO 30 giorni: storico insufficiente, budget non misurato/);
  assert.match(output, /ERRORE ai.nexusnxs.com\/healthz: HTTP 503 \(120 ms\)/);
  assert.match(output, /ERRORE ai.nexusnxs.com\/readyz: connessione fallita o timeout/);
  assert.doesNotMatch(output, /20000%/);
  assert.equal(report.errorBudget.consumedPercent, 20000);
});

test('una ripresa corrente non nasconde uno SLO storico fallito', () => {
  const row = { at: Date.now(), endpoint: 'nexusnxs.com', ok: true, status: 200, latencyMs: 10 };
  const output = formatAvailabilityReport({ measured: true, windowDays: 30, status: 'fail', errorBudget: { consumedPercent: 200 } }, [row]);
  assert.match(output, /online; SLO 30 giorni: fail; budget consumato 200%/);
  assert.match(output, /OK nexusnxs.com: HTTP 200/);
});

test('il monitor conserva solo endpoint pubblico, esito e latenza', async () => {
  let clock = 1_000;
  const rows = await collectAvailabilitySample({
    endpoints: ['https://ai.nexusnxs.com/readyz'],
    now: () => (clock += 17),
    fetchImpl: async () => ({ ok: true, status: 200 })
  });
  assert.deepEqual(rows[0], { schemaVersion: 1, at: 1017, endpoint: 'ai.nexusnxs.com/readyz', ok: true, status: 200, latencyMs: 17 });
  assert.doesNotMatch(JSON.stringify(rows), /prompt|answer|ip|authorization/i);
});

test('rilascia il corpo delle risposte anche quando il cleanup fallisce', async () => {
  let cancelled = 0;
  const rows = await collectAvailabilitySample({
    endpoints: ['https://nexusnxs.com/'],
    fetchImpl: async () => ({ ok: true, status: 200, body: { cancel: async () => { cancelled++; throw new Error('already closed'); } } })
  });
  assert.equal(cancelled, 1);
  assert.equal(rows[0].ok, true);
});

test('il monitor residente evita campioni concorrenti e si arresta in modo pulito', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-availability-service-'));
  try {
    const monitor = createAvailabilityMonitor({
      endpoints: ['https://nexusnxs.com/'],
      historyPath: path.join(root, 'history.ndjson'),
      reportPath: path.join(root, 'report.json'),
      minimumSamples: 1,
      minimumCoveragePercent: 50,
      intervalMs: 30_000,
      timeoutMs: 5_000
    });
    assert.equal(monitor.start({ initialDelayMs: 60_000 }), true);
    assert.equal(monitor.start(), false);
    assert.equal(monitor.status().running, true);
    await monitor.stop();
    assert.equal(monitor.status().running, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('segnala soltanto transizioni concrete di disponibilita senza endpoint o contenuti', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-availability-alert-'));
  const transitions = [];
  let online = false;
  try {
    const monitor = createAvailabilityMonitor({
      endpoints: ['https://ai.nexusnxs.com/readyz'],
      historyPath: path.join(root, 'history.ndjson'),
      reportPath: path.join(root, 'report.json'),
      minimumSamples: 1,
      fetchImpl: async () => ({ ok: online, status: online ? 200 : 503 }),
      onStateChange: (state) => transitions.push(state)
    });
    await monitor.run();
    await monitor.run();
    online = true;
    await monitor.run();
    assert.deepEqual(transitions, [
      { state: 'degraded', previous: '', failedEndpoints: 1 },
      { state: 'online', previous: 'degraded', failedEndpoints: 0 }
    ]);
    assert.doesNotMatch(JSON.stringify(transitions), /readyz|prompt|answer|ip/i);
    await monitor.stop();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rifiuta URL non HTTPS o contenenti credenziali e query', () => {
  assert.throws(() => endpointId('http://example.test/health'), /HTTPS/);
  assert.throws(() => endpointId('https://user@example.test/health'), /HTTPS/);
  assert.throws(() => endpointId('https://example.test/health?secret=1'), /HTTPS/);
});

test('la finestra diventa misurata soltanto con campioni e copertura sufficienti', () => {
  const now = 40 * DAY_MS;
  const healthy = Array.from({ length: 10 }, (_, index) => ({
    at: now - 9 * DAY_MS + index * DAY_MS,
    endpoint: 'ai.nexusnxs.com/readyz', ok: index !== 0, status: index === 0 ? 503 : 200, latencyMs: 120
  }));
  const passing = availabilitySummary(healthy, { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90, sampleIntervalMs: DAY_MS, targetPercent: 80 });
  assert.equal(passing.status, 'pass');
  assert.equal(passing.errorBudget.allowedErrorPercent, 20);
  assert.equal(passing.errorBudget.actualErrorPercent, 10);
  assert.equal(passing.errorBudget.consumedPercent, 50);
  assert.equal(passing.errorBudget.remainingPercent, 50);
  assert.equal(passing.errorBudget.burnRate, 0.5);
  assert.equal(availabilitySummary(healthy.slice(2), { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90 }).status, 'not-measured');
  assert.equal(availabilitySummary(healthy, { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90, sampleIntervalMs: DAY_MS, targetPercent: 95 }).status, 'fail');
});

test('campioni distanti non certificano gli intervalli senza monitoraggio', () => {
  const now = 40 * DAY_MS;
  const sparse = Array.from({ length: 1_001 }, (_, index) => ({
    at: now - 30 * DAY_MS + index * 30 * DAY_MS / 1_000,
    endpoint: 'ai.nexusnxs.com/readyz', ok: true, status: 200, latencyMs: 50
  }));
  const report = availabilitySummary(sparse, { now });
  assert.equal(report.status, 'not-measured');
  assert.equal(report.endpoints[0].spanMs, 30 * DAY_MS);
  assert.equal(report.endpoints[0].coverageMs, 1_000 * 60_000);
  assert.ok(report.endpoints[0].coveragePercent < 3);
});

test('filtra la finestra, deduplica conservando i guasti e richiede tutti gli endpoint', () => {
  const now = 40 * DAY_MS;
  const sample = { endpoint: 'nexusnxs.com', ok: true, status: 200, latencyMs: 50 };
  const dense = Array.from({ length: 1_441 }, (_, index) => ({ ...sample, at: now - DAY_MS + index * 60_000 }));
  const rows = [...dense, { ...sample, at: now - 2 * DAY_MS }, { ...sample, at: now + 1 },
    { ...sample, at: now, ok: false, status: 503 }];
  const options = { now, windowDays: 1 };
  const report = availabilitySummary(rows, options);
  assert.equal(report.status, 'pass');
  assert.equal(report.endpoints[0].samples, 1_441);
  assert.equal(report.endpoints[0].coverageMs, DAY_MS);
  assert.ok(report.availabilityPercent < 100);
  assert.equal(availabilitySummary(rows, { ...options, expectedEndpoints: ['https://ai.nexusnxs.com/readyz'] }).measured, false);
  assert.equal(availabilitySummary(rows, { ...options, now: now + 180_000 }).measured, false);
});

test('persistenza atomica scarta righe corrotte e limita lo storico', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-availability-'));
  try {
    const filePath = path.join(root, 'availability.ndjson');
    fs.writeFileSync(filePath, '{corrotto}\n', 'utf8');
    const samples = Array.from({ length: 1_100 }, (_, index) => ({ at: Date.now() - index, endpoint: 'nexusnxs.com', ok: true, status: 200, latencyMs: 30 }));
    persistAvailability(filePath, samples, { maxRows: 1_000 });
    assert.equal(readAvailabilitySamples(filePath, { windowDays: 45 }).length, 1_000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
