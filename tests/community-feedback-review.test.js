const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TrainingStore } = require('../src/infrastructure/storage/training-store');

const script = path.resolve(__dirname, '..', 'scripts', 'review-community-feedback.js');

test('i contributi pubblici restano in quarantena finché un revisore non li promuove', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-community-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const quarantinePath = path.join(directory, 'quarantine.jsonl');
  const approvedPath = path.join(directory, 'approved.jsonl');
  const quarantine = new TrainingStore({ filePath: quarantinePath, createId: () => 'candidate-1' });
  quarantine.append({
    requestId: 'request-1', prompt: 'Spiega un backup', response: 'Un backup conserva una copia recuperabile.',
    model: 'automatic', mode: 'fast', provenance: 'community-opt-in-quarantine', reviewStatus: 'quarantine', license: 'pending-review', consent: true
  });
  const listed = spawnSync(process.execPath, [script, `--quarantine=${quarantinePath}`, `--approved=${approvedPath}`], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).pending, 1);
  assert.equal(fs.existsSync(approvedPath), false);

  const promoted = spawnSync(process.execPath, [script, `--quarantine=${quarantinePath}`, `--approved=${approvedPath}`, '--approve=candidate-1', '--reviewer=test'], { encoding: 'utf8' });
  assert.equal(promoted.status, 0, promoted.stderr);
  const records = new TrainingStore({ filePath: approvedPath }).records();
  assert.equal(records.length, 1);
  assert.equal(records[0].provenance, 'reviewer-approved-community');
  assert.equal(records[0].reviewedBy, 'test');
  assert.equal(new TrainingStore({ filePath: quarantinePath }).records().length, 0);
});
