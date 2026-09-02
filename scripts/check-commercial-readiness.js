/**
 * @module scripts/check-commercial-readiness
 * @description Impedisce di confondere una proposta commerciale con un servizio pronto a incassare.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// #region 01 — Input e stime economiche

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function confirmed(value) {
  return /^(?:1|true|yes|confirmed)$/i.test(String(value || '').trim());
}

function estimatePlan(plan, economics) {
  const gross = Number(plan.monthlyPrice) || 0;
  const paymentFee = gross === 0 ? 0 : (gross * Number(economics.stripeEuropeanCardPercent || 0) / 100) + Number(economics.stripeFixedFee || 0);
  const afterPayment = Math.max(0, gross - paymentFee);
  const maximumServiceCostAtTargetMargin = Math.max(0, gross * (1 - Number(economics.targetGrossMarginPercent || 0) / 100) - paymentFee);
  return {
    id: plan.id,
    gross: Number(gross.toFixed(2)),
    estimatedPaymentFee: Number(paymentFee.toFixed(2)),
    afterPayment: Number(afterPayment.toFixed(2)),
    maximumServiceCostAtTargetMargin: Number(maximumServiceCostAtTargetMargin.toFixed(2))
  };
}

// #endregion

// #region 02 — Valutazione e comando

function evaluateCommercialReadiness({ policy, environment = process.env, sloReport = null } = {}) {
  if (!policy || policy.schemaVersion !== 1) throw new Error('Policy commerciale non valida.');
  const failures = [];
  if (!['interest-list', 'closed-beta', 'paid-beta', 'public'].includes(policy.launch?.mode)) failures.push('launch-mode-invalid');
  if (!Array.isArray(policy.plans) || policy.plans.length < 2) failures.push('plans-missing');
  for (const plan of policy.plans || []) {
    if (!plan.id || Number(plan.monthlyPrice) < 0) failures.push(`plan-invalid:${plan.id || 'unknown'}`);
    if (plan.unlimited !== false) failures.push(`unlimited-plan-forbidden:${plan.id || 'unknown'}`);
    if (plan.quotaStatus !== 'capacity-test-required' && !Number.isFinite(Number(plan.monthlyRequestBudget))) failures.push(`quota-unmeasured:${plan.id || 'unknown'}`);
  }

  const controls = (policy.paidLaunchControls || []).map((control) => ({
    id: control.id,
    confirmed: confirmed(environment[control.environment]),
    description: control.description
  }));
  const availability = sloReport?.checks?.find((entry) => entry.id === 'availability-window');
  const sloReady = sloReport?.releaseReady === true && sloReport?.onlineReadinessVerified === true && availability?.status === 'pass';
  const collectPayments = policy.launch?.collectPayments === true;
  const paidLaunchReady = failures.length === 0 && collectPayments && sloReady && controls.every((control) => control.confirmed);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    launchMode: policy.launch?.mode,
    collectPayments,
    paidLaunchReady,
    safeState: collectPayments ? (paidLaunchReady ? 'paid-launch-ready' : 'payments-must-remain-disabled') : 'interest-list-only',
    configurationFailures: failures,
    sloReady,
    controls,
    estimates: (policy.plans || []).map((plan) => estimatePlan(plan, policy.unitEconomics || {})),
    note: 'Le stime escludono IVA, imposte, rimborsi, energia, banda, supporto e costi di inferenza.'
  };
}

function main() {
  const strict = process.argv.includes('--strict');
  const policy = readJson(path.join(root, 'config', 'commercial-readiness.json'));
  const sloReport = readJson(path.join(root, 'qa-artifacts', 'product-slo-report.json'));
  const report = evaluateCommercialReadiness({ policy, sloReport });
  const outputPath = path.join(root, 'qa-artifacts', 'commercial-readiness-report.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Commerciale NexusNXS: ${report.safeState}.`);
  console.log(`- configurazione: ${report.configurationFailures.length === 0 ? 'valida' : report.configurationFailures.join(', ')}`);
  console.log(`- SLO per utenti paganti: ${report.sloReady ? 'conforme' : 'non dimostrato'}`);
  console.log(`- controlli esterni: ${report.controls.filter((control) => control.confirmed).length}/${report.controls.length}`);
  console.log(`Report: ${outputPath}`);
  if (strict && !report.paidLaunchReady) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { confirmed, estimatePlan, evaluateCommercialReadiness, readJson };

// #endregion
