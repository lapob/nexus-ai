const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CrashReportStore } = require('../src/infrastructure/storage/crash-report-store');

test('registra soltanto diagnostica anonima e limita la cronologia crash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-crash-'));
  const filePath = path.join(root, 'crashes.json');
  try {
    const store = new CrashReportStore({ filePath, limit: 2 });
    store.append('renderer', { reason: 'crashed', exitCode: 9, secret: 'non deve apparire' });
    store.append('child', { reason: 'abnormal-exit', exitCode: 3 });
    store.append('renderer', { reason: 'oom', exitCode: 5 });
    const raw = fs.readFileSync(filePath, 'utf8');
    const records = JSON.parse(raw);
    assert.equal(records.length, 2);
    assert.doesNotMatch(raw, /non deve apparire/);
    assert.match(records[1].code, /^[A-F0-9]{12}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
