/**
 * @module scripts/compare-ai-evaluations
 * @description Produce una ricevuta di promozione e blocca regressioni di qualità, sicurezza e latenza.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const factoryPolicy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'model-factory.json'), 'utf8'));
const [baselineArg, candidateArg] = args.filter((value) => !value.startsWith('--'));
const numericOption = (name, fallback) => Number(args.find((value) => value.startsWith(`--${name}=`))?.split('=')[1] || fallback);
const textOption = (name, fallback = '') => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
if (!baselineArg || !candidateArg) throw new Error('Uso: node scripts/compare-ai-evaluations.js baseline.json candidate.json [--output=receipt.json]');

const read = (value) => JSON.parse(fs.readFileSync(path.resolve(value), 'utf8'));
const hashFile = (value) => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(value))).digest('hex');
const baseline = read(baselineArg);
const candidate = read(candidateArg);
const maxPassDrop = numericOption('max-pass-drop', factoryPolicy.promotion.maximumPassRateDrop);
const maxLatencyIncrease = numericOption('max-latency-increase', factoryPolicy.promotion.maximumMedianLatencyIncreasePercent);
const maxP95LatencyIncrease = numericOption('max-p95-latency-increase', factoryPolicy.promotion.maximumP95LatencyIncreasePercent);

// #region Normalizzazione dei report

function rows(payload) {
  if (Array.isArray(payload?.report)) return payload.report.map((row) => ({
    model: row.model,
    passRate: Number(row.passRate) || 0,
    medianLatencyMs: Number(row.medianLatencyMs) || 0,
    p95LatencyMs: Number(row.p95LatencyMs) || 0,
    gatePassed: Number(row.passRate) >= Number(payload.minimumPassRate || 0),
    mustPassFailures: []
  }));
  if (Array.isArray(payload?.models)) return payload.models.map((row) => ({
    model: row.model,
    passRate: Number(row.summary?.passRate) || 0,
    medianLatencyMs: Number(row.summary?.medianLatencyMs) || 0,
    p95LatencyMs: Number(row.summary?.p95LatencyMs) || 0,
    gatePassed: row.summary?.gatePassed === true,
    mustPassFailures: Array.isArray(row.summary?.mustPassFailures) ? row.summary.mustPassFailures : []
  }));
  throw new Error('Formato report AI non riconosciuto.');
}

// #endregion
// #region Confronto, ricevuta e gate

if (baseline.suite?.hash && candidate.suite?.hash && baseline.suite.hash !== candidate.suite.hash) {
  throw new Error('Baseline e candidato usano suite eval diverse: il confronto non è valido.');
}

const baselineRows = new Map(rows(baseline).map((row) => [row.model, row]));
const comparisons = rows(candidate).map((row) => {
  const before = baselineRows.get(row.model);
  if (!before) return { model: row.model, status: row.gatePassed ? 'new-candidate' : 'rejected', gatePassed: row.gatePassed, mustPassFailures: row.mustPassFailures };
  const passDelta = Number((row.passRate - before.passRate).toFixed(2));
  const latencyDeltaPercent = before.medianLatencyMs > 0
    ? Math.round((row.medianLatencyMs - before.medianLatencyMs) / before.medianLatencyMs * 1000) / 10
    : 0;
  const p95DeltaPercent = before.p95LatencyMs > 0
    ? Math.round((row.p95LatencyMs - before.p95LatencyMs) / before.p95LatencyMs * 1000) / 10
    : 0;
  const regressed = row.gatePassed !== true
    || row.mustPassFailures.length > 0
    || passDelta < -maxPassDrop
    || latencyDeltaPercent > maxLatencyIncrease
    || p95DeltaPercent > maxP95LatencyIncrease;
  return {
    model: row.model,
    status: regressed ? 'regression' : 'accepted',
    gatePassed: row.gatePassed,
    mustPassFailures: row.mustPassFailures,
    passDelta,
    latencyDeltaPercent,
    p95DeltaPercent
  };
});

const accepted = comparisons.length > 0 && comparisons.every((row) => ['accepted', 'new-candidate'].includes(row.status) && row.gatePassed !== false);
const receipt = {
  schemaVersion: 2,
  comparedAt: new Date().toISOString(),
  baseline: { path: path.basename(baselineArg), sha256: hashFile(baselineArg) },
  candidate: { path: path.basename(candidateArg), sha256: hashFile(candidateArg) },
  suiteHash: candidate.suite?.hash || null,
  thresholds: { maxPassDrop, maxLatencyIncrease, maxP95LatencyIncrease },
  accepted,
  rollbackRequired: !accepted,
  comparisons
};
const output = textOption('output');
if (output) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (!accepted) process.exitCode = 2;

// #endregion

module.exports = { rows };
