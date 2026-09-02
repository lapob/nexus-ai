/**
 * @module scripts/check-python-runtime
 * @description Verifica provenienza, digest, pin e contenuto del runtime Python portabile.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region 01 — Manifest approvato e primitive di verifica

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'config', 'python-runtime.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const requireInstalled = process.argv.includes('--require-installed');
const requireClean = process.argv.includes('--require-clean');
const requireProductionApproval = process.argv.includes('--production');
const trusted = Object.freeze({
  pythonVersion: '3.13.15',
  release: '20260814',
  asset: 'cpython-3.13.15+20260814-x86_64-pc-windows-msvc-install_only.tar.gz',
  sha256: '4ca61e4b09c2240cc50cc6910c90664051e93ab7caa2f48b3c6b3c070670c0bd'
});

function fail(message) {
  throw new Error(`Runtime Python non verificato: ${message}`);
}

function insideRoot(relativePath) {
  if (path.isAbsolute(relativePath)) fail('runtimeDirectory deve essere relativo al progetto');
  const absolute = path.resolve(root, relativePath);
  const vendorRoot = `${path.resolve(root, 'vendor', 'python')}${path.sep}`;
  if (!absolute.startsWith(vendorRoot)) fail('runtimeDirectory esce da vendor/python');
  return absolute;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// #endregion

// #region 02 — Coerenza, provenienza e probe del runtime

for (const key of Object.keys(trusted)) {
  if (String(manifest[key]).toLowerCase() !== trusted[key].toLowerCase()) fail(`${key} non appartiene al runtime approvato`);
}
if (requireProductionApproval && manifest.production?.approved !== true) {
  fail(`release pubblica bloccata: ${manifest.production?.blocker || 'runtime non approvato'}`);
}
const expectedUrl = `https://github.com/astral-sh/python-build-standalone/releases/download/${trusted.release}/${trusted.asset.replace('+', '%2B')}`;
if (manifest.provider !== 'astral-sh/python-build-standalone' || manifest.downloadUrl !== expectedUrl) {
  fail('origine download diversa dalla release ufficiale approvata');
}
if (!manifest.runtimeDirectory.includes(`${trusted.pythonVersion}+${trusted.release}`)) fail('directory runtime non versionata correttamente');

const runtimeDirectory = insideRoot(manifest.runtimeDirectory);
const pinFiles = [
  'package.json',
  'src/application/bootstrap.js',
  'scripts/evaluate-local-voice.js',
  'scripts/provision-expressive-voice.js'
];
for (const relative of pinFiles) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/cpython-3\.11\.|python311\.dll/.test(content)) fail(`${relative} conserva un pin Python obsoleto`);
  if (relative !== 'package.json' && !content.includes('python-runtime.json')) {
    fail(`${relative} non risolve il runtime dal manifest`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pythonResource = (pkg.build?.extraResources || []).find((entry) => String(entry.to || '').replaceAll('\\', '/') === 'python/windows-x64');
if (!pythonResource || String(pythonResource.from || '').replaceAll('\\', '/') !== manifest.runtimeDirectory) {
  fail('extraResource Python non coincide con il manifest');
}
if (!(pythonResource.filter || []).includes('!**/*.pdb')) fail('i simboli PDB non sono esclusi dal client pubblico');
const voiceResource = (pkg.build?.extraResources || []).find((entry) => String(entry.to || '').replaceAll('\\', '/') === 'kokoro/.venv/Lib/site-packages');
for (const pattern of ['!**/pip/**', '!**/pip-*.dist-info/**', '!**/misaki/**', '!**/misaki-*.dist-info/**']) {
  if (!(voiceResource?.filter || []).includes(pattern)) fail(`filtro voce mancante: ${pattern}`);
}

if (!fs.existsSync(runtimeDirectory)) {
  if (requireInstalled) fail(`runtime assente: ${manifest.runtimeDirectory}`);
  process.stdout.write(`Manifest Python ${manifest.pythonVersion}+${manifest.release} verificato; runtime locale non installato.\n`);
  process.exit(0);
}

const markerPath = path.join(runtimeDirectory, '.nexus-python-runtime.json');
if (!fs.existsSync(markerPath)) fail('marker di provenienza assente');
const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
for (const key of ['pythonVersion', 'release', 'asset', 'sha256']) {
  if (String(marker[key]).toLowerCase() !== String(manifest[key]).toLowerCase()) fail(`marker ${key} non coerente`);
}
for (const [relative, expected] of Object.entries(manifest.runtimeFiles || {})) {
  const absolute = path.join(runtimeDirectory, ...relative.split('/'));
  if (!fs.existsSync(absolute)) fail(`file runtime mancante: ${relative}`);
  if (sha256(absolute) !== expected.toLowerCase()) fail(`digest runtime errato: ${relative}`);
}
for (const relative of manifest.removedComponents || []) {
  if (fs.existsSync(path.join(runtimeDirectory, ...relative.split('/')))) {
    fail(`componente SQLite vulnerabile presente: ${relative}`);
  }
}

const probe = spawnSync(path.join(runtimeDirectory, 'python.exe'), ['-I', '-c',
  'import json, ssl, sys; print(json.dumps({"python": ".".join(map(str, sys.version_info[:3])), "openssl": ssl.OPENSSL_VERSION}))'
], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
if (probe.status !== 0) fail(`probe Python fallita: ${(probe.stderr || '').trim()}`);
const versions = JSON.parse(probe.stdout.trim());
if (versions.python !== manifest.pythonVersion) fail(`versione eseguibile inattesa: ${versions.python}`);

if (requireClean) {
  const vendorPython = path.dirname(runtimeDirectory);
  const leftovers = fs.readdirSync(vendorPython, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('cpython-') && path.join(vendorPython, entry.name) !== runtimeDirectory)
    .map((entry) => entry.name);
  if (leftovers.length) fail(`runtime paralleli obsoleti: ${leftovers.join(', ')}`);
}

process.stdout.write(`Python ${versions.python} verificato · SQLite rimosso dal runtime · ${versions.openssl}\n`);

// #endregion
