const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepareFounderPreview, selectedPublicArtifacts } = require('../scripts/prepare-founder-preview');

function record(root, relativePath, metadata) {
  const absolute = path.join(root, relativePath);
  const buffer = fs.readFileSync(absolute);
  return {
    name: path.basename(relativePath), path: relativePath.replaceAll('\\', '/'), bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase(), visibility: 'public',
    distributionSigned: false, ...metadata
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-founder-package-'));
  fs.mkdirSync(path.join(root, 'release'), { recursive: true });
  fs.mkdirSync(path.join(root, 'release-android'), { recursive: true });
  fs.writeFileSync(path.join(root, 'release', 'NexusNXS-Setup.exe'), 'desktop');
  fs.writeFileSync(path.join(root, 'release-android', 'NexusNXS-Android.apk'), 'android');
  const artifacts = [
    record(root, 'release/NexusNXS-Setup.exe', { platform: 'windows', kind: 'installer', componentVersion: '1.0.0' }),
    record(root, 'release-android/NexusNXS-Android.apk', { platform: 'android', kind: 'apk', componentVersion: '2.0.0' })
  ];
  const manifest = {
    schemaVersion: 2, product: 'NexusNXS', version: '1.0.0', generatedAt: new Date().toISOString(),
    channel: 'preview', visibility: 'public', releaseClass: 'preview', containsPrivateArtifacts: false,
    integrity: { artifactDigest: 'sha256', manifestSignature: 'optional-preview' },
    updatePolicy: { rollout: 'manual-preview', initialPercentage: 100, paused: false, rollback: 'signed-forward-fix', preserveUserData: true },
    artifacts
  };
  fs.writeFileSync(path.join(root, 'release', 'release-manifest.json'), JSON.stringify(manifest));
  return { root, manifest };
}

test('il pacchetto amici contiene soltanto i due client pubblici e istruzioni verificabili', () => {
  const { root } = fixture();
  const result = prepareFounderPreview({ projectRoot: root, manifestPath: 'release/release-manifest.json', outputDirectory: 'share' });
  assert.deepEqual(result.files, ['CHECKSUMS.sha256', 'LEGGIMI.txt', 'NexusNXS-Android.apk', 'NexusNXS-Setup.exe', 'release-manifest.preview.json']);
  assert.match(fs.readFileSync(path.join(root, 'share', 'LEGGIMI.txt'), 'utf8'), /non disattivare antivirus/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'share', 'LEGGIMI.txt'), 'utf8'), /NexusNXS Control/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('un artefatto Control viene rifiutato anche se marcato pubblico', () => {
  const { manifest } = fixture();
  manifest.artifacts[1].name = 'NexusNXS-Control.apk';
  assert.throws(() => selectedPublicArtifacts(manifest), /privato o ambiguo/i);
});
