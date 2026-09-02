/**
 * @module scripts/check-stable-release-readiness
 * @description Blocca Stable senza firme, restore drill, dispositivi fisici e controlli operativi esterni.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'stable-release-policy.json'), 'utf8'));
const strict = process.argv.includes('--strict');

// #region Lettura evidenze e credenziali senza segreti

function readJson(relativePath) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')); }
  catch { return null; }
}

function ageHours(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 3_600_000 : Infinity;
}

function configured(name) { return Boolean(String(process.env[name] || '').trim()); }
function fileConfigured(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) return false;
  if (value.includes('BEGIN ') || /^(?:https?:|data:)/i.test(value) || value.length > 256) return true;
  try { return fs.statSync(path.resolve(value)).isFile(); } catch { return false; }
}

function check(id, passed, detail) { return { id, status: passed ? 'pass' : 'blocked', detail }; }

function signingChecks() {
  return [
    check('windows-signing', fileConfigured('CSC_LINK') && configured('CSC_KEY_PASSWORD'), 'Certificato Authenticode e password configurati'),
    check('android-signing', fileConfigured('NEXUS_ANDROID_KEYSTORE') && ['NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD'].every(configured), 'Keystore Android di produzione configurato'),
    check('manifest-signing', ['NEXUS_RELEASE_MANIFEST_PRIVATE_KEY', 'NEXUS_RELEASE_MANIFEST_PUBLIC_KEY', 'NEXUS_RELEASE_MANIFEST_KEY_ID'].every(configured), 'Coppia Ed25519 e key id configurati'),
    check('update-origin', /^https:\/\//i.test(String(process.env.NEXUS_UPDATE_URL || '').trim()), 'Origine HTTPS degli aggiornamenti configurata')
  ];
}

// #endregion
// #region Evidenze automatiche e controlli esterni

function artifactCheck(id, relativePath, maximumAgeHours, predicate, detail) {
  const artifact = readJson(relativePath);
  const fresh = artifact && ageHours(artifact.generatedAt || artifact.capturedAt) <= maximumAgeHours;
  return check(id, Boolean(fresh && predicate(artifact)), detail);
}

function androidMatrixCheck(id, relativePath) {
  return artifactCheck(id, relativePath, policy.artifactMaximumAgeHours.androidDeviceMatrix, (artifact) => {
    const profiles = Array.isArray(artifact.profiles) ? artifact.profiles : Array.isArray(artifact.Profiles) ? artifact.Profiles : [];
    const metrics = Array.isArray(artifact.frameMetrics) ? artifact.frameMetrics : Array.isArray(artifact.FrameMetrics) ? artifact.FrameMetrics : [];
    return profiles.length >= policy.android.requiredProfiles
      && metrics.length >= policy.android.requiredProfiles
      && metrics.every((entry) => Number(entry.TotalFrames ?? entry.totalFrames) >= policy.android.minimumFramesPerProfile
        && Number(entry.JankyPercent ?? entry.jankyPercent) <= policy.android.maximumJankyPercent);
  }, `Matrice reale recente con ${policy.android.requiredProfiles} profili e jank <= ${policy.android.maximumJankyPercent}%`);
}

function buildStableReadinessReport() {
  const checks = [
    ...signingChecks(),
    artifactCheck('product-slo', 'qa-artifacts/product-slo-report.json', policy.artifactMaximumAgeHours.productSlo, (artifact) => artifact.releaseReady === true && artifact.onlineReadinessVerified === true, 'SLO automatici recenti e readiness pubblica verificata online'),
    artifactCheck('backup-recovery', 'qa-artifacts/backup-recovery-drill.json', policy.artifactMaximumAgeHours.backupRecoveryDrill, (artifact) => artifact.passed === true && artifact.snapshotIntegrity === true && artifact.encryptedArchiveRoundTrip === true, 'Ripristino e cifratura provati con dati sintetici'),
    androidMatrixCheck('android-control-device', 'qa-artifacts/android-control-matrix/manifest.json'),
    androidMatrixCheck('android-public-device', 'qa-artifacts/android-public-matrix/manifest.json'),
    ...policy.externalControls.map((control) => check(control.id, String(process.env[control.environment] || '').trim().toLowerCase() === 'true', control.description))
  ];
  const reportPath = String(process.env[policy.penetrationTestReportEnvironment] || '').trim();
  let penetrationCurrent = false;
  try { penetrationCurrent = fs.statSync(path.resolve(reportPath)).isFile() && (Date.now() - fs.statSync(path.resolve(reportPath)).mtimeMs) / 3_600_000 <= policy.artifactMaximumAgeHours.externalPenetrationTest; } catch { /* evidenza assente */ }
  checks.push(check('external-penetration-test', penetrationCurrent, 'Report indipendente recente presente fuori dal repository'));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ready: checks.every((entry) => entry.status === 'pass'),
    summary: { pass: checks.filter((entry) => entry.status === 'pass').length, blocked: checks.filter((entry) => entry.status === 'blocked').length },
    checks
  };
}

// #endregion
// #region CLI

function main() {
  const report = buildStableReadinessReport();
  const output = path.join(root, 'qa-artifacts', 'stable-release-readiness.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Stable readiness: ${report.summary.pass} conformi, ${report.summary.blocked} bloccati.`);
  for (const entry of report.checks) console.log(`- ${entry.id}: ${entry.status}`);
  if (strict && !report.ready) process.exitCode = 1;
  return report;
}

if (require.main === module) main();
module.exports = { buildStableReadinessReport, main };

// #endregion
