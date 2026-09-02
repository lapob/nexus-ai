const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrainingStore, containsSensitiveMemory } = require('../src/infrastructure/storage/training-store');

test('salva in JSONL soltanto l’esempio esplicitamente approvato', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'training-examples.jsonl');
  const store = new TrainingStore({ filePath, clock: () => new Date('2026-07-25T10:00:00.000Z'), createId: () => 'sample-1' });
  assert.deepEqual(store.append({ requestId: 'req-1', prompt: 'Domanda', response: 'Risposta', model: 'qwen3:8b', mode: 'fast' }), { status: 'saved', id: 'sample-1' });
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8').trim()), {
    schemaVersion: 4, id: 'sample-1', createdAt: '2026-07-25T10:00:00.000Z', verifiedAt: '2026-07-25T10:00:00.000Z', provenance: 'user-approved-conversation', confidence: 'approved-example', reviewStatus: 'approved', license: 'user-approved-private-use', language: 'und', domain: 'general', requestId: 'req-1', prompt: 'Domanda', response: 'Risposta', model: 'qwen3:8b', mode: 'fast'
  });
});

test('recupera soltanto esempi approvati pertinenti senza usare righe corrotte', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-search-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'training-examples.jsonl');
  const store = new TrainingStore({ filePath });
  store.append({ requestId: 'req-1', prompt: 'Come configuro il microfono USB?', response: 'Apri le impostazioni audio.', model: 'qwen3:8b', mode: 'fast' });
  store.append({ requestId: 'req-2', prompt: 'Qual è la capitale della Francia?', response: 'Parigi.', model: 'qwen3:8b', mode: 'fast' });
  fs.appendFileSync(filePath, '{riga non valida}\n');
  assert.deepEqual(store.findRelevant('Il mio microfono USB non funziona', { limit: 1 }).map((item) => item.response), ['Apri le impostazioni audio.']);
  assert.deepEqual(store.findRelevant('Ricetta per il pane'), []);
});

test('deduplica gli esempi approvati equivalenti', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-dedup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new TrainingStore({ filePath: path.join(directory, 'training.jsonl'), createId: () => 'stable-id' });
  const example = { requestId: 'one', prompt: '  Configura   audio ', response: 'Procedura corretta.', model: 'qwen3:8b', mode: 'fast' };
  assert.deepEqual(store.append(example), { status: 'saved', id: 'stable-id' });
  assert.deepEqual(store.append({ ...example, requestId: 'two', prompt: 'configura audio' }), { status: 'saved', id: 'stable-id' });
  assert.equal(store.records().length, 1);
});

test('valuta e dimentica soltanto la memoria personale approvata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-evaluation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'training-examples.jsonl');
  const store = new TrainingStore({ filePath });
  store.append({ requestId: 'req-1', prompt: 'Configura il microfono USB per una voce naturale', response: 'Procedura corretta.', originalResponse: 'Procedura iniziale.', model: 'qwen3:8b', mode: 'fast' });
  store.append({ requestId: 'req-2', prompt: 'Ottimizza un progetto TypeScript locale', response: 'Piano tecnico.', model: 'qwen3:8b', mode: 'deep' });
  const report = store.evaluation();
  assert.equal(report.examples, 2);
  assert.ok(report.readiness > 0);
  assert.ok(report.diversity > 0);
  assert.equal(report.correctionCoverage, 50);
  assert.equal(store.stats().preferencePairs, 1);
  assert.deepEqual(store.stats().domains, { coding: 1, general: 1 });
  assert.deepEqual(store.clear(), { removed: 2 });
  assert.deepEqual(store.records(), []);
});

test('rifiuta segreti e credenziali dalla memoria personale', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-sensitive-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new TrainingStore({ filePath: path.join(directory, 'training.jsonl') });
  assert.equal(containsSensitiveMemory('api_key = sk_example_1234567890123456'), true);
  assert.throws(() => store.append({
    requestId: 'req-sensitive', prompt: 'Ricorda password: segretissima', response: 'Va bene', model: 'local', mode: 'fast'
  }), /dati sensibili/);
  assert.equal(store.stats().examples, 0);
});

test('la revisione cambia quando viene approvato un nuovo esempio', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-revision-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new TrainingStore({ filePath: path.join(directory, 'training.jsonl') });
  assert.equal(store.revision(), 'empty');
  store.append({ requestId: 'revision-1', prompt: 'Spiega una coda idempotente', response: 'Una coda idempotente evita effetti duplicati.', model: 'qwen3:8b', mode: 'fast' });
  assert.notEqual(store.revision(), 'empty');
});

test('separa i contributi pubblici in quarantena dagli esempi approvati', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-training-quarantine-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const now = new Date('2026-08-30T00:00:00.000Z');
  const store = new TrainingStore({ filePath: path.join(directory, 'community.jsonl'), clock: () => now });
  store.append({
    requestId: 'community-1', prompt: 'Spiega una rete locale', response: 'Una LAN collega dispositivi vicini.', model: 'automatic', mode: 'fast',
    provenance: 'community-opt-in-quarantine', reviewStatus: 'quarantine', license: 'pending-review', consent: true,
    expiresAt: now.getTime() + 90 * 24 * 60 * 60 * 1000
  });
  assert.equal(store.stats().approved, 0);
  assert.equal(store.stats().quarantined, 1);
  assert.equal(store.records()[0].reviewStatus, 'quarantine');
  assert.equal(store.records()[0].consent, true);
  assert.equal(store.records()[0].expiresAt, '2026-11-28T00:00:00.000Z');
  assert.deepEqual(store.findRelevant('rete locale', { limit: 2 }), [], 'la quarantena non deve mai entrare nel contesto AI');
});
