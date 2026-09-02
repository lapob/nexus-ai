/**
 * @module application/project-context
 * @description Riassume una cartella di lavoro senza leggere segreti o bloccare il processo principale.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Inventario limitato
const IGNORED = new Set(['.git', 'node_modules', 'dist', 'build', 'release', '.next', 'coverage', 'vendor']);
const SENSITIVE = /(?:^|[._-])(?:env|secret|token|credential|password|key)(?:$|[._-])/i;
const CACHE_TTL_MS = 15_000;
const summaryCache = new Map();

function summarizeProject(root, { maximumFiles = 1600 } = {}) {
  const extensions = new Map(); const notable = []; const queue = [root]; let files = 0;
  while (queue.length && files < maximumFiles) {
    const directory = queue.shift(); let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || IGNORED.has(entry.name) || SENSITIVE.test(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (queue.length < 300) queue.push(target); continue; }
      if (!entry.isFile()) continue;
      files += 1;
      const extension = path.extname(entry.name).toLowerCase() || '[senza estensione]';
      extensions.set(extension, (extensions.get(extension) || 0) + 1);
      if (/^(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|dockerfile|compose\.ya?ml|readme\.md|agents\.md)$/i.test(entry.name)) notable.push(path.relative(root, target));
      if (files >= maximumFiles) break;
    }
  }
  let scripts = [];
  try { scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {}).filter((name) => !SENSITIVE.test(name)).slice(0, 30); } catch {}
  return { files, truncated: files >= maximumFiles, languages: [...extensions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([extension, count]) => `${extension}:${count}`), notable: notable.slice(0, 24), scripts };
}

function projectContextDirective(workspace) {
  if (!workspace?.active) return '';
  const now = Date.now();
  const cached = summaryCache.get(workspace.path);
  const summary = cached && now - cached.createdAt < CACHE_TTL_MS
    ? cached.summary
    : summarizeProject(workspace.path);
  if (!cached || summary !== cached.summary) {
    summaryCache.clear();
    summaryCache.set(workspace.path, { createdAt: now, summary });
  }
  return `CONTESTO PROGETTO AUTOMATICO: ${summary.files}${summary.truncated ? '+' : ''} file; tipi principali ${summary.languages.join(', ') || 'non rilevati'}; manifest ${summary.notable.join(', ') || 'nessuno'}; comandi disponibili ${summary.scripts.join(', ') || 'non rilevati'}. Usa questo inventario soltanto per orientarti: leggi i file effettivi prima di dichiarare dettagli o modifiche.`;
}

function clearProjectContextCache() { summaryCache.clear(); }

module.exports = { clearProjectContextCache, projectContextDirective, summarizeProject };
// #endregion
