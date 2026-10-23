#!/usr/bin/env node
/**
 * @module scripts/run-continuous-evals
 * @description Distingue piano, controlli eseguiti e qualità del prodotto non misurata.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

// #region 01 — Controlli delimitati, senza inferenza o training impliciti

const CHECKS = Object.freeze([
  { id: 'eval-schema', script: 'scripts/run-ai-eval-lab.js', args: ['--validate-only'] },
  { id: 'knowledge-quality', script: 'scripts/audit-knowledge-quality.js', args: [] },
  { id: 'voice-runtime', script: 'scripts/evaluate-local-voice.js', args: [] }
]);

function runContinuousEvaluations({ execute = false, projectRoot = root, runProcess = spawnSync, clock = Date.now } = {}) {
  JSON.parse(fs.readFileSync(path.join(projectRoot, 'config/evals/nexusnxs-core-v1.json'), 'utf8'));
  const results = CHECKS.map(({ id, script, args }) => {
    const command = [process.execPath, script, ...args];
    if (!execute) return { id, command: ['node', script, ...args].join(' '), status: 'planned', measured: false };
    const started = clock();
    let run;
    try {
      run = runProcess(command[0], command.slice(1), {
        cwd: projectRoot, encoding: 'utf8', windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024
      });
    } catch (error) { run = { error }; }
    const passed = !run?.error && run?.status === 0 && !run?.signal;
    return { id, command: ['node', script, ...args].join(' '), status: passed ? 'pass' : 'fail', measured: true,
      exitCode: Number.isInteger(run?.status) ? run.status : null,
      ...(run?.error ? { errorCode: /^[A-Z0-9_]{1,60}$/u.test(run.error.code || '') ? run.error.code : 'PROCESS_FAILED' } : {}),
      durationMs: Math.max(0, clock() - started) };
  });
  return {
    schema: 'nexusnxs.continuous-eval.v2', generatedAt: new Date(clock()).toISOString(),
    mode: execute ? 'executed' : 'planned',
    status: execute ? results.every(result => result.status === 'pass') ? 'checks-passed' : 'failed' : 'planned',
    // Validare lo schema della suite non esegue i casi del modello.
    gatePassed: false,
    notMeasured: ['model-quality', 'human-voice', 'public-readiness', 'physical-clients'], results
  };
}

// #endregion

// #region 02 — CLI e report senza output o contenuti dei processi figli

function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--execute' && !arg.startsWith('--output='))) throw new Error('Opzione di valutazione non valida.');
  const outputArg = args.find(arg => arg.startsWith('--output='));
  const output = path.resolve(root, outputArg?.slice('--output='.length) || 'qa-artifacts/continuous-eval-summary.json');
  const report = runContinuousEvaluations({ execute: args.includes('--execute') });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Continuous checks: ${report.status}; product gate not measured; ${path.relative(root, output)}`);
  if (report.status === 'failed') process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main, runContinuousEvaluations };

// #endregion
