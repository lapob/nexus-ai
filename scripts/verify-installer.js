/**
 * @module scripts/verify-installer
 * @description Valida preventivamente configurazione, asset e confini dell'installer NexusNXS.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const pythonRuntimeManifest = require('../config/python-runtime.json');

// #region 01 — Contratto della build e delle risorse

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let releaseConfig = {};
try { releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'public-client.release.json'), 'utf8')); } catch {}
const leanPublicPackage = releaseConfig.mode === 'public' && process.env.NEXUS_BUNDLE_OFFLINE_VOICE !== '1';
const required = ['build/icon.ico', 'build/icon.png', 'src/main.js', 'renderer-dist/index.html'];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Asset installer mancante: ${relative}`);
}
if (pkg.build?.productName !== 'NexusNXS' || pkg.build?.win?.artifactName !== 'NexusNXS-${version}-Setup.${ext}') {
  throw new Error('Nome prodotto o artefatto installer non coerente.');
}
if (pkg.build?.nsis?.deleteAppDataOnUninstall !== false) throw new Error('La disinstallazione deve preservare i dati personali.');
if (!pkg.build?.electronFuses?.enableEmbeddedAsarIntegrityValidation || !pkg.build?.electronFuses?.onlyLoadAppFromAsar) {
  throw new Error('Hardening ASAR dell’installer incompleto.');
}
const resources = pkg.build?.extraResources || [];
if (resources.some((entry) => String(entry.from || '').includes('chatterbox'))) {
  throw new Error('Il runtime vocale espressivo opzionale non deve appesantire l’installer principale.');
}
const normalizedResource = (entry) => String(entry.from || '').replaceAll('\\', '/');
const pythonRuntime = resources.find((entry) => String(entry.to || '').replaceAll('\\', '/') === 'python/windows-x64');
if (!pythonRuntime || normalizedResource(pythonRuntime) !== pythonRuntimeManifest.runtimeDirectory
  || !pythonRuntime.filter?.includes('!**/*.pdb')) {
  throw new Error('Runtime Python del pacchetto non coerente con il manifest verificato.');
}
const kokoroWorker = resources.find((entry) => normalizedResource(entry).endsWith('vendor/kokoro/worker.py'));
const kokoroModels = resources.find((entry) => normalizedResource(entry).endsWith('vendor/kokoro/models'));
const kokoroPackages = resources.find((entry) => normalizedResource(entry).endsWith('vendor/kokoro/.venv/Lib/site-packages'));
const excludesDirectory = (patterns, directory) => {
  const normalized = (patterns || []).map((pattern) => String(pattern).replaceAll('\\', '/'));
  return normalized.includes(`!**/${directory}`) && normalized.includes(`!**/${directory}/**`);
};
if (!kokoroWorker || !kokoroModels || !kokoroPackages
  || !excludesDirectory(kokoroPackages.filter, 'tests')
  || !excludesDirectory(kokoroPackages.filter, 'test')
  || !excludesDirectory(kokoroPackages.filter, '__pycache__')
  || !kokoroPackages.filter?.includes('!**/*.pyc')
  || !kokoroPackages.filter?.includes('!**/pip/**')
  || !kokoroPackages.filter?.includes('!**/misaki/**')) {
  throw new Error('Filtri del runtime vocale principale incompleti.');
}

// #endregion

// #region 02 — Artefatti impacchettati, aggiornamento e integrità

const unpackedKokoro = path.join(root, 'release', 'win-unpacked', 'resources', 'kokoro');
const unpackedPython = path.join(root, 'release', 'win-unpacked', 'resources', 'python', 'windows-x64');
const unpackedAsar = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
if (fs.existsSync(unpackedAsar)) {
  const asar = require('@electron/asar');
  const packagedFiles = new Set(asar.listPackage(unpackedAsar).map((entry) => entry.replace(/^\\/, '').replaceAll('\\', '/')));
  for (const requiredModule of [
    'config/nexus-interaction-states.json',
    'config/access-profiles.json',
    'config/public-client.release.json',
    'config/python-runtime.json',
    'renderer-dist/index.html',
    'src/main.js',
    'node_modules/pdf-parse/index.js',
    'node_modules/qrcode/lib/index.js'
  ]) {
    if (!packagedFiles.has(requiredModule)) throw new Error(`Dipendenza runtime assente dal pacchetto: ${requiredModule}`);
  }
}
if (leanPublicPackage && (fs.existsSync(unpackedKokoro) || fs.existsSync(unpackedPython)
  || fs.existsSync(path.join(root, 'release', 'win-unpacked', 'resources', 'whisper')))) {
  throw new Error('Il client pubblico contiene runtime vocali locali non necessari.');
}
if (!leanPublicPackage && fs.existsSync(unpackedKokoro)) {
  const packedFiles = fs.readdirSync(unpackedKokoro, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name).replaceAll('\\', '/'));
  if (packedFiles.some((file) => /\/(?:__pycache__|tests?|Scripts|pip|setuptools|wheel|misaki)(?:\/|-)/i.test(file) || /\.pyc$/i.test(file))) {
    throw new Error('Il runtime Kokoro impacchettato contiene cache, test, tooling o dipendenze non necessarie.');
  }
  for (const relative of ['worker.py', 'models/kokoro-v1.0.onnx', 'models/voices-v1.0.bin']) {
    if (!fs.existsSync(path.join(unpackedKokoro, relative))) throw new Error(`Runtime Kokoro incompleto: ${relative}`);
  }
}
if (!leanPublicPackage && fs.existsSync(unpackedPython)) {
  const pythonFiles = fs.readdirSync(unpackedPython, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(unpackedPython, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
  if (pythonFiles.some((file) => /\.pdb$/i.test(file)
    || /^(?:DLLs\/(?:_sqlite3\.pyd|sqlite3\.dll)|Lib\/sqlite3\/|libs\/(?:_sqlite3|sqlite3)\.lib$)/i.test(file)
    || /^Lib\/(?:site-packages\/pip(?:\/|-)|ensurepip\/)/i.test(file))) {
    throw new Error('Il runtime Python impacchettato contiene simboli, SQLite nativo o tooling non necessario.');
  }
  for (const [relative, expected] of Object.entries(pythonRuntimeManifest.runtimeFiles)) {
    const absolute = path.join(unpackedPython, ...relative.split('/'));
    if (!fs.existsSync(absolute)) throw new Error(`Runtime Python incompleto: ${relative}`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    if (actual !== expected) throw new Error(`Digest Python impacchettato errato: ${relative}`);
  }
  const probe = spawnSync(path.join(unpackedPython, 'python.exe'), ['-I', '-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000
  });
  if (probe.status !== 0 || probe.stdout.trim() !== pythonRuntimeManifest.pythonVersion) {
    throw new Error('Versione Python impacchettata non valida.');
  }
}
const signed = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK);
const installer = path.join(root, 'release', `NexusNXS-${pkg.version}-Setup.exe`);
const blockmap = `${installer}.blockmap`;
const updateManifest = path.join(root, 'release', 'latest.yml');
if (fs.existsSync(installer)) {
  if (!fs.existsSync(blockmap) || !fs.existsSync(updateManifest)) throw new Error('Metadati di aggiornamento mancanti per l’installer finale.');
  const manifest = fs.readFileSync(updateManifest, 'utf8');
  if (!manifest.includes(`version: ${pkg.version}`) || !manifest.includes(path.basename(installer))) {
    throw new Error('Manifest di aggiornamento non coerente con versione e installer.');
  }
  const expectedSha512 = manifest.match(/^sha512:\s*(\S+)/m)?.[1];
  const actualSha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
  if (!expectedSha512 || expectedSha512 !== actualSha512) throw new Error('Hash SHA-512 del manifest di aggiornamento non valido.');
  if (fs.statSync(blockmap).mtimeMs + 2_000 < fs.statSync(installer).mtimeMs) throw new Error('Blockmap più vecchia dell’installer finale.');
}
process.stdout.write(`Installer ${leanPublicPackage ? 'pubblico leggero' : 'completo'} verificato · firma digitale ${signed ? 'configurata' : 'in attesa del certificato editore'}\n`);

// #endregion
