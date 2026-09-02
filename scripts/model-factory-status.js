#!/usr/bin/env node
/**
 * @module scripts/model-factory-status
 * @description Esegue i gate non distruttivi della Model Factory e produce uno stato privo di conversazioni.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = option('input');
const dataset = path.resolve(option('dataset') || path.join(root, 'developer-artifacts', 'training-dataset'));
const output = path.resolve(option('output') || path.join(root, 'qa-artifacts', 'model-factory-status.json'));
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'model-factory.json'), 'utf8'));

function run(script, args = [], acceptedStatuses = [0]) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(`${script} non ha superato il gate: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

const prepareArgs = [`--output=${dataset}`];
if (input) prepareArgs.push(`--input=${path.resolve(input)}`);
run('prepare-training-dataset.js', prepareArgs);
run('validate-training-dataset.js', [`--dataset=${dataset}`]);
const planResult = run('plan-model-training.js', [`--dataset=${dataset}`], [0, 2]);
const validation = JSON.parse(fs.readFileSync(path.join(dataset, 'validation-report.json'), 'utf8'));
const plan = JSON.parse(planResult.stdout);
const evalSuite = JSON.parse(fs.readFileSync(path.join(root, 'config', 'evals', 'nexusnxs-core-v1.json'), 'utf8'));
const cases = Array.isArray(evalSuite.cases) ? evalSuite.cases : [];
const categories = [...new Set(cases.map((entry) => entry.category).filter(Boolean))].sort();
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  status: plan.ready ? 'candidate-ready' : 'collecting-approved-examples',
  dataset: {
    id: validation.datasetId,
    examples: validation.total,
    preferencePairs: validation.preferencePairs,
    sftReady: validation.ready,
    dpoReady: validation.preferenceReady,
    additionalSftExamplesRequired: Math.max(0, policy.dataset.minimumSftExamples - validation.total),
    additionalDpoPreferencesRequired: Math.max(0, policy.dataset.minimumDpoPreferences - validation.preferencePairs)
  },
  evaluation: {
    cases: cases.length,
    categories: categories.length,
    mustPassCases: cases.filter((entry) => entry.mustPass === true).length
  },
  methods: policy.methods,
  automaticProductionPromotion: policy.policy.automaticProductionPromotion,
  next: plan.next
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
