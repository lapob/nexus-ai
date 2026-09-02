const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolveVaultPath,
  ensurePublicKnowledgeVault,
  saveUserVaultPath,
  localDataLayout
} = require('../src/infrastructure/storage/portable-paths');

test('rileva la vault padre senza dipendere dalla lettera del disco', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-portable-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.mkdirSync(path.join(vault, '.obsidian'));
  const appRoot = path.join(vault, '.AI');
  fs.mkdirSync(appRoot);
  assert.deepEqual(resolveVaultPath({ appRoot, env: {} }).vaultPath, fs.realpathSync(vault));
});

test('risolve una configurazione relativa alla cartella applicativa', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'app');
  const vault = path.join(root, 'knowledge');
  fs.mkdirSync(path.join(appRoot, 'config'), { recursive: true });
  fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'config', 'portable.json'), JSON.stringify({ vaultRelativePath: '../knowledge' }));
  const result = resolveVaultPath({ appRoot, env: {} });
  assert.equal(result.vaultPath, fs.realpathSync(vault));
  assert.equal(result.source, 'portable-config');
});

test('la configurazione portabile del progetto seleziona la knowledge pubblica', () => {
  const appRoot = path.resolve(__dirname, '..');
  const expectedVault = path.resolve(appRoot, '..', '.knowledge-public');
  const result = resolveVaultPath({ appRoot, env: {} });
  assert.equal(result.vaultPath, fs.realpathSync(expectedVault));
  assert.equal(result.source, 'portable-config');
});

test('colloca indici e cache sotto i dati locali del PC', () => {
  const layout = localDataLayout('C:/Users/Test/AppData/Local/NexusAI');
  assert.equal(layout.database, path.join(layout.root, 'database'));
  assert.equal(layout.vectorIndex, path.join(layout.root, 'vector-index'));
  assert.equal(layout.embeddingCache, path.join(layout.root, 'embedding-cache'));
});

test('salva e riusa la vault scelta al primo avvio dell’app installata', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-installed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'installed-app');
  const userData = path.join(root, 'user-data');
  const vault = path.join(root, 'personal-vault');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
  saveUserVaultPath(userData, vault);
  const result = resolveVaultPath({ appRoot, userDataPath: userData, env: {} });
  assert.equal(result.vaultPath, fs.realpathSync(vault));
  assert.equal(result.source, 'user-settings');
});

test('crea una knowledge pubblica locale senza sovrascrivere la memoria utente', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-public-knowledge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed');
  const userData = path.join(root, 'user-data');
  fs.mkdirSync(seed, { recursive: true });
  fs.writeFileSync(path.join(seed, 'Guida.md'), '# Versione iniziale');

  const first = ensurePublicKnowledgeVault(userData, seed);
  assert.equal(first.source, 'public-local');
  assert.equal(fs.existsSync(path.join(first.vaultPath, '.obsidian')), true);
  fs.writeFileSync(path.join(first.vaultPath, 'Guida.md'), '# Modifica personale');

  ensurePublicKnowledgeVault(userData, seed);
  assert.equal(fs.readFileSync(path.join(first.vaultPath, 'Guida.md'), 'utf8'), '# Modifica personale');
});
