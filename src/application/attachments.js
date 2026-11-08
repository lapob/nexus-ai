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
  '.gitignore', '.gitattributes', '.editorconfig', '.dockerfile',
  '.log', '.csv', '.tsv', '.tex', '.srt', '.vtt', '.rst', '.adoc', '.properties', '.env.example',
  '.gradle', '.cmake', '.mk', '.proto', '.sol', '.zig', '.nim', '.ex', '.exs', '.erl', '.hs', '.ml', '.fs', '.scala', '.clj', '.jl', '.m', '.pl'
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

// #endregion

// #region 03 — Allegati del proprietario (desktop): file completi, anche PDF

/** Tetto tecnico, non di prodotto: oltre 1 GiB un singolo file non sta in memoria in modo sicuro. */
const OWNER_MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Versione per il proprietario sul proprio PC: nessun limite di dimensione utile,
 * testo letto per intero e PDF estratti in un worker isolato. Il contesto passato
 * al modello viene poi adattato alla domanda (application/attachment-context).
 */
async function extractAttachmentAsync(targetPath, { extractPdf = require('../remote/pdf-extraction').extractPdfText } = {}) {
  const resolved = await fs.promises.realpath(targetPath);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile()) throw new Error('È possibile allegare soltanto file.');
  const name = path.basename(resolved);
  const base = { name, kind: 'file', fileCount: 1, size: stat.size };
  const skipped = (reason) => ({ ...base, content: `ALLEGATO FILE: ${name}\n\nFILE: ${name}\nContenuto non incluso (${reason}).` });
  if (SENSITIVE_NAME.test(name)) return skipped('sensibile');
  if (stat.size > OWNER_MAX_BYTES) return skipped('oltre 1 GiB, troppo grande per la memoria');
  if (path.extname(name).toLowerCase() === '.pdf') {
    try {
      const { text } = await extractPdf(await fs.promises.readFile(resolved), { profile: 'owner' });
      return { ...base, content: `ALLEGATO FILE: ${name}\n\nFILE: ${name} (PDF)\n${String(text).trim()}` };
    } catch { return skipped('PDF non leggibile o protetto'); }
  }
  if (!isTextCandidate(resolved)) return skipped('non testuale');
  const buffer = await fs.promises.readFile(resolved);
  if (buffer.includes(0)) return skipped('binario');
  return { ...base, content: `ALLEGATO FILE: ${name}\n\nFILE: ${name}\n${buffer.toString('utf8').replace(/\u0000/g, '').trim()}` };
}

module.exports = { extractAttachment, extractAttachmentAsync, isTextCandidate, MAX_FILE_BYTES, MAX_TOTAL_BYTES, OWNER_MAX_BYTES };

// #endregion
