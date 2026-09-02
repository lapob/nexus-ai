/**
 * @module scripts/check-release-readiness
 * @description Verifica i prerequisiti riproducibili di una release sorgente o pubblica.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { signatureEnvelope, verifySignatureEnvelope } = require('../src/security/release-integrity');

const root = path.resolve(__dirname, '..');
const production = process.argv.includes('--production');
const failures = [];
const warnings = [];
const releaseChannel = String(process.env.NEXUS_RELEASE_CHANNEL || (production ? 'stable' : 'preview')).trim().toLowerCase();
if (!['preview', 'beta', 'stable'].includes(releaseChannel)) failures.push('NEXUS_RELEASE_CHANNEL deve essere preview, beta oppure stable');
if (production && releaseChannel === 'preview') failures.push('il gate firmato non può produrre il canale Preview');

// #region 01 — Repository e metadati

for (const relative of ['README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'docs/INCIDENT_RESPONSE.md', '.github/workflows/ci.yml', '.github/workflows/security.yml']) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`${relative} mancante`);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(String(packageJson.version || ''))) failures.push('versione package non semver stabile');
if (packageJson.private !== true) failures.push('package npm deve restare private per impedire pubblicazioni accidentali');
const candidates = execFileSync('git', [
  '-c', `safe.directory=${root.replaceAll('\\', '/')}`,
  'ls-files', '--cached', '--others', '--exclude-standard', '-z'
], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).map((value) => value.replaceAll('\\', '/'));
for (const forbidden of ['renderer-dist/', 'release/', 'vendor/', '.knowledge-private/', '.knowledge-public/', '.nexus-data/']) {
  if (candidates.some((entry) => entry.startsWith(forbidden))) failures.push(`${forbidden} non deve essere pubblicato`);
}
const ollamaResources = (packageJson.build?.extraResources || [])
  .filter((entry) => /ollama/i.test(String(entry?.from || '')));
for (const resource of ollamaResources) {
  const executable = path.join(root, String(resource.from), process.platform === 'win32' ? 'ollama.exe' : 'ollama');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts', 'check-ollama-runtime-security.js'), `--executable=${executable}`], {
      cwd: root, stdio: 'pipe', windowsHide: true
    });
  } catch {
    failures.push(`runtime Ollama incluso nella release non conforme al gate di sicurezza: ${resource.from}`);
  }
}

// #endregion
// #region 02 — Infrastruttura della release

function secureOrigin(name, required) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    if (required) failures.push(`${name} non configurato`);
    else warnings.push(`${name} sarà richiesto per l'installer pubblico`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname !== '/') failures.push(`${name} deve essere un'origine HTTPS pulita`);
  } catch { failures.push(`${name} non è un URL valido`); }
}

secureOrigin('NEXUS_SERVICE_URL', production);
if (production) {
  const updateValue = String(process.env.NEXUS_UPDATE_URL || '').trim();
  if (!updateValue) failures.push('NEXUS_UPDATE_URL non configurato');
  else {
    try {
      const updateUrl = new URL(updateValue);
      if (updateUrl.protocol !== 'https:' || updateUrl.username || updateUrl.password || updateUrl.search || updateUrl.hash) {
        failures.push('NEXUS_UPDATE_URL deve essere una directory HTTPS pulita');
      }
    } catch { failures.push('NEXUS_UPDATE_URL non è un URL valido'); }
  }
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) failures.push('certificato di firma Windows non configurato (CSC_LINK / CSC_KEY_PASSWORD)');
  secureOrigin('NEXUS_URL', true);
  const androidSigningVariables = [
    'NEXUS_ANDROID_KEYSTORE', 'NEXUS_ANDROID_STORE_PASSWORD',
    'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD',
  ];
  const missingAndroidSigning = androidSigningVariables.filter((name) => !String(process.env[name] || '').trim());
  if (missingAndroidSigning.length) failures.push(`firma Android di produzione non configurata (${missingAndroidSigning.join(', ')})`);
  const manifestVariables = [
    'NEXUS_RELEASE_MANIFEST_PRIVATE_KEY',
    'NEXUS_RELEASE_MANIFEST_PUBLIC_KEY',
    'NEXUS_RELEASE_MANIFEST_KEY_ID'
  ];
  const missingManifestSigning = manifestVariables.filter((name) => !String(process.env[name] || '').trim());
  if (missingManifestSigning.length) failures.push(`firma distinta Ed25519 non configurata (${missingManifestSigning.join(', ')})`);
  else {
    try {
      const probe = Buffer.from('nexusnxs-release-key-pair-check');
      const envelope = signatureEnvelope(probe, {
        privateKey: process.env.NEXUS_RELEASE_MANIFEST_PRIVATE_KEY,
        keyId: process.env.NEXUS_RELEASE_MANIFEST_KEY_ID
      });
      verifySignatureEnvelope(probe, envelope, {
        publicKey: process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY,
        keyId: process.env.NEXUS_RELEASE_MANIFEST_KEY_ID
      });
    } catch (error) { failures.push(`coppia chiavi distinta non valida: ${error.message}`); }
  }
} else {
  warnings.push('Preview non abilita aggiornamenti automatici; Beta e Stable richiedono il gate firmato --production');
}

// #endregion
// #region 03 — Risultato

if (warnings.length) console.warn(`Avvisi release:\n- ${warnings.join('\n- ')}`);
if (failures.length) {
  console.error(`Release non pronta:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(production ? 'Release pubblica pronta per build firmata.' : 'Repository sorgente pronto per GitHub.');
}

// #endregion
