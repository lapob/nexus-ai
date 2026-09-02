/**
 * @module tests/commercial-readiness
 * @description Verifica che marketing, quote e incassi restino subordinati a prove reali.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { estimatePlan, evaluateCommercialReadiness } = require('../scripts/check-commercial-readiness');

const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/commercial-readiness.json'), 'utf8'));

test('la Founder Beta resta una lista di interesse senza checkout implicito', () => {
  const report = evaluateCommercialReadiness({ policy, environment: {}, sloReport: null });
  assert.equal(report.collectPayments, false);
  assert.equal(report.paidLaunchReady, false);
  assert.equal(report.safeState, 'interest-list-only');
  assert.deepEqual(report.configurationFailures, []);
  assert.ok(policy.plans.every((plan) => plan.unlimited === false));
});

test('un piano illimitato viene rifiutato anche con tutti i controlli esterni confermati', () => {
  const unsafe = structuredClone(policy);
  unsafe.launch.collectPayments = true;
  unsafe.plans[1].unlimited = true;
  const environment = Object.fromEntries(unsafe.paidLaunchControls.map((control) => [control.environment, 'confirmed']));
  const sloReport = { releaseReady: true, onlineReadinessVerified: true, checks: [{ id: 'availability-window', status: 'pass' }] };
  const report = evaluateCommercialReadiness({ policy: unsafe, environment, sloReport });
  assert.equal(report.paidLaunchReady, false);
  assert.match(report.configurationFailures.join(','), /unlimited-plan-forbidden:pro/);
});

test('le stime espongono il budget massimo di servizio senza fingere di includere imposte', () => {
  const estimate = estimatePlan(policy.plans.find((plan) => plan.id === 'pro'), policy.unitEconomics);
  assert.equal(estimate.gross, 12.99);
  assert.equal(estimate.estimatedPaymentFee, 0.44);
  assert.equal(estimate.afterPayment, 12.55);
  assert.ok(estimate.maximumServiceCostAtTargetMargin > 3 && estimate.maximumServiceCostAtTargetMargin < 4);
});

test('l incasso richiede SLO, disponibilita e tutti i controlli esterni', () => {
  const ready = structuredClone(policy);
  ready.launch.mode = 'paid-beta';
  ready.launch.collectPayments = true;
  const environment = Object.fromEntries(ready.paidLaunchControls.map((control) => [control.environment, 'true']));
  const sloReport = { releaseReady: true, onlineReadinessVerified: true, checks: [{ id: 'availability-window', status: 'pass' }] };
  assert.equal(evaluateCommercialReadiness({ policy: ready, environment, sloReport }).paidLaunchReady, true);
  sloReport.checks[0].status = 'not-measured';
  assert.equal(evaluateCommercialReadiness({ policy: ready, environment, sloReport }).paidLaunchReady, false);
});
