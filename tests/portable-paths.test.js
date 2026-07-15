const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveVaultPath, localDataLayout } = require('../src/portable-paths');

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

test('colloca indici e cache sotto i dati locali del PC', () => {
  const layout = localDataLayout('C:/Users/Test/AppData/Local/NexusAI');
  assert.equal(layout.database, path.join(layout.root, 'database'));
  assert.equal(layout.vectorIndex, path.join(layout.root, 'vector-index'));
  assert.equal(layout.embeddingCache, path.join(layout.root, 'embedding-cache'));
});
