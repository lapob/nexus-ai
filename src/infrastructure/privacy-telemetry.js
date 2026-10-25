/**
 * @module infrastructure/privacy-telemetry
 * @description Produce span campionati con attributi strettamente allowlist.
 */
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const ATTRIBUTE_ALLOWLIST = new Set([
  'component', 'operation', 'outcome', 'transport', 'client', 'tier',
  'statusCode', 'durationMs', 'queueMs', 'firstTokenMs', 'tokens', 'artifactCount'
]);

// #region Content-free span serialization
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

function createPrivacySpan({ name, startedAt = Date.now(), endedAt = Date.now(), attributes, context } = {}) {
  const safeName = String(name || 'nexus.operation').replace(/[^a-z0-9._-]/gi, '-').slice(0, 80);
  return Object.freeze({
    schema: 'nexusnxs.telemetry.v1',
    traceId: /^[a-f0-9]{32}$/.test(context?.traceId || '') ? context.traceId : crypto.randomBytes(16).toString('hex'),
    spanId: /^[a-f0-9]{16}$/.test(context?.spanId || '') ? context.spanId : crypto.randomBytes(8).toString('hex'),
    ...(/^[a-f0-9]{16}$/.test(context?.parentSpanId || '') ? { parentSpanId: context.parentSpanId } : {}),
    name: safeName,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Math.max(0, endedAt - startedAt),
    attributes: safeAttributes(attributes)
  });
}
// #endregion

// #region Async-local correlation; sampling inherited across the whole trace
class PrivacyTelemetry {
  constructor({ exporter = null, sampleRate = 0.1, random = Math.random } = {}) {
    this.exporter = typeof exporter === 'function' ? exporter : null;
    this.sampleRate = Math.max(0, Math.min(1, Number(sampleRate) || 0));
    this.random = random;
    this.context = new AsyncLocalStorage();
  }

  emit(input) {
    const parent = this.context.getStore();
    const sampled = parent ? parent.sampled : this.sampleRate > 0 && this.random() < this.sampleRate;
    if (!this.exporter || !sampled) return false;
    try {
      // Do not accept incoming trace IDs from HTTP bodies or caller input.
      this.exporter(createPrivacySpan({ ...input, context: parent ? {
        traceId: parent.traceId, parentSpanId: parent.spanId
      } : undefined }));
    } catch { return false; } // Observability must not fail a user request.
    return true;
  }

  async measure(name, attributes, operation) {
    if (typeof operation !== 'function') throw new TypeError('Operazione telemetria mancante.');
    const parent = this.context.getStore(), startedAt = Date.now(), started = performance.now();
    const context = { traceId: parent?.traceId || crypto.randomBytes(16).toString('hex'),
      spanId: crypto.randomBytes(8).toString('hex'), ...(parent ? { parentSpanId: parent.spanId } : {}),
      sampled: parent ? parent.sampled : Boolean(this.exporter && this.sampleRate > 0 && this.random() < this.sampleRate) };
    return this.context.run(context, async () => {
      let outcome = 'success';
      try { return await operation(); }
      catch (error) {
        outcome = error?.name === 'AbortError' || ['ABORT_ERR', 'VOICE_CANCELLED'].includes(error?.code) ? 'cancelled' : 'failure';
        throw error;
      } finally {
        if (context.sampled) {
          try { this.exporter(createPrivacySpan({ name, startedAt, endedAt: startedAt + Math.max(0, performance.now() - started),
            attributes: { ...attributes, outcome }, context })); } catch { /* Best effort, no content logging. */ }
        }
      }
    });
  }
}
// #endregion

module.exports = { ATTRIBUTE_ALLOWLIST, PrivacyTelemetry, createPrivacySpan, safeAttributes };
