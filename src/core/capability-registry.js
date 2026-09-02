/**
 * @module core/capability-registry
 * @description Pubblica e negozia capacità NexusNXS senza dettagli infrastrutturali.
 */
const crypto = require('node:crypto');

// #region 01 — Catalogo e normalizzazione

const CAPABILITY_ORDER = Object.freeze([
  'chat',
  'attachments',
  'voice-input',
  'voice-output',
  'web-research',
  'image-generation',
  'artifacts',
  'continuity',
  'device-actions',
  'workflows',
  'plugins'
]);

const PUBLIC_CAPABILITIES = new Set([
  'chat', 'attachments', 'voice-input', 'voice-output', 'web-research',
  'image-generation', 'artifacts', 'continuity'
]);

const VALID_STATES = new Set(['available', 'degraded', 'unavailable']);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeState(value) {
  if (value === true) return 'available';
  if (value === false || value == null) return 'unavailable';
  const state = typeof value === 'string' ? value : value.state;
  return VALID_STATES.has(state) ? state : 'unavailable';
}

function normalizeFeature(id, feature) {
  const state = normalizeState(feature);
  const source = feature && typeof feature === 'object' ? feature : {};
  const normalized = { id, state };
  if (source.mode && typeof source.mode === 'string') normalized.mode = source.mode.slice(0, 48);
  if (source.requiresConsent === true) normalized.requiresConsent = true;
  return Object.freeze(normalized);
}

// #endregion

// #region 02 — Manifesto e negoziazione

function createCapabilityManifest({ audience = 'public', features = {}, signer = null, now = Date.now() } = {}) {
  const isPublic = audience !== 'private';
  const capabilities = CAPABILITY_ORDER
    .filter((id) => !isPublic || PUBLIC_CAPABILITIES.has(id))
    .map((id) => normalizeFeature(id, features[id]));
  const body = {
    schema: 'nexusnxs.capabilities.v1',
    product: 'NexusNXS AI',
    audience: isPublic ? 'public' : 'private',
    issuedAt: new Date(now).toISOString(),
    capabilities
  };
  const digest = crypto.createHash('sha256').update(canonicalJson(body)).digest('base64url');
  const manifest = { ...body, digest };
  if (typeof signer === 'function') {
    const signature = signer(Buffer.from(digest, 'utf8'));
    if (signature) manifest.signature = Buffer.isBuffer(signature) ? signature.toString('base64url') : String(signature);
  }
  return Object.freeze(manifest);
}

function negotiateCapabilities(manifest, requested = []) {
  const known = new Map((manifest?.capabilities || []).map((entry) => [entry.id, entry]));
  const unique = [...new Set(requested.filter((id) => typeof id === 'string'))];
  return Object.freeze({
    accepted: unique.filter((id) => known.get(id)?.state === 'available'),
    degraded: unique.filter((id) => known.get(id)?.state === 'degraded'),
    rejected: unique.filter((id) => !known.has(id) || known.get(id)?.state === 'unavailable')
  });
}

module.exports = { CAPABILITY_ORDER, createCapabilityManifest, negotiateCapabilities };

// #endregion
