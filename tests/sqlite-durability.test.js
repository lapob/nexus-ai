const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const {
  checkpointDatabase,
  configureDatabase,
  createConsistentSqliteBackup,
  quickCheckDatabase
} = require('../src/infrastructure/storage/sqlite-durability');

test('configura attesa, WAL, durabilita FULL e controllo di integrita', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sqlite-durable-'));
  const database = new DatabaseSync(path.join(root, 'store.sqlite3'));
  try {
    configureDatabase(database, { foreignKeys: true });
    database.exec('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records(value) VALUES (\'ok\');');
    assert.equal(database.prepare('PRAGMA busy_timeout').get().timeout, 5_000);
    assert.equal(database.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(database.prepare('PRAGMA synchronous').get().synchronous, 2);
    assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.deepEqual(quickCheckDatabase(database), { ok: true, details: ['ok'] });
    assert.equal(checkpointDatabase(database, 'TRUNCATE').busy, 0);
  } finally {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('VACUUM INTO crea un backup autonomo e verificabile mentre la sorgente resta aperta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sqlite-backup-'));
  const sourcePath = path.join(root, 'source.sqlite3');
  const backupPath = path.join(root, 'staging', 'backup.sqlite3');
  const source = configureDatabase(new DatabaseSync(sourcePath));
  try {
    source.exec('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records(value) VALUES (\'committed\');');
    createConsistentSqliteBackup(sourcePath, backupPath);
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(backup.prepare('SELECT value FROM records').get().value, 'committed');
      assert.deepEqual(quickCheckDatabase(backup), { ok: true, details: ['ok'] });
    } finally { backup.close(); }
  } finally {
    source.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('un database sorgente corrotto non lascia un backup parziale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sqlite-corrupt-'));
  const sourcePath = path.join(root, 'source.sqlite3');
  const backupPath = path.join(root, 'backup.sqlite3');
  try {
    fs.writeFileSync(sourcePath, Buffer.from('not-a-sqlite-database'));
    assert.throws(() => createConsistentSqliteBackup(sourcePath, backupPath));
    assert.equal(fs.existsSync(backupPath), false);
    assert.equal(fs.existsSync(`${backupPath}-wal`), false);
    assert.equal(fs.existsSync(`${backupPath}-shm`), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
