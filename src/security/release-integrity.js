/**
 * @module security/release-integrity
 * @description Primitive condivise per firmare e verificare distinte, artefatti e feed di aggiornamento.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_CHANNELS = new Set(['preview', 'beta', 'stable']);
const MAX_REMOTE_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_REMOTE_UPDATE_MANIFEST_BYTES = 512 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 8_000;

// #region Firma e artefatti locali

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function keyMaterial(value, label = 'chiave') {
  if (Buffer.isBuffer(value)) return value;
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} non configurata.`);
  if (text.includes('-----BEGIN ')) return text;
  const target = path.resolve(text);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${label} non trovata.`);
  return fs.readFileSync(target);
}

function publicKeyDerBase64(value) {
  const key = crypto.createPublicKey(keyMaterial(value, 'Chiave pubblica manifest'));
  return key.export({ format: 'der', type: 'spki' }).toString('base64');
}

function publicKeyFromDerBase64(value) {
  const encoded = String(value || '').trim();
  if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('Chiave pubblica manifest incorporata non valida.');
  return crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
}

function signatureEnvelope(payload, { privateKey, keyId }) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const id = String(keyId || '').trim();
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(id)) throw new Error('Identificativo chiave manifest non valido.');
  const key = crypto.createPrivateKey(keyMaterial(privateKey, 'Chiave privata manifest'));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('La firma della distinta richiede una chiave Ed25519.');
  return {
    schemaVersion: 1,
    algorithm: 'ed25519',
    keyId: id,
    payloadSha256: sha256Bytes(bytes),
    signature: crypto.sign(null, bytes, key).toString('base64')
  };
}

function verifySignatureEnvelope(payload, envelope, { publicKey, keyId = '' } = {}) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (!envelope || envelope.schemaVersion !== 1 || envelope.algorithm !== 'ed25519') throw new Error('Busta firma manifest non supportata.');
  if (keyId && envelope.keyId !== keyId) throw new Error('La firma usa una chiave non autorizzata.');
  if (envelope.payloadSha256 !== sha256Bytes(bytes)) throw new Error('Digest della distinta non corrispondente.');
  const key = typeof publicKey === 'string' && !publicKey.includes('BEGIN') && !fs.existsSync(path.resolve(publicKey))
    ? publicKeyFromDerBase64(publicKey)
    : crypto.createPublicKey(keyMaterial(publicKey, 'Chiave pubblica manifest'));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('La verifica della distinta richiede una chiave Ed25519.');
  if (!crypto.verify(null, bytes, key, Buffer.from(String(envelope.signature || ''), 'base64'))) throw new Error('Firma della distinta non valida.');
  return true;
}

function validateReleaseManifest(manifest, { expectedChannel = '' } = {}) {
  if (!manifest || manifest.schemaVersion !== 2) throw new Error('Schema distinta release non supportato.');
  if (!['public', 'private-owner'].includes(manifest.visibility)) throw new Error('Visibilità distinta non valida.');
  if (manifest.visibility === 'public' && !PUBLIC_CHANNELS.has(manifest.channel)) throw new Error('Canale pubblico non valido.');
  if (expectedChannel && manifest.channel !== expectedChannel) throw new Error('Il canale della distinta non corrisponde al client.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(manifest.version || ''))) throw new Error('Versione distinta non valida.');
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw new Error('Distinta priva di artefatti.');
  if (manifest.visibility === 'public' && manifest.artifacts.some((artifact) => artifact.visibility !== 'public')) throw new Error('La distinta pubblica contiene un artefatto non pubblico.');
  if (manifest.visibility === 'public') {
    const expectedClass = manifest.channel === 'stable' ? 'production' : manifest.channel;
    if (manifest.releaseClass !== expectedClass) throw new Error('Classe e canale della distinta non corrispondono.');
    const expectedSignature = manifest.channel === 'preview' ? 'optional-preview' : 'ed25519';
    if (manifest.integrity?.manifestSignature !== expectedSignature) throw new Error('Politica di firma della distinta non coerente con il canale.');
    const expectedRollout = manifest.channel === 'stable' ? 'staged' : manifest.channel === 'beta' ? 'beta-ring' : 'manual-preview';
    if (manifest.updatePolicy?.rollout !== expectedRollout
      || !Number.isInteger(manifest.updatePolicy?.initialPercentage)
      || manifest.updatePolicy.initialPercentage < 1 || manifest.updatePolicy.initialPercentage > 100
      || (manifest.updatePolicy.paused !== undefined && typeof manifest.updatePolicy.paused !== 'boolean')
      || manifest.updatePolicy?.rollback !== 'signed-forward-fix'
      || manifest.updatePolicy?.preserveUserData !== true) {
      throw new Error('Policy di rollout e recupero non valida.');
    }
  }
  const paths = new Set();
  for (const artifact of manifest.artifacts) {
    const artifactPath = String(artifact?.path || '').replaceAll('\\', '/');
    if (!artifactPath || artifactPath.startsWith('/') || artifactPath.split('/').includes('..')) throw new Error('Percorso artefatto non valido nella distinta.');
    if (paths.has(artifactPath)) throw new Error('La distinta contiene percorsi artefatto duplicati.');
    paths.add(artifactPath);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) throw new Error(`Dimensione artefatto non valida: ${artifactPath}`);
    if (!/^[A-Fa-f0-9]{64}$/.test(String(artifact.sha256 || ''))) throw new Error(`Digest artefatto non valido: ${artifactPath}`);
    if (artifact.feedPath !== undefined) {
      const feedPath = String(artifact.feedPath || '').replaceAll('\\', '/');
      if (!feedPath || feedPath.startsWith('/') || feedPath.split('/').includes('..') || /^https?:/i.test(feedPath)) throw new Error('Percorso feed artefatto non valido.');
    }
  }
  return manifest;
}

function resolveArtifact(root, relativePath) {
  const normalized = String(relativePath || '').replaceAll('/', path.sep);
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (!normalized || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Percorso artefatto fuori dal bundle.');
  return target;
}

function verifyArtifactRecords(root, manifest) {
  validateReleaseManifest(manifest);
  const checked = [];
  for (const artifact of manifest.artifacts) {
    const target = resolveArtifact(root, artifact.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Artefatto mancante: ${artifact.path}`);
    const bytes = fs.readFileSync(target);
    if (bytes.length !== artifact.bytes) throw new Error(`Dimensione artefatto non valida: ${artifact.path}`);
    if (sha256Bytes(bytes) !== String(artifact.sha256 || '').toUpperCase()) throw new Error(`Digest artefatto non valido: ${artifact.path}`);
    checked.push(artifact.path);
  }
  return checked;
}

function yamlScalar(source, name) {
  const match = String(source || '').match(new RegExp(`^${name}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'));
  return match ? match[1].trim() : '';
}

function verifyElectronUpdateManifest(root, updateManifestPath, expectedVersion = '') {
  const source = fs.readFileSync(updateManifestPath, 'utf8');
  const version = yamlScalar(source, 'version');
  const relativeInstaller = yamlScalar(source, 'path');
  const expectedSha512 = yamlScalar(source, 'sha512');
  if (!version || (expectedVersion && version !== expectedVersion)) throw new Error('Versione latest.yml non coerente con la release.');
  if (!relativeInstaller || !expectedSha512) throw new Error('latest.yml non contiene path e sha512 verificabili.');
  const installer = resolveArtifact(path.dirname(updateManifestPath), relativeInstaller);
  if (!fs.existsSync(installer) || !fs.statSync(installer).isFile()) throw new Error('Installer indicato da latest.yml mancante.');
  const actual = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
  if (actual !== expectedSha512) throw new Error('sha512 di latest.yml non corrispondente all’installer.');
  const relativeToRoot = path.relative(root, installer);
  if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) throw new Error('Installer aggiornamento fuori dal bundle.');
  return { version, installer: relativeToRoot.replaceAll('\\', '/') };
}

// #endregion
// #region Verifica remota limitata

function cleanRemoteUpdateUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Origine aggiornamenti remota non valida.');
  return url.toString().replace(/\/$/, '');
}

function remoteArtifactUrl(base, artifact) {
  const relative = String(artifact.feedPath || path.basename(String(artifact.path || ''))).replaceAll('\\', '/');
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || /^https?:/i.test(relative)) throw new Error('Percorso feed artefatto non valido.');
  return `${base}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

async function boundedResponseText(response, maximumBytes, label) {
  if (!response?.ok) throw new Error(`${label} non disponibile.`);
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error(`${label} troppo grande.`);
  const text = await response.text();
  if (Buffer.byteLength(text) > maximumBytes) throw new Error(`${label} troppo grande.`);
  return text;
}

function updateFeedRecords(manifest) {
  const updateManifest = manifest.artifacts.find((artifact) => artifact.kind === 'update-manifest');
  if (!updateManifest) throw new Error('La distinta firmata non contiene il manifest aggiornamenti.');
  const feedPath = String(updateManifest.feedPath || path.basename(updateManifest.path || ''));
  if (feedPath.toLowerCase() !== 'latest.yml') throw new Error('Il manifest aggiornamenti firmato non usa latest.yml.');
  return { updateManifest };
}

function verifyRemoteUpdateManifestText(source, manifest) {
  const version = yamlScalar(source, 'version');
  const installerPath = yamlScalar(source, 'path').replaceAll('\\', '/');
  const sha512 = yamlScalar(source, 'sha512');
  if (version !== manifest.version) throw new Error('Versione latest.yml non coerente con la distinta firmata.');
  if (!installerPath || installerPath.startsWith('/') || installerPath.split('/').includes('..') || /^https?:/i.test(installerPath)) throw new Error('Percorso installer latest.yml non valido.');
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error('Digest installer latest.yml non valido.');
  const installer = manifest.artifacts.find((artifact) => artifact.kind === 'installer'
    && String(artifact.feedPath || path.basename(artifact.path || '')).replaceAll('\\', '/') === installerPath);
  if (!installer) throw new Error('Installer latest.yml assente dalla distinta firmata.');
  return { version, installerPath, sha512 };
}

async function verifyRemoteReleaseManifest({ updateUrl, publicKey, keyId, channel, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error('Client HTTPS non disponibile per verificare gli aggiornamenti.');
  const base = cleanRemoteUpdateUrl(updateUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  timeout.unref?.();
  const options = { cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal };
  try {
    const [manifestResponse, signatureResponse] = await Promise.all([
      fetchImpl(`${base}/release-manifest.json`, options),
      fetchImpl(`${base}/release-manifest.sig.json`, options)
    ]);
    const [manifestText, signatureText] = await Promise.all([
      boundedResponseText(manifestResponse, MAX_REMOTE_MANIFEST_BYTES, 'Distinta aggiornamento'),
      boundedResponseText(signatureResponse, 64 * 1024, 'Firma distinta aggiornamento')
    ]);
    let envelope;
    try { envelope = JSON.parse(signatureText); } catch { throw new Error('Firma distinta aggiornamento non valida.'); }
    verifySignatureEnvelope(Buffer.from(manifestText), envelope, { publicKey, keyId });
    let parsed;
    try { parsed = JSON.parse(manifestText); } catch { throw new Error('Distinta aggiornamento non valida.'); }
    const manifest = validateReleaseManifest(parsed, { expectedChannel: channel });
    if (manifest.visibility !== 'public' || manifest.integrity?.manifestSignature !== 'ed25519') throw new Error('Distinta aggiornamento non fiduciaria.');
    const { updateManifest } = updateFeedRecords(manifest);
    const updateResponse = await fetchImpl(remoteArtifactUrl(base, updateManifest), {
      ...options, headers: { Accept: 'application/yaml, text/yaml, text/plain' }
    });
    const updateText = await boundedResponseText(updateResponse, MAX_REMOTE_UPDATE_MANIFEST_BYTES, 'Manifest Electron');
    if (Buffer.byteLength(updateText) !== updateManifest.bytes || sha256Bytes(Buffer.from(updateText)) !== String(updateManifest.sha256).toUpperCase()) {
      throw new Error('latest.yml non corrisponde alla distinta firmata.');
    }
    verifyRemoteUpdateManifestText(updateText, manifest);
    return manifest;
  } finally {
    clearTimeout(timeout);
  }
}

// #endregion

module.exports = {
  PUBLIC_CHANNELS,
  keyMaterial,
  publicKeyDerBase64,
  publicKeyFromDerBase64,
  sha256Bytes,
  signatureEnvelope,
  validateReleaseManifest,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  verifyRemoteUpdateManifestText,
  verifyRemoteReleaseManifest,
  verifySignatureEnvelope
};
