const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalPluginRegistry } = require('../src/plugins/local-plugin-registry');

test('registry carica plugin confinati e applica i permessi', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugins-'));
  const directory = path.join(root, 'reader'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({ id: 'local.reader', entry: 'index.js', permissions: ['workspace:read'] }));
  const registry = new LocalPluginRegistry(root); registry.discover();
  assert.equal(registry.authorize('local.reader', 'workspace:read'), true);
  assert.equal(registry.authorize('local.reader', 'workspace:write'), false);
});

test('registry rifiuta entry esterne e permessi sconosciuti', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugins-'));
  const directory = path.join(root, 'bad'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({ id: 'local.bad', entry: '../escape.js', permissions: ['network:any'] }));
  assert.throws(() => new LocalPluginRegistry(root).discover(), /Entry plugin|Permesso/);
});

test('registry rifiuta un entry raggiungibile tramite symlink o junction esterna', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugins-'));
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugin-external-'));
  fs.writeFileSync(path.join(external, 'index.js'), 'module.exports = {};');
  const directory = path.join(root, 'linked');
  fs.mkdirSync(directory);
  fs.symlinkSync(external, path.join(directory, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({ id: 'local.linked', entry: 'external/index.js', permissions: [] }));

  assert.throws(() => new LocalPluginRegistry(root).discover(), /Entry plugin/);
});
