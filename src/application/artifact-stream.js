/**
 * @module application/artifact-stream
 * @description Normalizza artefatti tipizzati e limita ciò che può uscire dal server.
 */
const MAX_ARTIFACTS = 12;
const MAX_TEXT = 96 * 1024;
const SAFE_KINDS = new Set(['code', 'document', 'image', 'link', 'table', 'file-change']);

function cleanText(value, maximum = MAX_TEXT) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, maximum);
}

function normalizeArtifact(value, { publicAudience = false } = {}) {
  if (!value || typeof value !== 'object') return null;
  const kind = SAFE_KINDS.has(value.kind) ? value.kind : 'document';
  if (publicAudience && kind === 'file-change') return null;
  const artifact = {
    id: cleanText(value.id || `artifact-${Date.now()}`, 96),
    kind,
    title: cleanText(value.title || 'Risultato', 180),
    content: cleanText(value.content)
  };
  if (value.language) artifact.language = cleanText(value.language, 40);
  if (kind === 'link' && typeof value.url === 'string' && value.url.length <= 2048) {
    try { const url = new URL(value.url); if (url.protocol === 'https:' && !url.username && !url.password) artifact.url = value.url; } catch { /* No malformed or credential-bearing links. */ }
  }
  if (kind === 'image' && typeof value.url === 'string' && value.url.length <= 2 * 1024 * 1024
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/i.test(value.url)) artifact.url = value.url;
  return Object.freeze(artifact);
}

function normalizeArtifacts(values, options) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).slice(0, MAX_ARTIFACTS)
    .map((value, index) => {
      const normalized = normalizeArtifact(value, options);
      if (!normalized) return null;
      const artifact = { ...normalized };
      if (!value.id || seen.has(artifact.id)) artifact.id = `artifact-${index}`;
      while (seen.has(artifact.id)) artifact.id += '-result';
      seen.add(artifact.id); return Object.freeze(artifact);
    }).filter(Boolean);
}

module.exports = { MAX_ARTIFACTS, normalizeArtifact, normalizeArtifacts };
