const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TrainingStore } = require('../src/infrastructure/storage/training-store');

const root = path.resolve(__dirname, '..');

test('prepara dataset SFT e DPO con split per prompt e ricevuta di integrità', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-dataset-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'training.jsonl');
  const output = path.join(directory, 'dataset');
  const store = new TrainingStore({ filePath: input });
  for (let index = 0; index < 16; index += 1) {
    store.append({
      requestId: `request-${index}`,
      prompt: `Correggi il bug TypeScript numero ${index}`,
      response: `Soluzione verificata ${index}`,
      ...(index === 3 ? { originalResponse: 'Soluzione non corretta' } : {}),
      model: 'qwen3:8b',
      mode: 'deep'
    });
  }
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'config', 'evals', 'nexusnxs-core-v1.json'), 'utf8'));
  store.append({
    requestId: 'benchmark-contamination',
    prompt: suite.cases[0].prompt,
    response: 'Risposta deliberatamente esclusa dal dataset.',
    model: 'qwen3:8b',
    mode: 'deep'
  });
  const prepared = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-training-dataset.js'), `--input=${input}`, `--output=${output}`], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  const validated = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-training-dataset.js'), `--dataset=${output}`], { encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(output, 'validation-report.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.preferencePairs, 1);
  assert.equal(manifest.excludedBenchmarkOverlap, 1);
  assert.equal(manifest.total, 16);
  assert.match(manifest.transformations.join(','), /evaluation-holdout-filter/);
  assert.match(manifest.datasetId, /^[a-f0-9]{64}$/);
  assert.equal(report.datasetId, manifest.datasetId);
  assert.equal(report.preferencePairs, 1);
  assert.equal(fs.existsSync(path.join(output, 'integrity-receipt.json')), true);
});
