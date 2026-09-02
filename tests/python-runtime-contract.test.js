const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const manifest = require('../config/python-runtime.json');

test('il runtime Python pubblico ha origine e digest bloccati', () => {
  assert.equal(manifest.pythonVersion, '3.13.15');
  assert.equal(manifest.release, '20260814');
  assert.equal(manifest.sha256, '4ca61e4b09c2240cc50cc6910c90664051e93ab7caa2f48b3c6b3c070670c0bd');
  assert.equal(manifest.production.approved, true);
  assert.equal(manifest.production.minimumPythonVersion, '3.13.15');
  assert.match(manifest.downloadUrl, /^https:\/\/github\.com\/astral-sh\/python-build-standalone\/releases\/download\/20260814\//);
  assert.deepEqual(manifest.removedComponents.slice(0, 3), ['DLLs/_sqlite3.pyd', 'DLLs/sqlite3.dll', 'Lib/sqlite3']);
});

test('tutti i consumer risolvono il manifest e il pacchetto esclude SQLite e PDB', () => {
  for (const relative of ['src/application/bootstrap.js', 'scripts/evaluate-local-voice.js', 'scripts/provision-expressive-voice.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /python-runtime\.json/);
    assert.doesNotMatch(source, /3\.11\.15/);
  }
  const pkg = require('../package.json');
  const resource = pkg.build.extraResources.find((entry) => entry.to === 'python/windows-x64');
  assert.equal(resource.from, manifest.runtimeDirectory);
  assert.ok(resource.filter.includes('!**/*.pdb'));
  const voice = pkg.build.extraResources.find((entry) => entry.to === 'kokoro/.venv/Lib/site-packages');
  assert.ok(voice.filter.includes('!**/pip/**'));
  assert.ok(voice.filter.includes('!**/misaki/**'));
  assert.match(pkg.scripts['check:publication'], /check-python-runtime/);
  assert.match(pkg.scripts['prepare:package:win'], /check:python-runtime:production/);
  assert.match(pkg.scripts['check:python-runtime:production'], /--production/);
});

test('il provisioner verifica il digest prima di estrarre e promuove da staging', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/provision-python-runtime.ps1'), 'utf8');
  const hashAt = source.indexOf('Get-FileHash');
  const extractAt = source.indexOf('tar.exe');
  const moveAt = source.indexOf('Move-Item -LiteralPath $candidate');
  assert.ok(hashAt > 0 && extractAt > hashAt && moveAt > extractAt);
  assert.match(source, /Assert-ChildPath/);
  assert.match(source, /removedComponents/);
});
