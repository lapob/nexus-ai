const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptArchive, encryptArchive } = require('../src/infrastructure/storage/encrypted-backup');

test('cifra e ripristina un archivio personale portabile', () => {
  const source = { settings: { temperature: 0.4 }, clientData: { conversations: [{ id: 'one' }] } };
  const encrypted = encryptArchive(source, 'password-locale-sicura');
  assert.equal(encrypted.encryption, 'aes-256-gcm+scrypt');
  assert.equal(JSON.stringify(encrypted).includes('conversations'), false);
  assert.deepEqual(decryptArchive(encrypted, 'password-locale-sicura'), source);
});

test('rifiuta password errate e password troppo brevi', () => {
  assert.throws(() => encryptArchive({}, 'breve'), /almeno 10/);
  const encrypted = encryptArchive({ ok: true }, 'password-locale-sicura');
  assert.throws(() => decryptArchive(encrypted, 'password-diversa'), /Password errata/);
});
