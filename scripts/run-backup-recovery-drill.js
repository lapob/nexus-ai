/**
 * @module scripts/run-backup-recovery-drill
 * @description Prova realmente snapshot, cifratura e ripristino usando soltanto dati sintetici temporanei.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { decryptArchive, encryptArchive } = require('../src/infrastructure/storage/encrypted-backup');
const { restoreSnapshot, snapshotUserData, verifySnapshot } = require('../src/infrastructure/storage/version-snapshot');

const projectRoot = path.resolve(__dirname, '..');

// #region Dati sintetici e protezione temporanea

function createDatabase(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  try {
    database.exec('PRAGMA journal_mode=WAL; CREATE TABLE records (value TEXT NOT NULL);');
    database.prepare('INSERT INTO records(value) VALUES (?)').run(value);
  } finally { database.close(); }
}

function temporaryProtector() {
  const key = crypto.randomBytes(32);
  return {
    protect(bytes) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    unprotect(container) {
      const iv = container.subarray(0, 12);
      const tag = container.subarray(12, 28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(container.subarray(28)), decipher.final()]);
    }
  };
}

function readDatabaseValue(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try { return database.prepare('SELECT value FROM records').get().value; }
  finally { database.close(); }
}

// #endregion
// #region Drill e report privacy-safe

function runBackupRecoveryDrill({ outputPath = path.join(projectRoot, 'qa-artifacts', 'backup-recovery-drill.json') } = {}) {
  const startedAt = Date.now();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnxs-recovery-drill-'));
  const source = path.join(temporaryRoot, 'source');
  const restored = path.join(temporaryRoot, 'restored');
  const protection = temporaryProtector();
  try {
    fs.mkdirSync(path.join(source, 'data', 'database'), { recursive: true });
    fs.writeFileSync(path.join(source, 'settings.json'), JSON.stringify({ language: 'auto', privacy: true }));
    fs.writeFileSync(path.join(source, 'data', 'database', 'training-examples.jsonl'), '{"approved":true}\n');
    createDatabase(path.join(source, 'data', 'database', 'conversations.sqlite3'), 'conversation-ok');
    createDatabase(path.join(source, 'data', 'database', 'personal-memory.sqlite3'), 'memory-ok');

    const snapshotPath = snapshotUserData(source, 'recovery-drill', { protect: protection.protect });
    const verification = verifySnapshot(snapshotPath);
    assert.equal(verification.ok, true);
    const result = restoreSnapshot(snapshotPath, restored, { unprotect: protection.unprotect });
    assert.equal(result.restored, 4);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored, 'settings.json'), 'utf8')), { language: 'auto', privacy: true });
    assert.equal(readDatabaseValue(path.join(restored, 'data', 'database', 'conversations.sqlite3')), 'conversation-ok');
    assert.equal(readDatabaseValue(path.join(restored, 'data', 'database', 'personal-memory.sqlite3')), 'memory-ok');

    const portable = encryptArchive({ schemaVersion: 1, records: ['synthetic'] }, 'nexusnxs-recovery-drill');
    assert.deepEqual(decryptArchive(portable, 'nexusnxs-recovery-drill'), { schemaVersion: 1, records: ['synthetic'] });

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      passed: true,
      restoredFiles: result.restored,
      snapshotIntegrity: true,
      encryptedArchiveRoundTrip: true,
      durationMs: Date.now() - startedAt,
      dataClass: 'synthetic-only'
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
}

if (require.main === module) {
  try {
    const report = runBackupRecoveryDrill();
    console.log(`Backup recovery drill: PASS (${report.restoredFiles} file, ${report.durationMs} ms).`);
  } catch (error) {
    console.error(`Backup recovery drill: FAIL (${error.message})`);
    process.exitCode = 1;
  }
}

module.exports = { runBackupRecoveryDrill };

// #endregion
