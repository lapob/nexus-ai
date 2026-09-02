const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { OllamaProvider, inferModelCapabilities, normalizeQwenContent } = require('../src/ai/providers/ollama-provider');
const { AI_ERROR_CODES } = require('../src/ai/ai-errors');

const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69,
  77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
  123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
  993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

async function server(handler) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const instance = http.createServer(handler);
    await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
    const port = instance.address().port;
    if (FETCH_FORBIDDEN_PORTS.has(port)) {
      await new Promise((resolve) => instance.close(resolve));
      continue;
    }
    return {
      url: `http://127.0.0.1:${port}`,
      close: () => new Promise((resolve) => instance.close(resolve))
    };
  }
  throw new Error('Windows non ha assegnato una porta HTTP sicura al server di test.');
}
function json(response, data, status = 200) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); }
async function providerFor(url, options = {}) { const provider = new OllamaProvider({ provider: 'ollama', ollama: { baseUrl: url, timeoutMs: options.timeoutMs || 1000 }, chatModel: options.chatModel ?? 'qwen:test', embeddingModel: options.embeddingModel ?? 'embed:test' }); await provider.initialize({ provider: 'ollama', ollama: { baseUrl: url, timeoutMs: options.timeoutMs || 1000 }, chatModel: options.chatModel ?? 'qwen:test', embeddingModel: options.embeddingModel ?? 'embed:test' }); return provider; }

test('health distingue READY, nessun modello e modello selezionato assente', async () => { let models = [{ name: 'qwen:test', model: 'qwen:test', size: 42, modified_at: '2026-01-01T00:00:00Z' }]; const local = await server((request, response) => request.url === '/api/version' ? json(response, { version: '1.2.3' }) : json(response, { models })); try { const provider = await providerFor(local.url); assert.equal((await provider.health()).status, 'ready'); models = []; assert.equal((await provider.health()).status, 'degraded'); models = [{ name: 'other', model: 'other' }]; assert.equal((await provider.health()).error.code, AI_ERROR_CODES.MODEL_NOT_FOUND); } finally { await local.close(); } });
test('health distingue OFFLINE, timeout e risposta fondamentale invalida', async () => { const timeoutServer = await server((_request, response) => setTimeout(() => json(response, { models: [] }), 350)); const timeoutProvider = await providerFor(timeoutServer.url, { timeoutMs: 250 }); assert.equal((await timeoutProvider.health()).status, 'offline'); await timeoutServer.close(); const invalid = await server((_request, response) => json(response, { nope: true })); try { const provider = await providerFor(invalid.url); assert.equal((await provider.health()).status, 'error'); } finally { await invalid.close(); } });
test('listModels normalizza descrittori e setModel valida esistenza', async () => { const local = await server((_request, response) => json(response, { models: [{ name: 'alpha', model: 'alpha', size: 99 }] })); try { const provider = await providerFor(local.url); const models = await provider.listModels(); assert.equal(models[0].provider, 'ollama'); assert.equal(models[0].capabilities.streaming, true); await assert.rejects(provider.setModel('missing'), (error) => error.code === AI_ERROR_CODES.MODEL_NOT_FOUND); assert.equal((await provider.setModel('alpha')).id, 'alpha'); } finally { await local.close(); } });
test('chat normalizza la risposta e disattiva il thinking in modalità rapida', async () => {
  let body;
  const local = await server(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    json(response, { model: 'qwen:test', message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop', prompt_eval_count: 2, eval_count: 3 });
  });
  try {
    const provider = await providerFor(local.url);
    const result = await provider.chat({ requestId: 'c1', mode: 'quick', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.message.content, 'ok');
    assert.equal(result.usage.totalTokens, 5);
    assert.equal(body.think, false);
  } finally { await local.close(); }
});
test('chat principale diretta disattiva il thinking senza esporre tracce legacy', async () => {
  let body;
  const local = await server(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    json(response, {
      model: 'qwen3:14b',
      message: { role: 'assistant', content: '<think>traccia privata</think>2,4,6' },
      done: true,
      done_reason: 'stop'
    });
  });
  try {
    const provider = await providerFor(local.url);
    const result = await provider.chat({
      requestId: 'deep-direct',
      model: 'qwen3:14b',
      mode: 'deep',
      think: false,
      messages: [{ role: 'user', content: 'Calcola il risultato.' }]
    });
    assert.equal(body.think, false);
    assert.match(body.messages.at(-1).content, /^\/no_think\b/);
    assert.equal(result.message.content, '2,4,6');
  } finally { await local.close(); }
});
test('chat inoltra uno schema di output strutturato', async () => {
  let body;
  const local = await server(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    json(response, { model: 'qwen:test', message: { role: 'assistant', content: '{"ok":true}' }, done: true });
  });
  try {
    const provider = await providerFor(local.url);
    const format = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    await provider.chat({ requestId: 'json-schema', mode: 'quick', format, messages: [{ role: 'user', content: 'JSON' }] });
    assert.deepEqual(body.format, format);
  } finally { await local.close(); }
});
test('chat non streaming rispetta il timeout adattivo della singola richiesta', async () => {
  const local = await server((_request, response) => setTimeout(() => {
    json(response, { model: 'qwen:test', message: { role: 'assistant', content: 'ok' }, done: true });
  }, 350));
  try {
    const provider = await providerFor(local.url, { timeoutMs: 250 });
    const result = await provider.chat({ requestId: 'adaptive-timeout', timeoutMs: 800, messages: [{ role: 'user', content: 'attendi' }] });
    assert.equal(result.message.content, 'ok');
  } finally { await local.close(); }
});
test('streaming gestisce chunk spezzati e ultima riga senza newline', async () => { const local = await server((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.write('{"model":"qwen:test","message":{"content":"hel'); setTimeout(() => { response.write('lo"},"done":false}\n'); response.end('{"model":"qwen:test","message":{"content":"!"},"done":true,"done_reason":"stop"}'); }, 5); }); try { const provider = await providerFor(local.url); const tokens = []; let completed = 0; const result = await provider.streamChat({ requestId: 's1', mode: 'quick', messages: [{ role: 'user', content: 'hi' }] }, { onToken: (token) => tokens.push(token), onComplete: () => completed++ }); assert.deepEqual(tokens, ['hello', '!']); assert.equal(result.message.content, 'hello!'); assert.equal(completed, 1); } finally { await local.close(); } });
test('streaming abilita il thinking soltanto in modalità deep', async () => {
  let body;
  const local = await server(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.end('{"model":"qwen:test","message":{"content":"ok"},"done":true,"done_reason":"stop"}\n');
  });
  try {
    const provider = await providerFor(local.url);
    await provider.streamChat({ requestId: 'deep-1', mode: 'deep', messages: [{ role: 'user', content: 'analizza' }] });
    assert.equal(body.think, true);
  } finally { await local.close(); }
});

test('Qwen3 rapido non espone il ragionamento legacy nello stream', async () => {
  const local = await server((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.write('{"model":"qwen3:4b","message":{"content":"Analizzo internamente"},"done":false}\n');
    response.write('{"model":"qwen3:4b","message":{"content":"</think>"},"done":false}\n');
    response.end('{"model":"qwen3:4b","message":{"content":"NEXUSNXS pronto"},"done":true,"done_reason":"stop"}\n');
  });
  try {
    const provider = await providerFor(local.url);
    const tokens = [];
    const result = await provider.streamChat({
      requestId: 'qwen-quick',
      model: 'qwen3:4b',
      mode: 'quick',
      messages: [{ role: 'user', content: 'stato' }]
    }, { onToken: (token) => tokens.push(token) });
    assert.equal(tokens.join(''), 'NEXUSNXS pronto');
    assert.equal(result.message.content, 'NEXUSNXS pronto');
  } finally { await local.close(); }
});
test('streaming invalido emette onError una sola volta', async () => { const local = await server((_request, response) => { response.writeHead(200); response.end('{bad}\n'); }); try { const provider = await providerFor(local.url); let errors = 0; await assert.rejects(provider.streamChat({ requestId: 's2', mode: 'quick', messages: [{ role: 'user', content: 'hi' }] }, { onError: () => errors++ }), (error) => error.code === AI_ERROR_CODES.STREAM_INTERRUPTED); assert.equal(errors, 1); } finally { await local.close(); } });
test('embed accetta batch e valida vettori', async () => { const local = await server((_request, response) => json(response, { model: 'embed:test', embeddings: [[1, 0], [0, 1]], prompt_eval_count: 4 })); try { const provider = await providerFor(local.url); const result = await provider.embed(['a', 'b']); assert.equal(result.dimensions, 2); assert.equal(result.vectors.length, 2); } finally { await local.close(); } });
test('precarica il modello senza dipendere da variabili della chat', async () => {
  let body;
  const local = await server(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    json(response, { model: body.model, done: true, load_duration: 42 });
  });
  try {
    const provider = await providerFor(local.url);
    const result = await provider.preloadModel('qwen:test', { keepAlive: '10m', numCtx: 4096 });
    assert.equal(result.status, 'ready');
    assert.equal(result.loadDurationNs, 42);
    assert.deepEqual(body, { model: 'qwen:test', prompt: '', stream: false, keep_alive: '10m', options: { num_ctx: 4096 } });
  } finally { await local.close(); }
});
test('il keep-warm non espelle un modello diverso gia caricato su runtime a singolo slot', async () => {
  let generated = false;
  const local = await server(async (request, response) => {
    if (request.url === '/api/ps') {
      json(response, { models: [{ name: 'qwen3:14b' }] });
      return;
    }
    generated = true;
    json(response, { model: 'qwen3:8b', done: true, load_duration: 42 });
  });
  try {
    const provider = await providerFor(local.url);
    const result = await provider.preloadModel('qwen3:8b', { preserveLoadedModel: true });
    assert.equal(result.preserved, true);
    assert.equal(result.model, 'qwen3:14b');
    assert.equal(result.requestedModel, 'qwen3:8b');
    assert.equal(generated, false);
  } finally { await local.close(); }
});
test('un turno rapido riusa il modello principale residente senza ricaricare quello rapido', async () => {
  let chatBody;
  const local = await server(async (request, response) => {
    if (request.url === '/api/ps') return json(response, { models: [{ name: 'qwen3:14b' }] });
    let raw = '';
    for await (const chunk of request) raw += chunk;
    chatBody = JSON.parse(raw);
    return json(response, { model: chatBody.model, message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' });
  });
  try {
    const provider = await providerFor(local.url, { chatModel: 'qwen3:14b' });
    const result = await provider.chat({
      requestId: 'resident-quick', model: 'qwen3:8b', mode: 'quick', reuseLoadedModel: true,
      reusableModels: ['qwen3:8b', 'qwen3:14b'], messages: [{ role: 'user', content: 'Ciao' }]
    });
    assert.equal(chatBody.model, 'qwen3:14b');
    assert.equal(result.model, 'qwen3:14b');
  } finally { await local.close(); }
});
test('lo streaming rapido applica la stessa residenza senza doppio rilevamento', async () => {
  let probes = 0;
  let chatBody;
  const local = await server(async (request, response) => {
    if (request.url === '/api/ps') { probes += 1; return json(response, { models: [{ name: 'qwen3:14b' }] }); }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    chatBody = JSON.parse(raw);
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.end(`${JSON.stringify({ model: chatBody.model, message: { content: 'ok' }, done: true, done_reason: 'stop' })}\n`);
  });
  try {
    const provider = await providerFor(local.url, { chatModel: 'qwen3:14b' });
    const result = await provider.streamChat({
      requestId: 'resident-stream', model: 'qwen3:8b', mode: 'quick', reuseLoadedModel: true,
      reusableModels: ['qwen3:8b', 'qwen3:14b'], messages: [{ role: 'user', content: 'Ciao' }]
    });
    assert.equal(probes, 1);
    assert.equal(chatBody.model, 'qwen3:14b');
    assert.equal(result.model, 'qwen3:14b');
  } finally { await local.close(); }
});
test('un turno deep mantiene il modello principale anche se quello rapido risulta residente', async () => {
  let probed = false;
  let chatBody;
  const local = await server(async (request, response) => {
    if (request.url === '/api/ps') { probed = true; return json(response, { models: [{ name: 'qwen3:8b' }] }); }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    chatBody = JSON.parse(raw);
    return json(response, { model: chatBody.model, message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' });
  });
  try {
    const provider = await providerFor(local.url, { chatModel: 'qwen3:14b' });
    await provider.chat({
      requestId: 'resident-deep', model: 'qwen3:14b', mode: 'deep', reuseLoadedModel: true,
      reusableModels: ['qwen3:8b', 'qwen3:14b'], messages: [{ role: 'user', content: 'Analizza' }]
    });
    assert.equal(probed, false);
    assert.equal(chatBody.model, 'qwen3:14b');
  } finally { await local.close(); }
});
test('una selezione primaria quick non viene declassata al modello rapido residente', async () => {
  let probed = false;
  let chatBody;
  const local = await server(async (request, response) => {
    if (request.url === '/api/ps') { probed = true; return json(response, { models: [{ name: 'qwen3:8b' }] }); }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    chatBody = JSON.parse(raw);
    return json(response, { model: chatBody.model, message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' });
  });
  try {
    const provider = await providerFor(local.url, { chatModel: 'qwen3:14b' });
    await provider.chat({
      requestId: 'quality-primary', model: 'qwen3:14b', mode: 'quick', reuseLoadedModel: true,
      reusableModels: ['qwen3:8b', 'qwen3:14b'], messages: [{ role: 'user', content: 'Verifica' }]
    });
    assert.equal(probed, false);
    assert.equal(chatBody.model, 'qwen3:14b');
  } finally { await local.close(); }
});
test('scarica un modello con avanzamento NDJSON validato', async () => {
  const local = await server((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.write('{"status":"pulling","total":100,"completed":50}\n');
    response.end('{"status":"success","total":100,"completed":100}\n');
  });
  try {
    const provider = await providerFor(local.url);
    const events = [];
    const result = await provider.pullModel('qwen3:8b', { onProgress: (event) => events.push(event) });
    assert.equal(result.status, 'success');
    assert.deepEqual(events.map((event) => event.percent), [50, 100]);
  } finally { await local.close(); }
});

test('classifica conservativamente i modelli embedding', () => {
  assert.equal(inferModelCapabilities('qwen3:8b').chat, true);
  assert.equal(inferModelCapabilities('embeddinggemma:latest').embeddings, true);
  assert.equal(inferModelCapabilities('nomic-embed-text:latest').chat, false);
});

test('normalizza il contenuto legacy di Qwen3 senza alterare altri modelli', () => {
  assert.equal(normalizeQwenContent('qwen3:4b', 'quick', 'ragionamento</think>Risposta', 'stop'), 'Risposta');
  assert.equal(normalizeQwenContent('qwen3:4b', 'quick', 'Risposta valida ma troncata', 'length'), 'Risposta valida ma troncata');
  assert.equal(normalizeQwenContent('qwen3:4b', 'quick', '<think>ragionamento', 'length'), '');
  assert.equal(normalizeQwenContent('llama3:8b', 'quick', 'Risposta', 'stop'), 'Risposta');
});

test('il tooling sviluppatore crea un artefatto ufficiale soltanto da una base chat installata', async () => {
  let models = [{ name: 'qwen:test', model: 'qwen:test' }];
  let createBody;
  const local = await server(async (request, response) => {
    if (request.url === '/api/tags') return json(response, { models });
    if (request.url === '/api/create') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      createBody = JSON.parse(raw);
      models = [...models, { name: createBody.model, model: createBody.model }];
      return json(response, { status: 'success' });
    }
    return json(response, { version: '1.2.3' });
  });
  try {
    const provider = await providerFor(local.url);
    const created = await provider.createModel({
      name: 'nexus-personal',
      from: 'qwen:test',
      system: 'Sei NEXUSNXS.',
      numCtx: 8192,
      temperature: 0.25
    });
    assert.equal(created.id, 'nexus-personal');
    assert.deepEqual(createBody.parameters, { num_ctx: 8192, temperature: 0.25 });
    assert.equal(createBody.stream, false);
    await assert.rejects(provider.createModel({
      name: 'nexus-personal',
      from: 'qwen:test',
      system: 'duplicato'
    }), (error) => error.code === AI_ERROR_CODES.CONFIGURATION_INVALID);
  } finally {
    await local.close();
  }
});

test('shutdown interrompe anche richieste Ollama non associate a una chat', async () => {
  const provider = new OllamaProvider({
    provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', timeoutMs: 10_000 }, chatModel: 'qwen:test'
  }, {
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })
  });
  await provider.initialize({ provider: 'ollama', ollama: { baseUrl: 'http://127.0.0.1:11434', timeoutMs: 10_000 }, chatModel: 'qwen:test' });
  const pending = provider.listModels();
  await new Promise((resolve) => setImmediate(resolve));

  await provider.shutdown();
  await assert.rejects(pending);
  assert.equal(provider.initialized, false);
});
