const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runContinuousEvaluations } = require('../scripts/run-continuous-evals');

test('piano non eseguito non diventa un gate passato e non avvia processi', () => {
  const report = runContinuousEvaluations({ runProcess() { assert.fail('No implicit execution'); } });
  assert.equal(report.status, 'planned'); assert.equal(report.gatePassed, false);
  assert.ok(report.results.every(result => result.status === 'planned' && !result.measured));
});

test('i controlli leggeri superati non certificano inferenza, voce umana o client fisici', () => {
  const commands = [];
  const report = runContinuousEvaluations({ execute: true, runProcess(command, args, options) {
    commands.push({ command, args }); assert.equal(options.windowsHide, true);
    return { status: 0, stdout: 'private conversation content', stderr: 'private path' };
  } });
  assert.equal(report.status, 'checks-passed'); assert.equal(report.gatePassed, false);
  assert.ok(report.notMeasured.includes('model-quality'));
  assert.ok(report.notMeasured.includes('human-voice'));
  assert.equal(commands.length, 3); assert.ok(commands.every(command => command.command === process.execPath));
  assert.ok(commands[0].args.includes('--validate-only'));
  assert.equal(JSON.stringify(report).includes('private'), false);
});

test('errori, segnali, timeout o esiti mancanti non diventano pass', () => {
  for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' },
    { status: 0, error: { code: 'ETIMEDOUT', message: 'sensitive detail' } }, undefined]) {
    const report = runContinuousEvaluations({ execute: true, runProcess: () => result });
    assert.equal(report.status, 'failed'); assert.ok(report.results.every(row => row.status === 'fail'));
    assert.equal(report.gatePassed, false); assert.equal(JSON.stringify(report).includes('sensitive'), false);
  }
  assert.equal(runContinuousEvaluations({ execute: true, runProcess() { throw Error('sensitive detail'); } }).status, 'failed');
});

test('importare la libreria non esegue il piano né crea file', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-continuous-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = require.resolve('../scripts/run-continuous-evals');
  const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', target], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.deepEqual(fs.readdirSync(root), []);
});
