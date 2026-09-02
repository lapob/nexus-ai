/**
 * @module security/security-event-store
 * @description Registro locale, limitato nel tempo e concatenato per gli eventi di sicurezza remota.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 10_000;

// #region Normalizzazione e integrità

function safeText(value, length = 160) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
}

function digest(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function validChain(events = []) {
  let previousHash = '0'.repeat(64);
  for (const event of events) {
    const { hash, ...base } = event || {};
    if (base.previousHash !== previousHash || digest(base) !== hash) return false;
    previousHash = hash;
  }
  return true;
}

// #endregion
// #region Registro persistente

class SecurityEventStore {
  constructor({ filePath, retentionMs = RETENTION_MS } = {}) {
    this.filePath = filePath;
    this.retentionMs = retentionMs;
    this.invalidInput = false;
    this.recentKeys = new Map();
    const loaded = this.read();
    // Validate the complete journal before retention can remove its prefix.
    // Re-chaining an already altered journal would otherwise hide evidence of
    // tampering when the store performs its normal retention compaction.
    if (!this.invalidInput && !validChain(loaded)) this.invalidInput = true;
    this.events = loaded.filter((event) => Date.now() - event.at <= retentionMs).slice(-MAX_EVENTS);
    if (!this.invalidInput && this.events.length !== loaded.length) {
      let previousHash = '0'.repeat(64);
      this.events = this.events.map((event) => {
        const { hash: _hash, previousHash: _previousHash, ...rest } = event;
        const base = { ...rest, previousHash };
        const chained = { ...base, hash: digest(base) };
        previousHash = chained.hash;
        return chained;
      });
    }
    this.lastHash = this.events.at(-1)?.hash || '0'.repeat(64);
    if (!this.invalidInput) this.rewrite();
  }

  read() {
    try {
      const events = [];
      for (const line of fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (!event || !Number.isFinite(event.at)) this.invalidInput = true;
          else events.push(event);
        } catch { this.invalidInput = true; }
      }
      return events;
    } catch { return []; }
  }

  rewrite() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const output = this.events.map((event) => JSON.stringify(event)).join('\n');
      fs.writeFileSync(this.filePath, output ? `${output}\n` : '', { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(this.filePath, 0o600);
    } catch { /* Il registro non deve arrestare NexusNXS. */ }
  }

  append(type, { severity = 'info', address = '', deviceId = '', deviceName = '', detail = '' } = {}) {
    const now = Date.now();
    const throttleKey = `${safeText(type, 64)}:${safeText(address, 64)}:${safeText(deviceId, 80)}`;
    const last = this.recentKeys.get(throttleKey) || 0;
    if (now - last < 10_000) return null;
    this.recentKeys.set(throttleKey, now);
    if (this.recentKeys.size > 2_000) {
      for (const [key, at] of this.recentKeys) if (now - at > 60_000) this.recentKeys.delete(key);
    }
    const base = {
      id: crypto.randomUUID(), at: now, type: safeText(type, 64),
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'info',
      address: safeText(address, 64), deviceId: safeText(deviceId, 80),
      deviceName: safeText(deviceName, 80), detail: safeText(detail, 240), previousHash: this.lastHash
    };
    const event = { ...base, hash: digest(base) };
    this.lastHash = event.hash;
    this.events.push(event);
    const compact = this.events.length > MAX_EVENTS;
    if (compact) this.events = this.events.slice(-MAX_EVENTS);
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
      if (compact) this.rewrite();
    } catch { /* best effort */ }
    return event;
  }

  verifyIntegrity() {
    return !this.invalidInput && validChain(this.events);
  }

  summary({ devices = [] } = {}) {
    const recent = this.events.filter((event) => event.at >= Date.now() - 86_400_000);
    const critical = recent.filter((event) => event.severity === 'critical').length;
    const warnings = recent.filter((event) => event.severity === 'warning').length;
    return {
      status: critical ? 'critical' : warnings ? 'attention' : 'protected', integrity: this.verifyIntegrity(),
      retentionDays: Math.round(this.retentionMs / 86_400_000),
      counts: { last24Hours: recent.length, warnings, critical },
      devices: devices.map(({ id, name, scope, createdAt, lastSeenAt }) => ({ id, name, scope, createdAt, lastSeenAt })),
      events: this.events.slice(-80).reverse().map(({ hash, previousHash, ...event }) => event)
    };
  }
}

// #endregion

module.exports = { SecurityEventStore, RETENTION_MS };
