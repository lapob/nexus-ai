/**
 * @module application/attachments
 * @description Estrae contesto locale da file e cartelle scelti esplicitamente dall'utente.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Limiti e classificazione

const MAX_FILE_BYTES = 96_000;
const MAX_TOTAL_BYTES = 480_000;
const SENSITIVE_NAME = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|pfx|p12|key|kdbx))$/i;
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.mdx', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.xml', '.svg',
  '.py', '.pyi', '.java', '.kt', '.kts', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs',
  '.php', '.rb', '.swift', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.lua', '.r', '.dart', '.vue', '.svelte', '.astro',
  '.gitignore', '.gitattributes', '.editorconfig', '.dockerfile'
]);

function isTextCandidate(filePath) {
  const name = path.basename(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(path.extname(name)) || TEXT_EXTENSIONS.has(`.${name}`) || /^(?:dockerfile|makefile|readme|license)$/i.test(name);
}

function safeReadText(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  if (SENSITIVE_NAME.test(path.basename(filePath))) return { skipped: 'sensibile', size: stat.size };
  if (!isTextCandidate(filePath)) return { skipped: 'non testuale', size: stat.size };
  const length = Math.min(stat.size, MAX_FILE_BYTES);
  const buffer = Buffer.alloc(length);
  const descriptor = fs.openSync(filePath, 'r');
  try { fs.readSync(descriptor, buffer, 0, length, 0); } finally { fs.closeSync(descriptor); }
  if (buffer.includes(0)) return { skipped: 'binario', size: stat.size };
  return {
    text: buffer.toString('utf8').replace(/\u0000/g, '').trim(),
    size: stat.size,
    truncated: stat.size > MAX_FILE_BYTES
  };
}

// #endregion

// #region 02 — Estrazione del file scelto

function extractAttachment(targetPath) {
  const resolved = fs.realpathSync(targetPath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('È possibile allegare soltanto file.');
  const name = path.basename(resolved);
  const result = safeReadText(resolved);
  const readable = result && !result.skipped;
  const content = readable
    ? `FILE: ${name}${result.truncated ? ' [contenuto parziale]' : ''}\n${result.text.slice(0, MAX_TOTAL_BYTES)}`
    : `FILE: ${name}\nContenuto non incluso (${result?.skipped || 'non disponibile'}).`;
  const summary = [
    `ALLEGATO FILE: ${name}`,
    content
  ].filter(Boolean).join('\n\n');

  return {
    name,
    kind: 'file',
    fileCount: 1,
    size: stat.size,
    content: summary.slice(0, MAX_TOTAL_BYTES)
  };
}

module.exports = { extractAttachment, isTextCandidate, MAX_FILE_BYTES, MAX_TOTAL_BYTES };

// #endregion
