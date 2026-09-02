const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');

test('SQLite salva, aggiorna, elimina e riapre la cronologia atomicamente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-history-'));
  const filePath = path.join(root, 'database', 'conversations.sqlite3');
  try {
    let store = new ConversationStore({ filePath });
    store.save({ id: 'one', title: 'Prima', createdAt: 1, updatedAt: 2, turns: [{ role: 'user', content: 'Ciao', createdAt: 1 }] });
    store.save({ id: 'one', title: 'Aggiornata', createdAt: 1, updatedAt: 3, incomplete: true, turns: [{ role: 'assistant', content: 'Risposta', createdAt: 3, artifacts: [{ id: 'a', kind: 'file-change', title: 'app.ts', language: 'typescript', content: 'const ok = true;', added: 1, removed: 0 }] }] });
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].title, 'Aggiornata');
    assert.equal(store.list()[0].turns[0].artifacts[0].title, 'app.ts');
    store.close();
    store = new ConversationStore({ filePath });
    assert.equal(store.list()[0].incomplete, true);
    assert.equal(store.remove('one'), true);
    assert.deepEqual(store.list(), []);
    store.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('isola righe JSON corrotte senza nascondere le conversazioni sane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-history-corrupt-'));
  const filePath = path.join(root, 'conversations.sqlite3');
  try {
    const store = new ConversationStore({ filePath });
    store.save({ id: 'healthy-old', title: 'Sana precedente', createdAt: 1, updatedAt: 10, turns: [{ role: 'user', content: 'Uno', createdAt: 1 }] });
    store.save({ id: 'healthy-new', title: 'Sana recente', createdAt: 2, updatedAt: 20, turns: [{ role: 'assistant', content: 'Due', createdAt: 2 }] });
    store.database.prepare(`INSERT INTO conversations(id,title,created_at,updated_at,incomplete,turns_json)
      VALUES(?,?,?,?,?,?)`).run('broken', 'Danneggiata', 3, 30, 0, '{json-non-valido');

    assert.deepEqual(store.list({ limit: 2 }).map((row) => row.id), ['healthy-new', 'healthy-old']);
    assert.equal(store.get('broken'), null);
    assert.equal(store.get('healthy-new').turns[0].content, 'Due');
    assert.equal(store.get('missing'), null);
    store.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
