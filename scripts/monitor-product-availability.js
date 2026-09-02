/**
 * @module scripts/monitor-product-availability
 * @description Produce uno storico SLO locale e privacy-safe dei soli endpoint pubblici.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  availabilitySummary,
  collectAvailabilitySample,
  persistAvailability
} = require('../src/infrastructure/storage/availability-monitor');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'product-slo.json'), 'utf8'));
const historyPath = path.join(root, 'qa-artifacts', 'availability-samples.ndjson');
const reportPath = path.join(root, 'qa-artifacts', 'availability-report.json');
const args = process.argv.slice(2);
const intervalMs = Math.max(30_000, Number(args.find((value) => value.startsWith('--interval='))?.split('=')[1]) || 60_000);
const once = args.includes('--once') || !args.includes('--watch');
const strictCurrent = args.includes('--strict-current');

async function sample() {
  const readiness = policy.objectives.readiness;
  const availability = policy.objectives.availability;
  const samples = await collectAvailabilitySample({ endpoints: readiness.endpoints, timeoutMs: readiness.maximumLatencyMs });
  const history = persistAvailability(historyPath, samples);
  const report = availabilitySummary(history, {
    targetPercent: policy.objectives.availabilityTargetPercent,
    windowDays: policy.windowDays,
    minimumSamples: availability.minimumSamplesPerEndpoint,
    minimumCoveragePercent: availability.minimumCoveragePercent
  });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`Disponibilita NexusNXS: ${report.status}; budget consumato ${report.errorBudget.consumedPercent}%; ${report.endpoints.map((entry) => `${entry.endpoint} ${entry.availabilityPercent}%`).join(', ')}`);
  if (strictCurrent && samples.some((entry) => !entry?.ok)) process.exitCode = 1;
  return report;
}

async function main() {
  await sample();
  if (once) return;
  const timer = setInterval(() => sample().catch((error) => console.error(error.message)), intervalMs);
  const stop = () => { clearInterval(timer); process.exitCode = 0; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { sample };
