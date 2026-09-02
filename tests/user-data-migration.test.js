const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeUserDataDirectoryCase } = require('../src/infrastructure/storage/user-data-migration');

test('rinomina il nome storico Nexus in NexusNXS preservando tutti i dati', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-user-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'Nexus');
  fs.mkdirSync(path.join(legacy, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'settings.json'), '{"ok":true}');
  fs.writeFileSync(path.join(legacy, 'logs', 'nexus.log'), 'preservato');

  const result = normalizeUserDataDirectoryCase(root, { processId: 42 });
  assert.equal(result, path.join(root, 'NexusNXS'));
  assert.deepEqual(fs.readdirSync(root), ['NexusNXS']);
  assert.equal(fs.readFileSync(path.join(result, 'settings.json'), 'utf8'), '{"ok":true}');
  assert.equal(fs.readFileSync(path.join(result, 'logs', 'nexus.log'), 'utf8'), 'preservato');
});

test('non modifica una cartella NexusNXS già corretta', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-user-data-ready-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'NexusNXS'));
  assert.equal(normalizeUserDataDirectoryCase(root), path.join(root, 'NexusNXS'));
});

test('recupera una migrazione interrotta senza perdere i dati', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-user-data-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const interrupted = path.join(root, '.nexusnxs-name-migration-77');
  fs.mkdirSync(interrupted);
  fs.writeFileSync(path.join(interrupted, 'settings.json'), '{"recovered":true}');

  const result = normalizeUserDataDirectoryCase(root, { processId: 77 });
  assert.equal(result, path.join(root, 'NexusNXS'));
  assert.equal(fs.readFileSync(path.join(result, 'settings.json'), 'utf8'), '{"recovered":true}');
});
