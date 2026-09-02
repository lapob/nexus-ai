/**
 * @module scripts/prepare-public-release
 * @description Materializza l'origine HTTPS del servizio nel setup pubblico senza includere runtime AI locali.
 */
const fs = require('node:fs');
const path = require('node:path');
const { publicKeyDerBase64 } = require('../src/security/release-integrity');

const root = path.resolve(__dirname, '..');
const value = String(process.env.NEXUS_SERVICE_URL || '').trim().replace(/\/+$/, '');
let url;
try { url = new URL(value); } catch { /* errore uniforme sotto */ }
if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname !== '/') {
  process.stderr.write('Imposta NEXUS_SERVICE_URL con l’origine HTTPS pubblica, ad esempio https://ai.example.com\n');
  process.exit(1);
}
const target = path.join(root, 'config', 'public-client.release.json');
const channel = String(process.env.NEXUS_RELEASE_CHANNEL || 'preview').trim().toLowerCase();
if (!['preview', 'beta', 'stable'].includes(channel)) throw new Error('NEXUS_RELEASE_CHANNEL deve essere preview, beta oppure stable.');
const signedChannel = channel !== 'preview';
const fallbackUrls = String(process.env.NEXUS_SERVICE_FALLBACK_URLS || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 3).map((item) => {
  const fallback = new URL(item);
  if (fallback.protocol !== 'https:' || fallback.username || fallback.password || fallback.hash || fallback.pathname !== '/') throw new Error('Ogni fallback deve essere un’origine HTTPS sicura.');
  return fallback.origin;
}).filter((item, index, list) => item !== url.origin && list.indexOf(item) === index);
const rawUpdatesUrl = String(process.env.NEXUS_UPDATE_URL || '').trim().replace(/\/+$/, '');
let updatesUrl = '';
if (rawUpdatesUrl) {
  const updateOrigin = new URL(rawUpdatesUrl);
  if (updateOrigin.protocol !== 'https:' || updateOrigin.username || updateOrigin.password || updateOrigin.search || updateOrigin.hash) throw new Error('NEXUS_UPDATE_URL deve essere una directory HTTPS pulita.');
  updatesUrl = updateOrigin.toString().replace(/\/$/, '');
}
if (signedChannel && !updatesUrl) throw new Error('I canali Beta e Stable richiedono NEXUS_UPDATE_URL.');
if (!signedChannel) updatesUrl = '';
const manifestKeyId = String(process.env.NEXUS_RELEASE_MANIFEST_KEY_ID || '').trim();
const manifestPublicKey = process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY
  ? publicKeyDerBase64(process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY)
  : '';
if (signedChannel && (!manifestPublicKey || !/^[A-Za-z0-9._-]{3,80}$/.test(manifestKeyId))) {
  throw new Error('I canali Beta e Stable richiedono chiave pubblica Ed25519 e NEXUS_RELEASE_MANIFEST_KEY_ID.');
}
fs.writeFileSync(target, `${JSON.stringify({
  schemaVersion: 2, mode: 'public', channel, updatesUrl,
  serviceUrl: url.origin, fallbackUrls, manifestPublicKey, manifestKeyId
}, null, 2)}\n`);
process.stdout.write(`Client pubblico configurato per ${url.hostname}. Nessun modello locale verrà incluso.\n`);
