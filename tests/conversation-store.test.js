const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');

test('renderer cache stays bounded with many full artifact revisions while the native history remains complete', () => {
  const { fitConversationBudget } = require('../src/renderer/systems/ConversationHistory.ts');
  const record = { id: 'oversized', title: 'Document', turns: Array.from({ length: 6 }, () => ({ role: 'assistant', createdAt: 123, content: 'Answer', artifacts: Array.from({ length: 12 }, () => ({ id: 'a', content: 'x'.repeat(48_000), revisions: Array.from({ length: 6 }, (_, index) => ({ id: `v-${index}`, content: 'y'.repeat(48_000), createdAt: 123, sequence: index + 1 })) })) })) };
  const before = JSON.stringify(record);
  for (const budget of [4_500_000, 1000, 20]) assert.ok(JSON.stringify(fitConversationBudget([record], budget)).length <= budget);
  assert.equal(JSON.stringify(record), before);
});

test('editable artifact copies preserve the AI result, survive reopening and reject stale or deleted targets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-artifact-versions-'));
  const filePath = path.join(root, 'conversations.sqlite3');
  let store;
  try {
    store = new ConversationStore({ filePath });
    store.save({ id: 'one', turns: [{ role: 'assistant', content: 'Result', createdAt: 123,
      artifacts: [{ id: 'a', kind: 'file-change', title: 'sample.txt', content: 'AI result', previousContent: 'Before AI', diff: '-Before AI\n+AI result' }] }] });
    const input = { conversationId: 'one', turnCreatedAt: 123, artifactId: 'a', expectedRevisionId: '', content: 'My edit' };
    let updated = store.reviseArtifact(input);
    assert.equal(updated.turns[0].artifacts[0].content, 'AI result');
    assert.equal(updated.turns[0].artifacts[0].previousContent, 'Before AI');
    assert.throws(() => store.reviseArtifact({ ...input, content: 'Stale edit' }), /cambiato/);
    assert.throws(() => store.reviseArtifact({ ...input, conversationId: 'someone-else' }), /rimossa/);
    assert.throws(() => store.reviseArtifact({ ...input, turnCreatedAt: 124 }), /disponibile/);
    assert.throws(() => store.reviseArtifact({ ...input, content: 'x'.repeat(48_001) }), /non valida/);
    for (let index = 2; index <= 9; index += 1) {
      updated = store.reviseArtifact({ ...input, expectedRevisionId: updated.turns[0].artifacts[0].revisions.at(-1).id, content: `Copy ${index}` });
    }
    store.close(); store = new ConversationStore({ filePath });
    const artifact = store.get('one').turns[0].artifacts[0];
    assert.equal(artifact.content, 'AI result'); assert.equal(artifact.revisions.length, 6);
    assert.deepEqual(artifact.revisions.map(item => item.sequence), [4, 5, 6, 7, 8, 9]);
    assert.equal(artifact.revisions.at(-1).content, 'Copy 9');
    const unchanged = store.reviseArtifact({ ...input, expectedRevisionId: artifact.revisions.at(-1).id, content: 'Copy 9' });
    assert.deepEqual(unchanged.turns[0].artifacts[0].revisions, artifact.revisions);
    store.remove('one');
    assert.throws(() => store.reviseArtifact({ ...input, expectedRevisionId: artifact.revisions.at(-1).id }), /rimossa/);
    assert.equal(store.get('one'), null);
  } finally { store?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

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
