/**
 * @module scripts/check-product-slo
 * @description Aggrega prove di qualita, latenza e disponibilita senza conservare prompt o dati personali.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// #region 01 — Lettura e valutazione delle prove locali

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function result(id, status, observed, target, releaseBlocking = true) {
  return { id, status, observed, target, releaseBlocking };
}

function evaluateArtifacts({ policy, artifactsRoot = path.join(root, 'qa-artifacts'), projectRoot = root }) {
  const objectives = policy.objectives;
  const checks = [];
  const localModels = readJson(path.join(artifactsRoot, 'local-model-evaluation.json'));
  const models = Array.isArray(localModels?.report) ? localModels.report : [];
  // Il profilo rapido deve rispettare insieme qualita e latenza. Ordinare solo
  // per pass rate sceglieva il modello profondo quando guadagnava pochi punti,
  // attribuendo poi al percorso quick il suo cold-start. Tra i candidati che
  // superano la soglia qualitativa scegliamo quindi quello col p95 piu basso.
  const quickCandidates = models
    .map((entry) => ({
      ...entry,
      passRate: Number(entry.passRate),
      p95FirstTokenLatencyMs: Number(entry.p95FirstTokenLatencyMs),
      p95LatencyMs: Number(entry.p95LatencyMs)
    }))
    .filter((entry) => entry.passRate >= objectives.aiQuick.minimumBestPassRate && Number.isFinite(entry.p95FirstTokenLatencyMs) && Number.isFinite(entry.p95LatencyMs))
    .sort((left, right) => left.p95FirstTokenLatencyMs - right.p95FirstTokenLatencyMs || left.p95LatencyMs - right.p95LatencyMs || right.passRate - left.passRate);
  const bestModel = quickCandidates[0];
  checks.push(bestModel
    ? result('ai-quick-quality', Number(bestModel.passRate) >= objectives.aiQuick.minimumBestPassRate
      && Number(bestModel.p95FirstTokenLatencyMs) <= objectives.aiQuick.maximumBestP95FirstTokenLatencyMs
      && Number(bestModel.p95LatencyMs) <= objectives.aiQuick.maximumBestP95CompletionLatencyMs ? 'pass' : 'fail', {
        model: bestModel.model,
        passRate: Number(bestModel.passRate),
        p95FirstTokenLatencyMs: Number(bestModel.p95FirstTokenLatencyMs),
        p95CompletionLatencyMs: Number(bestModel.p95LatencyMs)
      }, objectives.aiQuick)
    : result('ai-quick-quality', 'not-measured', null, objectives.aiQuick));

  const lab = readJson(path.join(artifactsRoot, 'ai-eval-lab-gate.json'));
  const labModels = Array.isArray(lab?.models) ? lab.models : [];
  const labOk = lab?.gatePassed === true && labModels.every((entry) => Number(entry.summary?.passRate) >= objectives.aiLab.minimumPassRate
    && (entry.summary?.mustPassFailures || []).length <= objectives.aiLab.maximumMustPassFailures);
  checks.push(lab
    ? result('ai-evaluation-gate', labOk ? 'pass' : 'fail', { gatePassed: lab.gatePassed, models: labModels.map((entry) => ({ passRate: entry.summary?.passRate, mustPassFailures: (entry.summary?.mustPassFailures || []).length })) }, objectives.aiLab)
    : result('ai-evaluation-gate', 'not-measured', null, objectives.aiLab));

  const deepCandidates = labModels
    .map((entry) => ({ model: entry.model, passRate: Number(entry.summary?.passRate), p95LatencyMs: Number(entry.summary?.p95LatencyMs), mustPassFailures: (entry.summary?.mustPassFailures || []).length }))
    .filter((entry) => entry.passRate >= objectives.aiDeep.minimumBestPassRate && entry.mustPassFailures === 0)
    .sort((left, right) => left.p95LatencyMs - right.p95LatencyMs);
  const bestDeep = deepCandidates[0];
  checks.push(bestDeep
    ? result('ai-deep-quality', bestDeep.p95LatencyMs <= objectives.aiDeep.maximumBestP95LatencyMs ? 'pass' : 'fail', bestDeep, objectives.aiDeep)
    : result('ai-deep-quality', lab ? 'fail' : 'not-measured', null, objectives.aiDeep));

  const voice = readJson(path.join(artifactsRoot, 'local-voice-evaluation.json'));
  const voiceOk = voice && Number(voice.coldStartMs) <= objectives.voice.maximumColdStartMs && Number(voice.warmMedianMs) <= objectives.voice.maximumWarmMedianMs;
  checks.push(voice
    ? result('voice-latency', voiceOk ? 'pass' : 'fail', { backend: voice.backend, coldStartMs: voice.coldStartMs, warmMedianMs: voice.warmMedianMs }, objectives.voice)
    : result('voice-latency', 'not-measured', null, objectives.voice));

  const gateway = readJson(path.join(artifactsRoot, 'gateway-load-test.json'));
  checks.push(gateway
    ? result('gateway-load', gateway.passed === true && Number(gateway.p95LatencyMs) <= objectives.gateway.maximumP95LatencyMs ? 'pass' : 'fail', { clients: gateway.clients, p95LatencyMs: gateway.p95LatencyMs, passed: gateway.passed }, objectives.gateway)
    : result('gateway-load', 'not-measured', null, objectives.gateway));

  const motion = readJson(path.join(artifactsRoot, 'desktop-motion-qa.json'));
  const cores = Array.isArray(motion?.cores) ? motion.cores : [];
  const motionOk = cores.length > 0 && cores.every((entry) => Number(entry.p95Ms) <= objectives.desktopMotion.maximumFrameP95Ms
    && Number(entry.slowFrameRatio) <= objectives.desktopMotion.maximumSlowFrameRatio
    && (entry.failures || []).length === 0);
  checks.push(motion
    ? result('desktop-motion', motionOk ? 'pass' : 'fail', { cores: cores.map((entry) => ({ view: entry.view, p95Ms: entry.p95Ms, slowFrameRatio: entry.slowFrameRatio, failures: (entry.failures || []).length })) }, objectives.desktopMotion)
    : result('desktop-motion', 'not-measured', null, objectives.desktopMotion));

  const baselineFiles = [
    'android/NexusRemote/app/src/main/baseline-prof.txt',
    'android/NexusConsole/app/src/main/baseline-prof.txt'
  ];
  const baselineObserved = baselineFiles.map((file) => ({ file, present: fs.existsSync(path.join(projectRoot, file)) && fs.statSync(path.join(projectRoot, file)).size > 0 }));
  checks.push(result('android-baseline-profiles', baselineObserved.every((entry) => entry.present) ? 'pass' : 'fail', baselineObserved, { requiredForBothClients: true }));

  const availability = readJson(path.join(artifactsRoot, 'availability-report.json'))
    || readJson(path.join(path.dirname(projectRoot), '.nexus-data', 'metrics', 'availability-report.json'));
  checks.push(availability?.measured === true
    ? result('availability-window', availability.availabilityPercent >= objectives.availabilityTargetPercent ? 'pass' : 'fail', {
        availabilityPercent: availability.availabilityPercent,
        endpoints: availability.endpoints
      }, { percent: objectives.availabilityTargetPercent, windowDays: policy.windowDays }, false)
    : result('availability-window', 'not-measured', {
        reason: 'La disponibilita richiede uno storico continuo; health check isolati non dimostrano il target.',
        samples: availability?.endpoints?.map((entry) => ({ endpoint: entry.endpoint, samples: entry.samples, coverageMs: entry.coverageMs })) || []
      }, { percent: objectives.availabilityTargetPercent, windowDays: policy.windowDays }, false));
  return checks;
}

// #endregion
// #region 02 — Readiness pubblica e report aggregato

async function evaluateReadiness(policy, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return result('public-readiness', 'not-measured', null, policy.objectives.readiness);
  const observed = [];
  for (const endpoint of policy.objectives.readiness.endpoints) {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(endpoint, { redirect: 'follow', signal: AbortSignal.timeout(policy.objectives.readiness.maximumLatencyMs) });
      observed.push({ endpoint, status: response.status, latencyMs: Date.now() - startedAt, ok: response.ok });
    } catch (error) {
      observed.push({ endpoint, status: 0, latencyMs: Date.now() - startedAt, ok: false, error: error.name || 'RequestError' });
    }
  }
  return result('public-readiness', observed.every((entry) => entry.ok && entry.latencyMs <= policy.objectives.readiness.maximumLatencyMs) ? 'pass' : 'fail', observed, policy.objectives.readiness);
}

async function buildReport({ policyPath = path.join(root, 'config', 'product-slo.json'), artifactsRoot, projectRoot, offline = false, fetchImpl = globalThis.fetch } = {}) {
  const policy = readJson(policyPath);
  if (!policy?.objectives) throw new Error('Policy SLO non valida.');
  const checks = evaluateArtifacts({ policy, artifactsRoot, projectRoot });
  if (!offline) checks.push(await evaluateReadiness(policy, fetchImpl));
  const blocking = checks.filter((entry) => entry.releaseBlocking);
  const publicReadiness = checks.find((entry) => entry.id === 'public-readiness');
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    service: policy.service,
    windowDays: policy.windowDays,
    onlineReadinessVerified: publicReadiness?.status === 'pass',
    releaseReady: blocking.every((entry) => entry.status === 'pass'),
    summary: {
      pass: checks.filter((entry) => entry.status === 'pass').length,
      fail: checks.filter((entry) => entry.status === 'fail').length,
      notMeasured: checks.filter((entry) => entry.status === 'not-measured').length
    },
    checks
  };
}

// #endregion
// #region 03 — CLI

async function main() {
  const strict = process.argv.includes('--strict');
  const offline = process.argv.includes('--offline');
  const report = await buildReport({ offline });
  const outputPath = path.join(root, 'qa-artifacts', 'product-slo-report.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`SLO NexusNXS: ${report.summary.pass} conformi, ${report.summary.fail} fuori soglia, ${report.summary.notMeasured} non misurati.`);
  for (const check of report.checks) console.log(`- ${check.id}: ${check.status}`);
  console.log(`Report: ${outputPath}`);
  if (strict && !report.releaseReady) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { buildReport, evaluateArtifacts, evaluateReadiness, readJson };

// #endregion
