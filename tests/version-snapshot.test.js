const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');
const { restoreSnapshot, snapshotUserData, verifySnapshot } = require('../src/infrastructure/storage/version-snapshot');

test('manifest e file con nomi distinti non possono ripristinare due volte la stessa destinazione', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restore-duplicate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = path.join(root, 'settings.json'); fs.writeFileSync(settings, 'old settings');
  const snapshot = snapshotUserData(root, 'duplicate'), manifestPath = path.join(snapshot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.copyFileSync(path.join(snapshot, 'settings.json'), path.join(snapshot, 'settings.json.protected'));
  manifest.files.push({ ...manifest.files[0], name: 'settings.json.protected' });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest)); fs.writeFileSync(settings, 'current settings');
  assert.equal(verifySnapshot(snapshot).ok, true);
  assert.throws(() => restoreSnapshot(snapshot, root, { unprotect: bytes => bytes }), /duplicate/);
  assert.equal(fs.readFileSync(settings, 'utf8'), 'current settings');
});

test('una decifratura tardiva fallita non modifica nessun file corrente', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restore-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const training = path.join(root, 'data/database/training-examples.jsonl');
  fs.mkdirSync(path.dirname(training), { recursive: true });
  fs.writeFileSync(path.join(root, 'settings.json'), 'old settings'); fs.writeFileSync(training, 'old training');
  const snapshot = snapshotUserData(root, 'preflight', { protect: bytes => Buffer.from(bytes.toString('base64')) });
  fs.writeFileSync(path.join(root, 'settings.json'), 'current settings'); fs.writeFileSync(training, 'current training');
  let calls = 0;
  assert.throws(() => restoreSnapshot(snapshot, root, { unprotect(bytes) {
    if (++calls === 2) throw Error('synthetic decryption failure');
    return Buffer.from(bytes.toString(), 'base64');
  } }), /synthetic decryption failure/);
  assert.equal(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'), 'current settings');
  assert.equal(fs.readFileSync(training, 'utf8'), 'current training');
});

test('un errore di pubblicazione ripristina anche i file già sostituiti', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restore-rollback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = path.join(root, 'settings.json'), training = path.join(root, 'data/database/training-examples.jsonl');
  fs.mkdirSync(path.dirname(training), { recursive: true });
  fs.writeFileSync(settings, 'old settings'); fs.writeFileSync(training, 'old training');
  const snapshot = snapshotUserData(root, 'rollback');
  fs.writeFileSync(settings, 'current settings'); fs.writeFileSync(training, 'current training');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === training && source.endsWith('.restore')) throw Error('synthetic publish failure');
    return rename(source, target);
  });
  assert.throws(() => restoreSnapshot(snapshot, root), /synthetic publish failure/);
  assert.equal(fs.readFileSync(settings, 'utf8'), 'current settings');
  assert.equal(fs.readFileSync(training, 'utf8'), 'current training');
  assert.equal(fs.readdirSync(root).some(name => /\.restore|\.previous/u.test(name)), false);
});

test('rollback conserva la precedente coppia DB e sidecar anche dopo un errore tardivo', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restore-sidecars-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'data/database/conversations.sqlite3'), settings = path.join(root, 'settings.json');
  const first = new ConversationStore({ filePath: file });
  first.save({ id: 'old', turns: [{ role: 'user', content: 'old' }] }); first.close();
  fs.writeFileSync(settings, 'old settings'); const snapshot = snapshotUserData(root, 'sidecars');
  const current = new ConversationStore({ filePath: file });
  current.save({ id: 'current', turns: [{ role: 'user', content: 'current' }] }); current.close();
  const expected = fs.readFileSync(file);
  fs.writeFileSync(file + '-wal', 'synthetic current WAL'); fs.writeFileSync(file + '-shm', 'synthetic current SHM');
  fs.writeFileSync(settings, 'current settings');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === settings && source.endsWith('.restore')) throw Error('synthetic publish failure');
    return rename(source, target);
  });
  assert.throws(() => restoreSnapshot(snapshot, root), /synthetic publish failure/);
  assert.deepEqual(fs.readFileSync(file), expected);
  assert.equal(fs.readFileSync(file + '-wal', 'utf8'), 'synthetic current WAL');
  assert.equal(fs.readFileSync(file + '-shm', 'utf8'), 'synthetic current SHM');
});

test('se anche il rollback fallisce conserva la copia precedente per il recupero', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-restore-retained-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = path.join(root, 'settings.json'), training = path.join(root, 'data/database/training-examples.jsonl');
  fs.mkdirSync(path.dirname(training), { recursive: true });
  fs.writeFileSync(settings, 'old settings'); fs.writeFileSync(training, 'old training');
  const snapshot = snapshotUserData(root, 'retained');
  fs.writeFileSync(settings, 'current settings'); fs.writeFileSync(training, 'current training');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    if ((target === training && source.endsWith('.restore')) || (target === settings && source.endsWith('.previous'))) throw Error('synthetic disk failure');
    return rename(source, target);
  });
  assert.throws(() => restoreSnapshot(snapshot, root), AggregateError);
  const retained = fs.readdirSync(root).filter(name => name.startsWith('settings.json.') && name.endsWith('.previous'));
  assert.equal(retained.length, 1); assert.equal(fs.readFileSync(path.join(root, retained[0]), 'utf8'), 'current settings');
});

test('crea uno snapshot per versione senza sovrascriverlo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-snapshot-'));
  try {
    fs.writeFileSync(path.join(root, 'settings.json'), '{"model":"uno"}');
    const target = snapshotUserData(root, '0.3.5');
    fs.writeFileSync(path.join(root, 'settings.json'), '{"model":"due"}');
    assert.equal(snapshotUserData(root, '0.3.5'), target);
    assert.match(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'), /uno/);
    assert.equal(verifySnapshot(target).ok, true);
    fs.writeFileSync(path.join(target, 'settings.json'), '{"tampered":true}');
    assert.equal(verifySnapshot(target).ok, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('protegge automaticamente i file dello snapshot quando è disponibile la cifratura di sistema', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-protected-snapshot-'));
  try {
    fs.writeFileSync(path.join(root, 'settings.json'), '{"private":true}');
    const target = snapshotUserData(root, '0.3.6', { protect: (bytes) => Buffer.from(bytes.toString('base64')) });
    assert.equal(fs.existsSync(path.join(target, 'settings.json')), false);
    assert.equal(fs.existsSync(path.join(target, 'settings.json.protected')), true);
    assert.doesNotMatch(fs.readFileSync(path.join(target, 'settings.json.protected'), 'utf8'), /private/);
    assert.equal(verifySnapshot(target).ok, true);
    fs.writeFileSync(path.join(root, 'settings.json'), '{"private":false}');
    const result = restoreSnapshot(target, root, { unprotect: (bytes) => Buffer.from(bytes.toString(), 'base64') });
    assert.equal(result.restored, 1);
    assert.match(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'), /true/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('non trasforma una directory parziale in uno snapshot valido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-partial-snapshot-'));
  const target = path.join(root, 'backups', '0.3.7');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'settings.json'), '{"partial":true}');
    fs.writeFileSync(path.join(root, 'settings.json'), '{"complete":true}');
    assert.equal(snapshotUserData(root, '0.3.7'), target);
    assert.equal(verifySnapshot(target).ok, true);
    assert.match(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'), /complete/);
    const quarantined = fs.readdirSync(path.join(root, 'backups')).filter((name) => name.startsWith('.0.3.7.invalid.'));
    assert.equal(quarantined.length, 1);
    const invalidPath = path.join(root, 'backups', quarantined[0]);
    assert.equal(fs.existsSync(path.join(invalidPath, 'manifest.json')), false);
    assert.match(fs.readFileSync(path.join(invalidPath, 'settings.json'), 'utf8'), /partial/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un errore durante la protezione non pubblica ne lascia staging incompleti', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-snapshot-fault-'));
  try {
    fs.writeFileSync(path.join(root, 'settings.json'), '{"model":"safe"}');
    fs.mkdirSync(path.join(root, 'data', 'database'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'database', 'training-examples.jsonl'), '{"example":1}\n');
    let calls = 0;
    assert.throws(() => snapshotUserData(root, '0.3.8', {
      protect: (bytes) => {
        calls += 1;
        if (calls === 2) throw new Error('fault-injection');
        return Buffer.from(bytes.toString('base64'));
      }
    }), /fault-injection/);
    const backups = path.join(root, 'backups');
    assert.equal(fs.existsSync(path.join(backups, '0.3.8')), false);
    assert.deepEqual(fs.readdirSync(backups), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('include in modo coerente i commit ancora presenti nel WAL SQLite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-snapshot-wal-'));
  const databasePath = path.join(root, 'data', 'database', 'conversations.sqlite3');
  let store;
  try {
    store = new ConversationStore({ filePath: databasePath });
    store.save({ id: 'wal-turn', title: 'Nel WAL', turns: [{ role: 'user', content: 'Persistimi', createdAt: 1 }] });
    const target = snapshotUserData(root, '0.3.9');
    const backup = new DatabaseSync(path.join(target, 'conversations.sqlite3'), { readOnly: true });
    try {
      assert.equal(backup.prepare('SELECT title FROM conversations WHERE id=?').get('wal-turn').title, 'Nel WAL');
      assert.equal(backup.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    } finally { backup.close(); }
  } finally {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
