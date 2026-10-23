/**
 * @module scripts/run-backup-recovery-drill
 * @description Prova realmente snapshot, cifratura e ripristino usando soltanto dati sintetici temporanei.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');
const { PersonalMemoryStore } = require('../src/infrastructure/storage/personal-memory-store');
const { decryptArchive, encryptArchive } = require('../src/infrastructure/storage/encrypted-backup');
const { restoreSnapshot, snapshotUserData, verifySnapshot } = require('../src/infrastructure/storage/version-snapshot');

const projectRoot = path.resolve(__dirname, '..');

// #region Dati sintetici e protezione temporanea

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

// #endregion
// #region Drill e report privacy-safe

function runBackupRecoveryDrill({ outputPath = path.join(projectRoot, 'qa-artifacts', 'backup-recovery-drill.json') } = {}) {
  const startedAt = Date.now();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnxs-recovery-drill-'));
  const source = path.join(temporaryRoot, 'source');
  const restored = path.join(temporaryRoot, 'restored');
  const protection = temporaryProtector();
  const stores = [];
  try {
    fs.mkdirSync(path.join(source, 'data', 'database'), { recursive: true });
    fs.writeFileSync(path.join(source, 'settings.json'), JSON.stringify({ language: 'auto', privacy: true }));
    fs.writeFileSync(path.join(source, 'data', 'database', 'training-examples.jsonl'), '{"approved":true}\n');
    const conversations = new ConversationStore({ filePath: path.join(source, 'data/database/conversations.sqlite3') });
    stores.push(conversations);
    const memories = new PersonalMemoryStore({ filePath: path.join(source, 'data/database/personal-memory.sqlite3') });
    stores.push(memories);
    conversations.save({ id: 'synthetic-conversation', incomplete: true, turns: [
      { role: 'user', content: 'Prepara il documento Aurora.', createdAt: 100 },
      { role: 'assistant', content: 'Documento pronto.', createdAt: 200,
        artifacts: [{ id: 'aurora-document', kind: 'file', title: 'Aurora.md', content: '# Aurora' }] }
    ] });
    conversations.reviseArtifact({ conversationId: 'synthetic-conversation', turnCreatedAt: 200,
      artifactId: 'aurora-document', expectedRevisionId: '', content: '# Aurora revisionata' });
    const expiry = Date.now() + 86400000;
    const remembered = memories.remember({ content: 'Il progetto Aurora usa Java', sourceId: 'synthetic-turn', expiresAt: expiry });
    memories.updateById(remembered.id, 'Il progetto Aurora usa Rust');
    const forgotten = memories.remember({ content: 'Il progetto Obsoleto usa Python' });
    memories.forgetById(forgotten.id);
    const expectedConversation = conversations.get('synthetic-conversation');
    const expectedMemories = memories.list();
    assert.equal(expectedMemories[0].expiresAt, expiry);

    const snapshotPath = snapshotUserData(source, 'recovery-drill', { protect: protection.protect });
    const verification = verifySnapshot(snapshotPath);
    assert.equal(verification.ok, true);
    const result = restoreSnapshot(snapshotPath, restored, { unprotect: protection.unprotect });
    assert.equal(result.restored, 4);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored, 'settings.json'), 'utf8')), { language: 'auto', privacy: true });
    const recoveredConversations = new ConversationStore({ filePath: path.join(restored, 'data/database/conversations.sqlite3') });
    stores.push(recoveredConversations);
    const recoveredMemories = new PersonalMemoryStore({ filePath: path.join(restored, 'data/database/personal-memory.sqlite3') });
    stores.push(recoveredMemories);
    assert.deepEqual(recoveredConversations.get('synthetic-conversation'), expectedConversation);
    assert.deepEqual(recoveredMemories.list(), expectedMemories);
    assert.equal(recoveredMemories.list({ status: 'forgotten' }).length, 1);
    assert.equal(recoveredConversations.list().length, 1);

    const portable = encryptArchive({ schemaVersion: 1, records: ['synthetic'] }, 'nexusnxs-recovery-drill');
    assert.deepEqual(decryptArchive(portable, 'nexusnxs-recovery-drill'), { schemaVersion: 1, records: ['synthetic'] });

    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      passed: true,
      restoredFiles: result.restored,
      snapshotIntegrity: true,
      encryptedArchiveRoundTrip: true,
      applicationStoresRoundTrip: true,
      liveWalSnapshot: true,
      artifactRevisionsPreserved: true,
      memoryExpiryAndProvenancePreserved: true,
      durationMs: Date.now() - startedAt,
      dataClass: 'synthetic-only'
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  } finally {
    for (const store of stores.reverse()) store.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
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

function validApplicationRecoveryReport(report) {
  return report?.schemaVersion === 2 && report.dataClass === 'synthetic-only' && report.restoredFiles === 4
    && ['passed', 'snapshotIntegrity', 'encryptedArchiveRoundTrip', 'applicationStoresRoundTrip',
      'liveWalSnapshot', 'artifactRevisionsPreserved', 'memoryExpiryAndProvenancePreserved'].every(key => report[key] === true);
}

module.exports = { runBackupRecoveryDrill, validApplicationRecoveryReport };

// #endregion
