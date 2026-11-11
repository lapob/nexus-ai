/**
 * @module remote/device-notification-relay
 * @description Inoltro locale degli eventi di notifica dalla UI desktop al Core
 * headless che possiede il gateway. La UI scrive piccoli file JSON opachi in
 * una cartella dei dati condivisi (solo proprietario); il Core li valida, li
 * applica al proprio hub e li elimina. Nessuna porta, nessun contenuto di chat:
 * solo operazione, tipo, riferimento opaco, durata e scadenza.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Formato e validazione

const RELAY_SCHEMA = 'nexusnxs.device-notification-relay.v1';
const MAX_FILES = 64;
const MAX_FILE_BYTES = 1_024;
const MAX_AGE_MS = 15 * 60 * 1000;
const SCAN_INTERVAL_MS = 2_000;
const KINDS = new Set(['response-ready', 'consent-required']);
const REFERENCE = /^[A-Za-z0-9:_-]{1,200}$/;
const FILE_NAME = /^\d{13}-[0-9a-f-]{36}\.json$/;

function relayRecord(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || value.schema !== RELAY_SCHEMA) return null;
  const createdAt = Number(value.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > now + 60_000 || now - createdAt > MAX_AGE_MS) return null;
  const reference = String(value.reference || '');
  if (!REFERENCE.test(reference)) return null;
  if (value.op === 'resolve') return { op: 'resolve', reference };
  if (value.op !== 'publish' || !KINDS.has(value.kind)) return null;
  const durationMs = Math.max(0, Number(value.durationMs) || 0);
  const expiresAt = Math.max(0, Number(value.expiresAt) || 0);
  return { op: 'publish', kind: value.kind, reference, durationMs, expiresAt };
}

// #endregion

// #region 02 — Scrittore (UI) e lettore (Core)

/**
 * Lato UI: stessa interfaccia dell'hub (publish/resolve). Quando `shouldRelay`
 * è falso (nessun Core indipendente), gli eventi restano nell'hub locale.
 */
function createRelayPublisher({ directory, localHub, shouldRelay = () => true, now = () => Date.now(), logger = null }) {
  const write = (record) => {
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const pending = fs.readdirSync(directory).filter((name) => FILE_NAME.test(name));
      if (pending.length >= MAX_FILES) return false;
      const createdAt = now();
      const name = `${createdAt}-${crypto.randomUUID()}.json`;
      const temporary = path.join(directory, `.${name}.tmp`);
      fs.writeFileSync(temporary, JSON.stringify({ schema: RELAY_SCHEMA, createdAt, ...record }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, path.join(directory, name));
      return true;
    } catch (error) {
      logger?.warn?.('Evento notifica non inoltrato al Core.', { error: error?.message || String(error) });
      return false;
    }
  };
  // Sul disco va solo un'impronta del riferimento, coerente tra publish e resolve.
  const opaque = (reference) => `ui:${crypto.createHash('sha256').update(String(reference || '')).digest('hex').slice(0, 40)}`;
  return {
    publish(kind, { reference = '', durationMs = 0, expiresAt = 0 } = {}) {
      if (!shouldRelay()) return localHub?.publish(kind, { reference, durationMs, expiresAt }) ?? null;
      return write({ op: 'publish', kind, reference: opaque(reference), durationMs: Number(durationMs) || 0, expiresAt: Number(expiresAt) || 0 }) ? { relayed: true } : null;
    },
    resolve(reference) {
      localHub?.resolve(reference);
      if (shouldRelay()) write({ op: 'resolve', reference: opaque(reference) });
      return true;
    }
  };
}

/** Lato Core: applica i file validi all'hub e li rimuove sempre, validi o no. */
function drainRelay({ directory, hub, now = Date.now() }) {
  let entries;
  try { entries = fs.readdirSync(directory); }
  catch { return 0; }
  let applied = 0;
  for (const name of entries.filter((entry) => FILE_NAME.test(entry)).sort()) {
    const filePath = path.join(directory, name);
    let record = null;
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size <= MAX_FILE_BYTES) record = relayRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')), now);
    } catch { record = null; }
    try { fs.rmSync(filePath, { force: true }); } catch {}
    if (!record) continue;
    if (record.op === 'resolve') hub.resolve(record.reference);
    else hub.publish(record.kind, record);
    applied++;
  }
  return applied;
}

function startRelayReader({ directory, hub, intervalMs = SCAN_INTERVAL_MS, logger = null }) {
  try { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); } catch {}
  const drain = () => {
    try { drainRelay({ directory, hub }); }
    catch (error) { logger?.warn?.('Relay notifiche non leggibile.', { error: error?.message || String(error) }); }
  };
  drain();
  let watcher = null;
  try { watcher = fs.watch(directory, { persistent: false }, () => drain()); } catch { watcher = null; }
  // Rete di sicurezza economica: fs.watch può perdere eventi su alcuni volumi.
  const timer = setInterval(drain, intervalMs);
  timer.unref?.();
  return () => { clearInterval(timer); try { watcher?.close(); } catch {} };
}

// #endregion

module.exports = { RELAY_SCHEMA, createRelayPublisher, drainRelay, startRelayReader, relayRecord };
