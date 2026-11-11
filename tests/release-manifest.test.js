/**
 * @module tests/release-manifest
 * @description Verifica il confine di pubblicazione tra client pubblici e Console privata.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifactRecord, releaseManifest, writeManifest } = require('../scripts/release-manifest');
const releaseScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'release-all.js'), 'utf8');

test('la distinta pubblica rifiuta artefatti riservati al proprietario', () => {
  assert.throws(() => releaseManifest({
    product: 'NexusNXS', version: '1.0.0', channel: 'stable', visibility: 'public', releaseClass: 'preview',
    artifacts: [{ name: 'NexusNXS-Control.apk', visibility: 'private-owner' }],
  }), /non può entrare nella distinta pubblica/);
});

test('le distinte pubblica e privata restano separate e verificabili', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnxs-release-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const publicFile = path.join(root, 'release', 'NexusNXS-Setup.exe');
  const privateFile = path.join(root, 'release-private', 'NexusNXS-Control.apk');
  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.mkdirSync(path.dirname(privateFile), { recursive: true });
  fs.writeFileSync(publicFile, 'public-client');
  fs.writeFileSync(privateFile, 'private-console');

  const publicManifest = releaseManifest({
    product: 'NexusNXS', version: '1.0.0', channel: 'preview', visibility: 'public', releaseClass: 'preview',
    artifacts: [artifactRecord(root, publicFile, { visibility: 'public' })],
  });
  const privateManifest = releaseManifest({
    product: 'NexusNXS per PC', version: '1.0.0', channel: 'owner', visibility: 'private-owner', releaseClass: 'preview',
    artifacts: [artifactRecord(root, privateFile, { visibility: 'private-owner' })],
  });
  const publicPath = writeManifest(path.join(root, 'release', 'release-manifest.json'), publicManifest);
  const privatePath = writeManifest(path.join(root, 'release-private', 'release-manifest.private.json'), privateManifest);

  assert.equal(JSON.parse(fs.readFileSync(publicPath, 'utf8')).containsPrivateArtifacts, false);
  assert.doesNotMatch(fs.readFileSync(publicPath, 'utf8'), /NexusNXS-Control/);
  assert.equal(JSON.parse(fs.readFileSync(privatePath, 'utf8')).visibility, 'private-owner');
  assert.notEqual(publicManifest.artifacts[0].sha256, privateManifest.artifacts[0].sha256);
});

test('la distinta conserva le versioni reali dei componenti Android', () => {
  assert.match(releaseScript, /androidVersion\('NexusConsole'\)/);
  assert.match(releaseScript, /componentVersion/);
  assert.match(releaseScript, /'preview', 'beta', 'stable'/);
  assert.match(releaseScript, /releaseChannel === 'stable' \? 'production' : releaseChannel === 'beta' \? 'beta' : 'preview'/);
});

test('la release privata rimuove l alias storico NexusNXS-PC', () => {
  assert.match(releaseScript, /rmSync\(path\.join\(privateRoot, 'NexusNXS-PC\.apk'\), \{ force: true \}\)/);
  assert.match(releaseScript, /NexusNXS-Control\.apk/);
});

test('la build incorpora lo stesso canale dichiarato nella distinta', () => {
  assert.match(releaseScript, /NEXUS_RELEASE_CHANNEL:\s*releaseChannel/);
  assert.match(releaseScript, /scopedEnvironment/);
  assert.match(releaseScript, /env:\s*environment/);
});

test('la pipeline non propaga le credenziali di firma ai task che non le richiedono', () => {
  assert.match(releaseScript, /RELEASE_SECRET_KEYS/);
  assert.match(releaseScript, /delete environment\[key\]/);
  assert.match(releaseScript, /build:win:signed[^\n]+WINDOWS_SIGNING_SECRETS/);
  assert.match(releaseScript, /android:console[^\n]+ANDROID_SIGNING_SECRETS/);
});

test('Preview resta esplicitamente non firmata mentre Beta e Stable richiedono firma', () => {
  const preview = releaseManifest({
    product: 'NexusNXS', version: '1.0.0', channel: 'preview', visibility: 'public', releaseClass: 'preview',
    artifacts: [{ name: 'preview.bin', path: 'release/preview.bin', bytes: 1, sha256: 'A'.repeat(64), visibility: 'public' }]
  });
  const stable = releaseManifest({
    product: 'NexusNXS', version: '1.0.0', channel: 'stable', visibility: 'public', releaseClass: 'production', signatureRequired: true,
    artifacts: [{ name: 'stable.bin', path: 'release/stable.bin', bytes: 1, sha256: 'B'.repeat(64), visibility: 'public' }]
  });
  assert.equal(preview.integrity.manifestSignature, 'optional-preview');
  assert.equal(stable.integrity.manifestSignature, 'ed25519');
  assert.deepEqual(stable.updatePolicy, {
    rollout: 'staged', initialPercentage: 10, paused: false, rollback: 'signed-forward-fix', preserveUserData: true,
    stages: [{ afterHours: 0, percentage: 10 }, { afterHours: 24, percentage: 50 }, { afterHours: 72, percentage: 100 }]
  });
  assert.equal(preview.updatePolicy.rollout, 'manual-preview');
});

test('Preview firmata Ed25519 diventa automatica e non accetta politiche miste', () => {
  const { validateReleaseManifest } = require('../src/security/release-integrity');
  const signed = releaseManifest({
    product: 'NexusNXS', version: '1.0.1', channel: 'preview', visibility: 'public', releaseClass: 'preview', signatureRequired: true,
    artifacts: [{ name: 'preview.bin', path: 'release/preview.bin', bytes: 1, sha256: 'C'.repeat(64), visibility: 'public' }]
  });
  assert.equal(signed.integrity.manifestSignature, 'ed25519');
  assert.equal(signed.updatePolicy.rollout, 'preview-auto');
  assert.throws(() => validateReleaseManifest({ ...signed, updatePolicy: { ...signed.updatePolicy, rollout: 'manual-preview' } }), /rollout/i);
  assert.throws(() => validateReleaseManifest({ ...signed, integrity: { ...signed.integrity, manifestSignature: 'optional-preview' }, updatePolicy: { ...signed.updatePolicy } }), /rollout/i);
});

test('la chiave pubblica Preview incorporata verifica soltanto firme della chiave privata locale', () => {
  const crypto = require('node:crypto');
  const { signatureEnvelope, verifySignatureEnvelope } = require('../src/security/release-integrity');
  const { previewPublicKey, PREVIEW_KEY_ID } = require('../scripts/preview-update-key');
  const publicKey = previewPublicKey();
  assert.ok(publicKey && publicKey.includes('BEGIN PUBLIC KEY'));
  const intruder = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const envelope = signatureEnvelope(Buffer.from('{"a":1}'), { privateKey: intruder, keyId: PREVIEW_KEY_ID });
  assert.throws(() => verifySignatureEnvelope(Buffer.from('{"a":1}'), envelope, { publicKey, keyId: PREVIEW_KEY_ID }), /Firma della distinta non valida/);
});
