/**
 * @module infrastructure/storage/personal-memory-store
 * @description Memoria personale esplicita, verificabile e indipendente dalla knowledge.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
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

// qwen3-embedding e modelli simili distinguono query e documenti: la query con
// istruzione separa meglio il ricordo giusto (misurato: 0.39–0.53 contro ≤0.28).
function memoryQueryText(query) {
  return `Instruct: Given a question about the user, retrieve the personal memory that answers it\nQuery: ${normalizeText(query, 2000)}`;
}

function explicitMemoryInstruction(question) {
  const text = normalizeText(question, 12_000);
  const correction = text.match(/^(?:correggi il ricordo|update memory)\s+#?(\d+)\s*:\s*(.+)$/iu);
  if (correction) return { action: 'update', id: Number(correction[1]), content: normalizeText(correction[2]) };
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
      // Vettori semantici opzionali: il retrieval lessicale resta il fallback.
      if (!columns.includes('embedding')) this.database.exec('ALTER TABLE memories ADD COLUMN embedding TEXT;');
      if (!columns.includes('embedding_model')) this.database.exec('ALTER TABLE memories ADD COLUMN embedding_model TEXT;');
      // Una conversazione già consolidata alla stessa revisione non viene rielaborata.
      this.database.exec(`CREATE TABLE IF NOT EXISTS memory_consolidations (
          conversation_id TEXT PRIMARY KEY,
          conversation_updated_at INTEGER NOT NULL,
          consolidated_at INTEGER NOT NULL,
          facts INTEGER NOT NULL DEFAULT 0
        );`);
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
    this.database.exec('SAVEPOINT nexus_memory_remember');
    try {
      this.database.prepare(`INSERT INTO memories(memory_key,type,content,status,confidence,source_kind,source_id,subject_key,created_at,updated_at,expires_at)
        VALUES(?,?,?,'active','user-confirmed','explicit-user-statement',?,?,?,?,?)
        ON CONFLICT(memory_key) DO UPDATE SET type=excluded.type, content=excluded.content, status='active',
        confidence='user-confirmed', source_kind='explicit-user-statement', source_id=excluded.source_id, subject_key=excluded.subject_key,
        superseded_by=NULL, updated_at=excluded.updated_at, expires_at=excluded.expires_at, embedding=NULL, embedding_model=NULL`).run(key, resolvedType, clean, sourceId, subjectKey, now, now, resolvedExpiry);
      const current = this.database.prepare('SELECT * FROM memories WHERE memory_key=?').get(key);
      if (subjectKey) {
        this.database.prepare("UPDATE memories SET status='superseded', superseded_by=?, updated_at=? WHERE subject_key=? AND id<>? AND status='active'")
          .run(current.id, now, subjectKey, current.id);
      }
      this.database.exec('RELEASE nexus_memory_remember');
      return current;
    } catch (error) {
      this.database.exec('ROLLBACK TO nexus_memory_remember; RELEASE nexus_memory_remember');
      throw error;
    }
  }

  /**
   * Ricordo derivato (riassunto o fatto dedotto da una conversazione). Non
   * sovrascrive mai un ricordo confermato dall'utente, non resuscita un ricordo
   * dimenticato e non sostituisce altri ricordi dello stesso soggetto.
   */
  rememberDerived({ content, type, key = null, sourceKind, sourceId, expiresAt = null, now = Date.now() }) {
    const clean = normalizeText(content);
    if (clean.length < 3) throw new Error('Il ricordo è troppo breve.');
    if (!['conversation-summary', 'conversation-extraction'].includes(sourceKind)) throw new Error('Origine del ricordo derivato non valida.');
    const resolvedType = MEMORY_TYPES.has(type) ? type : classifyMemory(clean);
    const memoryKeyValue = key ? memoryKey(key) : memoryKey(clean);
    const existing = this.database.prepare('SELECT id,status,confidence FROM memories WHERE memory_key=?').get(memoryKeyValue);
    if (existing && (existing.status === 'forgotten' || existing.confidence === 'user-confirmed')) return null;
    const expiry = Number.isFinite(expiresAt) ? Math.max(now, expiresAt) : now + 180 * 86_400_000;
    this.database.prepare(`INSERT INTO memories(memory_key,type,content,status,confidence,source_kind,source_id,subject_key,created_at,updated_at,expires_at)
      VALUES(?,?,?,'active','inferred',?,?,NULL,?,?,?)
      ON CONFLICT(memory_key) DO UPDATE SET type=excluded.type, content=excluded.content, status='active',
      source_kind=excluded.source_kind, source_id=excluded.source_id, updated_at=excluded.updated_at, expires_at=excluded.expires_at,
      embedding=NULL, embedding_model=NULL
      WHERE memories.status<>'forgotten' AND memories.confidence<>'user-confirmed'`)
      .run(memoryKeyValue, resolvedType, clean, sourceKind, String(sourceId || '').slice(0, 128) || null, now, now, expiry);
    return this.publicRecord(this.database.prepare('SELECT * FROM memories WHERE memory_key=?').get(memoryKeyValue));
  }

  consolidationRevision(conversationId) {
    return this.database.prepare('SELECT conversation_updated_at FROM memory_consolidations WHERE conversation_id=?').get(String(conversationId))?.conversation_updated_at ?? null;
  }

  markConsolidated(conversationId, conversationUpdatedAt, facts = 0, now = Date.now()) {
    this.database.prepare(`INSERT INTO memory_consolidations(conversation_id,conversation_updated_at,consolidated_at,facts) VALUES(?,?,?,?)
      ON CONFLICT(conversation_id) DO UPDATE SET conversation_updated_at=excluded.conversation_updated_at, consolidated_at=excluded.consolidated_at, facts=excluded.facts`)
      .run(String(conversationId).slice(0, 128), conversationUpdatedAt, now, facts);
  }

  missingEmbeddings(model, limit = 32) {
    this.expireStale();
    return this.database.prepare("SELECT id,content FROM memories WHERE status='active' AND (embedding IS NULL OR embedding_model IS NOT ?) ORDER BY updated_at DESC LIMIT ?")
      .all(String(model), Math.min(128, Math.max(1, limit)));
  }

  setEmbedding(id, vector, model) {
    if (!Array.isArray(vector) || !vector.length || vector.length > 8192 || vector.some((value) => !Number.isFinite(value))) throw new Error('Vettore del ricordo non valido.');
    return this.database.prepare('UPDATE memories SET embedding=?, embedding_model=? WHERE id=?').run(JSON.stringify(vector), String(model), id).changes;
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

  findRelevant(query, { limit = 6, queryVector = null, embeddingModel = null, minSemantic = 0.33 } = {}) {
    const all = this.list({ limit: 500 }).filter((record) => !record.expiresAt || record.expiresAt > Date.now());
    const queryTokens = tokens(query);
    const asksEverything = /\b(?:cosa ricordi|che cosa ricordi|mostra la memoria|what do you remember)\b/iu.test(query);
    const now = Date.now();
    // Retrieval ibrido: con un vettore della query e ricordi indicizzati dallo
    // stesso modello, la similarità semantica trova anche parafrasi; senza
    // vettori il comportamento lessicale precedente resta identico.
    const vectors = new Map();
    if (Array.isArray(queryVector) && queryVector.length && embeddingModel) {
      for (const row of this.database.prepare("SELECT id,embedding FROM memories WHERE status='active' AND embedding IS NOT NULL AND embedding_model=?").all(String(embeddingModel))) {
        try { const vector = JSON.parse(row.embedding); if (Array.isArray(vector) && vector.length === queryVector.length) vectors.set(row.id, vector); } catch { /* vettore corrotto: solo lessicale */ }
      }
    }
    const queryNorm = Math.sqrt((queryVector || []).reduce((total, value) => total + value * value, 0)) || 1;
    const cosine = (vector) => vector.reduce((total, value, index) => total + value * queryVector[index], 0) / ((Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1) * queryNorm);
    const ranked = all.map((record) => {
      const recordTokens = tokens(record.content);
      const overlap = queryTokens.filter((token) => recordTokens.includes(token)).length;
      const preferenceBoost = record.type === 'preference' ? 0.2 : 0;
      const ageDays = Math.max(0, (now - record.updatedAt) / 86_400_000);
      // Gli eventi sono contesto temporaneo: dopo un mese non influenzano più
      // una risposta normale, ma restano consultabili su richiesta esplicita.
      // I riassunti di conversazione durano di più: sono il ricordo episodico.
      const temporalWeight = record.type === 'episodic' && !asksEverything && record.sourceKind !== 'conversation-summary'
        ? ageDays > 30 ? 0 : Math.max(0.15, 1 - ageDays / 35)
        : 1;
      const lexical = overlap / Math.max(2, queryTokens.length);
      const vector = vectors.get(record.id);
      const semantic = vector ? cosine(vector) : 0;
      const relevance = vector ? (semantic >= minSemantic ? semantic * 0.7 + lexical * 0.3 : lexical * 0.3) : lexical;
      // I ricordi dedotti pesano meno di quelli confermati dall'utente.
      const trust = record.confidence === 'inferred' ? 0.85 : 1;
      // Con il ranking semantico il bonus fisso delle preferenze riempiva i
      // risultati di preferenze non pertinenti: vale solo se il ricordo è pertinente.
      const boost = vectors.size ? (relevance > 0 ? preferenceBoost / 2 : 0) : preferenceBoost;
      return { record, score: (asksEverything ? 1 : (relevance + boost) * trust) * temporalWeight };
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

  updateById(id, content, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some((key) => key !== 'expiresAt')) throw new Error('Opzioni del ricordo non valide.');
    const clean = normalizeText(content);
    if (!Number.isSafeInteger(id) || id < 1 || clean.length < 3) throw new Error('Ricordo non valido.');
    this.expireStale();
    const existing = this.database.prepare("SELECT id,expires_at FROM memories WHERE id=? AND status='active'").get(id);
    if (!existing) throw new Error('Ricordo non disponibile.');
    const key = memoryKey(clean);
    const duplicate = this.database.prepare('SELECT id FROM memories WHERE memory_key=? AND id<>?').get(key, id);
    if (duplicate) throw new Error('Questo ricordo esiste già.');
    const type = classifyMemory(clean);
    const now = Date.now();
    const customExpiry = Object.hasOwn(options, 'expiresAt');
    if (customExpiry && options.expiresAt !== null && (!Number.isSafeInteger(options.expiresAt)
      || options.expiresAt <= now || options.expiresAt > now + 10 * 366 * 86_400_000)) throw new Error('Scadenza del ricordo non valida.');
    // Correggere il testo non rinnova una scadenza già scelta dall'utente.
    const expiresAt = customExpiry ? options.expiresAt : existing.expires_at;
    const subject = exclusiveMemorySubject(clean, type) || null;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      // Una correzione dell'utente rende il ricordo confermato e invalida il vettore.
      this.database.prepare("UPDATE memories SET content=?, memory_key=?, type=?, subject_key=?, updated_at=?, expires_at=?, confidence='user-confirmed', embedding=NULL, embedding_model=NULL WHERE id=?")
        .run(clean, key, type, subject, now, expiresAt, id);
      if (subject) this.database.prepare("UPDATE memories SET status='superseded', superseded_by=?, updated_at=? WHERE subject_key=? AND id<>? AND status='active'").run(id, now, subject, id);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return 1;
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
    const totalActive = this.stats().active;
    const memories = this.list({ limit: 500 }).map(({ id: _id, sourceId: _sourceId, ...memory }) => memory);
    return Object.freeze({
      schemaVersion: 1,
      scope: 'local-personal',
      exportedAt: new Date().toISOString(),
      totalActive,
      truncated: totalActive > memories.length,
      memories
    });
  }

  revision() {
    this.expireStale();
    const row = this.database.prepare("SELECT COUNT(*) AS active, COALESCE(MAX(updated_at),0) AS updated_at FROM memories WHERE status='active'").get();
    if (!row.active) return '0:0';
    // Wall-clock timestamps can coincide during edits. Usage counters must not
    // invalidate answers, but content and expiry always must.
    const records = this.database.prepare("SELECT id,type,content,expires_at FROM memories WHERE status='active' ORDER BY id").all();
    const digest = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    return `${Number(row.active)}:${Number(row.updated_at)}:${digest}`;
  }

  close() { closeDatabase(this.database); }
}

// #endregion

module.exports = { PersonalMemoryStore, classifyMemory, exclusiveMemorySubject, explicitMemoryInstruction, memoryKey, memoryQueryText };
