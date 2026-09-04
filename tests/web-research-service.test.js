const test = require('node:test');
const assert = require('node:assert/strict');
const { WebResearchService, safeProviderEndpoint, safePublicUrl } = require('../src/research/web-research-service');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    text: async () => JSON.stringify(payload)
  };
}

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
    braveApiKey: 'server-secret',
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

test('usa OpenAI Responses come ricerca live senza esporre la credenziale', async () => {
  let request;
  const service = new WebResearchService({
    provider: 'openai',
    openAiApiKey: 'server-secret',
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
  const service = new WebResearchService({ provider: 'auto', openAiApiKey: 'server-secret', openAiModel: 'search-model' });
  assert.equal(service.activeProvider(), 'openai');
  assert.deepEqual(service.capabilityState(), { state: 'available', mode: 'live' });
});

test('in modalita auto ripiega su Wikipedia se Brave non risponde', async () => {
  const calls = [];
  const service = new WebResearchService({
    provider: 'auto',
    braveApiKey: 'server-secret',
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
    braveApiKey: 'server-secret',
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

test('rifiuta URL pubblici non HTTPS e risposte non JSON', async () => {
  assert.equal(safePublicUrl('http://127.0.0.1/private'), '');
  assert.equal(safePublicUrl('https://user:pass@example.com'), '');
  assert.throws(() => safeProviderEndpoint('http://api.example/v1/responses'), /non sicuro/);
  assert.throws(() => safeProviderEndpoint('https://api.example/v1/responses?key=secret'), /non sicuro/);
  const service = new WebResearchService({
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html />' })
  });
  await assert.rejects(() => service.search('Nexus'), /JSON/);
});
