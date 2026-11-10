/**
 * @module scripts/preview-update-key
 * @description Identità di firma degli aggiornamenti automatici Preview. La chiave pubblica è qui sotto e viene
 * incorporata nell'app (NEXUS_DISABLE_PREVIEW_UPDATES=1 la esclude); la privata resta solo sul PC di rilascio,
 * fuori da ogni repository (%APPDATA%/NexusNXS-release o NEXUS_PREVIEW_UPDATE_KEY), e non viene mai stampata.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PREVIEW_UPDATE_URL = 'https://nexusnxs.com/updates/preview';
const PREVIEW_KEY_ID = 'nxs-preview-1';
// Chiave pubblica Ed25519 (non segreta): verifica nell'app le distinte firmate dal PC di rilascio.
const PREVIEW_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAZ/dRgYQHnWsqlVkNuzZhmjSDHW0Dkquh80ZNs+m66do=',
  '-----END PUBLIC KEY-----',
  ''
].join('\n');

function previewPrivateKeyPath(env = process.env) {
  if (env.NEXUS_PREVIEW_UPDATE_KEY) return path.resolve(env.NEXUS_PREVIEW_UPDATE_KEY);
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'NexusNXS-release', 'preview-manifest-ed25519.pem');
}

/** Chiave pubblica incorporabile, oppure null se gli aggiornamenti Preview non sono configurati. */
function previewPublicKey(env = process.env) {
  return env.NEXUS_DISABLE_PREVIEW_UPDATES === '1' ? null : PREVIEW_PUBLIC_KEY;
}

/** Materiale di firma per la distinta Preview; fallisce chiuso se la pubblica esiste ma la privata no. */
function previewUpdateSigning(env = process.env) {
  const publicKey = previewPublicKey(env);
  if (!publicKey) return null;
  const privatePath = previewPrivateKeyPath(env);
  if (!fs.existsSync(privatePath)) {
    throw new Error('Aggiornamenti Preview configurati ma chiave di firma assente su questo PC: la release non può essere pubblicata.');
  }
  return { privateKey: privatePath, publicKey, keyId: PREVIEW_KEY_ID };
}

module.exports = { PREVIEW_KEY_ID, PREVIEW_PUBLIC_KEY, PREVIEW_UPDATE_URL, previewPrivateKeyPath, previewPublicKey, previewUpdateSigning };
