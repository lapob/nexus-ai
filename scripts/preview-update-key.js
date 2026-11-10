/**
 * @module scripts/preview-update-key
 * @description Identità di firma degli aggiornamenti automatici Preview. La chiave pubblica è nel repository
 * (config/preview-update-key.pub.pem) e viene incorporata nell'app; la privata resta solo sul PC di rilascio,
 * fuori da ogni repository (%APPDATA%/NexusNXS-release o NEXUS_PREVIEW_UPDATE_KEY), e non viene mai stampata.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const PREVIEW_UPDATE_URL = 'https://nexusnxs.com/updates/preview';
const PREVIEW_KEY_ID = 'nxs-preview-1';
const PREVIEW_PUBLIC_KEY_PATH = path.join(root, 'config', 'preview-update-key.pub.pem');

function previewPrivateKeyPath(env = process.env) {
  if (env.NEXUS_PREVIEW_UPDATE_KEY) return path.resolve(env.NEXUS_PREVIEW_UPDATE_KEY);
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'NexusNXS-release', 'preview-manifest-ed25519.pem');
}

/** Chiave pubblica incorporabile, oppure null se gli aggiornamenti Preview non sono configurati. */
function previewPublicKey() {
  return fs.existsSync(PREVIEW_PUBLIC_KEY_PATH) ? fs.readFileSync(PREVIEW_PUBLIC_KEY_PATH, 'utf8') : null;
}

/** Materiale di firma per la distinta Preview; fallisce chiuso se la pubblica esiste ma la privata no. */
function previewUpdateSigning(env = process.env) {
  const publicKey = previewPublicKey();
  if (!publicKey) return null;
  const privatePath = previewPrivateKeyPath(env);
  if (!fs.existsSync(privatePath)) {
    throw new Error('Aggiornamenti Preview configurati ma chiave di firma assente su questo PC: la release non può essere pubblicata.');
  }
  return { privateKey: privatePath, publicKey, keyId: PREVIEW_KEY_ID };
}

module.exports = { PREVIEW_KEY_ID, PREVIEW_PUBLIC_KEY_PATH, PREVIEW_UPDATE_URL, previewPrivateKeyPath, previewPublicKey, previewUpdateSigning };
