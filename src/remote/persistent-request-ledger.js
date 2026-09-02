/**
 * @module remote/persistent-request-ledger
 * @description Registro atomico e a scadenza per rendere idempotenti le richieste pubbliche.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region Formato persistente e limiti

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const MAX_STREAM_CHARS = 80_000;
const DEFAULT_MAX_CONTENT_CHARS = 16 * 1024 * 1024;

function cleanEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const status = ['running', 'complete', 'interrupted'].includes(value.status) ? value.status : null;
  if (!status || typeof value.fingerprint !== 'string') return null;
  return {
    fingerprint: value.fingerprint.slice(0, 128),
    status,
    createdAt: Number(value.createdAt || 0),
    updatedAt: Number(value.updatedAt || 0),
    content: String(value.content || '').slice(0, MAX_STREAM_CHARS),
    result: value.result && typeof value.result === 'object'
      ? {
          message: String(value.result.message || '').slice(0, MAX_STREAM_CHARS),
          completedAt: Number(value.result.completedAt || value.updatedAt || 0)
        }
      : null
  };
}

// #endregion

// #region Ledger idempotente

class PersistentRequestLedger {
  constructor({ filePath, ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, maxContentChars = DEFAULT_MAX_CONTENT_CHARS, now = () => Date.now(), persistDelayMs = 120 } = {}) {
    if (!filePath) throw new Error('Percorso ledger richieste mancante.');
    this.filePath = filePath;
    this.ttlMs = Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.maxEntries = Math.max(100, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
    this.maxContentChars = Math.max(MAX_STREAM_CHARS, Number(maxContentChars) || DEFAULT_MAX_CONTENT_CHARS);
    this.now = now;
    this.persistDelayMs = Math.max(0, Number(persistDelayMs) || 0);
    this.entries = new Map();
    this.persistTimer = null;
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const [key, raw] of Object.entries(parsed?.entries || {})) {
        if (!/^[a-f0-9]{64}$/i.test(key)) continue;
        const entry = cleanEntry(raw);
        if (!entry) continue;
        // Dopo un riavvio non esiste più un'inferenza proprietaria. Una richiesta
        // senza token è quindi ripetibile; una risposta parziale resta invece
        // interrotta per impedire che venga generata una seconda continuazione.
        if (entry.status === 'running') {
          if (!entry.content) continue;
          entry.status = 'interrupted';
          entry.updatedAt = this.now();
        }
        this.entries.set(key, entry);
      }
      this.prune({ persist: false });
    } catch { /* Il primo avvio non ha ancora un ledger. */ }
  }

  prune({ persist = true } = {}) {
    const cutoff = this.now() - this.ttlMs;
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (entry.updatedAt < cutoff) { this.entries.delete(key); changed = true; }
    }
    if (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt);
      for (const [key] of oldest.slice(0, this.entries.size - this.maxEntries)) {
        this.entries.delete(key);
        changed = true;
      }
    }
    let contentChars = [...this.entries.values()].reduce((total, entry) => total + entry.content.length, 0);
    if (contentChars > this.maxContentChars) {
      const oldest = [...this.entries.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt);
      for (const [key, entry] of oldest) {
        if (contentChars <= this.maxContentChars) break;
        this.entries.delete(key);
        contentChars -= entry.content.length;
        changed = true;
      }
    }
    if (changed && persist) this.schedulePersist();
  }

  inspect(key, fingerprint) {
    this.prune();
    const entry = this.entries.get(key);
    if (!entry) return { state: 'missing', entry: null };
    if (entry.fingerprint !== fingerprint) return { state: 'conflict', entry };
    return { state: entry.status, entry: { ...entry, result: entry.result ? { ...entry.result } : null } };
  }

  begin(key, fingerprint) {
    const current = this.inspect(key, fingerprint);
    if (current.state !== 'missing') return current;
    const at = this.now();
    const entry = { fingerprint, status: 'running', createdAt: at, updatedAt: at, content: '', result: null };
    this.entries.set(key, entry);
    this.persistNow();
    return { state: 'started', entry: { ...entry } };
  }

  append(key, token) {
    const entry = this.entries.get(key);
    if (!entry || entry.status !== 'running') return 0;
    const text = String(token || '');
    if (!text) return entry.content.length;
    entry.content = `${entry.content}${text}`.slice(0, MAX_STREAM_CHARS);
    entry.updatedAt = this.now();
    this.schedulePersist();
    return entry.content.length;
  }

  complete(key, result) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const at = this.now();
    const cleanResult = {
      message: String(result?.message || '').slice(0, MAX_STREAM_CHARS),
      completedAt: Number(result?.completedAt || at)
    };
    entry.status = 'complete';
    entry.updatedAt = at;
    entry.result = cleanResult;
    // Il messaggio finale è autorevole anche quando il provider ha emesso token
    // raggruppati o ha corretto la risposta prima del completamento.
    entry.content = cleanResult.message;
    this.prune({ persist: false });
    this.persistNow();
    return { ...cleanResult };
  }

  fail(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (!entry.content) this.entries.delete(key);
    else {
      entry.status = 'interrupted';
      entry.updatedAt = this.now();
      entry.result = null;
    }
    this.persistNow();
  }

  replay(key, cursor = 0) {
    const entry = this.entries.get(key);
    if (!entry) return { cursor: 0, token: '', state: 'missing', result: null };
    const safeCursor = Math.max(0, Math.min(entry.content.length, Number(cursor) || 0));
    return {
      cursor: entry.content.length,
      token: entry.content.slice(safeCursor),
      state: entry.status,
      result: entry.result ? { ...entry.result } : null
    };
  }

  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, this.persistDelayMs);
    this.persistTimer.unref?.();
  }

  persistNow() {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    const entries = Object.fromEntries(this.entries);
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, entries }), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch { /* Windows applica le ACL della cartella. */ }
  }

  close() { this.persistNow(); }
}

// #endregion

module.exports = { PersistentRequestLedger, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES, DEFAULT_MAX_CONTENT_CHARS, MAX_STREAM_CHARS };
