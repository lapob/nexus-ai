/**
 * @module infrastructure/storage/sqlite-durability
 * @description Regole comuni di integrita, attesa e checkpoint per gli archivi SQLite locali.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const CHECKPOINT_MODES = new Set(['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE']);

// #region 01 — Integrity, configuration and shutdown

function pragmaValue(row) {
  if (!row || typeof row !== 'object') return undefined;
  return Object.values(row)[0];
}

function sqliteIntegrityError(details) {
  const error = new Error(`Il database SQLite non supera quick_check: ${details.join('; ')}`);
  error.code = 'NEXUS_SQLITE_INTEGRITY_FAILED';
  error.details = details;
  return error;
}

function quickCheckDatabase(database) {
  const rows = database.prepare('PRAGMA quick_check').all();
  const details = rows.map((row) => String(pragmaValue(row) || '').trim()).filter(Boolean);
  if (details.length !== 1 || details[0].toLocaleLowerCase('en-US') !== 'ok') {
    throw sqliteIntegrityError(details.length ? details : ['risultato assente']);
  }
  return { ok: true, details };
}

function checkpointDatabase(database, mode = 'PASSIVE') {
  const normalizedMode = String(mode || '').toUpperCase();
  if (!CHECKPOINT_MODES.has(normalizedMode)) throw new TypeError('Modalita di checkpoint SQLite non valida.');
  const row = database.prepare(`PRAGMA wal_checkpoint(${normalizedMode})`).get() || {};
  return {
    busy: Number(row.busy || 0),
    logFrames: Number(row.log ?? row.log_frames ?? 0),
    checkpointedFrames: Number(row.checkpointed ?? row.checkpointed_frames ?? 0)
  };
}

function configureDatabase(database, { foreignKeys = false, busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS } = {}) {
  const timeout = Math.min(60_000, Math.max(1_000, Number(busyTimeoutMs) || DEFAULT_BUSY_TIMEOUT_MS));
  database.exec(`PRAGMA busy_timeout=${timeout};
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA wal_autocheckpoint=500;
    ${foreignKeys ? 'PRAGMA foreign_keys=ON;' : ''}`);
  quickCheckDatabase(database);
  return database;
}

function closeDatabase(database) {
  let failure = null;
  try {
    checkpointDatabase(database, 'TRUNCATE');
    quickCheckDatabase(database);
  } catch (error) {
    failure = error;
  }
  try {
    database.close();
  } catch (error) {
    if (!failure) failure = error;
  }
  if (failure) throw failure;
}

// #endregion

// #region 02 — Crash-consistent backup lifecycle

function removeSqliteSidecars(filePath) {
  for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(`${filePath}${suffix}`, { force: true });
}

function createConsistentSqliteBackup(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.rmSync(destinationPath, { force: true });
  removeSqliteSidecars(destinationPath);

  let source;
  let backup;
  try {
    source = new DatabaseSync(sourcePath);
    source.exec(`PRAGMA busy_timeout=${DEFAULT_BUSY_TIMEOUT_MS};`);
    quickCheckDatabase(source);
    checkpointDatabase(source, 'PASSIVE');
    source.prepare('VACUUM INTO ?').run(destinationPath);
    source.close();
    source = null;
    backup = new DatabaseSync(destinationPath, { readOnly: true });
    quickCheckDatabase(backup);
    backup.close();
    backup = null;
  } catch (error) {
    fs.rmSync(destinationPath, { force: true });
    removeSqliteSidecars(destinationPath);
    throw error;
  } finally {
    if (backup) backup.close();
    if (source) source.close();
  }
  return destinationPath;
}

// #endregion

module.exports = {
  DEFAULT_BUSY_TIMEOUT_MS,
  checkpointDatabase,
  closeDatabase,
  configureDatabase,
  createConsistentSqliteBackup,
  quickCheckDatabase,
  removeSqliteSidecars
};
