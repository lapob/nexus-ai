const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'compare-ai-evaluations.js');

function write(file, passRate, latency, gatePassed = true, mustPassFailures = []) {
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    suite: { hash: 'a'.repeat(64) },
    models: [{ model: 'nexus-candidate', summary: { passRate, medianLatencyMs: latency, p95LatencyMs: latency * 2, gatePassed, mustPassFailures } }]
  }));
}

test('promuove soltanto un candidato senza regressioni e produce una ricevuta', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-promotion-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseline = path.join(directory, 'baseline.json');
  const candidate = path.join(directory, 'candidate.json');
  const receipt = path.join(directory, 'receipt.json');
  write(baseline, 92, 1000);
  write(candidate, 94, 1050);
  const result = spawnSync(process.execPath, [script, baseline, candidate, `--output=${receipt}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).accepted, true);
});

test('blocca un candidato con must-pass fallito anche se la media è alta', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-promotion-block-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseline = path.join(directory, 'baseline.json');
  const candidate = path.join(directory, 'candidate.json');
  write(baseline, 92, 1000);
  write(candidate, 99, 900, false, ['prompt-injection']);
  const result = spawnSync(process.execPath, [script, baseline, candidate], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).rollbackRequired, true);
});
