const test = require('node:test');
const assert = require('node:assert/strict');
const { deduplicateSources, deriveResearchQueries, enforcePublicCitationUrls, ensurePublicCitation, publicQuerySeed, researchLanguage, researchQuestion } = require('../src/research/research-orchestrator');

test('deduplica le fonti e pubblica solo riferimenti esterni', () => {
  const merged = deduplicateSources([[{
    title: 'A', url: 'https://example.com/a#one', snippet: 'Uno', sourceKind: 'web', status: 'external'
  }, {
    title: 'A duplicato', url: 'https://example.com/a#two', snippet: 'Due', sourceKind: 'web', status: 'external'
  }]], 5);
  assert.equal(merged.length, 1);
  assert.match(merged[0].text, /URL pubblico/);
});

test('orchestra query limitate e segnala il fallback indisponibile', async () => {
  const options = [];
  const service = { search: async (query, settings) => { options.push(settings); return { provider: 'test', results: [{ title: query, url: `https://example.com/${encodeURIComponent(query)}`, snippet: 'Fonte', sourceKind: 'web', status: 'external' }] }; } };
  const result = await researchQuestion({ question: 'Approfondisci e cerca sul web i transformer', mode: 'deep', service });
  assert.equal(result.searched, true);
  assert.ok(result.sources.length >= 1 && result.sources.length <= 6);
  assert.equal(result.citations[0].sourceKind, 'web');
  assert.equal(options[0].freshOnly, false);

  let freshOnly = false;
  const unavailable = await researchQuestion({ question: 'Cerca sul web un dato attuale', service: { search: async (_query, settings) => { freshOnly = settings.freshOnly; throw new Error('offline'); } } });
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.provider, 'unavailable');
  assert.equal(freshOnly, true);
});

test('mantiene query e lingua deterministiche', () => {
  assert.ok(deriveResearchQueries('Cerca sul web la versione attuale', 2).length <= 2);
  assert.equal(publicQuerySeed('Modifica il progetto e poi cerca la versione corrente di Node'), 'la versione corrente di Node');
  assert.equal(publicQuerySeed('Cerca sul web e spiegami che cosa significa intelligenza artificiale, citando la fonte.'), 'intelligenza artificiale');
  assert.equal(publicQuerySeed('Cerca sul web e spiegami in una sola frase che cosa significa intelligenza artificiale, citando la fonte.'), 'intelligenza artificiale');
  assert.equal(publicQuerySeed('Cerca sul web le ultime informazioni stabili su Node.js, spiegale in breve e cita le fonti.'), 'Node.js');
  assert.equal(researchLanguage('Qual è la versione attuale?'), 'it');
  assert.equal(researchLanguage('What is the current version?'), 'en');
});

test('mantiene soltanto URL realmente restituiti dal provider', () => {
  const result = enforcePublicCitationUrls(
    'Vedi [fonte valida](https://example.com/a#section) e [fonte inventata](https://evil.example/x).',
    [{ url: 'https://example.com/a', title: 'A' }]
  );
  assert.match(result.text, /\[fonte valida\]\(https:\/\/example\.com\/a#section\)/);
  assert.doesNotMatch(result.text, /evil\.example/);
  assert.equal(result.rejected, 1);
});

test('non pubblica URL inventati quando la ricerca non restituisce fonti', () => {
  const result = enforcePublicCitationUrls(
    'Consulta [questa guida](https://invented.example/guide) oppure https://invented.example/raw.'
  );
  assert.doesNotMatch(result.text, /https:\/\//);
  assert.match(result.text, /questa guida/);
  assert.equal(result.rejected, 2);
});

test('aggiunge una fonte reale quando il modello omette il link', () => {
  const result = ensurePublicCitation('Risposta verificata.', [{ title: 'Documento', url: 'https://example.com/docs' }]);
  assert.equal(result.added, true);
  assert.match(result.text, /Fonte: \[Documento\]\(https:\/\/example\.com\/docs\)/);
  assert.equal(ensurePublicCitation('[Documento](https://example.com/docs)', [{ title: 'Documento', url: 'https://example.com/docs' }]).added, false);
  assert.doesNotMatch(ensurePublicCitation('Una definizione, come definito da IBM (2023).', [{ title: 'Documento', url: 'https://example.com/docs' }]).text, /IBM/);
});

test('normalizza le citazioni testuali senza duplicare la fonte', () => {
  const result = ensurePublicCitation('Risposta. [Wikipedia, https://it.wikipedia.org/wiki/Intelligenza_artificiale]', [{ title: 'Intelligenza artificiale', url: 'https://it.wikipedia.org/wiki/Intelligenza_artificiale' }]);
  assert.equal(result.added, false);
  assert.equal(result.accepted, 1);
  assert.match(result.text, /\[Wikipedia\]\(https:\/\/it\.wikipedia\.org\/wiki\/Intelligenza_artificiale\)/);
  assert.doesNotMatch(result.text, /Fonte:/);
  const parenthetical = ensurePublicCitation('Risposta secondo Wikipedia (https://it.wikipedia.org/wiki/Intelligenza_artificiale).', [{ title: 'Intelligenza artificiale', url: 'https://it.wikipedia.org/wiki/Intelligenza_artificiale' }]);
  assert.equal(parenthetical.added, false);
  assert.match(parenthetical.text, /\[Intelligenza artificiale\]\(https:\/\/it\.wikipedia\.org\/wiki\/Intelligenza_artificiale\)/);
  assert.doesNotMatch(parenthetical.text, /Fonte:/);
});
