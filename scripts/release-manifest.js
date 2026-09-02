/**
 * @module scripts/release-manifest
 * @description Crea distinte verificabili senza mescolare artefatti pubblici e privati.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  signatureEnvelope,
  validateReleaseManifest,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  verifySignatureEnvelope
} = require('../src/security/release-integrity');

// #region Distinta e artefatti

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function artifactRecord(root, filePath, metadata = {}) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`Artefatto mancante: ${absolute}`);
  }
  const relativePath = path.relative(root, absolute).replaceAll('\\', '/');
  if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error(`Artefatto fuori dal progetto: ${absolute}`);
  }
  return {
    name: path.basename(absolute),
    path: relativePath,
    bytes: fs.statSync(absolute).size,
    sha256: sha256(absolute),
    ...metadata,
  };
}

function releaseManifest({ product, version, channel, visibility, releaseClass, artifacts, signatureRequired = false }) {
  const privateOwner = visibility === 'private-owner';
  if (!['public', 'private-owner'].includes(visibility)) throw new Error(`Visibilità release non valida: ${visibility}`);
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error('La distinta deve contenere almeno un artefatto.');
  if (!privateOwner && artifacts.some((artifact) => artifact.visibility === 'private-owner')) {
    throw new Error('Un artefatto privato non può entrare nella distinta pubblica.');
  }
  const manifest = {
    schemaVersion: 2,
    product,
    version,
    generatedAt: new Date().toISOString(),
    channel,
    visibility,
    releaseClass,
    containsPrivateArtifacts: privateOwner,
    integrity: {
      artifactDigest: 'sha256',
      manifestSignature: signatureRequired ? 'ed25519' : 'optional-preview'
    },
    updatePolicy: {
      rollout: channel === 'stable' ? 'staged' : channel === 'beta' ? 'beta-ring' : 'manual-preview',
      initialPercentage: channel === 'stable' ? 10 : 100,
      paused: false,
      rollback: 'signed-forward-fix',
      preserveUserData: true
    },
    artifacts,
  };
  return validateReleaseManifest(manifest);
}

// #endregion
// #region Scrittura e firma

function writeManifest(destination, manifest) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return destination;
}

function writeManifestSignature(manifestPath, signaturePath, { privateKey, publicKey, keyId }) {
  const payload = fs.readFileSync(manifestPath);
  const envelope = signatureEnvelope(payload, { privateKey, keyId });
  verifySignatureEnvelope(payload, envelope, { publicKey, keyId });
  fs.writeFileSync(signaturePath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return signaturePath;
}

// #endregion

module.exports = {
  artifactRecord,
  releaseManifest,
  sha256,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  verifySignatureEnvelope,
  writeManifest,
  writeManifestSignature
};
