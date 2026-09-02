/**
 * @module application/proactive-event-bus
 * @description Distribuisce segnali di sistema metadata-only senza eseguire azioni autonome.
 */
const crypto = require('node:crypto');

// #region Policy and sanitization
const EVENT_POLICY = Object.freeze({
  'system.resume': Object.freeze({ severity: 'info', requiresApproval: false }),
  'system.suspend': Object.freeze({ severity: 'info', requiresApproval: false }),
  'power.source': Object.freeze({ severity: 'info', requiresApproval: false }),
  'network.status': Object.freeze({ severity: 'info', requiresApproval: false }),
  'security.alert': Object.freeze({ severity: 'warning', requiresApproval: true }),
  'update.available': Object.freeze({ severity: 'info', requiresApproval: true }),
  'device.health': Object.freeze({ severity: 'warning', requiresApproval: true })
});

function cleanText(value, maximum = 120) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function normalizeMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
  const allowed = ['state', 'source', 'category', 'code', 'summary', 'version'];
  return Object.freeze(Object.fromEntries(allowed.flatMap((key) => {
    const text = cleanText(value[key], key === 'summary' ? 180 : 80);
    return text ? [[key, text]] : [];
  })));
}

function quietMinute(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

function normalizeQuietHours(value) {
  if (!value || value === 'off' || value.enabled === false) return Object.freeze({ enabled: false, start: 0, end: 0 });
  let start;
  let end;
  if (typeof value === 'string') [start, end] = value.split('-');
  else ({ start, end } = value);
  const startMinute = quietMinute(start);
  const endMinute = quietMinute(end);
  if (startMinute === null || endMinute === null || startMinute === endMinute) {
    return Object.freeze({ enabled: false, start: 0, end: 0 });
  }
  return Object.freeze({ enabled: true, start: startMinute, end: endMinute });
}

function isQuietTime(timestamp, quietHours) {
  if (!quietHours?.enabled) return false;
  const date = new Date(timestamp);
  const minute = date.getHours() * 60 + date.getMinutes();
  return quietHours.start < quietHours.end
    ? minute >= quietHours.start && minute < quietHours.end
    : minute >= quietHours.start || minute < quietHours.end;
}
// #endregion

// #region Event bus
class ProactiveEventBus {
  constructor({ logger = console, now = Date.now, dedupeMs = 15_000, historyLimit = 64, quietHours = false } = {}) {
    this.logger = logger;
    this.now = now;
    this.dedupeMs = Math.max(1_000, Number(dedupeMs) || 15_000);
    this.historyLimit = Math.max(8, Math.min(256, Number(historyLimit) || 64));
    this.listeners = new Set();
    this.events = [];
    this.lastSeen = new Map();
    this.quietHours = normalizeQuietHours(quietHours);
    this.closed = false;
  }

  publish(type, metadata = {}) {
    if (this.closed || !Object.prototype.hasOwnProperty.call(EVENT_POLICY, type)) return null;
    const normalized = normalizeMetadata(metadata);
    const fingerprint = crypto.createHash('sha256').update(`${type}\u0000${JSON.stringify(normalized)}`).digest('hex');
    const time = this.now();
    const previous = this.lastSeen.get(fingerprint);
    if (previous !== undefined && time - previous < this.dedupeMs) return null;
    this.lastSeen.set(fingerprint, time);
    const policy = EVENT_POLICY[type];
    // Le quiet hours silenziano solo segnali informativi. Avvisi di sicurezza,
    // salute e ogni evento che richiede consenso restano sempre visibili.
    const urgentState = ['offline', 'degraded', 'critical'].includes(normalized.state);
    const quiet = policy.severity === 'info' && !policy.requiresApproval && !urgentState && isQuietTime(time, this.quietHours);
    const event = Object.freeze({
      id: crypto.randomUUID(), type, createdAt: time,
      severity: policy.severity,
      requiresApproval: policy.requiresApproval,
      delivery: quiet ? 'quiet' : 'immediate',
      metadata: normalized
    });
    this.events.push(event);
    this.events.splice(0, Math.max(0, this.events.length - this.historyLimit));
    if (!quiet) {
      for (const listener of [...this.listeners]) {
        try { listener(event); } catch (error) { this.logger.warn?.('Consumer proattivo isolato dopo un errore.', { error }); }
      }
    }
    return event;
  }

  subscribe(listener) {
    if (typeof listener !== 'function' || this.closed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(limit = 20) {
    return this.events.slice(-Math.max(1, Math.min(64, Number(limit) || 20)));
  }

  close() {
    this.closed = true;
    this.listeners.clear();
    this.events = [];
    this.lastSeen.clear();
  }
}
// #endregion

module.exports = { EVENT_POLICY, ProactiveEventBus, isQuietTime, normalizeMetadata, normalizeQuietHours };
