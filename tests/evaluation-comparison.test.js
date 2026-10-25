const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function report(model = 'baseline') {
  return { generatedAt: new Date().toISOString(), suite: { hash: 'b'.repeat(64) },
    provenance: { trainingUse: 'evaluation-only', containsRealUserData: false },
    models: [{ model, mode: 'quick', summary: { modelCases: 100, passRate: 95, medianLatencyMs: 1000, p95LatencyMs: 2000, gatePassed: true, mustPassFailures: [] } }] };
}
function compare(t, before, after, options = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-eval-compare-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseline = path.join(directory, 'baseline.json'), candidate = path.join(directory, 'candidate.json');
  fs.writeFileSync(baseline, JSON.stringify(before)); fs.writeFileSync(candidate, JSON.stringify(after));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/compare-ai-evaluations.js'), baseline, candidate, ...options], { encoding: 'utf8', timeout: 5000 });
  return { ...result, receipt: result.stdout ? JSON.parse(result.stdout) : null };
}

test('a different model requires an explicit measured baseline instead of automatic acceptance', t => {
  const missing = compare(t, report(), report('candidate'));
  assert.equal(missing.status, 2); assert.equal(missing.receipt.comparisons[0].status, 'missing-baseline');
  const measured = compare(t, report(), report('candidate'), ['--baseline-model=baseline']);
  assert.equal(measured.status, 0, measured.stderr); assert.equal(measured.receipt.automaticProductionPromotion, false);
  assert.equal(measured.receipt.comparisons[0].baselineModel, 'baseline');
});

test('fixtures, insufficient inference cases, mismatched modes and stale results cannot authorize promotion', t => {
  for (const mutate of [r => { r.models[0].mode = 'fixture'; }, r => { r.models[0].summary.modelCases = 0; },
    r => { r.models[0].mode = 'quick-raw'; }, r => { r.generatedAt = '2020-01-01'; },
    r => { delete r.provenance; }, r => { r.models[0].summary.medianLatencyMs = 0; }]) {
    const candidate = report(); mutate(candidate);
    const result = compare(t, report(), candidate);
    assert.equal(result.status, 2, result.stderr); assert.equal(result.receipt.accepted, false);
  }
});

test('missing suite hashes and invalid thresholds fail closed', t => {
  const candidate = report(); delete candidate.suite;
  assert.equal(compare(t, report(), candidate).status, 1);
  assert.equal(compare(t, report(), report(), ['--max-pass-drop=NaN']).status, 1);
});

test('quality, mandatory safety and p95 regressions remain blocking', t => {
  for (const change of [{ passRate: 90 }, { mustPassFailures: ['safety'] }, { p95LatencyMs: 3000 }, { gatePassed: false }]) {
    const candidate = report(); Object.assign(candidate.models[0].summary, change);
    const result = compare(t, report(), candidate);
    assert.equal(result.status, 2); assert.equal(result.receipt.comparisons[0].status, 'regression');
  }
});
