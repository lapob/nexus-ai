const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { takeQuickPrompt, writeQuickPrompt } = require('../src/application/quick-prompt');

test('la domanda della barra rapida si legge una sola volta, pulita e limitata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-quick-'));
  try {
    assert.equal(writeQuickPrompt(root, '  Ciao\u0000 Jarvis  ', { now: 1_000 }), true);
    assert.equal(takeQuickPrompt(root, { now: 2_000 }), 'Ciao Jarvis');
    assert.equal(takeQuickPrompt(root, { now: 2_000 }), null);
    assert.equal(writeQuickPrompt(root, '   '), false);
    writeQuickPrompt(root, 'x'.repeat(9_000), { now: 1_000 });
    assert.equal(takeQuickPrompt(root, { now: 1_500 }).length, 4_000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('una domanda vecchia, dal futuro o malformata viene scartata e cancellata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-quick-'));
  try {
    writeQuickPrompt(root, 'vecchia', { now: 0 });
    assert.equal(takeQuickPrompt(root, { now: 120_000 }), null);
    writeQuickPrompt(root, 'futura', { now: 100_000 });
    assert.equal(takeQuickPrompt(root, { now: 0 }), null);
    fs.writeFileSync(path.join(root, 'quick-prompt.json'), '{rotto');
    assert.equal(takeQuickPrompt(root), null);
    assert.equal(fs.existsSync(path.join(root, 'quick-prompt.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
