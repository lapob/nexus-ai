/**
 * @module ai/ollama-runtime-security
 * @description Gate fail-closed per firma, versione e vulnerabilità del runtime Ollama locale.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFile } = require('node:child_process');
const { hashFile } = require('./native-runtime-inventory');

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
      package: String(match?.artifact?.name || ''),
      version: String(match?.artifact?.version || '')
    }))
    .filter((finding) => BLOCKING_SEVERITIES.has(finding.severity.toLowerCase()));
}

// #endregion

// #region 01b — Eccezioni revisionate (strette e fail-closed)

const REVIEWED_EXCEPTIONS_PATH = path.join(__dirname, '..', '..', 'config', 'ollama-reviewed-exceptions.json');
const MAX_EXCEPTION_DAYS = 30;

/**
 * Carica le eccezioni revisionate dal sorgente. Un file assente lascia il gate
 * invariato; un file presente ma malformato rifiuta il runtime, perché una
 * policy illeggibile non deve trasformarsi in "nessun controllo".
 */
function loadReviewedExceptions(filePath = REVIEWED_EXCEPTIONS_PATH) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw runtimeSecurityError('Eccezioni runtime illeggibili.', 'OLLAMA_EXCEPTIONS_INVALID'); }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw runtimeSecurityError('Eccezioni runtime non valide.', 'OLLAMA_EXCEPTIONS_INVALID'); }
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.exceptions)) throw runtimeSecurityError('Schema eccezioni runtime non valido.', 'OLLAMA_EXCEPTIONS_INVALID');
  return parsed.exceptions.map((entry) => {
    const reviewed = Date.parse(`${entry?.reviewedAt}T00:00:00Z`);
    const expires = Date.parse(`${entry?.expiresAt}T23:59:59Z`);
    const valid = /^[A-Z]+-\d{4}-\d+$/.test(String(entry?.advisory || ''))
      && entry.severity === 'high'
      && /^[a-z0-9./-]+$/.test(String(entry.module || ''))
      && /^v?\d+\.\d+\.\d+/.test(String(entry.moduleVersion || ''))
      && Array.isArray(entry.vulnerablePackages) && entry.vulnerablePackages.length > 0
      && entry.vulnerablePackages.every((name) => typeof name === 'string' && name.startsWith(`${entry.module}/`))
      && /^[a-f0-9]{64}$/.test(String(entry.runtimeSha256 || ''))
      && Number.isFinite(reviewed) && Number.isFinite(expires) && expires > reviewed
      && expires - reviewed <= (MAX_EXCEPTION_DAYS + 1) * 86_400_000
      && String(entry.evidence || '').trim().length >= 40;
    if (!valid) throw runtimeSecurityError(`Eccezione runtime non valida: ${entry?.advisory || 'sconosciuta'}.`, 'OLLAMA_EXCEPTIONS_INVALID');
    return Object.freeze({ ...entry, reviewedMs: reviewed, expiresMs: expires });
  });
}

const normalizeModuleVersion = (value) => String(value || '').replace(/^v/, '');

/** Eccezioni candidate per un finding: stesso advisory, modulo, versione e binario, non scadute. */
function applicableExceptions(finding, exceptions, { sha256, now }) {
  return exceptions.filter((entry) => (entry.advisory === finding.id || (entry.aliases || []).includes(finding.id))
    && finding.severity.toLowerCase() === 'high'
    && entry.module === finding.package
    && normalizeModuleVersion(entry.moduleVersion) === normalizeModuleVersion(finding.version)
    && entry.runtimeSha256 === sha256
    && now <= entry.expiresMs);
}

/** Simboli Go del pacchetto: "pkg." oppure "pkg/" (sottopacchetti) nel binario. */
function packageLinked(binary, packageName) {
  return binary.includes(`${packageName}.`) || binary.includes(`${packageName}/`);
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

function authenticodeOperation(executablePath) {
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
  return { command: 'powershell.exe', args: [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command
  ], options: {
    encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      PSModulePath: windowsPowerShellModules,
      NEXUS_OLLAMA_AUDIT_TARGET: executablePath
    }
  }, errorCode: 'OLLAMA_SIGNATURE_CHECK_FAILED', description: 'Verifica firma Ollama', stage: 'signature' };
}

function parseAuthenticode(result) {
  let signature;
  try { signature = JSON.parse(String(result.stdout || '').trim()); }
  catch { throw runtimeSecurityError('Risposta firma Ollama non valida.', 'OLLAMA_SIGNATURE_CHECK_FAILED'); }
  if (signature.Status !== 'Valid' || !/\bOllama Inc\b/i.test(signature.Signer || '')) {
    throw runtimeSecurityError('Il runtime Ollama non ha una firma ufficiale valida.', 'OLLAMA_SIGNATURE_INVALID', signature);
  }
  return { status: signature.Status, signer: signature.Signer };
}

function verifyAuthenticode(executablePath, { platform = process.platform, runProcess = spawnSync } = {}) {
  if (platform !== 'win32') return { status: 'NotApplicable', signer: '' };
  const operation = authenticodeOperation(executablePath);
  return parseAuthenticode(runChecked(runProcess, operation.command, operation.args, operation.options, operation.errorCode, operation.description));
}

// #endregion

// #region 02 — Audit fail-closed e API pubblica

function* auditRuntimeSteps(executablePath, {
  platform = process.platform,
  requireSignature = platform === 'win32',
  usage = 'distribution',
  host = '',
  minimumVersion = DEVELOPMENT_MINIMUM_VERSION,
  scannerExecutable = process.env.NEXUS_GRYPE_EXECUTABLE || 'grype',
  reviewedExceptions = undefined,
  now = Date.now()
} = {}) {
  let executable = path.resolve(String(executablePath || ''));
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw runtimeSecurityError('Runtime Ollama non disponibile.', 'OLLAMA_RUNTIME_MISSING', { executable });
  }
  // External scanners may not traverse Windows junctions used by worktrees.
  // Audit, execute and hash the same resolved file, without bypassing the gate.
  executable = fs.realpathSync.native(executable);
  const initialHash = yield { kind: 'sha256', executable, stage: 'identity' };
  const signature = requireSignature
    ? parseAuthenticode(yield authenticodeOperation(executable))
    : { status: 'NotRequired', signer: '' };
  const versionResult = yield { command: executable, args: ['--version'], options: {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, OLLAMA_HOST: '127.0.0.1:1' }
  }, errorCode: 'OLLAMA_VERSION_CHECK_FAILED', description: 'Lettura versione Ollama', stage: 'version' };
  const version = parseOllamaVersion(`${versionResult.stdout || ''}\n${versionResult.stderr || ''}`);
  if (!version) throw runtimeSecurityError('Versione Ollama non verificabile.', 'OLLAMA_VERSION_INVALID');
  if (compareVersions(version, minimumVersion) < 0) {
    throw runtimeSecurityError(
      `Ollama ${version} è precedente alla versione minima consentita ${minimumVersion}.`,
      'OLLAMA_VERSION_UNSUPPORTED', { executable, version, minimumVersion }
    );
  }

  const scanResult = yield { command: scannerExecutable, args: [
    `file:${executable}`, '--scope', 'all-layers', '-o', 'json'
  ], options: {
    // Grype's first database-backed scan can be slow on the portable SSD.
    // Keep the fail-closed gate, but allow enough time for a real result.
    encoding: 'utf8', windowsHide: true, timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GRYPE_CHECK_FOR_APP_UPDATE: 'false' }
  }, errorCode: 'OLLAMA_SECURITY_SCAN_FAILED', description: 'Scansione Grype Ollama', stage: 'vulnerabilities' };
  let scan;
  try { scan = JSON.parse(String(scanResult.stdout || '')); }
  catch { throw runtimeSecurityError('Risposta Grype non valida.', 'OLLAMA_SECURITY_SCAN_FAILED'); }
  const severities = new Set(['unknown', 'negligible', 'low', 'medium', 'high', 'critical']);
  if (!Array.isArray(scan?.matches) || !scan.matches.every(match =>
    typeof match?.vulnerability?.id === 'string' && match.vulnerability.id.trim()
    && typeof match.vulnerability.severity === 'string' && severities.has(match.vulnerability.severity.toLowerCase())
    && typeof match?.artifact?.name === 'string' && match.artifact.name.trim())) {
    throw runtimeSecurityError('Risposta Grype incompleta o non valida.', 'OLLAMA_SECURITY_SCAN_FAILED');
  }
  let blocking = blockingFindings(scan);
  const sha256 = yield { kind: 'sha256', executable, stage: 'identity-final' };
  if (sha256 !== initialHash) throw runtimeSecurityError('Il runtime è cambiato durante la verifica.', 'OLLAMA_RUNTIME_CHANGED');
  // Un finding High è esonerato solo se un'eccezione revisionata e non scaduta
  // copre esattamente advisory, modulo, versione e binario, e se nessun
  // pacchetto vulnerabile dichiarato risulta compilato. Critical non è mai esonerabile.
  const exceptions = blocking.length ? (reviewedExceptions === undefined ? loadReviewedExceptions() : reviewedExceptions) : [];
  const waived = [];
  if (blocking.length && exceptions.length) {
    const candidates = blocking.map((finding) => ({ finding, entries: applicableExceptions(finding, exceptions, { sha256, now }) }));
    const needles = [...new Set(candidates.flatMap(({ entries }) => entries.flatMap((entry) => entry.vulnerablePackages)))];
    const linked = needles.length ? yield { kind: 'symbols', executable, needles, stage: 'reachability' } : {};
    blocking = blocking.filter((finding, index) => {
      const entry = candidates[index].entries.find((item) => item.vulnerablePackages.every((name) => linked[name] === false));
      if (!entry) return true;
      waived.push(Object.freeze({ ...finding, expiresAt: entry.expiresAt, vulnerablePackages: entry.vulnerablePackages }));
      return false;
    });
  }
  const developmentLoopback = usage === 'development' && isLoopbackHost(host);
  if (blocking.length && !developmentLoopback) {
    throw runtimeSecurityError(
      `Runtime Ollama ${version} bloccato: ${blocking.length} segnalazioni High/Critical rilevate.`,
      'OLLAMA_RUNTIME_VULNERABLE',
      { executable, version, sha256, signature, findings: blocking.slice(0, 25) }
    );
  }
  const warnings = Object.freeze([
    ...(blocking.length ? [Object.freeze({
      code: 'OLLAMA_MODULE_FINDINGS_LOOPBACK_ONLY',
      message: `${blocking.length} finding High/Critical a granularità modulo: runtime consentito soltanto in sviluppo loopback.`,
      findings: Object.freeze(blocking.slice(0, 25))
    })] : []),
    ...(waived.length ? [Object.freeze({
      code: 'OLLAMA_REVIEWED_EXCEPTION',
      message: `${waived.length} finding High esonerati da eccezione revisionata: pacchetto vulnerabile assente dal binario.`,
      findings: Object.freeze(waived)
    })] : [])
  ]);
  return Object.freeze({ executable, version, minimumVersion, sha256, signature, blockingFindings: blocking.length, waivedFindings: waived.length, warnings });
}

// Legge il binario già verificato per hash e restituisce, per ogni pacchetto,
// se i suoi simboli Go sono presenti. latin1 preserva ogni byte come carattere.
function linkedPackages(buffer, needles) {
  const binary = buffer.toString('latin1');
  return Object.fromEntries(needles.map((name) => [name, packageLinked(binary, name)]));
}

function auditOllamaRuntime(executablePath, options = {}) {
  const steps = auditRuntimeSteps(executablePath, options); let next = steps.next();
  while (!next.done) {
    const op = next.value;
    const result = op.kind === 'sha256' ? crypto.createHash('sha256').update(fs.readFileSync(op.executable)).digest('hex')
      : op.kind === 'symbols' ? (options.readBinary ? linkedPackages(options.readBinary(op.executable), op.needles) : linkedPackages(fs.readFileSync(op.executable), op.needles))
      : runChecked(options.runProcess || spawnSync, op.command, op.args, op.options, op.errorCode, op.description);
    next = steps.next(result);
  }
  return next.value;
}

async function auditOllamaRuntimeAsync(executablePath, options = {}) {
  const steps = auditRuntimeSteps(executablePath, options); let next = steps.next();
  const run = options.runProcess || ((command, args, settings) => new Promise(resolve => {
    execFile(command, args, { ...settings, signal: options.signal }, (error, stdout, stderr) => {
      resolve({ status: error ? (Number.isInteger(error.code) ? error.code : -1) : 0, error, stdout, stderr });
    });
  }));
  while (!next.done) {
    options.signal?.throwIfAborted();
    const op = next.value, started = performance.now();
    const result = op.kind === 'sha256' ? await hashFile(op.executable, options.signal)
      : op.kind === 'symbols' ? linkedPackages(options.readBinary ? await options.readBinary(op.executable) : await fs.promises.readFile(op.executable, { signal: options.signal }), op.needles)
      : await run(op.command, op.args, op.options);
    options.signal?.throwIfAborted();
    const checked = op.kind === 'sha256' || op.kind === 'symbols' ? result
      : runChecked(() => result, op.command, op.args, op.options, op.errorCode, op.description);
    try { options.onStage?.({ stage: op.stage, durationMs: Math.round(performance.now() - started) }); } catch { /* Observability cannot admit or reject a runtime. */ }
    next = steps.next(checked);
  }
  return next.value;
}

function assertOllamaRuntimeSecure(executablePath, options) {
  return auditOllamaRuntime(executablePath, options);
}

module.exports = {
  DEVELOPMENT_MINIMUM_VERSION, assertOllamaRuntimeSecure, auditOllamaRuntime, auditOllamaRuntimeAsync,
  blockingFindings, compareVersions, isLoopbackHost, parseOllamaVersion, verifyAuthenticode,
  loadReviewedExceptions, packageLinked, REVIEWED_EXCEPTIONS_PATH
};

// #endregion
