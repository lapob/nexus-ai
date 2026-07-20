const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedRendererUrl, normalizeLocalFileUrl } = require('../src/application/register-ipc');

const encoded = 'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer/index.html';

test('normalizza rappresentazioni Chromium e Node dello stesso renderer Windows', () => {
  assert.equal(isTrustedRendererUrl('file:///D:/[AI]/Nexus/.AI/src/renderer/index.html', encoded), true);
  assert.equal(isTrustedRendererUrl('file:///d:/%5bai%5d/Nexus/.AI/src/renderer/index.html', encoded), true);
  assert.equal(isTrustedRendererUrl('file:///D:\\[AI]\\Nexus\\.AI\\src\\renderer\\index.html', encoded), true);
  assert.equal(normalizeLocalFileUrl('file:///D:/%5BAI%5D/Nexus/.AI/src/renderer/../renderer/index.html'), normalizeLocalFileUrl(encoded));
});

test('autorizza il file esatto e rifiuta file, prefissi e schemi differenti', () => {
  const rejected = [
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer/app.js',
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer/index.html.evil',
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer-evil/index.html',
    'https://example.test/index.html', 'http://127.0.0.1/index.html',
    'not a url', '', undefined,
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer/%2e%2e/index.html',
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer%2Findex.html',
    'file:///D:/%5BAI%5D/Nexus/.AI/src/renderer%5Cindex.html'
  ];
  for (const candidate of rejected) assert.equal(isTrustedRendererUrl(candidate, encoded), false, String(candidate));
});

test('fallisce in modo chiuso anche con un URL trusted non valido', () => {
  assert.equal(isTrustedRendererUrl(encoded, 'https://example.test/index.html'), false);
  assert.equal(isTrustedRendererUrl(encoded, ''), false);
});
