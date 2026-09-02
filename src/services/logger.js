/**
 * @module services/logger
 * @description Servizio trasversale condiviso dai layer applicativi.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Serializzazione, file e rotazione

const LEVEL_WEIGHT = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, code: error.code };
}

const SENSITIVE_KEY = /authorization|cookie|credential|password|passwd|secret|token|api[-_]?key|private[-_]?key/i;
const SENSITIVE_ASSIGNMENT = /((?:access[-_]?token|auth(?:orization)?|client[-_]?secret|credential|password|passwd|refresh[-_]?token|secret|token|api[-_]?key|private[-_]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
function sanitizeLogValue(value, key = '', depth = 0, seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value instanceof Error) return sanitizeLogValue(serializeError(value), key, depth, seen);
  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g, '[REDACTED]')
      .replace(/\b(sk|pk|api)[-_][A-Za-z0-9_-]{16,}\b/gi, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
      .replace(/([?&](?:access[-_]?token|api[-_]?key|auth|password|secret|token)=)[^&\s#]+/gi, '$1[REDACTED]')
      .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, '$1[REDACTED]@')
      .replace(SENSITIVE_ASSIGNMENT, '$1[REDACTED]');
  }
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= 4) return '[Truncated]';
  seen.add(value);
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeLogValue(item, '', depth + 1, seen));
  return Object.fromEntries(Object.entries(value)
    .slice(0, 100)
    .map(([childKey, childValue]) => [childKey, sanitizeLogValue(childValue, childKey, depth + 1, seen)]));
}

function rotateLog(filePath, maxBytes, backups) {
  try {
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).size < maxBytes) return;
    for (let index = backups - 1; index >= 1; index -= 1) {
      const source = `${filePath}.${index}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${filePath}.${index + 1}`);
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    // Il logging non deve mai interrompere l'applicazione.
  }
}

function appendLocalLog(filePath, output, maxBytes, backups) {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    rotateLog(filePath, maxBytes, backups);
    fs.appendFileSync(filePath, `${output}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Console resta sempre disponibile come fallback diagnostico.
  }
}

// #endregion
// #region 02 — Logger strutturato

function createLogger({
  level = 'info',
  scope = 'nexus',
  filePath = '',
  maxBytes = 1_048_576,
  backups = 3,
  consoleOutput = !filePath
} = {}) {
  const threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info;
  function write(logLevel, message, context = {}) {
    if (LEVEL_WEIGHT[logLevel] > threshold) return;
    const sanitizedContext = sanitizeLogValue(context);
    const record = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      scope,
      message,
      ...(sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext) ? sanitizedContext : {})
    };
    const output = JSON.stringify(record);
    appendLocalLog(filePath, output, maxBytes, backups);
    // Un'app desktop non deve aprire o riempire una console con diagnostica
    // interna. La console resta il fallback dei logger privi di file.
    if (consoleOutput) {
      if (logLevel === 'error') console.error(output);
      else if (logLevel === 'warn') console.warn(output);
      else console.log(output);
    }
  }
  return Object.freeze({
    error: (message, context) => write('error', message, context),
    warn: (message, context) => write('warn', message, context),
    info: (message, context) => write('info', message, context),
    debug: (message, context) => write('debug', message, context),
    child: (childScope) => createLogger({
      level,
      scope: `${scope}:${childScope}`,
      filePath,
      maxBytes,
      backups,
      consoleOutput
    })
  });
}

module.exports = { appendLocalLog, createLogger, rotateLog, sanitizeLogValue, serializeError };

// #endregion
