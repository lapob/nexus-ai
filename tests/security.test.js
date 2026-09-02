const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { assertLocalUrl, assertOllamaUrl, resolveVaultNotePath } = require('../src/core/security');

test('accetta soltanto endpoint HTTP locali', () => {
  assert.equal(assertLocalUrl('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434');
  assert.equal(assertLocalUrl('http://localhost:1234'), 'http://localhost:1234');
  assert.equal(assertLocalUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434');
  assert.throws(() => assertLocalUrl('https://example.com/v1'), /endpoint locali/);
  assert.throws(() => assertLocalUrl('http://localhost.evil.test/v1'), /endpoint locali/);
  assert.throws(() => assertLocalUrl('http://localhost@evil.test/v1'), /endpoint locali/);
  assert.throws(() => assertLocalUrl('http://user:pass@localhost:11434'), /soltanto protocollo/);
  assert.throws(() => assertLocalUrl('http://localhost:11434/api'), /soltanto protocollo/);
  assert.throws(() => assertLocalUrl('file:///C:/segreto'), /endpoint locali/);
  assert.throws(() => assertLocalUrl('not-a-url'), /non valido/);
});

test('consente Ollama LAN soltanto con opt-in e IP RFC1918', () => {
  assert.equal(assertOllamaUrl('http://192.168.1.50:11434', { allowLan: true }), 'http://192.168.1.50:11434');
  assert.equal(assertOllamaUrl('https://10.20.30.40:11434/', { allowLan: true }), 'https://10.20.30.40:11434');
  assert.equal(assertOllamaUrl('http://172.31.1.2:11434', { allowLan: true }), 'http://172.31.1.2:11434');
  assert.throws(() => assertOllamaUrl('http://192.168.1.50:11434'), /abilita esplicitamente la LAN/);
  assert.throws(() => assertOllamaUrl('http://172.32.1.2:11434', { allowLan: true }), /IPv4 privati/);
  assert.throws(() => assertOllamaUrl('http://ollama.local:11434', { allowLan: true }), /IPv4 privati/);
  assert.throws(() => assertOllamaUrl('https://8.8.8.8:11434', { allowLan: true }), /IPv4 privati/);
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
