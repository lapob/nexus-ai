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
  if (kind === 'link' && /^https:\/\//i.test(String(value.url || ''))) artifact.url = cleanText(value.url, 2_048);
  if (kind === 'image' && /^data:image\/(png|jpeg|webp);base64,/i.test(String(value.url || ''))) artifact.url = cleanText(value.url, 2 * 1024 * 1024);
  return Object.freeze(artifact);
}

function normalizeArtifacts(values, options) {
  return (Array.isArray(values) ? values : []).slice(0, MAX_ARTIFACTS)
    .map((value) => normalizeArtifact(value, options)).filter(Boolean);
}

module.exports = { MAX_ARTIFACTS, normalizeArtifact, normalizeArtifacts };
