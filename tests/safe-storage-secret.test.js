const test = require('node:test');
const assert = require('node:assert/strict');
const { createSafeStorageSecretProtection, windowsDpapi } = require('../src/infrastructure/electron/safe-storage-secret');

test('il codec safeStorage protegge e recupera il segreto senza conservarlo in chiaro', () => {
  const adapter = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`dpapi:${value}`, 'utf8'),
    decryptString: (value) => Buffer.from(value).toString('utf8').replace(/^dpapi:/, '')
  };
  const protection = createSafeStorageSecretProtection(adapter, { platform: 'linux' });
  const secret = 'segreto-locale-di-test';
  const protectedValue = protection.protectSecret(secret);
  assert.doesNotMatch(protectedValue, new RegExp(secret));
  assert.equal(protection.unprotectSecret(protectedValue), secret);
});

test('il codec fallisce chiuso quando la protezione del sistema non e disponibile', () => {
  const protection = createSafeStorageSecretProtection({ isEncryptionAvailable: () => false }, { platform: 'linux' });
  assert.throws(() => protection.protectSecret('secret'), { code: 'SYSTEM_SECRET_PROTECTION_UNAVAILABLE' });
  assert.throws(() => protection.unprotectSecret('secret'), { code: 'SYSTEM_SECRET_PROTECTION_UNAVAILABLE' });
});

test('Windows usa DPAPI CurrentUser condiviso tra Core e Presence isolati', () => {
  const calls = [];
  const protection = createSafeStorageSecretProtection(null, {
    platform: 'win32',
    runWindowsDpapi(value, mode) {
      calls.push(mode);
      return mode === 'protect'
        ? Buffer.from(`current-user:${value}`, 'utf8').toString('base64')
        : Buffer.from(value, 'base64').toString('utf8').replace(/^current-user:/, '');
    }
  });
  const protectedValue = protection.protectSecret('bridge-secret');
  assert.equal(protection.unprotectSecret(protectedValue), 'bridge-secret');
  assert.deepEqual(calls, ['protect', 'unprotect']);
});

test('DPAPI Windows reale protegge un segreto senza inserirlo nella riga di comando', { skip: process.platform !== 'win32' }, () => {
  const secret = `nexus-${Date.now()}`;
  const protectedValue = windowsDpapi(secret, 'protect');
  assert.doesNotMatch(protectedValue, new RegExp(secret));
  assert.equal(windowsDpapi(protectedValue, 'unprotect'), secret);
});
