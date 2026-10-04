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

test('DPAPI ritenta una sola volta un timeout senza esporre il segreto o cambiare ambito', () => {
  const calls = [];
  const result = windowsDpapi('synthetic-secret', 'protect', { run(executable, args, options) {
    calls.push({ executable, args, options });
    return calls.length === 1 ? { error: { code: 'ETIMEDOUT' }, status: null }
      : { status: 0, stdout: 'protected-ciphertext' };
  } });
  assert.equal(result, 'protected-ciphertext');
  assert.deepEqual(calls.map(call => call.options.timeout), [4000, 8000]);
  for (const call of calls) {
    assert.equal(call.options.input, 'synthetic-secret');
    assert.equal(call.options.windowsHide, true);
    assert.doesNotMatch(call.args.join(' '), /synthetic-secret/);
    assert.match(Buffer.from(call.args.at(-1), 'base64').toString('utf16le'), /CurrentUser/);
  }
});

test('DPAPI nega errori crittografici e timeout ripetuti senza fallback in chiaro', () => {
  for (const failure of [{ status: 1, stdout: '', stderr: 'Cryptographic failure' },
    { status: null, error: { code: 'ETIMEDOUT' } }]) {
    let calls = 0;
    assert.throws(() => windowsDpapi('synthetic-secret', 'unprotect', { run() { calls++; return failure; } }),
      { code: 'SYSTEM_SECRET_UNPROTECT_FAILED' });
    assert.equal(calls, failure.error ? 2 : 1);
  }
});
