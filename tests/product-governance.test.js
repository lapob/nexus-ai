/**
 * @module tests/product-governance
 * @description Verifica i gate SLO, ASVS, Tailscale e i profili Android.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildReport, evaluateArtifacts, evaluateReadiness } = require('../scripts/check-product-slo');
const { inspectControls } = require('../scripts/check-asvs-controls');
const { inspectPolicy, parseHujson } = require('../scripts/check-tailscale-policy');

const root = path.resolve(__dirname, '..');

test('la policy SLO distingue prove conformi dalla disponibilita non misurata', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/product-slo.json'), 'utf8'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-slo-conformant-'));
  const artifacts = path.join(fixture, 'qa-artifacts');
  const writeJson = (name, value) => fs.writeFileSync(path.join(artifacts, name), `${JSON.stringify(value)}\n`, 'utf8');
  try {
    fs.mkdirSync(artifacts, { recursive: true });
    writeJson('local-model-evaluation.json', { report: [{ passRate: 94, p95LatencyMs: 1800 }] });
    writeJson('ai-eval-lab-gate.json', { gatePassed: true, models: [{ model: 'fixture', summary: { passRate: 91, p95LatencyMs: 4200, mustPassFailures: [] } }] });
    writeJson('local-voice-evaluation.json', { backend: 'fixture', coldStartMs: 1200, warmMedianMs: 420 });
    writeJson('gateway-load-test.json', { clients: 20, p95LatencyMs: 180, passed: true });
    writeJson('desktop-motion-qa.json', { cores: [{ view: 'fixture', p95Ms: 8.4, slowFrameRatio: 0, failures: [] }] });
    for (const file of [
      'android/NexusRemote/app/src/main/baseline-prof.txt',
      'android/NexusConsole/app/src/main/baseline-prof.txt'
    ]) {
      fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      fs.writeFileSync(path.join(fixture, file), 'fixture\n', 'utf8');
    }

    const checks = evaluateArtifacts({ policy, artifactsRoot: artifacts, projectRoot: fixture });
    assert.equal(checks.find((entry) => entry.id === 'availability-window').status, 'not-measured');
    assert.equal(checks.find((entry) => entry.id === 'android-baseline-profiles').status, 'pass');
    assert.equal(checks.filter((entry) => entry.releaseBlocking && entry.status !== 'pass').length, 0);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('lo SLO rapido sceglie il modello conforme piu veloce e non il cold-start del modello profondo', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/product-slo.json'), 'utf8'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-slo-routing-'));
  try {
    fs.writeFileSync(path.join(fixture, 'local-model-evaluation.json'), `${JSON.stringify({
      report: [
        { model: 'fast', passRate: 94, p95LatencyMs: 1900 },
        { model: 'deep', passRate: 100, p95LatencyMs: 52000 }
      ]
    })}\n`, 'utf8');
    const quick = evaluateArtifacts({ policy, artifactsRoot: fixture, projectRoot: fixture })
      .find((entry) => entry.id === 'ai-quick-quality');
    assert.equal(quick.status, 'pass');
    assert.equal(quick.observed.passRate, 94);
    assert.equal(quick.observed.p95LatencyMs, 1900);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('la mappa ASVS punta soltanto a prove presenti', () => {
  const map = JSON.parse(fs.readFileSync(path.join(root, 'config/asvs-5-controls.json'), 'utf8'));
  assert.deepEqual(inspectControls(map, root), { passed: true, controls: 14, excluded: 3, failures: [] });
});

test('la policy Tailscale vieta wildcard, SSH e gateway diretto', () => {
  const template = parseHujson(fs.readFileSync(path.join(root, 'config/tailscale-grants.example.hujson'), 'utf8'));
  assert.equal(inspectPolicy(template).passed, true);
  assert.equal(inspectPolicy(template, { strict: true }).passed, false);
  const unsafe = { grants: [{ src: ['*'], dst: ['*'], ip: ['*:*'] }], tests: [] };
  assert.equal(inspectPolicy(unsafe).passed, false);
});

test('il valutatore SLO non richiede dati utente e segnala artefatti assenti', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-slo-'));
  try {
    const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/product-slo.json'), 'utf8'));
    const checks = evaluateArtifacts({ policy, artifactsRoot: empty, projectRoot: empty });
    assert.equal(checks.find((entry) => entry.id === 'ai-quick-quality').status, 'not-measured');
    assert.equal(checks.find((entry) => entry.id === 'android-baseline-profiles').status, 'fail');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('readiness pubblica assente blocca il rilascio anche con prove locali conformi', async () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/product-slo.json'), 'utf8'));
  const readiness = await evaluateReadiness(policy, async () => ({ ok: false, status: 503 }));
  assert.equal(readiness.status, 'fail');
  assert.equal(readiness.releaseBlocking, true);

  const report = await buildReport({
    policyPath: path.join(root, 'config/product-slo.json'),
    artifactsRoot: path.join(root, 'qa-artifacts'),
    projectRoot: root,
    fetchImpl: async () => ({ ok: false, status: 503 })
  });
  assert.equal(report.onlineReadinessVerified, false);
  assert.equal(report.releaseReady, false);
});

test('la supply chain revisiona le dipendenze e attesta la SBOM senza tag mobili', () => {
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const security = fs.readFileSync(path.join(root, '.github/workflows/security.yml'), 'utf8');
  assert.match(ci, /actions\/dependency-review-action@[0-9a-f]{40}/);
  assert.match(ci, /fail-on-severity:\s*high/);
  assert.match(security, /attestations:\s*write/);
  assert.match(security, /id-token:\s*write/);
  assert.match(security, /actions\/attest-build-provenance@[0-9a-f]{40}/);
  assert.match(security, /subject-path:\s*qa-artifacts\/nexus-sbom\.cdx\.json/);
  assert.doesNotMatch(`${ci}\n${security}`, /uses:\s*actions\/(?:dependency-review-action|attest-build-provenance)@v\d/);
});
