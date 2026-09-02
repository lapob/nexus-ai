/**
 * @module infrastructure/storage/conversation-store
 * @description Cronologia locale transazionale con migrazioni SQLite versionate.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { closeDatabase, configureDatabase } = require('./sqlite-durability');

const MAX_CONVERSATIONS = 200;
const MAX_TURNS = 80;
const MAX_ARTIFACT_CONTENT = 48_000;

// #region 01 — Normalizzazione

function normalizeRecord(value = {}) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string') throw new TypeError('Conversazione non valida.');
  const turns = Array.isArray(value.turns) ? value.turns.slice(-MAX_TURNS).filter((turn) => turn && ['user', 'assistant'].includes(turn.role)).map((turn) => ({
    role: turn.role,
    content: String(turn.content || '').slice(0, 60_000),
    createdAt: Number(turn.createdAt) || Date.now(),
    ...(Array.isArray(turn.artifacts) ? { artifacts: turn.artifacts.slice(0, 12).filter((item) => item && typeof item === 'object').map((item) => ({
      id: String(item.id || '').slice(0, 160), kind: ['file-change', 'command', 'file', 'result'].includes(item.kind) ? item.kind : 'result',
      title: String(item.title || 'Dettaglio').slice(0, 260), subtitle: String(item.subtitle || '').slice(0, 160),
      language: String(item.language || 'text').slice(0, 40), content: String(item.content || '').slice(0, MAX_ARTIFACT_CONTENT),
      previousContent: String(item.previousContent || '').slice(0, MAX_ARTIFACT_CONTENT), diff: String(item.diff || '').slice(0, MAX_ARTIFACT_CONTENT),
      added: Math.max(0, Number(item.added) || 0), removed: Math.max(0, Number(item.removed) || 0), truncated: item.truncated === true
      , events: Array.isArray(item.events) ? item.events.slice(0, 12).map((event) => ({ label: String(event?.label || '').slice(0, 160), status: event?.status === 'warning' ? 'warning' : 'complete' })) : []
      , diagnostics: Array.isArray(item.diagnostics) ? item.diagnostics.slice(0, 12).map((entry) => ({ file: String(entry?.file || '').slice(0, 300), line: Math.max(0, Number(entry?.line) || 0), column: Math.max(0, Number(entry?.column) || 0), message: String(entry?.message || '').slice(0, 300) })) : []
    })) } : {})
  })).filter((turn) => turn.content) : [];
  return {
    id: value.id.slice(0, 128),
    title: String(value.title || turns.find((turn) => turn.role === 'user')?.content || 'Conversazione').replace(/\s+/g, ' ').trim().slice(0, 90),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    incomplete: value.incomplete === true,
    ...(value.workspace?.path ? { workspace: { path: String(value.workspace.path).slice(0, 4096), name: String(value.workspace.name || '').slice(0, 255) } } : {}),
    turns
  };
}

// #endregion

// #region 02 — Database e migrazioni

class ConversationStore {
  constructor({ filePath }) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    try {
      configureDatabase(database, { foreignKeys: true });
      this.database = database;
      this.migrate();
    } catch (error) {
      try { database.close(); } catch { /* conserva l'errore di apertura originale */ }
      throw error;
    }
  }

  migrate() {
    const version = Number(this.database.prepare('PRAGMA user_version').get().user_version || 0);
    if (version < 1) {
      this.database.exec(`BEGIN;
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, incomplete INTEGER NOT NULL DEFAULT 0, turns_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS conversations_updated ON conversations(updated_at DESC);
        PRAGMA user_version=1;
      COMMIT;`);
    }
  }

  deserialize(row) {
    if (!row) return null;
    try {
      const payload = JSON.parse(row.turns_json);
      const stored = Array.isArray(payload) ? { turns: payload } : payload;
      if (!stored || typeof stored !== 'object' || !Array.isArray(stored.turns)) return null;
      return {
        id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at,
        incomplete: row.incomplete === 1, ...stored
      };
    } catch {
      // Una singola riga danneggiata non deve rendere illeggibile tutta la cronologia.
      return null;
    }
  }

  list({ limit = MAX_CONVERSATIONS } = {}) {
    const requested = Math.min(MAX_CONVERSATIONS, Math.max(1, Number(limit) || MAX_CONVERSATIONS));
    return this.database.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?').all(MAX_CONVERSATIONS)
      .map((row) => this.deserialize(row))
      .filter(Boolean)
      .slice(0, requested);
  }

  get(id) {
    const row = this.database.prepare('SELECT * FROM conversations WHERE id=?').get(String(id).slice(0, 128));
    return this.deserialize(row);
  }

  save(value) {
    const record = normalizeRecord(value);
    this.database.prepare(`INSERT INTO conversations(id,title,created_at,updated_at,incomplete,turns_json)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at,
      incomplete=excluded.incomplete, turns_json=excluded.turns_json`).run(record.id, record.title, record.createdAt, record.updatedAt, record.incomplete ? 1 : 0, JSON.stringify({ turns: record.turns, ...(record.workspace ? { workspace: record.workspace } : {}) }));
    this.database.prepare('DELETE FROM conversations WHERE id NOT IN (SELECT id FROM conversations ORDER BY updated_at DESC LIMIT ?)').run(MAX_CONVERSATIONS);
    return record;
  }

  remove(id) {
    return this.database.prepare('DELETE FROM conversations WHERE id=?').run(String(id).slice(0, 128)).changes > 0;
  }

  import(records) {
    this.database.exec('BEGIN');
    try { for (const record of Array.isArray(records) ? records : []) this.save(record); this.database.exec('COMMIT'); }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return this.list();
  }

  close() { closeDatabase(this.database); }
}

// #endregion

module.exports = { ConversationStore, normalizeRecord };
