#!/usr/bin/env node
/**
 * @module scripts/run-continuous-evals
 * @description Compone i gate continui AI, knowledge e voce in un report privo di contenuti.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const execute = process.argv.includes('--execute');
const outputArg = process.argv.find((value) => value.startsWith('--output='));
const output = path.resolve(root, outputArg?.slice('--output='.length) || 'qa-artifacts/continuous-eval-summary.json');
const suite = path.join(root, 'config', 'evals', 'nexusnxs-core-v1.json');
if (!fs.existsSync(suite)) throw new Error('Suite di valutazione NexusNXS non trovata.');
JSON.parse(fs.readFileSync(suite, 'utf8'));

const commands = [
  ['node', ['scripts/run-ai-eval-lab.js', '--validate-only']],
  ['node', ['scripts/audit-knowledge-quality.js']],
  ['node', ['scripts/evaluate-local-voice.js']]
];
const results = commands.map(([command, args]) => {
  if (!execute) return { command: [command, ...args].join(' '), status: 'planned' };
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15 * 60 * 1000 });
  return {
    command: [command, ...args].join(' '),
    status: run.status === 0 ? 'pass' : 'fail',
    exitCode: run.status,
    summary: String(run.stdout || run.stderr || '').trim().split(/\r?\n/).slice(-4)
  };
});
const report = {
  schema: 'nexusnxs.continuous-eval.v1',
  generatedAt: new Date().toISOString(),
  mode: execute ? 'executed' : 'planned',
  status: results.every(({ status }) => ['pass', 'planned'].includes(status)) ? 'pass' : 'fail',
  results
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`Continuous eval: ${report.status} · ${results.length} gate · ${path.relative(root, output)}\n`);
if (report.status !== 'pass') process.exitCode = 1;
