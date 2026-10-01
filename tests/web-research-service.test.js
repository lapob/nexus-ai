const test = require('node:test');
const assert = require('node:assert/strict');
const { WebResearchService, safeProviderEndpoint, safePublicUrl, safeSelfHostedEndpoint } = require('../src/research/web-research-service');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    text: async () => JSON.stringify(payload)
  };
}

test('le chiavi configurate non attivano provider cloud senza consenso esplicito', async () => {
  let calls = 0;
  const settings = { braveApiKey: 'synthetic-key', openAiApiKey: 'synthetic-key', openAiModel: 'search-model',
    fetchImpl: async () => { calls++; throw new Error('cloud not allowed'); } };
  assert.equal(new WebResearchService(settings).activeProvider(), 'wikipedia');
  assert.equal(new WebResearchService({ ...settings, searxngEndpoint: 'http://127.0.0.1:8080/' }).activeProvider(), 'searxng');
  for (const provider of ['brave', 'openai']) {
    const service = new WebResearchService({ ...settings, provider });
    assert.equal(service.activeProvider(), 'unavailable');
    await assert.rejects(service.search('query sintetica'));
  }
  assert.equal(calls, 0);
});

test('normalizza Wikipedia come fallback senza chiavi client', async () => {
  const calls = [];
  const service = new WebResearchService({
    provider: 'auto',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ query: { search: [{ title: 'Nexus', snippet: '<span>Voce enciclopedica</span>' }] } });
    }
  });
  const result = await service.search('Nexus', { language: 'it', limit: 3 });
  assert.equal(result.provider, 'wikipedia');
  assert.equal(result.results[0].snippet, 'Voce enciclopedica');
  assert.match(result.results[0].url, /^https:\/\/it\.wikipedia\.org\/wiki\/Nexus/);
  assert.equal(calls.length, 1);
  assert.deepEqual(service.capabilityState(), { state: 'degraded', mode: 'reference-only' });
  assert.equal(calls[0].options.redirect, 'error');
  assert.match(calls[0].options.headers['User-Agent'], /^NexusNXS\//);
  const cached = await service.search('Nexus', { language: 'it', limit: 3 });
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 1);
});

test('usa Brave soltanto lato server e non restituisce la credenziale', async () => {
  let token = '';
  const service = new WebResearchService({
    provider: 'brave',
    cloudEnabled: true, braveApiKey: 'server-secret',
    fetchImpl: async (_url, options) => {
      token = options.headers['X-Subscription-Token'];
      return jsonResponse({ web: { results: [{ title: 'Documentazione', url: 'https://example.com/docs', description: 'Risultato verificabile' }] } });
    }
  });
  const result = await service.search('documentazione');
  assert.equal(token, 'server-secret');
  assert.equal(result.results[0].url, 'https://example.com/docs');
  assert.doesNotMatch(JSON.stringify(result), /server-secret/);
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
});

test('usa SearXNG self-hosted come provider live preferito senza credenziali', async () => {
  let requestUrl = '';
  const service = new WebResearchService({
    provider: 'auto',
    searxngEndpoint: 'http://127.0.0.1:8080/',
    braveApiKey: 'fallback-secret',
    fetchImpl: async (url) => {
      requestUrl = String(url);
      return jsonResponse({ results: [{ title: 'Documentazione locale', url: 'https://example.com/current', content: 'Risultato aggiornato' }] });
    }
  });
  const result = await service.search('versione corrente', { freshOnly: true, language: 'it', limit: 2 });
  const url = new URL(requestUrl);
  assert.equal(service.activeProvider(), 'searxng');
  assert.equal(result.provider, 'searxng');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('language'), 'it');
  assert.equal(result.results[0].snippet, 'Risultato aggiornato');
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
});

test('usa OpenAI Responses come ricerca live senza esporre la credenziale', async () => {
  let request;
  const service = new WebResearchService({
    provider: 'openai',
    cloudEnabled: true, openAiApiKey: 'server-secret',
    openAiModel: 'search-model',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({
        output_text: 'Risultato verificato',
        output: [{
          type: 'web_search_call',
          action: { sources: [{ title: 'Documentazione ufficiale', url: 'https://example.com/current' }] }
        }]
      });
    }
  });
  const result = await service.search('versione corrente', { freshOnly: true });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.tools, [{ type: 'web_search' }]);
  assert.equal(body.store, false);
  assert.equal(result.provider, 'openai');
  assert.equal(result.results[0].url, 'https://example.com/current');
  assert.doesNotMatch(JSON.stringify(result), /server-secret/);
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
});

test('auto seleziona OpenAI quando Brave non è configurato', () => {
  const service = new WebResearchService({ provider: 'auto', cloudEnabled: true, openAiApiKey: 'server-secret', openAiModel: 'search-model' });
  assert.equal(service.activeProvider(), 'openai');
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
});

test('in modalita auto ripiega su Wikipedia se Brave non risponde', async () => {
  const calls = [];
  const service = new WebResearchService({
    provider: 'auto',
    cloudEnabled: true, braveApiKey: 'server-secret',
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('api.search.brave.com')) return jsonResponse({}, 401);
      return jsonResponse({ query: { search: [{ title: 'Node.js', snippet: 'Runtime JavaScript' }] } });
    }
  });
  const result = await service.search('Node.js', { language: 'it' });
  assert.equal(result.provider, 'wikipedia');
  assert.equal(result.results[0].title, 'Node.js');
  assert.equal(calls.length, 2);
});

test('non spaccia Wikipedia per ricerca in tempo reale', async () => {
  const withoutLiveProvider = new WebResearchService({
    provider: 'auto',
    fetchImpl: async () => { throw new Error('non deve essere chiamato'); }
  });
  await assert.rejects(
    () => withoutLiveProvider.search('versione corrente Node.js', { freshOnly: true }),
    /provider live/
  );
  assert.deepEqual(withoutLiveProvider.capabilityState(), { state: 'degraded', mode: 'reference-only' });

  const calls = [];
  const failingLiveProvider = new WebResearchService({
    provider: 'auto',
    cloudEnabled: true, braveApiKey: 'server-secret',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return jsonResponse({}, 503);
    }
  });
  await assert.rejects(
    () => failingLiveProvider.search('versione corrente Node.js', { freshOnly: true }),
    /503/
  );
  assert.deepEqual(failingLiveProvider.capabilityState(), { state: 'degraded', mode: 'live-retrying' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.search\.brave\.com/);
});

test('una richiesta live supera il fallback in cache e usa il provider ripristinato', async () => {
  let liveAvailable = false;
  let liveCalls = 0;
  let referenceCalls = 0;
  const service = new WebResearchService({
    provider: 'auto',
    searxngEndpoint: 'http://127.0.0.1:8080/',
    fetchImpl: async (url) => {
      if (new URL(url).hostname === '127.0.0.1') {
        liveCalls += 1;
        return liveAvailable
          ? jsonResponse({ results: [{ title: 'Fonte aggiornata', url: 'https://example.com/current', content: 'Dato verificato' }] })
          : jsonResponse({}, 503);
      }
      referenceCalls += 1;
      return jsonResponse({ query: { search: [{ title: 'Nexus', snippet: 'Riferimento enciclopedico' }] } });
    }
  });
  assert.equal((await service.search('Nexus')).provider, 'wikipedia');
  assert.equal((await service.search('Nexus')).cached, true);
  liveAvailable = true;
  const result = await service.search('Nexus', { freshOnly: true });
  assert.equal(result.provider, 'searxng');
  assert.equal(result.cached, false);
  assert.equal(result.results[0].title, 'Fonte aggiornata');
  assert.equal(liveCalls, 2);
  assert.equal(referenceCalls, 1);
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
  const cachedLive = await service.search('Nexus', { freshOnly: true });
  assert.equal(cachedLive.provider, 'searxng');
  assert.equal(cachedLive.cached, true);
  assert.equal(liveCalls, 2);
});

test('un fallback in cache non nasconde il guasto a una richiesta live', async () => {
  let liveCalls = 0;
  let referenceCalls = 0;
  const service = new WebResearchService({
    provider: 'auto',
    searxngEndpoint: 'http://127.0.0.1:8080/',
    fetchImpl: async (url) => {
      if (new URL(url).hostname === '127.0.0.1') {
        liveCalls += 1;
        return jsonResponse({}, 503);
      }
      referenceCalls += 1;
      return jsonResponse({ query: { search: [{ title: 'Nexus', snippet: 'Riferimento enciclopedico' }] } });
    }
  });
  assert.equal((await service.search('Nexus')).provider, 'wikipedia');
  await assert.rejects(() => service.search('Nexus', { freshOnly: true }), /503/);
  assert.equal(liveCalls, 2);
  assert.equal(referenceCalls, 1);
  assert.deepEqual(service.capabilityState(), { state: 'degraded', mode: 'live-retrying' });
  const reference = await service.search('Nexus');
  assert.equal(reference.provider, 'wikipedia');
  assert.equal(reference.cached, true);
});

test('rifiuta URL pubblici non HTTPS e risposte non JSON', async () => {
  assert.equal(safePublicUrl('http://127.0.0.1/private'), '');
  assert.equal(safePublicUrl('https://user:pass@example.com'), '');
  assert.throws(() => safeProviderEndpoint('http://api.example/v1/responses'), /non sicuro/);
  assert.throws(() => safeProviderEndpoint('https://api.example/v1/responses?key=secret'), /non sicuro/);
  assert.equal(safeSelfHostedEndpoint('http://localhost:8080/'), 'http://localhost:8080/');
  assert.equal(safeSelfHostedEndpoint('https://search.example/'), 'https://search.example/');
  assert.throws(() => safeSelfHostedEndpoint('http://search.example/'), /HTTPS oppure loopback/);
  assert.throws(() => safeSelfHostedEndpoint('https://search.example/?token=secret'), /non contenere credenziali/);
  const service = new WebResearchService({
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html />' })
  });
  await assert.rejects(() => service.search('Nexus'), /JSON/);
});

test('filtro temporale e cache mantengono la data reale di consultazione', async () => {
  let now = Date.parse('2026-10-01T12:00:00Z');
  const calls = [];
  const service = new WebResearchService({ provider: 'searxng', searxngEndpoint: 'http://127.0.0.1:8080/', now: () => now,
    fetchImpl: async url => { calls.push(new URL(url)); return jsonResponse({ results: [{ title: 'Fonte', url: 'https://example.com/a', content: 'Dato' }] }); }
  });
  const first = await service.search('notizie', { timeRange: 'month' });
  assert.equal(calls[0].searchParams.get('time_range'), 'month');
  assert.equal(first.results[0].timeRange, 'month');
  assert.equal(first.retrievedAt, '2026-10-01T12:00:00.000Z');
  now += 1000;
  const cached = await service.search('notizie', { timeRange: 'month' });
  assert.equal(cached.cached, true);
  assert.equal(cached.retrievedAt, first.retrievedAt);
  assert.equal(cached.results[0].retrievedAt, first.retrievedAt);
  await service.search('notizie', { timeRange: 'day' });
  assert.equal(calls.length, 2);
  now += 300_000;
  const refreshed = await service.search('notizie', { timeRange: 'month' });
  assert.equal(refreshed.cached, false);
  assert.notEqual(refreshed.retrievedAt, first.retrievedAt);
});

test('il filtro temporale non viene ignorato o sostituito da un fallback', async () => {
  const service = new WebResearchService({ provider: 'auto', searxngEndpoint: 'http://127.0.0.1:8080/', fetchImpl: async () => jsonResponse({}, 503) });
  await assert.rejects(() => service.search('notizie', { timeRange: 'month' }), /503/);
  await assert.rejects(() => service.search('notizie', { timeRange: 'week' }), /settimanale nativo/);
  await assert.rejects(() => service.search('notizie', { timeRange: 'invalid' }), /Filtro temporale/);
  await assert.rejects(() => new WebResearchService({ provider: 'wikipedia' }).search('notizie', { timeRange: 'week' }), /non supporta/);
});
