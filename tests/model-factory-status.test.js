const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TrainingStore } = require('../src/infrastructure/storage/training-store');

const root = path.resolve(__dirname, '..');

test('la Model Factory resta bloccata finché il dataset approvato non raggiunge le soglie', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-model-factory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'training.jsonl');
  const dataset = path.join(directory, 'dataset');
  const output = path.join(directory, 'status.json');
  const store = new TrainingStore({ filePath: input });
  for (let index = 0; index < 12; index += 1) {
    store.append({ prompt: `Esempio approvato ${index} per matematica`, response: `Risposta verificata ${index}` });
  }
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'model-factory-status.js'),
    `--input=${input}`,
    `--dataset=${dataset}`,
    `--output=${output}`
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.status, 'collecting-approved-examples');
  assert.equal(report.dataset.sftReady, false);
  assert.equal(report.dataset.additionalSftExamplesRequired, 988);
  assert.equal(report.automaticProductionPromotion, false);
});
