/**
 * @module tests/founder-beta-readiness
 * @description Verifica la separazione fra Preview automatica e Founder Beta distribuibile.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFounderBetaReport } = require('../scripts/check-founder-beta-readiness');

function fixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-founder-beta-'));
  const write = (relative, value) => {
    const target = path.join(projectRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value)}\n`, 'utf8');
  };
  const now = Date.now();
  write('config/founder-beta-policy.json', {
    schemaVersion: 1, maximumInvitedTesters: 20,
    artifactMaximumAgeHours: { productSlo: 24, backupRecovery: 168, aiEvaluation: 24, desktopMotion: 24, androidDeviceMatrix: 336 },
    android: { requiredProfiles: 5, maximumJankyPercent: 18, minimumFramesPerProfile: 20 },
    externalControls: [{ id: 'privacy', environment: 'PRIVACY_OK', description: 'privacy' }, { id: 'support', environment: 'SUPPORT_OK', description: 'support' }]
  });
  write('qa-artifacts/product-slo-report.json', { generatedAt: new Date(now).toISOString(), releaseReady: true, onlineReadinessVerified: true });
  write('qa-artifacts/backup-recovery-drill.json', { generatedAt: new Date(now).toISOString(), passed: true, snapshotIntegrity: true, encryptedArchiveRoundTrip: true });
  write('qa-artifacts/ai-eval-lab-gate.json', { generatedAt: new Date(now).toISOString(), gatePassed: true, models: [{ summary: { mustPassFailures: [] } }] });
  write('qa-artifacts/desktop-motion-qa.json', { generatedAt: new Date(now).toISOString(), cores: [{ failures: [] }] });
  return { projectRoot, write, now };
}

test('la Preview tecnica non finge che firma e dispositivi reali siano gia pronti', () => {
  const item = fixture();
  try {
    const report = buildFounderBetaReport({ projectRoot: item.projectRoot, environment: {}, now: item.now });
    assert.equal(report.technicalPreviewReady, true);
    assert.equal(report.founderBetaReady, false);
    assert.equal(report.checks.find((entry) => entry.id === 'android-public-device').status, 'blocked');
    assert.equal(report.checks.find((entry) => entry.id === 'windows-signing').status, 'blocked');
  } finally { fs.rmSync(item.projectRoot, { recursive: true, force: true }); }
});

test('la Founder Beta richiede insieme prove automatiche firma dispositivi e responsabilita', () => {
  const item = fixture();
  try {
    const matrix = { capturedAt: new Date(item.now).toISOString(), profiles: [1, 2, 3, 4, 5], frameMetrics: Array.from({ length: 5 }, () => ({ totalFrames: 120, jankyPercent: 2 })) };
    item.write('qa-artifacts/android-control-matrix/manifest.json', matrix);
    item.write('qa-artifacts/android-public-matrix/manifest.json', matrix);
    const environment = {
      CSC_LINK: 'certificate', CSC_KEY_PASSWORD: 'secret',
      NEXUS_ANDROID_KEYSTORE: 'keystore', NEXUS_ANDROID_STORE_PASSWORD: 'secret', NEXUS_ANDROID_KEY_ALIAS: 'nexus', NEXUS_ANDROID_KEY_PASSWORD: 'secret',
      NEXUS_RELEASE_MANIFEST_PRIVATE_KEY: 'private', NEXUS_RELEASE_MANIFEST_PUBLIC_KEY: 'public', NEXUS_RELEASE_MANIFEST_KEY_ID: 'founder-1',
      NEXUS_UPDATE_URL: 'https://updates.example.test/beta/', PRIVACY_OK: 'confirmed', SUPPORT_OK: 'true'
    };
    const report = buildFounderBetaReport({ projectRoot: item.projectRoot, environment, now: item.now });
    assert.equal(report.technicalPreviewReady, true);
    assert.equal(report.founderBetaReady, true);
    assert.equal(report.summary.blocked, 0);
  } finally { fs.rmSync(item.projectRoot, { recursive: true, force: true }); }
});

test('accetta il timestamp PowerShell dei report Android fisici', () => {
  const item = fixture();
  try {
    const matrix = {
      CapturedAt: new Date(item.now).toISOString(),
      Profiles: [1, 2, 3, 4, 5],
      FrameMetrics: Array.from({ length: 5 }, () => ({ TotalFrames: 120, JankyPercent: 2 }))
    };
    item.write('qa-artifacts/android-control-matrix/manifest.json', matrix);
    item.write('qa-artifacts/android-public-matrix/manifest.json', matrix);
    const report = buildFounderBetaReport({ projectRoot: item.projectRoot, environment: {}, now: item.now });
    assert.equal(report.checks.find((entry) => entry.id === 'android-control-device').status, 'pass');
    assert.equal(report.checks.find((entry) => entry.id === 'android-public-device').status, 'pass');
  } finally { fs.rmSync(item.projectRoot, { recursive: true, force: true }); }
});
