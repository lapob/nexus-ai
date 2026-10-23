const test = require('node:test');
const assert = require('node:assert/strict');
const { deduplicateSources, deriveResearchQueries, enforcePublicCitationUrls, ensurePublicCitation, publicQuerySeed, researchLanguage, researchTimeRange, researchQuestion } = require('../src/research/research-orchestrator');

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

test('separa le istruzioni per link e fonti dai termini di ricerca', async () => {
  const question = 'Cerca sul web la documentazione ufficiale di JavaScript Promise.allSettled e indicami un link verificato.';
  assert.deepEqual(deriveResearchQueries(question, 1), ['la documentazione ufficiale di JavaScript Promise.allSettled']);
  assert.deepEqual(deriveResearchQueries('Search Promise.allSettled documentation and give me a verified link.', 1), ['Promise.allSettled documentation']);
  assert.equal(publicQuerySeed('Cerca fonti di diritto e citazioni giudiziarie'), 'fonti di diritto e citazioni giudiziarie');
  assert.equal(publicQuerySeed('Search stars and show sources of light'), 'stars and show sources of light');
  assert.equal(publicQuerySeed('Cerca Promise.allSettled e indicami un link sulla gestione errori'), 'Promise.allSettled e indicami un link sulla gestione errori');
  const calls = [];
  const result = await researchQuestion({ question, service: { search: async query => {
    calls.push(query);
    return { provider: 'searxng', results: [{ title: 'Documentazione', url: 'https://example.com/docs', snippet: 'Fonte verificata dal provider', sourceKind: 'web' }] };
  } } });
  assert.deepEqual(calls, ['la documentazione ufficiale di JavaScript Promise.allSettled']);
  assert.equal(result.unavailable, false);
  assert.equal(result.citations.length, 1);
});

test('distingue nessun risultato da un provider guasto senza inventare fonti', async () => {
  const question = 'Cerca sul web un dato attuale';
  const empty = await researchQuestion({ question, service: { search: async () => ({ provider: 'searxng', results: [] }) } });
  assert.equal(empty.unavailable, true);
  assert.equal(empty.emptyResults, true);
  assert.equal(empty.provider, 'searxng');
  assert.deepEqual(empty.citations, []);
  const failed = await researchQuestion({ question, service: { search: async () => { throw new Error('offline'); } } });
  assert.equal(failed.unavailable, true);
  assert.equal(failed.emptyResults, false);
  assert.equal(failed.provider, 'unavailable');
});

test('le release stabili usano una query breve senza perdere il nome del prodotto', async () => {
  const question = 'Cerca sul web la versione stabile attuale di Nebula Engine e cita la pagina ufficiale con il suo indirizzo.';
  assert.deepEqual(deriveResearchQueries(question, 1), ['Nebula Engine latest stable release official']);
  assert.deepEqual(deriveResearchQueries('Qual è la versione stabile di Lumen?', 1), ['Lumen latest stable release official']);
  assert.deepEqual(deriveResearchQueries('What is the latest stable release of Cedar?', 1), ['Cedar latest stable release official']);
  const calls = [];
  await researchQuestion({ question, language: 'it', service: { search: async (query, options) => {
    calls.push({ query, options }); return { provider: 'searxng', results: [] };
  } } });
  assert.equal(calls.length, 1); assert.equal(calls[0].options.language, 'en');
  assert.equal(calls[0].options.freshOnly, true);
});

test('ricerca approfondita esegue due query e conserva data e filtro delle citazioni', async () => {
  const calls = [];
  const result = await researchQuestion({ question: 'Cerca le notizie delle ultime 24 ore', mode: 'deep', service: { search: async (query, options) => {
    calls.push({ query, options });
    return { provider: 'searxng', results: [{ title: query, url: `https://example.com/${calls.length}`, snippet: 'Dato', sourceKind: 'web', retrievedAt: '2026-10-01T12:00:00.000Z', timeRange: options.timeRange }] };
  } } });
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].query, calls[1].query);
  assert.equal(calls[0].options.timeRange, 'day');
  assert.equal(result.citations[0].retrievedAt, '2026-10-01T12:00:00.000Z');
  assert.equal(result.citations[0].timeRange, 'day');
  assert.equal(researchTimeRange('versione corrente oggi'), '');
  assert.equal(researchTimeRange('past month'), 'month');
  assert.equal(researchTimeRange('ultimo anno'), 'year');
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
