/**
 * @module ai/ollama-runtime-security
 * @description Gate fail-closed per firma, versione e vulnerabilità del runtime Ollama locale.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region 01 — Regole, parsing e identità del runtime

const BLOCKING_SEVERITIES = new Set(['critical', 'high']);
const DEVELOPMENT_MINIMUM_VERSION = '0.32.3';

function runtimeSecurityError(message, code, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function parseOllamaVersion(output) {
  return String(output || '').match(/(?:client|ollama) version(?: is)?\s+v?([0-9]+(?:\.[0-9]+){2}(?:[-+][0-9A-Za-z.-]+)?)/i)?.[1] || '';
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '').split(/[.+-]/, 3).map((part) => Number(part) || 0);
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function isLoopbackHost(value) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(value || '').trim().toLowerCase());
}

function blockingFindings(payload) {
  return (Array.isArray(payload?.matches) ? payload.matches : [])
    .map((match) => ({
      id: String(match?.vulnerability?.id || ''),
      severity: String(match?.vulnerability?.severity || ''),
      package: String(match?.artifact?.name || '')
    }))
    .filter((finding) => BLOCKING_SEVERITIES.has(finding.severity.toLowerCase()));
}

function runChecked(runProcess, command, args, options, errorCode, description) {
  const result = runProcess(command, args, options);
  if (result?.error || result?.status !== 0) {
    throw runtimeSecurityError(`${description} non riuscita.`, errorCode, {
      status: result?.status ?? null,
      error: result?.error?.message || '',
      stderr: String(result?.stderr || '').slice(0, 1_000)
    });
  }
  return result;
}

function verifyAuthenticode(executablePath, { platform = process.platform, runProcess = spawnSync } = {}) {
  if (platform !== 'win32') return { status: 'NotApplicable', signer: '' };
  const command = [
    "$ErrorActionPreference = 'Stop';",
    'Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;',
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:NEXUS_OLLAMA_AUDIT_TARGET;',
    '[pscustomobject]@{ Status = [string]$signature.Status; Signer = [string]$signature.SignerCertificate.Subject } | ConvertTo-Json -Compress'
  ].join(' ');
  // Node eredita il PSModulePath di PowerShell 7 quando viene avviato da pwsh.
  // Windows PowerShell 5.1 può quindi tentare di caricare per errore i moduli
  // binari di PowerShell 7 e restituire un JSON vuoto con exit code 0. Forziamo
  // esclusivamente i percorsi modulo compatibili con powershell.exe.
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const windowsPowerShellModules = [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'Documents', 'WindowsPowerShell', 'Modules'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'WindowsPowerShell', 'Modules'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
  ].filter(Boolean).join(path.delimiter);
  const result = runChecked(runProcess, 'powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command
  ], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      PSModulePath: windowsPowerShellModules,
      NEXUS_OLLAMA_AUDIT_TARGET: executablePath
    }
  }, 'OLLAMA_SIGNATURE_CHECK_FAILED', 'Verifica firma Ollama');
  let signature;
  try { signature = JSON.parse(String(result.stdout || '').trim()); }
  catch { throw runtimeSecurityError('Risposta firma Ollama non valida.', 'OLLAMA_SIGNATURE_CHECK_FAILED'); }
  if (signature.Status !== 'Valid' || !/\bOllama Inc\b/i.test(signature.Signer || '')) {
    throw runtimeSecurityError('Il runtime Ollama non ha una firma ufficiale valida.', 'OLLAMA_SIGNATURE_INVALID', signature);
  }
  return { status: signature.Status, signer: signature.Signer };
}

// #endregion

// #region 02 — Audit fail-closed e API pubblica

function auditOllamaRuntime(executablePath, {
  platform = process.platform,
  runProcess = spawnSync,
  requireSignature = platform === 'win32',
  usage = 'distribution',
  host = '',
  minimumVersion = DEVELOPMENT_MINIMUM_VERSION
} = {}) {
  const executable = path.resolve(String(executablePath || ''));
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw runtimeSecurityError('Runtime Ollama non disponibile.', 'OLLAMA_RUNTIME_MISSING', { executable });
  }
  const signature = requireSignature
    ? verifyAuthenticode(executable, { platform, runProcess })
    : { status: 'NotRequired', signer: '' };
  const versionResult = runChecked(runProcess, executable, ['--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, OLLAMA_HOST: '127.0.0.1:1' }
  }, 'OLLAMA_VERSION_CHECK_FAILED', 'Lettura versione Ollama');
  const version = parseOllamaVersion(`${versionResult.stdout || ''}\n${versionResult.stderr || ''}`);
  if (!version) throw runtimeSecurityError('Versione Ollama non verificabile.', 'OLLAMA_VERSION_INVALID');
  if (compareVersions(version, minimumVersion) < 0) {
    throw runtimeSecurityError(
      `Ollama ${version} è precedente alla versione minima consentita ${minimumVersion}.`,
      'OLLAMA_VERSION_UNSUPPORTED', { executable, version, minimumVersion }
    );
  }

  const scanResult = runChecked(runProcess, 'grype', [
    `file:${executable}`, '--scope', 'all-layers', '-o', 'json'
  ], {
    // Grype's first database-backed scan can be slow on the portable SSD.
    // Keep the fail-closed gate, but allow enough time for a real result.
    encoding: 'utf8', windowsHide: true, timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GRYPE_CHECK_FOR_APP_UPDATE: 'false' }
  }, 'OLLAMA_SECURITY_SCAN_FAILED', 'Scansione Grype Ollama');
  let scan;
  try { scan = JSON.parse(String(scanResult.stdout || '')); }
  catch { throw runtimeSecurityError('Risposta Grype non valida.', 'OLLAMA_SECURITY_SCAN_FAILED'); }
  const blocking = blockingFindings(scan);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  const developmentLoopback = usage === 'development' && isLoopbackHost(host);
  if (blocking.length && !developmentLoopback) {
    throw runtimeSecurityError(
      `Runtime Ollama ${version} bloccato: ${blocking.length} vulnerabilità High/Critical rilevate.`,
      'OLLAMA_RUNTIME_VULNERABLE',
      { executable, version, sha256, signature, findings: blocking.slice(0, 25) }
    );
  }
  const warnings = blocking.length ? Object.freeze([Object.freeze({
    code: 'OLLAMA_MODULE_FINDINGS_LOOPBACK_ONLY',
    message: `${blocking.length} finding High/Critical a granularità modulo: runtime consentito soltanto in sviluppo loopback.`,
    findings: Object.freeze(blocking.slice(0, 25))
  })]) : Object.freeze([]);
  return Object.freeze({ executable, version, minimumVersion, sha256, signature, blockingFindings: blocking.length, warnings });
}

function assertOllamaRuntimeSecure(executablePath, options) {
  return auditOllamaRuntime(executablePath, options);
}

module.exports = {
  DEVELOPMENT_MINIMUM_VERSION, assertOllamaRuntimeSecure, auditOllamaRuntime,
  blockingFindings, compareVersions, isLoopbackHost, parseOllamaVersion, verifyAuthenticode
};

// #endregion
