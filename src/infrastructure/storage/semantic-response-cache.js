/**
 * @module infrastructure/storage/semantic-response-cache
 * @description Cache locale prudente per risposte stabili e già validate.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { closeDatabase, configureDatabase } = require('./sqlite-durability');

// #region Normalizzazione e guardrail semantici

const UNSAFE_TO_CACHE = /\b(?:oggi|domani|ieri|adesso|ora|prezzo|meteo|notizie|versione attuale|ultimo|today|tomorrow|yesterday|now|price|weather|news|latest|current|hoy|mañana|ayer|ahora|precio|clima|noticias|actual|aujourd['’]hui|demain|hier|maintenant|prix|météo|actualités|actuel|heute|morgen|gestern|jetzt|preis|wetter|nachrichten|aktuell|apri|avvia|chiudi|crea|modifica|elimina|esegui|password|token|secret|api[ -]?key)\b/iu;
const CONTRAST_TOKENS = new Set([
  'non', 'senza', 'no', 'not', 'without', 'never', 'mai',
  'abilita', 'abilitare', 'attiva', 'attivare', 'enable', 'allow', 'consenti', 'consentire',
  'disabilita', 'disabilitare', 'disattiva', 'disattivare', 'disable', 'deny', 'nega', 'negare',
  'prima', 'before', 'dopo', 'after', 'interno', 'internal', 'esterno', 'external',
  'pubblico', 'public', 'privato', 'private', 'minimo', 'minimum', 'massimo', 'maximum'
]);
function normalize(value) { return String(value || '').toLocaleLowerCase('it-IT').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokens(value) { return new Set(normalize(value).split(' ').filter((token) => token.length > 2)); }
function similarity(left, right) {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}
function semanticGuards(value) {
  const normalized = normalize(value);
  const guarded = normalized.split(' ').filter((token) => CONTRAST_TOKENS.has(token)).sort();
  const quantities = [...String(value || '').matchAll(/\b\d+(?:[.,]\d+)?(?:\s*(?:ms|s|sec|secondi?|min|minuti?|h|ore|kb|mb|gb|tb|%))?\b/giu)]
    .map((match) => match[0].toLocaleLowerCase('it-IT').replace(/\s+/g, ''))
    .sort();
  return { guarded, quantities };
}
function compatibleQuestions(left, right) {
  const a = semanticGuards(left); const b = semanticGuards(right);
  return a.guarded.join('|') === b.guarded.join('|') && a.quantities.join('|') === b.quantities.join('|');
}
function cacheableQuestion(question) { const text = String(question || '').trim(); return text.length >= 12 && text.length <= 1000 && !UNSAFE_TO_CACHE.test(text); }

// #endregion
// #region Archivio SQLite

class SemanticResponseCache {
  constructor({ filePath, ttlMs = 7 * 86_400_000, limit = 300, encrypt = null, decrypt = null } = {}) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    try {
      configureDatabase(database);
      this.database = database; this.ttlMs = ttlMs; this.limit = limit; this.encrypt = encrypt; this.decrypt = decrypt;
      this.database.exec(`CREATE TABLE IF NOT EXISTS response_cache(
        id INTEGER PRIMARY KEY, namespace TEXT NOT NULL, question TEXT NOT NULL, normalized TEXT NOT NULL,
        answer TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS response_cache_namespace ON response_cache(namespace, created_at DESC);
        CREATE INDEX IF NOT EXISTS response_cache_lookup ON response_cache(namespace, normalized);`);
    } catch (error) {
      try { database.close(); } catch { /* conserva l'errore di apertura originale */ }
      throw error;
    }
  }
  find(question, { namespace = 'default', threshold = 0.92 } = {}) {
    if (!cacheableQuestion(question)) return null;
    const now = Date.now();
    this.database.prepare('DELETE FROM response_cache WHERE created_at < ?').run(now - this.ttlMs);
    const normalized = normalize(question);
    const exact = this.database.prepare('SELECT * FROM response_cache WHERE namespace=? AND normalized=? ORDER BY last_used_at DESC LIMIT 1').get(namespace, normalized);
    const rows = exact ? [] : this.database.prepare('SELECT * FROM response_cache WHERE namespace=? ORDER BY last_used_at DESC LIMIT ?').all(namespace, this.limit);
    const match = exact
      ? { row: exact, score: 1, matchType: 'exact' }
      : rows.filter((row) => compatibleQuestions(question, row.question))
        .map((row) => ({ row, score: similarity(question, row.question), matchType: 'semantic' }))
        .sort((a, b) => b.score - a.score)[0];
    if (!match || match.score < threshold) return null;
    this.database.prepare('UPDATE response_cache SET hits=hits+1,last_used_at=? WHERE id=?').run(now, match.row.id);
    let answer = match.row.answer;
    if (answer.startsWith('enc:')) {
      try { answer = this.decrypt ? this.decrypt(answer.slice(4)) : ''; } catch { answer = ''; }
    }
    if (!answer) { this.database.prepare('DELETE FROM response_cache WHERE id=?').run(match.row.id); return null; }
    return { answer, model: match.row.model, score: match.score, matchType: match.matchType };
  }
  put(question, answer, { namespace = 'default', model = 'unknown' } = {}) {
    if (!cacheableQuestion(question) || !String(answer || '').trim() || String(answer).length > 20_000) return false;
    const now = Date.now(); const normalized = normalize(question);
    this.database.prepare('DELETE FROM response_cache WHERE namespace=? AND normalized=?').run(namespace, normalized);
    const protectedAnswer = this.encrypt ? `enc:${this.encrypt(String(answer).trim())}` : String(answer).trim();
    this.database.prepare('INSERT INTO response_cache(namespace,question,normalized,answer,model,created_at,last_used_at) VALUES(?,?,?,?,?,?,?)')
      .run(namespace, String(question).trim(), normalized, protectedAnswer, String(model), now, now);
    this.database.prepare('DELETE FROM response_cache WHERE id IN (SELECT id FROM response_cache ORDER BY last_used_at DESC LIMIT -1 OFFSET ?)').run(this.limit);
    return true;
  }
  clear() { return this.database.prepare('DELETE FROM response_cache').run().changes; }
  stats() {
    const row = this.database.prepare('SELECT COUNT(*) AS entries, COALESCE(SUM(hits),0) AS hits FROM response_cache').get();
    return { entries: Number(row.entries || 0), hits: Number(row.hits || 0) };
  }
  close() { closeDatabase(this.database); }
}

// #endregion

module.exports = { SemanticResponseCache, cacheableQuestion, compatibleQuestions, similarity };
