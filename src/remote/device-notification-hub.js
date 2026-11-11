/**
 * @module remote/device-notification-hub
 * @description Eventi di notifica opachi per i dispositivi privati associati:
 * "risposta pronta" e "consenso richiesto". Nessun contenuto della chat, del
 * prompt o dell'azione lascia il server: solo tipo, cursore, scadenza e deep
 * link generico. Il riferimento interno serve soltanto a deduplicare e ritirare.
 */
const crypto = require('node:crypto');

// #region 01 — Contratto pubblico

const NOTIFICATION_KINDS = Object.freeze({
  'response-ready': Object.freeze({ link: 'nexusnxs-control://open/response', ttlMs: 30 * 60 * 1000 }),
  'consent-required': Object.freeze({ link: 'nexusnxs-control://open/consent', ttlMs: 10 * 60 * 1000 })
});
const DEFAULT_LONG_GENERATION_MS = 20_000;
const DEFAULT_CONSENT_GRACE_MS = 20_000;
const MAX_WAIT_MS = 55_000;
const MAX_EVENTS = 64;
const MAX_WAITERS = 32;
const MAX_PENDING = 64;

function publicEvent(entry) {
  return Object.freeze({
    id: entry.id,
    cursor: entry.cursor,
    kind: entry.kind,
    link: NOTIFICATION_KINDS[entry.kind].link,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt
  });
}

// #endregion

// #region 02 — Hub in memoria con long-poll

class DeviceNotificationHub {
  constructor({
    now = () => Date.now(),
    setTimer = (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref?.(); return timer; },
    clearTimer = (timer) => clearTimeout(timer),
    longGenerationMs = DEFAULT_LONG_GENERATION_MS,
    consentGraceMs = DEFAULT_CONSENT_GRACE_MS,
    maxEvents = MAX_EVENTS,
    maxWaiters = MAX_WAITERS
  } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.longGenerationMs = Math.max(0, Number(longGenerationMs) || 0);
    this.consentGraceMs = Math.max(0, Number(consentGraceMs) || 0);
    this.maxEvents = Math.max(1, maxEvents);
    this.maxWaiters = Math.max(1, maxWaiters);
    // L'istanza cambia a ogni avvio: un cursore salvato dal telefono prima di
    // un riavvio del server non deve nascondere i nuovi eventi.
    this.instance = crypto.randomUUID();
    this.cursor = 0;
    this.events = [];
    this.pending = new Map();
    this.waiters = new Set();
    this.listeners = new Set();
    this.closed = false;
  }

  /**
   * Pubblica un evento. `response-ready` richiede `durationMs` >= soglia di
   * generazione lunga; `consent-required` attende una breve tolleranza così
   * una conferma data subito al computer non fa vibrare il telefono.
   */
  publish(kind, { reference = '', durationMs = 0, expiresAt = 0 } = {}) {
    if (this.closed || !NOTIFICATION_KINDS[kind]) return null;
    const ref = String(reference || '').slice(0, 200);
    if (kind === 'response-ready' && !(Number(durationMs) >= this.longGenerationMs)) return null;
    const ttl = NOTIFICATION_KINDS[kind].ttlMs;
    const limit = Number(expiresAt) > 0 ? Math.min(Number(expiresAt), this.now() + ttl) : this.now() + ttl;
    if (kind === 'consent-required' && this.consentGraceMs > 0) {
      if (!ref || this.pending.has(ref)) return null;
      if (this.pending.size >= MAX_PENDING) return null;
      const timer = this.setTimer(() => {
        this.pending.delete(ref);
        if (limit > this.now()) this.append(kind, ref, limit);
      }, this.consentGraceMs);
      this.pending.set(ref, timer);
      return { scheduled: true };
    }
    return this.append(kind, ref, limit);
  }

  append(kind, reference, expiresAt) {
    if (this.closed) return null;
    this.prune();
    // Un nuovo evento per lo stesso riferimento sostituisce il precedente.
    if (reference) this.events = this.events.filter((entry) => !(entry.kind === kind && entry.reference === reference));
    const entry = {
      id: crypto.randomUUID(), cursor: ++this.cursor, kind, reference,
      createdAt: this.now(), expiresAt, resolved: false
    };
    this.events.push(entry);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    const event = publicEvent(entry);
    for (const listener of [...this.listeners]) {
      try { listener(event, this.instance); } catch { /* un listener guasto non blocca gli altri */ }
    }
    this.flushWaiters();
    return event;
  }

  /** Ritira un consenso deciso, annullato o scaduto (anche se ancora in tolleranza). */
  resolve(reference) {
    const ref = String(reference || '');
    if (!ref) return false;
    const timer = this.pending.get(ref);
    if (timer !== undefined) { this.clearTimer(timer); this.pending.delete(ref); }
    let changed = timer !== undefined;
    for (const entry of this.events) {
      if (entry.reference === ref && !entry.resolved) { entry.resolved = true; changed = true; }
    }
    return changed;
  }

  prune() {
    const now = this.now();
    this.events = this.events.filter((entry) => !entry.resolved && entry.expiresAt > now);
  }

  /**
   * Senza cursore valido (o dopo un riavvio) restituisce solo la base corrente:
   * il telefono riceve gli eventi successivi, non lo storico.
   */
  list({ since, instance } = {}) {
    this.prune();
    const parsed = Number(since);
    const sameInstance = String(instance || '') === this.instance;
    const baseline = since === undefined || since === null || since === '' || !Number.isSafeInteger(parsed) || parsed < 0;
    // Dopo un riavvio il vecchio cursore non ha significato: si parte da zero.
    const from = baseline ? this.cursor : (sameInstance ? Math.min(parsed, this.cursor) : 0);
    const events = this.events.filter((entry) => entry.cursor > from).map(publicEvent);
    return { instance: this.instance, cursor: this.cursor, events };
  }

  wait({ since, instance, timeoutMs = 0, signal } = {}) {
    const immediate = this.list({ since, instance });
    const timeout = Math.max(0, Math.min(MAX_WAIT_MS, Number(timeoutMs) || 0));
    if (immediate.events.length || timeout === 0 || this.closed || signal?.aborted) return Promise.resolve(immediate);
    if (this.waiters.size >= this.maxWaiters) return Promise.resolve({ ...immediate, retryAfterMs: 15_000 });
    const from = immediate.cursor;
    return new Promise((resolve) => {
      const waiter = { from, done: null };
      const finish = () => {
        if (!this.waiters.has(waiter)) return;
        this.waiters.delete(waiter);
        this.clearTimer(timer);
        signal?.removeEventListener?.('abort', finish);
        resolve(this.list({ since: from, instance: this.instance }));
      };
      waiter.done = finish;
      const timer = this.setTimer(finish, timeout);
      signal?.addEventListener?.('abort', finish, { once: true });
      this.waiters.add(waiter);
    });
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) if (this.cursor > waiter.from) waiter.done();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status() {
    this.prune();
    return { instance: this.instance, cursor: this.cursor, active: this.events.length, pendingConsents: this.pending.size, waiters: this.waiters.size };
  }

  close() {
    this.closed = true;
    for (const timer of this.pending.values()) this.clearTimer(timer);
    this.pending.clear();
    for (const waiter of [...this.waiters]) waiter.done();
    this.listeners.clear();
  }
}

// #endregion

module.exports = { DeviceNotificationHub, NOTIFICATION_KINDS, DEFAULT_LONG_GENERATION_MS, DEFAULT_CONSENT_GRACE_MS, MAX_WAIT_MS };
