/**
 * @module infrastructure/electron/safe-storage-secret
 * @description Protegge piccoli segreti di coordinamento con il keystore del sistema operativo.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region 01 — Protezione DPAPI Windows

function secretProtectionError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function windowsDpapi(value, mode, {
  run = spawnSync,
  systemRoot = process.env.SystemRoot || 'C:\\Windows'
} = {}) {
  const text = String(value || '');
  if (!text || text.length > 8_192 || !['protect', 'unprotect'].includes(mode)) {
    throw secretProtectionError('Credenziale locale non valida.', 'SYSTEM_SECRET_INPUT_INVALID');
  }
  const bootstrap = "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;";
  const script = mode === 'protect'
    ? `${bootstrap}$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`
    : `${bootstrap}$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    input: text,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 4_000,
    maxBuffer: 16 * 1024
  });
  if (result?.error || result?.status !== 0 || !String(result?.stdout || '')) {
    throw secretProtectionError(
      mode === 'protect' ? 'Protezione credenziale locale non riuscita.' : 'Credenziale locale non decifrabile per questo utente.',
      mode === 'protect' ? 'SYSTEM_SECRET_PROTECTION_FAILED' : 'SYSTEM_SECRET_UNPROTECT_FAILED',
      result?.error
    );
  }
  return String(result.stdout);
}

// #endregion

// #region 02 — Adapter cross-platform safeStorage

function createSafeStorageSecretProtection(safeStorage, {
  platform = process.platform,
  runWindowsDpapi = windowsDpapi
} = {}) {
  if (platform !== 'win32' && (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function')) {
    throw new TypeError('Adapter Electron safeStorage mancante.');
  }

  const ensureAvailable = () => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw secretProtectionError(
        'Protezione credenziali del sistema non disponibile.',
        'SYSTEM_SECRET_PROTECTION_UNAVAILABLE'
      );
    }
  };

  return Object.freeze({
    protectSecret(value) {
      if (platform === 'win32') return runWindowsDpapi(String(value), 'protect');
      ensureAvailable();
      try {
        return safeStorage.encryptString(String(value)).toString('base64');
      } catch (error) {
        throw secretProtectionError(
          'Protezione credenziale locale non riuscita.',
          'SYSTEM_SECRET_PROTECTION_FAILED',
          error
        );
      }
    },
    unprotectSecret(value) {
      if (platform === 'win32') return runWindowsDpapi(String(value), 'unprotect');
      ensureAvailable();
      try {
        return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
      } catch (error) {
        throw secretProtectionError(
          'Credenziale locale non decifrabile per questo utente.',
          'SYSTEM_SECRET_UNPROTECT_FAILED',
          error
        );
      }
    }
  });
}

// #endregion

module.exports = { createSafeStorageSecretProtection, windowsDpapi };
