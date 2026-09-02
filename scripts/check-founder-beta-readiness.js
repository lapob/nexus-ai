/**
 * @module scripts/check-founder-beta-readiness
 * @description Distingue una Preview tecnicamente provabile da una Founder Beta firmata e verificata su dispositivi reali.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// #region 01 — Prove automatiche e controlli esterni

function readJson(projectRoot, relativePath) {
  try { return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')); }
  catch { return null; }
}

function ageHours(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) / 3_600_000 : Infinity;
}

function confirmed(value) { return /^(?:1|true|yes|confirmed)$/i.test(String(value || '').trim()); }
function check(id, passed, detail, kind = 'automatic') { return { id, status: passed ? 'pass' : 'blocked', kind, detail }; }

function artifactCheck({ projectRoot, id, relativePath, maximumAgeHours, predicate, detail, now }) {
  const artifact = readJson(projectRoot, relativePath);
  const timestamp = artifact?.generatedAt || artifact?.capturedAt || artifact?.evaluatedAt;
  return check(id, Boolean(artifact && ageHours(timestamp, now) <= maximumAgeHours && predicate(artifact)), detail);
}

function androidMatrixCheck({ projectRoot, id, relativePath, policy, now }) {
  return artifactCheck({
    projectRoot, id, relativePath,
    maximumAgeHours: policy.artifactMaximumAgeHours.androidDeviceMatrix,
    detail: `Matrice fisica recente con ${policy.android.requiredProfiles} profili e jank <= ${policy.android.maximumJankyPercent}%`,
    now,
    predicate: (artifact) => {
      const profiles = Array.isArray(artifact.profiles) ? artifact.profiles : Array.isArray(artifact.Profiles) ? artifact.Profiles : [];
      const metrics = Array.isArray(artifact.frameMetrics) ? artifact.frameMetrics : Array.isArray(artifact.FrameMetrics) ? artifact.FrameMetrics : [];
      return profiles.length >= policy.android.requiredProfiles
        && metrics.length >= policy.android.requiredProfiles
        && metrics.every((entry) => Number(entry.TotalFrames ?? entry.totalFrames) >= policy.android.minimumFramesPerProfile
          && Number(entry.JankyPercent ?? entry.jankyPercent) <= policy.android.maximumJankyPercent);
    }
  });
}

function buildFounderBetaReport({ projectRoot = root, environment = process.env, now = Date.now() } = {}) {
  const policy = readJson(projectRoot, 'config/founder-beta-policy.json');
  if (!policy || policy.schemaVersion !== 1) throw new Error('Policy Founder Beta non valida.');
  const automatic = [
    artifactCheck({ projectRoot, id: 'product-slo', relativePath: 'qa-artifacts/product-slo-report.json', maximumAgeHours: policy.artifactMaximumAgeHours.productSlo, now, detail: 'Qualità, latenza e readiness pubblica recenti', predicate: (artifact) => artifact.releaseReady === true && artifact.onlineReadinessVerified === true }),
    artifactCheck({ projectRoot, id: 'backup-recovery', relativePath: 'qa-artifacts/backup-recovery-drill.json', maximumAgeHours: policy.artifactMaximumAgeHours.backupRecovery, now, detail: 'Ripristino sintetico e archivio cifrato verificati', predicate: (artifact) => artifact.passed === true && artifact.snapshotIntegrity === true && artifact.encryptedArchiveRoundTrip === true }),
    artifactCheck({ projectRoot, id: 'ai-evaluation', relativePath: 'qa-artifacts/ai-eval-lab-gate.json', maximumAgeHours: policy.artifactMaximumAgeHours.aiEvaluation, now, detail: 'Eval AI versionate senza fallimenti obbligatori', predicate: (artifact) => artifact.gatePassed === true && (artifact.models || []).every((model) => (model.summary?.mustPassFailures || []).length === 0) }),
    artifactCheck({ projectRoot, id: 'desktop-motion', relativePath: 'qa-artifacts/desktop-motion-qa.json', maximumAgeHours: policy.artifactMaximumAgeHours.desktopMotion, now, detail: 'Core e transizioni desktop dentro il budget', predicate: (artifact) => (artifact.cores || []).length > 0 && artifact.cores.every((core) => (core.failures || []).length === 0) })
  ];
  const device = [
    androidMatrixCheck({ projectRoot, id: 'android-control-device', relativePath: 'qa-artifacts/android-control-matrix/manifest.json', policy, now }),
    androidMatrixCheck({ projectRoot, id: 'android-public-device', relativePath: 'qa-artifacts/android-public-matrix/manifest.json', policy, now })
  ];
  const distribution = [
    check('windows-signing', Boolean(String(environment.CSC_LINK || '').trim() && String(environment.CSC_KEY_PASSWORD || '').trim()), 'Installer Windows firmato', 'distribution'),
    check('android-signing', ['NEXUS_ANDROID_KEYSTORE', 'NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD'].every((name) => String(environment[name] || '').trim()), 'APK Android firmati con chiave conservata', 'distribution'),
    check('manifest-signing', ['NEXUS_RELEASE_MANIFEST_PRIVATE_KEY', 'NEXUS_RELEASE_MANIFEST_PUBLIC_KEY', 'NEXUS_RELEASE_MANIFEST_KEY_ID'].every((name) => String(environment[name] || '').trim()), 'Distinte di release firmate', 'distribution'),
    check('update-origin', /^https:\/\//i.test(String(environment.NEXUS_UPDATE_URL || '').trim()), 'Origine HTTPS degli aggiornamenti', 'distribution')
  ];
  const external = policy.externalControls.map((control) => check(control.id, confirmed(environment[control.environment]), control.description, 'external'));
  const all = [...automatic, ...device, ...distribution, ...external];
  const technicalPreviewReady = automatic.every((entry) => entry.status === 'pass');
  const founderBetaReady = technicalPreviewReady && all.every((entry) => entry.status === 'pass');
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    maximumInvitedTesters: policy.maximumInvitedTesters,
    technicalPreviewReady,
    founderBetaReady,
    summary: { pass: all.filter((entry) => entry.status === 'pass').length, blocked: all.filter((entry) => entry.status === 'blocked').length },
    checks: all
  };
}

// #endregion
// #region 02 — CLI

function main() {
  const strict = process.argv.includes('--strict');
  const report = buildFounderBetaReport();
  const output = path.join(root, 'qa-artifacts', 'founder-beta-readiness.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Founder Beta: Preview tecnica ${report.technicalPreviewReady ? 'pronta' : 'bloccata'}; inviti reali ${report.founderBetaReady ? 'pronti' : 'bloccati'}.`);
  for (const entry of report.checks) console.log(`- ${entry.id}: ${entry.status}`);
  console.log(`Report: ${output}`);
  if (strict && !report.founderBetaReady) process.exitCode = 1;
  return report;
}

if (require.main === module) main();
module.exports = { ageHours, buildFounderBetaReport, confirmed, main };

// #endregion
