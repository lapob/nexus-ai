const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PersonalMemoryStore, explicitMemoryInstruction } = require('../src/infrastructure/storage/personal-memory-store');

test('riconosce solo richieste esplicite di memoria', () => {
  assert.deepEqual(explicitMemoryInstruction('Ricorda che preferisco risposte concise'), {
    action: 'remember', content: 'preferisco risposte concise', type: 'preference'
  });
  assert.equal(explicitMemoryInstruction('Preferisco risposte concise'), null);
  assert.deepEqual(explicitMemoryInstruction('Dimentica che preferisco risposte concise'), {
    action: 'forget', content: 'preferisco risposte concise'
  });
});

test('persiste, recupera con provenienza e dimentica un ricordo', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-'));
  const filePath = path.join(directory, 'memory.sqlite3');
  let store = new PersonalMemoryStore({ filePath });
  const saved = store.remember({ content: 'Il progetto Aurora usa TypeScript', sourceId: 'turn-1' });
  assert.equal(saved.source_kind, 'explicit-user-statement');
  store.close();

  store = new PersonalMemoryStore({ filePath });
  const results = store.findRelevant('Quale linguaggio usa il progetto Aurora?');
  assert.equal(results[0].content, 'Il progetto Aurora usa TypeScript');
  assert.equal(results[0].sourceKind, 'explicit-user-statement');
  assert.equal(results[0].sourceId, 'turn-1');
  assert.equal(store.forgetMatching('progetto Aurora'), 1);
  assert.equal(store.stats().active, 0);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('clear elimina l intera memoria personale', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  store.remember({ content: 'La lingua preferita è italiano' });
  assert.equal(store.clear(), 1);
  assert.deepEqual(store.stats(), { total: 0, active: 0 });
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('permette di dimenticare un singolo ricordo dalla gestione dati', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  const first = store.remember({ content: 'Il progetto Atlas usa Rust' });
  store.remember({ content: 'Preferisco risposte sintetiche', type: 'preference' });
  assert.equal(store.forgetById(first.id), 1);
  assert.equal(store.forgetById(first.id), 0);
  assert.equal(store.stats().active, 1);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('un evento vecchio non condiziona le risposte ma resta consultabile', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  store.remember({ content: 'Oggi ho una riunione Aurora', type: 'episodic' });
  store.database.prepare('UPDATE memories SET updated_at=?').run(Date.now() - 45 * 86_400_000);
  assert.equal(store.findRelevant('Quando ho la riunione Aurora?').length, 0);
  assert.equal(store.findRelevant('Cosa ricordi?').length, 1);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('i ricordi scaduti vengono marcati e non restano attivi', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-expiry-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  store.remember({ content: 'Evento temporaneo Atlas', type: 'episodic', expiresAt: Date.now() + 1_000 });
  store.database.prepare('UPDATE memories SET expires_at=?').run(Date.now() - 1);
  assert.equal(store.expireStale(), 1);
  assert.equal(store.stats().active, 0);
  assert.equal(store.list({ status: 'expired' })[0].content, 'Evento temporaneo Atlas');
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('l esportazione portabile esclude identificatori interni e ricordi rimossi', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-export-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  const removed = store.remember({ content: 'Il progetto Vecchio usa Java', sourceId: 'private-turn' });
  store.forgetById(removed.id);
  store.remember({ content: 'Il progetto Nuovo usa Rust', sourceId: 'private-turn-2' });
  const exported = store.exportPortable();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.memories.length, 1);
  assert.equal(exported.memories[0].content, 'Il progetto Nuovo usa Rust');
  assert.equal(Object.hasOwn(exported.memories[0], 'id'), false);
  assert.equal(Object.hasOwn(exported.memories[0], 'sourceId'), false);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('la revisione della memoria cambia soltanto con il contenuto attivo', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-revision-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  assert.equal(store.revision(), '0:0');
  const saved = store.remember({ content: 'Il progetto Boreale usa Go' });
  const populated = store.revision();
  assert.match(populated, /^1:\d+$/);
  store.forgetById(saved.id);
  assert.equal(store.revision(), '0:0');
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('una nuova preferenza esclusiva sostituisce la precedente senza cancellarne la provenienza', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-conflict-'));
  const store = new PersonalMemoryStore({ filePath: path.join(directory, 'memory.sqlite3') });
  const previous = store.remember({ content: 'La mia lingua preferita è italiano', sourceId: 'turn-old' });
  const current = store.remember({ content: 'La mia lingua preferita è inglese', sourceId: 'turn-new' });

  assert.deepEqual(store.list().map((record) => record.content), ['La mia lingua preferita è inglese']);
  const superseded = store.list({ status: 'superseded' });
  assert.equal(superseded[0].id, previous.id);
  assert.equal(superseded[0].sourceId, 'turn-old');
  assert.equal(superseded[0].supersededBy, current.id);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
