const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (name) => import(pathToFileURL(path.join(__dirname, '..', 'web', 'src', name)).href);

test('comandi «/»: elenco completo, filtro per nome, descrizione solo come ripiego', async () => {
  const { matchSlash, SLASH_COMMANDS } = await load('prompts.ts');
  assert.equal(matchSlash('/').length, SLASH_COMMANDS.length);
  assert.deepEqual(matchSlash('/r').map((item) => item.command), ['riassumi']);
  assert.deepEqual(matchSlash('/inglese').map((item) => item.command), ['traduci']);
  assert.deepEqual(matchSlash('/zz'), []);
  assert.equal(matchSlash('ciao /r'), null, 'solo a inizio messaggio');
  assert.equal(matchSlash('/riassumi questo'), null, 'dopo uno spazio è testo normale');
});

test('suggerimenti dinamici: niente doppioni, categorie diverse, saluto per fascia oraria', async () => {
  const { mixedSuggestions, sample, greeting, needsInput, CATEGORIES } = await load('prompts.ts');
  for (let round = 0; round < 50; round += 1) {
    const picked = mixedSuggestions(4);
    assert.equal(new Set(picked.map((item) => item.icon)).size, 4);
    assert.equal(new Set(sample(CATEGORIES[0].prompts, 4)).size, 4);
  }
  assert.equal(greeting(new Date(2026, 0, 1, 9)), 'Buongiorno.');
  assert.equal(greeting(new Date(2026, 0, 1, 15)), 'Buon pomeriggio.');
  assert.equal(greeting(new Date(2026, 0, 1, 21)), 'Buonasera.');
  assert.equal(greeting(new Date(2026, 0, 1, 2)), 'Ancora sveglio?');
  assert.ok(needsInput('Riassumi i punti chiave di questo testo: '));
  assert.ok(!needsInput('Spiegami la relatività'));
});

test('cronologia: fissate in cima, poi oggi, ieri, 7 e 30 giorni, meno recenti', async () => {
  const { groupConversations } = await load('store.ts');
  const now = new Date(2026, 10, 9, 15).getTime();
  const day = 86_400_000;
  const item = (id, ago) => ({ id, title: id, createdAt: now - ago, updatedAt: now - ago, messages: [] });
  const groups = groupConversations([item('a', 1000), item('b', day), item('c', 3 * day), item('d', 20 * day), item('e', 90 * day), item('f', 2 * day)], ['f'], now);
  assert.deepEqual(groups.map((group) => [group.label, group.items.map((entry) => entry.id)]), [
    ['Fissate', ['f']], ['Oggi', ['a']], ['Ieri', ['b']], ['Ultimi 7 giorni', ['c']], ['Ultimi 30 giorni', ['d']], ['Meno recenti', ['e']]
  ]);
});
