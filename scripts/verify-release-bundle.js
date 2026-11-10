/**
 * @module scripts/verify-release-bundle
 * @description Verifica offline distinta, artefatti, feed Electron e firma della release prodotta.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  verifySignatureEnvelope
} = require('./release-manifest');
const { PREVIEW_KEY_ID, PREVIEW_PUBLIC_KEY } = require('./preview-update-key');

const root = path.resolve(__dirname, '..');
const manifestArgument = process.argv.find((argument) => argument.startsWith('--manifest='));
const manifestPath = path.resolve(root, manifestArgument ? manifestArgument.slice('--manifest='.length) : 'release/release-manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Distinta non trovata: ${manifestPath}`);
const payload = fs.readFileSync(manifestPath);
const manifest = JSON.parse(payload.toString('utf8'));
const checked = verifyArtifactRecords(root, manifest);
const updateArtifact = manifest.artifacts.find((artifact) => artifact.kind === 'update-manifest');
if (updateArtifact) verifyElectronUpdateManifest(root, path.resolve(root, updateArtifact.path), manifest.version);

if (manifest.integrity?.manifestSignature === 'ed25519') {
  const signaturePath = manifestPath.replace(/\.json$/i, '.sig.json');
  if (!fs.existsSync(signaturePath)) throw new Error('Firma distinta mancante.');
  // Preview: chiave pubblica incorporata nel repository; Stable: chiave fornita dall'ambiente di rilascio.
  const preview = manifest.channel === 'preview' && !process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY;
  verifySignatureEnvelope(payload, JSON.parse(fs.readFileSync(signaturePath, 'utf8')), {
    publicKey: preview ? PREVIEW_PUBLIC_KEY : process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY,
    keyId: preview ? PREVIEW_KEY_ID : process.env.NEXUS_RELEASE_MANIFEST_KEY_ID
  });
}

process.stdout.write(`Bundle ${manifest.channel} verificato: ${checked.length} artefatti integri.\n`);
