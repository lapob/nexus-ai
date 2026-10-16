/**
 * @module scripts/monitor-product-availability
 * @description Produce uno storico SLO locale e privacy-safe dei soli endpoint pubblici.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  availabilitySummary,
  collectAvailabilitySample,
  formatAvailabilityReport,
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

async function sample({ fetchImpl = globalThis.fetch, historyFile = historyPath, reportFile = reportPath,
  summaryFile = process.env.GITHUB_STEP_SUMMARY, enforceCurrent = strictCurrent } = {}) {
  const readiness = policy.objectives.readiness;
  const availability = policy.objectives.availability;
  const samples = await collectAvailabilitySample({ endpoints: readiness.endpoints, timeoutMs: readiness.maximumLatencyMs, fetchImpl });
  if (!samples.length || samples.some(entry => !entry)) throw new Error('Nessun campione valido raccolto.');
  const history = persistAvailability(historyFile, samples);
  const historical = availabilitySummary(history, {
    targetPercent: policy.objectives.availabilityTargetPercent,
    windowDays: policy.windowDays,
    minimumSamples: availability.minimumSamplesPerEndpoint,
    minimumCoveragePercent: availability.minimumCoveragePercent,
    sampleIntervalMs: intervalMs,
    expectedEndpoints: readiness.endpoints
  });
  const failedEndpoints = samples.filter(entry => !entry.ok).length;
  const report = { ...historical, current: { state: failedEndpoints ? 'degraded' : 'online', failedEndpoints, endpoints: samples.length } };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(formatAvailabilityReport(report, samples));
  if (summaryFile) fs.appendFileSync(summaryFile, [
    '## Public availability observations',
    `Current observation: **${report.current.state}** (${failedEndpoints}/${samples.length} endpoints unavailable).`,
    `Historical SLO: **${report.status}**. A single run does not certify the availability window.`,
    'HTTP failures and timeouts remain in the attached raw samples and report. Scheduled success means the observations were saved, not that the AI was available. Manual checks still require every endpoint to be ready.',
    '', '```text', formatAvailabilityReport(report, samples), '```', ''
  ].join('\n'), 'utf8');
  if (enforceCurrent && failedEndpoints) process.exitCode = 1;
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
