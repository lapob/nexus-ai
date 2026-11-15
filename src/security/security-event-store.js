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

// Più processi (server, bridge, gateway di soccorso) possono scrivere lo stesso registro.
// Prima della sincronizzazione su disco ognuno concatenava dal proprio ultimo hash in memoria,
// creando biforcazioni innocue. Una catena è riparabile se ogni evento ha un hash integro e ogni
// previousHash è l'inizio o l'hash di un evento precedente presente: nessuna riga modificata o rimossa.
function benignForks(events = []) {
  const seen = new Set(['0'.repeat(64)]);
  let forks = 0;
  let previousHash = '0'.repeat(64);
  for (const event of events) {
    const { hash, ...base } = event || {};
    if (!hash || digest(base) !== hash || !seen.has(base.previousHash)) return -1;
    if (base.previousHash !== previousHash) forks += 1;
    seen.add(hash);
    previousHash = hash;
  }
  return forks;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rechain(events) {
  let previousHash = '0'.repeat(64);
  return events.map((event) => {
    const { hash: _hash, previousHash: _previousHash, ...rest } = event;
    const base = { ...rest, previousHash };
    const chained = { ...base, hash: digest(base) };
    previousHash = chained.hash;
    return chained;
  });
}

// #endregion
// #region Registro persistente

class SecurityEventStore {
  constructor({ filePath, retentionMs = RETENTION_MS } = {}) {
    this.filePath = filePath;
    this.retentionMs = retentionMs;
    this.invalidInput = false;
    this.recentKeys = new Map();
    this.repaired = 0;
    // Lettura, retention e riscrittura sotto blocco: un altro processo non perde righe nel frattempo.
    this.withLock(() => this.load());
    if (this.repaired) this.append('journal.repaired', { detail: `${this.repaired} biforcazioni da scrittori concorrenti; originale conservato` });
  }

  load() {
    const retentionMs = this.retentionMs;
    let loaded = this.read();
    // Validate the complete journal before retention can remove its prefix.
    // Re-chaining an already altered journal would otherwise hide evidence of
    // tampering when the store performs its normal retention compaction.
    if (!this.invalidInput && !validChain(loaded)) {
      const forks = benignForks(loaded);
      if (forks > 0) loaded = this.repairForks(loaded, forks);
      else this.invalidInput = true;
    }
    this.events = loaded.filter((event) => Date.now() - event.at <= retentionMs).slice(-MAX_EVENTS);
    if (!this.invalidInput && this.events.length !== loaded.length) {
      this.events = rechain(this.events);
    }
    this.lastHash = this.events.at(-1)?.hash || '0'.repeat(64);
    if (!this.invalidInput) this.rewrite();
    this.fileSize = this.currentSize();
  }

  repairForks(events, forks) {
    // L'originale resta accanto come prova; la catena si ricostruisce nello stesso ordine.
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
      const parsed = path.parse(this.filePath);
      fs.copyFileSync(this.filePath, path.join(parsed.dir, `${parsed.name}.fork-repaired.${stamp}${parsed.ext}`));
    } catch {
      this.invalidInput = true;
      return events;
    }
    this.repaired = forks;
    return rechain(events);
  }

  currentSize() {
    try { return fs.statSync(this.filePath).size; } catch { return 0; }
  }

  syncFromDisk() {
    // Un altro processo ha scritto: si riparte dalla sua coda, così la catena resta unica.
    const size = this.currentSize();
    if (size === this.fileSize) return;
    const loaded = this.read();
    // Un processo con codice precedente (es. app desktop installata) può ancora biforcare: è tollerato,
    // mentre una riga modificata o rimossa resta una violazione.
    if (!this.invalidInput && benignForks(loaded) < 0) this.invalidInput = true;
    this.events = loaded;
    this.lastHash = this.events.at(-1)?.hash || '0'.repeat(64);
    this.fileSize = size;
  }

  withLock(action) {
    // Blocco tra processi con file esclusivo: due append contemporanei non biforcano la catena.
    const lockPath = `${this.filePath}.lock`;
    let handle = null;
    for (let attempt = 0; attempt < 200 && handle === null; attempt += 1) {
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        handle = fs.openSync(lockPath, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') break;
        try { if (Date.now() - fs.statSync(lockPath).mtimeMs > 5_000) fs.rmSync(lockPath, { force: true }); } catch { /* già rilasciato */ }
        sleepSync(5);
      }
    }
    try { return action(); } finally {
      if (handle !== null) { try { fs.closeSync(handle); fs.rmSync(lockPath, { force: true }); } catch { /* best effort */ } }
    }
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
    return this.withLock(() => this.appendLocked(now, type, { severity, address, deviceId, deviceName, detail }));
  }

  appendLocked(now, type, { severity, address, deviceId, deviceName, detail }) {
    this.syncFromDisk();
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
    if (compact) {
      // Validate before removing the prefix, as during startup retention.
      // Never make a corrupted journal appear healthy by rebuilding its hashes.
      if (!this.invalidInput && benignForks(this.events) < 0) this.invalidInput = true;
      this.events = this.events.slice(-MAX_EVENTS);
      if (!this.invalidInput) this.events = rechain(this.events);
      this.lastHash = this.events.at(-1)?.hash || '0'.repeat(64);
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
      if (compact) this.rewrite();
    } catch { /* best effort */ }
    this.fileSize = this.currentSize();
    return this.events.at(-1);
  }

  verifyIntegrity() {
    return !this.invalidInput && benignForks(this.events) >= 0;
  }

  summary({ devices = [] } = {}) {
    this.syncFromDisk();
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
