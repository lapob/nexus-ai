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
  persistAvailability,
  readAvailabilitySamples
} = require('../src/infrastructure/storage/availability-monitor');

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
  const passing = availabilitySummary(healthy, { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90, targetPercent: 80 });
  assert.equal(passing.status, 'pass');
  assert.equal(passing.errorBudget.allowedErrorPercent, 20);
  assert.equal(passing.errorBudget.actualErrorPercent, 10);
  assert.equal(passing.errorBudget.consumedPercent, 50);
  assert.equal(passing.errorBudget.remainingPercent, 50);
  assert.equal(passing.errorBudget.burnRate, 0.5);
  assert.equal(availabilitySummary(healthy.slice(2), { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90 }).status, 'not-measured');
  assert.equal(availabilitySummary(healthy, { now, windowDays: 10, minimumSamples: 10, minimumCoveragePercent: 90, targetPercent: 95 }).status, 'fail');
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
