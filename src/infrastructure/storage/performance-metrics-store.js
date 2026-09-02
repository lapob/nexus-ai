/**
 * @module infrastructure/storage/performance-metrics-store
 * @description Conserva metriche aggregate locali in SQLite senza prompt, risposte o identificatori personali.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { closeDatabase, configureDatabase } = require('./sqlite-durability');

const ALLOWED_KINDS = new Set(['chat', 'stream', 'remote']);
const ALLOWED_MODES = new Set(['instant', 'fast', 'deep']);
const ALLOWED_MODEL_CLASSES = new Set(['fast', 'primary', 'vision', 'instant']);
const INTERACTION_SLO = Object.freeze({
  instant: Object.freeze({ firstTokenP95Ms: 900, totalP95Ms: 4_000 }),
  fast: Object.freeze({ firstTokenP95Ms: 2_500, totalP95Ms: 20_000 }),
  deep: Object.freeze({ firstTokenP95Ms: 4_000, totalP95Ms: 45_000 })
});

// #region 01 — Privacy-safe normalization and migration

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function boundedDuration(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(900_000, Math.round(value))) : null;
}

function normalizeMetric({ kind = 'chat', mode = 'fast', modelClass = 'unknown', durationMs = 0, firstTokenMs = null, prepareMs = null, inferenceMs = null, verifyMs = null, success = true, corrected = false, cached = false } = {}) {
  return {
    schemaVersion: 3,
    recordedAt: Date.now(),
    kind: ALLOWED_KINDS.has(kind) ? kind : 'chat',
    mode: ALLOWED_MODES.has(mode) ? mode : 'fast',
    modelClass: ALLOWED_MODEL_CLASSES.has(modelClass) ? modelClass : 'unknown',
    durationMs: Math.max(0, Math.min(900_000, Math.round(Number(durationMs) || 0))),
    firstTokenMs: boundedDuration(firstTokenMs),
    prepareMs: boundedDuration(prepareMs),
    inferenceMs: boundedDuration(inferenceMs),
    verifyMs: boundedDuration(verifyMs),
    success: success === true,
    corrected: corrected === true,
    cached: cached === true
  };
}

function parseLegacyRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const row = JSON.parse(line);
        return ALLOWED_KINDS.has(row.kind) && Number.isFinite(row.durationMs) ? [normalizeMetric(row)] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function evaluateSlo(summary, mode) {
  const threshold = INTERACTION_SLO[mode];
  if (!threshold || summary.successful < 10) return { status: 'insufficient', minimumSamples: 10 };
  const firstTokenOk = summary.firstTokenP95Ms > 0 && summary.firstTokenP95Ms <= threshold.firstTokenP95Ms;
  const totalOk = summary.p95Ms > 0 && summary.p95Ms <= threshold.totalP95Ms;
  return {
    status: firstTokenOk && totalOk ? 'healthy' : 'degraded',
    firstTokenOk,
    totalOk,
    thresholds: threshold
  };
}

// #endregion

// #region 02 — Batched metrics persistence and aggregation

class PerformanceMetricsStore {
  constructor({ filePath, legacyFilePath = '', limit = 1000 } = {}) {
    if (!filePath) throw new Error('Percorso metriche mancante.');
    this.filePath = path.resolve(filePath);
    this.limit = Math.max(100, Math.min(5000, Number(limit) || 1000));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const database = new DatabaseSync(this.filePath);
    try {
      configureDatabase(database);
      database.exec(`CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        model_class TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        first_token_ms INTEGER,
        prepare_ms INTEGER,
        inference_ms INTEGER,
        verify_ms INTEGER,
        success INTEGER NOT NULL,
        corrected INTEGER NOT NULL,
        cached INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS performance_metrics_mode_id ON performance_metrics(mode, id DESC);`);
      const columns = new Set(database.prepare('PRAGMA table_info(performance_metrics)').all().map((row) => row.name));
      if (!columns.has('prepare_ms')) database.exec('ALTER TABLE performance_metrics ADD COLUMN prepare_ms INTEGER;');
      if (!columns.has('inference_ms')) database.exec('ALTER TABLE performance_metrics ADD COLUMN inference_ms INTEGER;');
      if (!columns.has('verify_ms')) database.exec('ALTER TABLE performance_metrics ADD COLUMN verify_ms INTEGER;');
      this.database = database;
      this.pendingRows = [];
      this.pendingWrites = 0;
      this.flushTimer = null;
      this.retryDelayMs = 150;
      this.insertStatement = database.prepare(`INSERT INTO performance_metrics(
        recorded_at,kind,mode,model_class,duration_ms,first_token_ms,prepare_ms,inference_ms,verify_ms,success,corrected,cached
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
      this.trimStatement = database.prepare('DELETE FROM performance_metrics WHERE id <= COALESCE((SELECT id FROM performance_metrics ORDER BY id DESC LIMIT 1 OFFSET ?), 0)');
      this.migrateLegacy(legacyFilePath);
      this.trim();
    } catch (error) {
      try { database.close(); } catch {}
      throw error;
    }
  }

  migrateLegacy(legacyFilePath) {
    if (this.database.prepare('SELECT COUNT(*) AS count FROM performance_metrics').get().count > 0) return 0;
    const rows = parseLegacyRows(legacyFilePath);
    if (!rows.length) return 0;
    this.database.exec('BEGIN');
    try {
      for (const row of rows.slice(-this.limit)) this.insert(row);
      this.database.exec('COMMIT');
      return rows.length;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  insert(row) {
    this.insertStatement.run(
      row.recordedAt, row.kind, row.mode, row.modelClass, row.durationMs, row.firstTokenMs,
      row.prepareMs, row.inferenceMs, row.verifyMs,
      row.success ? 1 : 0, row.corrected ? 1 : 0, row.cached ? 1 : 0
    );
  }

  trim() {
    this.trimStatement.run(this.limit);
  }

  beginBatch() {
    if (this.flushTimer) return;
    this.scheduleFlush(75);
  }

  scheduleFlush(delayMs = 75) {
    if (this.flushTimer || !this.pendingRows.length) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try { this.flush(); } catch { /* Il batch resta in coda e viene ritentato con backoff. */ }
    }, Math.max(25, Number(delayMs) || 75));
    this.flushTimer.unref?.();
  }

  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.pendingRows.length) return false;
    const batch = this.pendingRows;
    this.pendingRows = [];
    this.pendingWrites = 0;
    try {
      this.database.exec('BEGIN IMMEDIATE');
      for (const row of batch) this.insert(row);
      this.trim();
      this.database.exec('COMMIT');
      this.retryDelayMs = 150;
      if (this.pendingRows.length) this.beginBatch();
      return true;
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch {}
      this.pendingRows = [...batch, ...this.pendingRows];
      this.pendingWrites = this.pendingRows.length;
      const retryDelay = this.retryDelayMs;
      this.retryDelayMs = Math.min(2_000, retryDelay * 2);
      this.scheduleFlush(retryDelay);
      throw error;
    }
  }

  read() {
    if (this.pendingRows.length) this.flush();
    return this.database.prepare(`SELECT recorded_at,kind,mode,model_class,duration_ms,first_token_ms,prepare_ms,inference_ms,verify_ms,success,corrected,cached
      FROM (SELECT * FROM performance_metrics ORDER BY id DESC LIMIT ?) ORDER BY id ASC`).all(this.limit).map((row) => ({
      schemaVersion: 3,
      recordedAt: Number(row.recorded_at),
      kind: row.kind,
      mode: row.mode,
      modelClass: row.model_class,
      durationMs: Number(row.duration_ms),
      firstTokenMs: row.first_token_ms === null ? null : Number(row.first_token_ms),
      prepareMs: row.prepare_ms === null ? null : Number(row.prepare_ms),
      inferenceMs: row.inference_ms === null ? null : Number(row.inference_ms),
      verifyMs: row.verify_ms === null ? null : Number(row.verify_ms),
      success: row.success === 1,
      corrected: row.corrected === 1,
      cached: row.cached === 1
    }));
  }

  record(value = {}) {
    const row = normalizeMetric(value);
    this.pendingRows.push(row);
    this.pendingWrites = this.pendingRows.length;
    this.beginBatch();
    if (this.pendingWrites >= 32) this.flush();
    return row;
  }

  summary({ mode } = {}) {
    const rows = this.read().filter((row) => !mode || row.mode === mode);
    const durations = rows.filter((row) => row.success).map((row) => row.durationMs);
    const firstTokens = rows.filter((row) => row.success && Number.isFinite(row.firstTokenMs)).map((row) => row.firstTokenMs);
    const prepare = rows.filter((row) => row.success && Number.isFinite(row.prepareMs)).map((row) => row.prepareMs);
    const inference = rows.filter((row) => row.success && Number.isFinite(row.inferenceMs)).map((row) => row.inferenceMs);
    const verify = rows.filter((row) => row.success && Number.isFinite(row.verifyMs)).map((row) => row.verifyMs);
    const summary = {
      samples: rows.length,
      successful: durations.length,
      failures: rows.length - durations.length,
      corrected: rows.filter((row) => row.corrected).length,
      cached: rows.filter((row) => row.cached).length,
      firstTokenP50Ms: percentile(firstTokens, 0.5),
      firstTokenP95Ms: percentile(firstTokens, 0.95),
      prepareP95Ms: percentile(prepare, 0.95),
      inferenceP95Ms: percentile(inference, 0.95),
      verifyP95Ms: percentile(verify, 0.95),
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99)
    };
    return { ...summary, slo: evaluateSlo(summary, mode) };
  }

  close() {
    this.flush();
    closeDatabase(this.database);
  }
}

// #endregion

module.exports = { PerformanceMetricsStore, normalizeMetric, parseLegacyRows, percentile, evaluateSlo, INTERACTION_SLO };
