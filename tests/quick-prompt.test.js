const test = require('node:test');
const { takeQuickPayload } = require('../src/application/quick-prompt');

test('barra rapida: la cattura dello schermo viaggia una volta sola e solo se valida', () => {
  const fsx = require('node:fs'); const osx = require('node:os'); const pathx = require('node:path'); const assertx = require('node:assert/strict');
  const { writeQuickPrompt: write } = require('../src/application/quick-prompt');
  const root = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'nxs-quick-image-'));
  try {
    const image = Buffer.from('jpeg bytes').toString('base64');
    assertx.equal(write(root, 'Cosa vedi?', { image }), true);
    assertx.deepEqual(takeQuickPayload(root), { text: 'Cosa vedi?', image });
    assertx.equal(takeQuickPayload(root), null, 'monouso');
    write(root, 'Solo testo', { image: 'non-base64 <script>' });
    assertx.deepEqual(takeQuickPayload(root), { text: 'Solo testo' });
    write(root, 'Troppo grande', { image: 'A'.repeat(2_100_000) });
    assertx.deepEqual(takeQuickPayload(root), { text: 'Troppo grande' });
  } finally { fsx.rmSync(root, { recursive: true, force: true }); }
});

test('barra rapida: lo schermo è un gesto esplicito, azzerato a ogni apertura e dopo ogni invio', () => {
  const assertx = require('node:assert/strict');
  const source = require('node:fs').readFileSync(require.resolve('../src/infrastructure/electron/quick-bar.js'), 'utf8');
  assertx.match(source, /aria-pressed="false"/);
  assertx.match(source, /onShow\(\(\)=>\{const bar=form;setScreen\(false\)/);
  assertx.match(source, /sync\(\);setScreen\(false\);\}\);/);
  assertx.match(source, /desktopCapturer\.getSources\(\{ types: \['screen'\]/);
  assertx.doesNotMatch(source, /writeFile|appendFile/, 'la cattura resta in memoria');
});
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
