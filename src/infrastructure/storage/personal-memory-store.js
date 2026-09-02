/**
 * @module infrastructure/storage/personal-memory-store
 * @description Memoria personale esplicita, verificabile e indipendente dalla knowledge.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { closeDatabase, configureDatabase } = require('./sqlite-durability');

const MEMORY_TYPES = new Set(['preference', 'semantic', 'project', 'procedural', 'episodic']);
const STOPWORDS = new Set(['che', 'con', 'del', 'della', 'delle', 'degli', 'dei', 'per', 'una', 'uno', 'sono', 'come', 'this', 'that', 'with', 'from', 'the', 'and']);

// #region Normalizzazione e istruzioni esplicite

function normalizeText(value, max = 2000) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function memoryKey(value) {
  return normalizeText(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return [...new Set(memoryKey(value).split(' ').filter((token) => token.length >= 3 && !STOPWORDS.has(token)))];
}

function exclusiveMemorySubject(content, type) {
  if (!['preference', 'semantic'].includes(type)) return '';
  const clean = normalizeText(content);
  const personal = clean.match(/^(?:(?:la|il)\s+mi[ao]|my)\s+(.{2,80}?)\s+(?:è|e|is)\s+.+$/iu);
  if (personal) return memoryKey(`${type}:personal:${personal[1]}`);
  const preferred = clean.match(/^(?:la|il|the)?\s*(lingua|language|tema|theme|voce|voice|nome|name|colore|color|modello|model)\s+preferit[ao]?\s+(?:è|e|is)\s+.+$/iu);
  return preferred ? memoryKey(`${type}:preferred:${preferred[1]}`) : '';
}

function classifyMemory(content) {
  const text = content.toLocaleLowerCase('it-IT');
  if (/\b(?:preferisco|mi piace|voglio che|stile|prefer|i like)\b/.test(text)) return 'preference';
  if (/\b(?:progetto|repository|cartella|workspace|nexus)\b/.test(text)) return 'project';
  if (/\b(?:procedura|ogni volta|quando faccio|workflow|devi sempre)\b/.test(text)) return 'procedural';
  if (/\b(?:ieri|oggi|domani|evento|appuntamento|successo)\b/.test(text)) return 'episodic';
  return 'semantic';
}

function explicitMemoryInstruction(question) {
  const text = normalizeText(question, 12_000);
  const remember = text.match(/^\s*(?:nexus[,;:]?\s*)?(?:ricorda(?:ti)?\s+che|memorizza(?:\s+che)?|remember\s+that)\s+(.+)$/iu);
  if (remember) return { action: 'remember', content: normalizeText(remember[1]), type: classifyMemory(remember[1]) };
  const forget = text.match(/^\s*(?:nexus[,;:]?\s*)?(?:dimentica(?:\s+che)?|rimuovi\s+dalla\s+memoria|forget\s+that)\s+(.+)$/iu);
  if (forget) return { action: 'forget', content: normalizeText(forget[1]) };
  return null;
}

// #endregion

// #region Archivio e consolidamento

class PersonalMemoryStore {
  constructor({ filePath }) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    try {
      configureDatabase(database);
      this.database = database;
      this.database.exec(`CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_key TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          confidence TEXT NOT NULL DEFAULT 'user-confirmed',
          source_kind TEXT NOT NULL DEFAULT 'explicit-user-statement',
          source_id TEXT,
          subject_key TEXT,
          superseded_by INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER,
          last_used_at INTEGER,
          use_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS memories_status_updated ON memories(status, updated_at DESC);`);
      const columns = this.database.prepare('PRAGMA table_info(memories)').all().map((row) => row.name);
      if (!columns.includes('expires_at')) this.database.exec('ALTER TABLE memories ADD COLUMN expires_at INTEGER;');
      if (!columns.includes('subject_key')) this.database.exec('ALTER TABLE memories ADD COLUMN subject_key TEXT;');
      if (!columns.includes('superseded_by')) this.database.exec('ALTER TABLE memories ADD COLUMN superseded_by INTEGER;');
    } catch (error) {
      try { database.close(); } catch { /* conserva l'errore di apertura originale */ }
      throw error;
    }
  }

  remember({ content, type, sourceId = null, expiresAt = null }) {
    const clean = normalizeText(content);
    if (clean.length < 3) throw new Error('Il ricordo è troppo breve.');
    const resolvedType = MEMORY_TYPES.has(type) ? type : classifyMemory(clean);
    const key = memoryKey(clean);
    const subjectKey = exclusiveMemorySubject(clean, resolvedType) || null;
    const now = Date.now();
    const resolvedExpiry = Number.isFinite(expiresAt) ? Math.max(now, expiresAt) : resolvedType === 'episodic' ? now + 30 * 86_400_000 : null;
    this.database.prepare(`INSERT INTO memories(memory_key,type,content,status,confidence,source_kind,source_id,subject_key,created_at,updated_at,expires_at)
      VALUES(?,?,?,'active','user-confirmed','explicit-user-statement',?,?,?,?,?)
      ON CONFLICT(memory_key) DO UPDATE SET type=excluded.type, content=excluded.content, status='active',
      confidence='user-confirmed', source_id=excluded.source_id, subject_key=excluded.subject_key,
      superseded_by=NULL, updated_at=excluded.updated_at, expires_at=excluded.expires_at`).run(key, resolvedType, clean, sourceId, subjectKey, now, now, resolvedExpiry);
    const current = this.database.prepare('SELECT * FROM memories WHERE memory_key=?').get(key);
    if (subjectKey) {
      this.database.prepare("UPDATE memories SET status='superseded', superseded_by=?, updated_at=? WHERE subject_key=? AND id<>? AND status='active'")
        .run(current.id, now, subjectKey, current.id);
    }
    return current;
  }

  expireStale(now = Date.now()) {
    return this.database.prepare("UPDATE memories SET status='expired', updated_at=? WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=?")
      .run(now, now).changes;
  }

  list({ limit = 100, status = 'active' } = {}) {
    this.expireStale();
    return this.database.prepare('SELECT * FROM memories WHERE status=? ORDER BY updated_at DESC LIMIT ?').all(status, Math.min(500, Math.max(1, limit))).map((row) => this.publicRecord(row));
  }

  publicRecord(row) {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      status: row.status,
      confidence: row.confidence,
      sourceKind: row.source_kind,
      sourceId: row.source_id || null,
      supersededBy: row.superseded_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at || null,
      lastUsedAt: row.last_used_at || null,
      useCount: row.use_count
    };
  }

  findRelevant(query, { limit = 6 } = {}) {
    const all = this.list({ limit: 500 }).filter((record) => !record.expiresAt || record.expiresAt > Date.now());
    const queryTokens = tokens(query);
    const asksEverything = /\b(?:cosa ricordi|che cosa ricordi|mostra la memoria|what do you remember)\b/iu.test(query);
    const now = Date.now();
    const ranked = all.map((record) => {
      const recordTokens = tokens(record.content);
      const overlap = queryTokens.filter((token) => recordTokens.includes(token)).length;
      const preferenceBoost = record.type === 'preference' ? 0.2 : 0;
      const ageDays = Math.max(0, (now - record.updatedAt) / 86_400_000);
      // Gli eventi sono contesto temporaneo: dopo un mese non influenzano più
      // una risposta normale, ma restano consultabili su richiesta esplicita.
      const temporalWeight = record.type === 'episodic' && !asksEverything
        ? ageDays > 30 ? 0 : Math.max(0.15, 1 - ageDays / 35)
        : 1;
      return { record, score: (asksEverything ? 1 : overlap / Math.max(2, queryTokens.length) + preferenceBoost) * temporalWeight };
    }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || right.record.updatedAt - left.record.updatedAt).slice(0, limit);
    if (ranked.length) {
      const statement = this.database.prepare('UPDATE memories SET last_used_at=?, use_count=use_count+1 WHERE id=?');
      for (const { record } of ranked) statement.run(now, record.id);
    }
    return ranked.map(({ record, score }) => ({ ...record, score }));
  }

  forgetMatching(content) {
    const needle = tokens(content);
    if (!needle.length) return 0;
    const matches = this.list({ limit: 500 }).filter((record) => {
      const candidate = tokens(record.content);
      return needle.every((token) => candidate.includes(token));
    });
    const statement = this.database.prepare("UPDATE memories SET status='forgotten', updated_at=? WHERE id=?");
    for (const record of matches) statement.run(Date.now(), record.id);
    return matches.length;
  }

  forgetById(id) {
    if (!Number.isInteger(id) || id < 1) return 0;
    return this.database.prepare("UPDATE memories SET status='forgotten', updated_at=? WHERE id=? AND status='active'").run(Date.now(), id).changes;
  }

  clear() {
    return this.database.prepare('DELETE FROM memories').run().changes;
  }

  stats() {
    this.expireStale();
    const row = this.database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active FROM memories").get();
    return { total: Number(row.total || 0), active: Number(row.active || 0) };
  }

  exportPortable() {
    this.expireStale();
    return Object.freeze({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      memories: this.list({ limit: 500 }).map(({ id: _id, sourceId: _sourceId, ...memory }) => memory)
    });
  }

  revision() {
    const row = this.database.prepare("SELECT COUNT(*) AS active, COALESCE(MAX(updated_at),0) AS updated_at FROM memories WHERE status='active'").get();
    return `${Number(row.active || 0)}:${Number(row.updated_at || 0)}`;
  }

  close() { closeDatabase(this.database); }
}

// #endregion

module.exports = { PersonalMemoryStore, classifyMemory, exclusiveMemorySubject, explicitMemoryInstruction, memoryKey };
