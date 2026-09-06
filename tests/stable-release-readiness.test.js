/**
 * @module tests/stable-release-readiness
 * @description Garantisce che Stable non ignori firme, restore, dispositivi fisici e controlli esterni.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runBackupRecoveryDrill } = require('../scripts/run-backup-recovery-drill');
const { artifactCheck } = require('../scripts/check-stable-release-readiness');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Stable riconosce timestamp PowerShell e rifiuta prove scadute o future', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stable-evidence-'));
  const file = path.join(temporary, 'matrix.json');
  try {
    for (const [offset, expected] of [[-1000, 'pass'], [-25 * 3600000, 'blocked'], [3600000, 'blocked']]) {
      fs.writeFileSync(file, JSON.stringify({ CapturedAt: new Date(Date.now() + offset).toISOString(), valid: true }));
      const result = artifactCheck('android', path.relative(root, file), 24, value => value.valid, 'matrix');
      assert.equal(result.status, expected);
      assert.equal(result.evidence.fresh, expected === 'pass');
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('il drill ripristina snapshot e archivio cifrato senza usare dati reali', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnxs-drill-test-'));
  try {
    const output = path.join(temporary, 'report.json');
    const report = runBackupRecoveryDrill({ outputPath: output });
    assert.equal(report.passed, true);
    assert.equal(report.restoredFiles, 4);
    assert.equal(report.dataClass, 'synthetic-only');
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).encryptedArchiveRoundTrip, true);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('la release Stable applica un gate non aggirabile sulle evidenze reali', () => {
  const pkg = JSON.parse(read('package.json'));
  const release = read('scripts', 'release-all.js');
  const readiness = read('scripts', 'check-stable-release-readiness.js');
  const policy = JSON.parse(read('config', 'stable-release-policy.json'));
  assert.match(pkg.scripts['release:stable:gate'], /backup:drill/);
  assert.match(pkg.scripts['release:stable:gate'], /qa:android:device:strict/);
  assert.match(pkg.scripts['release:stable:gate'], /signing:gate/);
  assert.match(release, /if \(production\) \{[\s\S]*check-stable-release-readiness\.js/);
  assert.match(readiness, /penetrationTestReportEnvironment/);
  assert.match(readiness, /android-public-matrix/);
  assert.match(readiness, /android-control-matrix/);
  assert.equal(policy.android.maximumJankyPercent, 18);
  assert.equal(policy.externalControls.length, 6);
});

test('la matrice fisica è manuale e confinata a un runner Android dedicato', () => {
  const workflow = read('.github', 'workflows', 'android-device.yml');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /runs-on: \[self-hosted, windows, nexusnxs-android\]/);
  assert.match(workflow, /qa:android:device:strict/);
  assert.doesNotMatch(workflow, /schedule:|pull_request:|push:/);
});
