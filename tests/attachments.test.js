const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractAttachment, isTextCandidate } = require('../src/application/attachments');

test('riconosce sorgenti e documenti testuali senza trattare ogni binario come testo', () => {
  assert.equal(isTextCandidate('app.tsx'), true);
  assert.equal(isTextCandidate('README.md'), true);
  assert.equal(isTextCandidate('archive.zip'), false);
});

test('estrae un file sorgente scelto esplicitamente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-attachments-'));
  try {
    const target = path.join(root, 'app.ts');
    fs.writeFileSync(target, 'export const answer = 42;');
    const attachment = extractAttachment(target);
    assert.equal(attachment.kind, 'file');
    assert.match(attachment.content, /export const answer/);
    assert.equal(attachment.fileCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rifiuta cartelle ed evita di leggere file sensibili', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sensitive-'));
  try {
    assert.throws(() => extractAttachment(root), /soltanto file/);
    const secret = path.join(root, '.env');
    fs.writeFileSync(secret, 'TOKEN=segreto');
    assert.doesNotMatch(extractAttachment(secret).content, /TOKEN=segreto/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('segnala un file non testuale senza inserirne i byte nel prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-binary-'));
  try {
    const target = path.join(root, 'image.png');
    fs.writeFileSync(target, Buffer.from([0, 1, 2, 3, 4]));
    const attachment = extractAttachment(target);
    assert.equal(attachment.kind, 'file');
    assert.match(attachment.content, /non testuale/);
    assert.doesNotMatch(attachment.content, /\u0000/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
