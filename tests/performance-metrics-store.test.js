const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PerformanceMetricsStore, percentile, evaluateSlo } = require('../src/infrastructure/storage/performance-metrics-store');

test('il bootstrap collega le metriche reali agli handler desktop', () => {
  const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'bootstrap.js'), 'utf8');
  assert.match(bootstrap, /registerIpcHandlers\(\{[\s\S]*?conversationStore,\s*performanceStore,\s*remoteGateway,/);
});

test('classifica la latenza soltanto con un campione sufficiente e soglie per modalita', () => {
  assert.equal(evaluateSlo({ successful: 4 }, 'fast').status, 'insufficient');
  assert.equal(evaluateSlo({ successful: 10, firstTokenP95Ms: 900, p95Ms: 4_000 }, 'fast').status, 'healthy');
  assert.equal(evaluateSlo({ successful: 10, firstTokenP95Ms: 3_000, p95Ms: 4_000 }, 'fast').status, 'degraded');
});

test('calcola percentili ripetibili senza conservare contenuti personali', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-metrics-'));
  try {
    const filePath = path.join(root, 'performance.sqlite3');
    const store = new PerformanceMetricsStore({ filePath, limit: 100 });
    for (const durationMs of [100, 200, 300, 400, 500]) store.record({ kind: 'stream', mode: 'fast', modelClass: 'fast', durationMs, prepareMs: 20, inferenceMs: durationMs - 40, verifyMs: 20, success: true });
    store.record({ kind: 'stream', mode: 'deep', modelClass: 'primary', durationMs: 800, success: false, corrected: true, prompt: 'non salvare', answer: 'non salvare' });
    assert.deepEqual(store.summary({ mode: 'fast' }), { samples: 5, successful: 5, failures: 0, corrected: 0, cached: 0, firstTokenP50Ms: 0, firstTokenP95Ms: 0, prepareP95Ms: 20, inferenceP95Ms: 460, verifyP95Ms: 20, p50Ms: 300, p95Ms: 500, p99Ms: 500, slo: { status: 'insufficient', minimumSamples: 10 } });
    assert.equal(store.summary({ mode: 'deep' }).failures, 1);
    const raw = fs.readFileSync(filePath).toString('utf8');
    assert.doesNotMatch(raw, /non salvare|prompt|answer/);
    store.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('percentile gestisce dataset vuoti e code', () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([9, 1, 5], 0.5), 5);
  assert.equal(percentile([9, 1, 5], 0.99), 9);
});

test('limita la crescita e recupera da un archivio corrotto', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-metrics-bounded-'));
  try {
    const filePath = path.join(root, 'performance.sqlite3');
    const legacyFilePath = path.join(root, 'performance.jsonl');
    fs.writeFileSync(legacyFilePath, '{non-json}\n', 'utf8');
    const store = new PerformanceMetricsStore({ filePath, legacyFilePath, limit: 100 });
    assert.equal(store.summary().samples, 0);
    for (let index = 0; index < 140; index += 1) store.record({ durationMs: index, success: true });
    assert.equal(store.summary().samples, 100);
    assert.equal(store.read()[0].durationMs, 40);
    store.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('migra il registro JSONL valido una sola volta e conserva il limite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-metrics-migration-'));
  try {
    const filePath = path.join(root, 'performance.sqlite3');
    const legacyFilePath = path.join(root, 'performance.jsonl');
    fs.writeFileSync(legacyFilePath, `${JSON.stringify({ kind: 'stream', mode: 'fast', durationMs: 123, success: true })}\n`, 'utf8');
    const store = new PerformanceMetricsStore({ filePath, legacyFilePath, limit: 100 });
    assert.equal(store.summary().samples, 1);
    store.close();
    const reopened = new PerformanceMetricsStore({ filePath, legacyFilePath, limit: 100 });
    assert.equal(reopened.summary().samples, 1);
    reopened.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un commit fallito riaccoda il batch in ordine e lo ritenta senza busy loop', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-metrics-retry-'));
  try {
    const store = new PerformanceMetricsStore({ filePath: path.join(root, 'performance.sqlite3'), limit: 100 });
    store.record({ durationMs: 101, success: true });
    store.record({ durationMs: 202, success: true });

    const originalExec = store.database.exec.bind(store.database);
    let failCommit = true;
    let commitAttempts = 0;
    store.database.exec = (statement) => {
      if (String(statement).trim().toUpperCase() === 'COMMIT') {
        commitAttempts += 1;
        if (failCommit) {
          failCommit = false;
          throw new Error('commit simulato non riuscito');
        }
      }
      return originalExec(statement);
    };

    assert.throws(() => store.flush(), /commit simulato/);
    assert.equal(store.pendingWrites, 2);
    assert.deepEqual(store.pendingRows.map((row) => row.durationMs), [101, 202]);

    store.record({ durationMs: 303, success: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(commitAttempts, 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(commitAttempts, 2);
    assert.deepEqual(store.read().map((row) => row.durationMs), [101, 202, 303]);
    assert.equal(store.pendingWrites, 0);
    store.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
