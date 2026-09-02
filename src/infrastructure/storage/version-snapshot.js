/**
 * @module infrastructure/storage/version-snapshot
 * @description Snapshot locale recuperabile prima che una nuova versione apra i dati.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createConsistentSqliteBackup, quickCheckDatabase, removeSqliteSidecars } = require('./sqlite-durability');

const SNAPSHOT_SOURCES = [
  ['settings.json', 'settings.json', false],
  [path.join('data', 'database', 'conversations.sqlite3'), 'conversations.sqlite3', true],
  [path.join('data', 'database', 'personal-memory.sqlite3'), 'personal-memory.sqlite3', true],
  [path.join('data', 'database', 'training-examples.jsonl'), 'training-examples.jsonl', false]
];

// #region Integrità e manifest

function fileDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validManifestName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255
    && name !== 'manifest.json' && path.basename(name) === name && !name.includes('\0');
}

function verifySnapshot(snapshotPath) {
  const manifestPath = path.join(snapshotPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: false, files: [], error: 'manifest-missing' };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const names = files.map((entry) => entry?.name);
    const schemaValid = manifest.schemaVersion === 1
      || (manifest.schemaVersion === 2 && manifest.state === 'complete');
    const entriesValid = files.every((entry) => validManifestName(entry?.name)
      && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0
      && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(entry.sha256));
    const namesUnique = new Set(names).size === names.length;
    if (!schemaValid || !entriesValid || !namesUnique) return { ok: false, files: [], error: 'manifest-invalid' };
    const actualFiles = fs.readdirSync(snapshotPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== 'manifest.json')
      .map((entry) => entry.name)
      .sort();
    const expectedFiles = [...names].sort();
    const exactContents = actualFiles.length === expectedFiles.length
      && actualFiles.every((name, index) => name === expectedFiles[index]);
    const ok = exactContents && files.every((entry) => {
      const target = path.join(snapshotPath, entry.name);
      return fs.statSync(target).size === entry.bytes && fileDigest(target) === entry.sha256;
    });
    return { ok, files: ok ? files : [], createdAt: manifest.createdAt || '', error: ok ? undefined : 'content-invalid' };
  } catch { return { ok: false, files: [], error: 'manifest-invalid' }; }
}

function writeManifest(target, version) {
  const copied = fs.readdirSync(target).filter((name) => name !== 'manifest.json' && fs.statSync(path.join(target, name)).isFile()).sort();
  const manifest = {
    schemaVersion: 2,
    state: 'complete',
    version,
    createdAt: new Date().toISOString(),
    files: copied.map((name) => ({ name, bytes: fs.statSync(path.join(target, name)).size, sha256: fileDigest(path.join(target, name)) }))
  };
  const manifestPath = path.join(target, 'manifest.json');
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flush: true });
  fs.renameSync(temporary, manifestPath);
}

function flushFile(filePath) {
  let handle;
  try {
    handle = fs.openSync(filePath, 'r+');
    fs.fsyncSync(handle);
  } catch (error) {
    if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error?.code)) throw error;
  } finally { if (handle !== undefined) fs.closeSync(handle); }
}

function flushDirectory(directory) {
  let handle;
  try {
    handle = fs.openSync(directory, 'r');
    fs.fsyncSync(handle);
  } catch { /* alcuni filesystem Windows non consentono fsync sulle directory */ }
  finally { if (handle !== undefined) fs.closeSync(handle); }
}

function writeSnapshotFile(source, destination, { sqlite = false, protect = null } = {}) {
  let readableSource = source;
  let sqliteTemporary = null;
  try {
    if (sqlite) {
      sqliteTemporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.sqlite`;
      createConsistentSqliteBackup(source, sqliteTemporary);
      readableSource = sqliteTemporary;
    }
    const bytes = fs.readFileSync(readableSource);
    if (typeof protect === 'function') {
      const protectedBytes = protect(bytes);
      if (!Buffer.isBuffer(protectedBytes) || !protectedBytes.length) throw new Error('Protezione dello snapshot NexusNXS non riuscita.');
      fs.writeFileSync(`${destination}.protected`, protectedBytes, { mode: 0o600, flush: true });
    } else {
      fs.writeFileSync(destination, bytes, { mode: 0o600, flush: true });
    }
  } finally {
    if (sqliteTemporary) {
      fs.rmSync(sqliteTemporary, { force: true });
      removeSqliteSidecars(sqliteTemporary);
    }
  }
}

function pruneSnapshots(backupsRoot, keep = 3) {
  const valid = fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, path: path.join(backupsRoot, entry.name) }))
    .filter((entry) => verifySnapshot(entry.path).ok)
    .map((entry) => ({ ...entry, time: fs.statSync(entry.path).mtimeMs }))
    .sort((left, right) => right.time - left.time);
  for (const stale of valid.slice(keep)) fs.rmSync(stale.path, { recursive: true, force: true });
}

function quarantineInvalidSnapshot(target, backupsRoot, safeVersion) {
  const quarantine = path.join(backupsRoot, `.${safeVersion}.invalid.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
  fs.renameSync(target, quarantine);
  return quarantine;
}

// #endregion

// #region Creazione e ripristino atomico

function snapshotUserData(userDataPath, version, { protect = null } = {}) {
  const safeVersion = String(version || '').replace(/[^0-9A-Za-z._-]/g, '').slice(0, 40);
  if (!safeVersion) return null;
  const backupsRoot = path.join(userDataPath, 'backups');
  const target = path.join(backupsRoot, safeVersion);
  fs.mkdirSync(backupsRoot, { recursive: true });
  if (fs.existsSync(target)) {
    if (verifySnapshot(target).ok) return target;
    quarantineInvalidSnapshot(target, backupsRoot, safeVersion);
  }
  const staging = path.join(backupsRoot, `.${safeVersion}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.staging`);
  fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
  try {
    for (const [relative, destination, sqlite] of SNAPSHOT_SOURCES) {
      const source = path.join(userDataPath, relative);
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
      writeSnapshotFile(source, path.join(staging, destination), { sqlite, protect });
    }
    writeManifest(staging, safeVersion);
    if (!verifySnapshot(staging).ok) throw new Error('Verifica dello snapshot NexusNXS non riuscita.');
    for (const entry of fs.readdirSync(staging)) flushFile(path.join(staging, entry));
    flushDirectory(staging);
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (!fs.existsSync(target) || !verifySnapshot(target).ok) throw error;
    }
    flushDirectory(backupsRoot);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  if (!verifySnapshot(target).ok) throw new Error('Verifica dello snapshot NexusNXS pubblicato non riuscita.');
  pruneSnapshots(backupsRoot);
  return target;
}

function restoreSnapshot(snapshotPath, userDataPath, { unprotect = null } = {}) {
  const verification = verifySnapshot(snapshotPath);
  if (!verification.ok) throw new Error('Lo snapshot NexusNXS non supera la verifica di integrità.');
  const destinations = new Map([
    ['settings.json', 'settings.json'],
    ['conversations.sqlite3', path.join('data', 'database', 'conversations.sqlite3')],
    ['personal-memory.sqlite3', path.join('data', 'database', 'personal-memory.sqlite3')],
    ['training-examples.jsonl', path.join('data', 'database', 'training-examples.jsonl')]
  ]);
  let restored = 0;
  for (const entry of verification.files) {
    const protectedFile = entry.name.endsWith('.protected');
    const logicalName = protectedFile ? entry.name.slice(0, -10) : entry.name;
    const relative = destinations.get(logicalName);
    if (!relative) continue;
    const source = path.join(snapshotPath, entry.name);
    const bytes = protectedFile
      ? (typeof unprotect === 'function' ? unprotect(fs.readFileSync(source)) : null)
      : fs.readFileSync(source);
    if (!Buffer.isBuffer(bytes)) throw new Error('Lo snapshot protetto richiede la cifratura di sistema originale.');
    const destination = path.join(userDataPath, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.restore`;
    let published = false;
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o600, flush: true });
      if (logicalName.endsWith('.sqlite3')) {
        let database;
        try {
          database = new DatabaseSync(temporary, { readOnly: true });
          quickCheckDatabase(database);
        } finally { if (database) database.close(); }
        removeSqliteSidecars(destination);
      }
      fs.renameSync(temporary, destination);
      published = true;
      restored += 1;
    } finally {
      if (!published) {
        fs.rmSync(temporary, { force: true });
        removeSqliteSidecars(temporary);
      }
    }
  }
  return { restored };
}

// #endregion

module.exports = { restoreSnapshot, snapshotUserData, verifySnapshot };
