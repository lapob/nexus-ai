/**
 * @module tests/web-search
 * @description Ricerca nelle conversazioni: accenti, desinenze, prefissi, frase esatta, ordinamento e fusione semantica.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../web/src/search.ts');

const docs = [
  { id: 'a', title: 'Viaggio a Lisbona', text: 'Ho prenotato i voli per Lisbona e un hotel in centro.', updatedAt: 3 },
  { id: 'b', title: 'Città da visitare', text: 'Le città più belle del Portogallo: Porto e Lisbona. Perché no?', updatedAt: 2 },
  { id: 'c', title: 'Ricetta', text: 'Pasta al pomodoro con basilico fresco.', updatedAt: 1 }
];

test('lessicale: accenti, maiuscole, desinenze e prefissi; il titolo pesa di più', async () => {
  const { lexicalSearch, fold, stem } = await load();
  assert.equal(fold('Città Perché'), 'citta perche');
  assert.equal(stem('viaggiare'), stem('viaggio'));
  assert.deepEqual(lexicalSearch('citta', docs).map((hit) => hit.id), ['b']);
  assert.deepEqual(lexicalSearch('VIAGGIARE', docs).map((hit) => hit.id), ['a']);
  assert.deepEqual(lexicalSearch('lisbona', docs).map((hit) => hit.id), ['a', 'b'], 'titolo prima del corpo');
  assert.deepEqual(lexicalSearch('basil', docs).map((hit) => hit.id), ['c'], 'prefisso');
  assert.deepEqual(lexicalSearch('pizza margherita', docs), []);
  assert.match(lexicalSearch('pomodoro', docs)[0].snippet, /pomodoro/);
});

test('evidenzia le parole trovate senza perdere testo, anche con accenti e desinenze', async () => {
  const { highlight } = await load();
  const text = 'Le città più belle: Lisbona e Porto. Viaggiare!';
  const parts = highlight(text, 'citta viaggio');
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['città', 'Viaggiare']);
  assert.deepEqual(highlight('ciao', ''), [{ text: 'ciao', match: false }]);
});

test('semantica: aggiunge parafrasi senza parole in comune e indicizza una sola volta', async () => {
  const { lexicalSearch, semanticSearch } = await load();
  const calls = [];
  // Vettori finti: «cucina» vicino alla ricetta, lontano dai viaggi.
  const embed = async (texts) => { calls.push(texts.length); return texts.map((text) => (/pasta|cucina/i.test(text) ? [1, 0] : [0, 1])); };
  const lexical = lexicalSearch('cucina', docs);
  assert.deepEqual(lexical, []);
  const hits = await semanticSearch('cucina', docs, lexical, embed);
  assert.equal(hits[0].id, 'c');
  assert.equal(hits[0].semantic, true);
  await semanticSearch('cucina', docs, lexical, embed);
  assert.deepEqual(calls, [3, 1, 1], 'documenti indicizzati una volta, poi solo la domanda');
});
