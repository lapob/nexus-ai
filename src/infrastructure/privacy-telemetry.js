/**
 * @module infrastructure/privacy-telemetry
 * @description Produce span campionati con attributi strettamente allowlist.
 */
const crypto = require('node:crypto');

const ATTRIBUTE_ALLOWLIST = new Set([
  'component', 'operation', 'outcome', 'transport', 'client', 'tier',
  'statusCode', 'durationMs', 'queueMs', 'tokens', 'artifactCount'
]);

function safeAttributes(attributes = {}) {
  const result = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!ATTRIBUTE_ALLOWLIST.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean') result[key] = value;
    else if (typeof value === 'string') result[key] = value.slice(0, 80);
  }
  return Object.freeze(result);
}

function createPrivacySpan({ name, startedAt = Date.now(), endedAt = Date.now(), attributes } = {}) {
  const safeName = String(name || 'nexus.operation').replace(/[^a-z0-9._-]/gi, '-').slice(0, 80);
  return Object.freeze({
    schema: 'nexusnxs.telemetry.v1',
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
    name: safeName,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Math.max(0, endedAt - startedAt),
    attributes: safeAttributes(attributes)
  });
}

class PrivacyTelemetry {
  constructor({ exporter = null, sampleRate = 0.1, random = Math.random } = {}) {
    this.exporter = typeof exporter === 'function' ? exporter : null;
    this.sampleRate = Math.max(0, Math.min(1, Number(sampleRate) || 0));
    this.random = random;
  }

  emit(input) {
    if (!this.exporter || this.random() > this.sampleRate) return false;
    this.exporter(createPrivacySpan(input));
    return true;
  }
}

module.exports = { ATTRIBUTE_ALLOWLIST, PrivacyTelemetry, createPrivacySpan, safeAttributes };
