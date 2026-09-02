/**
 * @module tests/release-integrity
 * @description Verifica firma distaccata, digest artefatti e feed aggiornamenti senza chiavi persistenti di test.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { artifactRecord, releaseManifest } = require('../scripts/release-manifest');
const {
  publicKeyDerBase64,
  signatureEnvelope,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  verifyRemoteReleaseManifest,
  verifySignatureEnvelope
} = require('../src/security/release-integrity');

function signingKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    publicKey: publicKey.export({ format: 'pem', type: 'spki' })
  };
}

test('firma e verifica una distinta Ed25519 senza generare chiavi nel repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-release-sign-'));
  try {
    const artifact = path.join(root, 'release', 'client.bin');
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, 'release-content');
    const manifest = releaseManifest({
      product: 'NexusNXS', version: '1.2.3', channel: 'stable', visibility: 'public',
      releaseClass: 'production', signatureRequired: true,
      artifacts: [artifactRecord(root, artifact, { visibility: 'public' })]
    });
    const payload = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const keys = signingKeys();
    const envelope = signatureEnvelope(payload, { privateKey: keys.privateKey, keyId: 'release-2026' });
    assert.equal(verifySignatureEnvelope(payload, envelope, { publicKey: keys.publicKey, keyId: 'release-2026' }), true);
    assert.deepEqual(verifyArtifactRecords(root, manifest), ['release/client.bin']);
    assert.throws(() => verifySignatureEnvelope(Buffer.concat([payload, Buffer.from('tamper')]), envelope, { publicKey: keys.publicKey, keyId: 'release-2026' }), /Digest/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifica che latest.yml punti esattamente all installer atteso', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-release-yml-'));
  try {
    const release = path.join(root, 'release');
    fs.mkdirSync(release);
    const installer = path.join(release, 'NexusNXS-1.2.3-Setup.exe');
    fs.writeFileSync(installer, 'installer');
    const digest = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
    const latest = path.join(release, 'latest.yml');
    fs.writeFileSync(latest, `version: 1.2.3\npath: NexusNXS-1.2.3-Setup.exe\nsha512: ${digest}\n`);
    assert.deepEqual(verifyElectronUpdateManifest(root, latest, '1.2.3'), {
      version: '1.2.3', installer: 'release/NexusNXS-1.2.3-Setup.exe'
    });
    fs.appendFileSync(installer, 'tampered');
    assert.throws(() => verifyElectronUpdateManifest(root, latest, '1.2.3'), /sha512/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('il preflight remoto accetta soltanto distinta firmata del canale richiesto', async () => {
  const keys = signingKeys();
  const installerPath = 'NexusNXS-2.0.0-Setup.exe';
  const installerSha512 = crypto.createHash('sha512').update('installer').digest('base64');
  const latestText = `version: 2.0.0\npath: ${installerPath}\nsha512: ${installerSha512}\n`;
  const manifest = releaseManifest({
    product: 'NexusNXS', version: '2.0.0', channel: 'beta', visibility: 'public',
    releaseClass: 'beta', signatureRequired: true,
    artifacts: [
      { name: installerPath, path: `release/${installerPath}`, feedPath: installerPath, kind: 'installer', bytes: 9, sha256: 'A'.repeat(64), visibility: 'public' },
      { name: 'latest.yml', path: 'release/latest.yml', feedPath: 'latest.yml', kind: 'update-manifest', bytes: Buffer.byteLength(latestText), sha256: crypto.createHash('sha256').update(latestText).digest('hex'), visibility: 'public' }
    ]
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const envelope = signatureEnvelope(Buffer.from(manifestText), { privateKey: keys.privateKey, keyId: 'beta-key' });
  const fetchImpl = async (url) => ({
    ok: true,
    headers: { get: () => null },
    text: async () => url.endsWith('.sig.json') ? JSON.stringify(envelope) : url.endsWith('/latest.yml') ? latestText : manifestText
  });
  const verified = await verifyRemoteReleaseManifest({
    updateUrl: 'https://updates.example.test/beta',
    publicKey: publicKeyDerBase64(keys.publicKey), keyId: 'beta-key', channel: 'beta', fetchImpl
  });
  assert.equal(verified.version, '2.0.0');
  await assert.rejects(
    verifyRemoteReleaseManifest({
      updateUrl: 'https://updates.example.test/stable',
      publicKey: publicKeyDerBase64(keys.publicKey), keyId: 'beta-key', channel: 'stable', fetchImpl
    }),
    /canale/
  );
  const tamperedFeed = async (url) => ({
    ok: true,
    headers: { get: () => null },
    text: async () => url.endsWith('.sig.json') ? JSON.stringify(envelope) : url.endsWith('/latest.yml') ? latestText.replace('2.0.0', '9.9.9') : manifestText
  });
  await assert.rejects(
    verifyRemoteReleaseManifest({
      updateUrl: 'https://updates.example.test/beta',
      publicKey: publicKeyDerBase64(keys.publicKey), keyId: 'beta-key', channel: 'beta', fetchImpl: tamperedFeed
    }),
    /non corrisponde/
  );
});
