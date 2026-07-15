const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { assertLocalUrl, resolveVaultNotePath } = require('../src/security');

test('accetta soltanto endpoint HTTP locali', () => {
  assert.equal(assertLocalUrl('http://127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(assertLocalUrl('http://localhost:1234/v1'), 'http://localhost:1234/v1');
  assert.throws(() => assertLocalUrl('https://example.com/v1'), /soltanto endpoint locali/);
  assert.throws(() => assertLocalUrl('http://localhost.evil.test/v1'), /soltanto endpoint locali/);
  assert.throws(() => assertLocalUrl('http://localhost@evil.test/v1'), /soltanto endpoint locali/);
  assert.throws(() => assertLocalUrl('file:///C:/segreto'), /soltanto endpoint locali/);
  assert.throws(() => assertLocalUrl('not-a-url'), /non valido/);
});

test('impedisce path traversal fuori dalla vault', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-'));
  fs.mkdirSync(path.join(vault, '01_Tech'));
  fs.mkdirSync(path.join(vault, 'NexusAI'));
  fs.writeFileSync(path.join(vault, '01_Tech', 'Nota.md'), '# Nota');
  fs.writeFileSync(path.join(vault, 'NexusAI', 'README.md'), '# Codice');
  try {
    assert.equal(resolveVaultNotePath(vault, '01_Tech/Nota.md'), fs.realpathSync(path.join(vault, '01_Tech', 'Nota.md')));
    assert.throws(() => resolveVaultNotePath(vault, '../segreto.md'), /non valido/);
    assert.throws(() => resolveVaultNotePath(vault, 'NexusAI/README.md'), /non valido/);
  } finally { fs.rmSync(vault, { recursive: true, force: true }); }
});
