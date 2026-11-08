const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { AgentLoop, fitMessages } = require('../src/agents/agent-loop');
const { TypedToolRegistry, validateAgainstSchema, assertSchema } = require('../src/agents/typed-tools');
const { registerCoreTools, evaluateExpression } = require('../src/agents/core-tools');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { validateChatRequest } = require('../src/ai/ai-provider');
const { OllamaProvider, inferModelCapabilities } = require('../src/ai/providers/ollama-provider');
const { AI_ERROR_CODES } = require('../src/ai/ai-errors');

// #region Helper: provider scriptato attraverso il vero AIRuntime

function scriptedRuntime(script, { tools = true } = {}) {
  const requests = [];
  const provider = {
    name: 'scripted',
    async initialize() { return this; },
    async health() { return { ok: true }; },
    async listModels() { return []; },
    getCurrentModel() { return 'scripted'; },
    async setModel() {}, async createModel() {}, async pullModel() {}, async preloadModel() {},
    getCapabilities() { return { chat: true, tools }; },
    async chat(request) {
      const valid = validateChatRequest(request);
      requests.push(valid);
      const next = script.shift();
      if (!next) throw new Error('Script esaurito');
      const message = typeof next === 'function' ? next(valid) : next;
      return { requestId: valid.requestId, provider: 'scripted', model: 'scripted', message: { role: 'assistant', content: '', ...message }, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } };
    },
    async streamChat() { throw new Error('non usato'); },
    cancel() { return false; }, async embed() { return { vectors: [] }; }, async shutdown() {}
  };
  const runtime = new AIRuntime({ registry: { create: () => provider } });
  return { runtime, requests, ready: runtime.initialize({ provider: 'scripted' }) };
}

function registry() {
  return registerCoreTools(new TypedToolRegistry(), { now: () => new Date('2026-11-06T09:30:00Z'), defaultTimeZone: 'Europe/Rome' });
}

// #endregion

test('il loop esegue più strumenti in sequenza e restituisce la risposta finale', async () => {
  const { runtime, requests, ready } = scriptedRuntime([
    { toolCalls: [{ name: 'current-time', arguments: {} }] },
    { toolCalls: [{ name: 'calculate', arguments: { expression: '(1250*0.22)+sqrt(16)' } }] },
    { content: 'Oggi è venerdì; il totale è 279.' }
  ]);
  await ready;
  const events = [];
  const agent = new AgentLoop({ runtime, tools: registry() });
  const result = await agent.run({ requestId: 'turn1', messages: [{ role: 'user', content: 'che giorno è e quanto fa 1250*22%+4?' }], onEvent: (event) => events.push(event.type) });
  assert.equal(result.stopReason, 'answer');
  assert.equal(result.steps, 3);
  assert.equal(result.content, 'Oggi è venerdì; il totale è 279.');
  assert.deepEqual(result.toolRuns.map(({ name, ok }) => [name, ok]), [['current-time', true], ['calculate', true]]);
  assert.equal(result.usage.promptTokens, 30);
  // Il terzo passo vede le due osservazioni, marcate come dati non fidati.
  const last = requests.at(-1);
  assert.equal(last.messages[0].role, 'system');
  assert.match(last.messages[0].content, /MODALITÀ AGENTE/);
  const toolMessages = last.messages.filter((message) => message.role === 'tool');
  assert.equal(toolMessages.length, 2);
  assert.match(toolMessages[1].content, /BEGIN_UNTRUSTED_TOOL_OUTPUT/);
  assert.match(toolMessages[1].content, /279/);
  assert.equal(last.tools.length, 3);
  assert.match(last.messages[0].content, /DATA CORRENTE: .*(2026-11-06|novembre 2026)/);
  assert.ok(events.includes('tool-call') && events.includes('tool-result'));
});

test('argomenti non validi e strumenti sconosciuti tornano al modello come errori correggibili', async () => {
  const { runtime, requests, ready } = scriptedRuntime([
    { toolCalls: [{ name: 'calculate', arguments: { expression: 42 } }, { name: 'delete-everything', arguments: {} }] },
    { content: 'Non posso farlo.' }
  ]);
  await ready;
  const result = await new AgentLoop({ runtime, tools: registry() }).run({ requestId: 'turn2', messages: [{ role: 'user', content: 'x' }] });
  assert.deepEqual(result.toolRuns.map(({ code }) => code), ['TOOL_ARGUMENTS_INVALID', 'TOOL_UNAVAILABLE']);
  const observations = requests.at(-1).messages.filter((message) => message.role === 'tool').map((message) => message.content).join('\n');
  assert.match(observations, /atteso string/);
});

test('uno strumento sensibile richiede consenso esplicito e un rifiuto non lo esegue', async () => {
  let executed = 0;
  const tools = registry().register({
    name: 'write-note', description: 'Scrive una nota.', risk: 'high', requiresConsent: true,
    parameters: { type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 100 } } },
    invoke: () => { executed += 1; return { saved: true }; }
  });
  for (const [decision, expected] of [[false, 0], [true, 1]]) {
    const { runtime, ready } = scriptedRuntime([{ toolCalls: [{ name: 'write-note', arguments: { text: 'ciao' } }] }, { content: 'fatto' }]);
    await ready;
    const asked = [];
    const agent = new AgentLoop({ runtime, tools, requestConsent: async (request) => { asked.push(request.tool); return decision; } });
    const result = await agent.run({ requestId: `consent-${decision}`, messages: [{ role: 'user', content: 'salva' }] });
    assert.deepEqual(asked, ['write-note']);
    assert.equal(executed, expected);
    assert.equal(result.toolRuns[0].code, decision ? 'OK' : 'TOOL_CONSENT_DENIED');
  }
  // Senza callback di consenso lo strumento non viene mai eseguito.
  const { runtime, ready } = scriptedRuntime([{ toolCalls: [{ name: 'write-note', arguments: { text: 'x' } }] }, { content: 'ok' }]);
  await ready;
  await new AgentLoop({ runtime, tools }).run({ requestId: 'noconsent', messages: [{ role: 'user', content: 'salva' }] });
  assert.equal(executed, 1);
});

test('chiamate ripetute non rieseguono effetti e il budget forza una risposta finale senza strumenti', async () => {
  let calls = 0;
  const tools = new TypedToolRegistry().register({ name: 'probe', description: 'Sonda.', parameters: { type: 'object', properties: {} }, invoke: () => { calls += 1; return calls; } });
  const loop = Array.from({ length: 3 }, () => ({ toolCalls: [{ name: 'probe', arguments: {} }] }));
  const { runtime, requests, ready } = scriptedRuntime([...loop, { content: 'conclusione' }]);
  await ready;
  const result = await new AgentLoop({ runtime, tools, maxSteps: 3 }).run({ requestId: 'budget', messages: [{ role: 'system', content: 'Sei Nexus.' }, { role: 'user', content: 'sonda' }] });
  assert.equal(calls, 1);
  assert.deepEqual(result.toolRuns.map(({ code }) => code), ['OK', 'TOOL_REPEATED', 'TOOL_REPEATED']);
  assert.equal(result.stopReason, 'max-steps');
  assert.equal(result.content, 'conclusione');
  const final = requests.at(-1);
  assert.equal(final.tools, undefined);
  assert.equal(final.messages.filter((message) => message.role === 'system').length, 1);
  assert.match(final.messages[0].content, /^Sei Nexus\.[\s\S]*BUDGET STRUMENTI ESAURITO/);
});

test('senza supporto strumenti il loop ripiega su una chat diretta', async () => {
  const { runtime, requests, ready } = scriptedRuntime([{ content: 'risposta diretta' }], { tools: false });
  await ready;
  const result = await new AgentLoop({ runtime, tools: registry() }).run({ requestId: 'plain', messages: [{ role: 'user', content: 'ciao' }] });
  assert.equal(result.stopReason, 'tools-unsupported');
  assert.equal(requests[0].tools, undefined);
  assert.equal(result.content, 'risposta diretta');
});

test('annullamento durante uno strumento interrompe il turno senza ulteriori inferenze', async () => {
  const controller = new AbortController();
  const tools = new TypedToolRegistry().register({ name: 'slow', description: 'Lento.', parameters: { type: 'object', properties: {} },
    invoke: (_args, { signal }) => new Promise((resolve) => { controller.abort(); signal.addEventListener('abort', () => resolve('tardi')); }) });
  const { runtime, requests, ready } = scriptedRuntime([{ toolCalls: [{ name: 'slow', arguments: {} }] }, { content: 'mai' }]);
  await ready;
  await assert.rejects(new AgentLoop({ runtime, tools }).run({ requestId: 'cancel', messages: [{ role: 'user', content: 'x' }], signal: controller.signal }),
    (error) => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
  assert.equal(requests.length, 1);
});

test('timeout dello strumento diventa un errore osservabile per il modello', async () => {
  const tools = new TypedToolRegistry().register({ name: 'hang', description: 'Bloccato.', timeoutMs: 100, parameters: { type: 'object', properties: {} }, invoke: () => new Promise(() => {}) });
  const { runtime, ready } = scriptedRuntime([{ toolCalls: [{ name: 'hang', arguments: {} }] }, { content: 'scaduto' }]);
  await ready;
  const result = await new AgentLoop({ runtime, tools }).run({ requestId: 'timeout', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(result.toolRuns[0].code, 'TOOL_TIMEOUT');
  assert.equal(result.content, 'scaduto');
});

test('fitMessages conserva system e turno corrente entro il limite del provider', () => {
  const history = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const transcript = [{ role: 'system', content: 's' }, ...history, { role: 'user', content: 'ora' }];
  const { messages, turnStart } = fitMessages(transcript, transcript.length - 1);
  assert.equal(messages.length, 32);
  assert.equal(messages[0].content, 's');
  assert.equal(messages.at(-1).content, 'ora');
  assert.equal(turnStart, 31);
});

test('schema JSON: validazione dei tipi, campi extra e schemi non supportati', () => {
  const schema = { type: 'object', required: ['n'], properties: { n: { type: 'integer', minimum: 1, maximum: 3 }, tags: { type: 'array', maxItems: 2, items: { type: 'string', enum: ['a', 'b'] } } } };
  assert.deepEqual(validateAgainstSchema(schema, { n: 2, tags: ['a'] }), []);
  assert.equal(validateAgainstSchema(schema, { n: 2.5 }).length, 1);
  assert.equal(validateAgainstSchema(schema, { n: 9, extra: true, tags: ['c', 'a', 'b'] }).length, 4);
  assert.throws(() => assertSchema({ type: 'object', properties: { x: { type: 'string', $ref: '#/x' } } }), /non supportata/);
  assert.throws(() => assertSchema({ type: 'object', required: ['missing'], properties: {} }), /non dichiarato/);
});

test('calcolatrice: precedenze, funzioni e input pericolosi', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('-2^2'), -4);
  assert.equal(evaluateExpression('2^-1'), 0.5);
  assert.equal(evaluateExpression('2^3^2'), 512);
  assert.equal(evaluateExpression('(1250*0,22)+sqrt(16)'), 279);
  assert.equal(evaluateExpression('0.1+0.2'), 0.3);
  assert.throws(() => evaluateExpression('1/0'), /zero/);
  assert.throws(() => evaluateExpression('process.exit(1)'), /non consentito/);
  assert.throws(() => evaluateExpression('constructor'), /non consentito/);
});

test('registro pubblico espone soltanto strumenti pubblici al modello', () => {
  const tools = registerCoreTools(new TypedToolRegistry({ audience: 'public' }), {
    knowledgeIndex: { search: () => [] }, webResearch: { search: async () => ({ results: [] }) }
  });
  assert.deepEqual(tools.definitionsForModel().map((tool) => tool.function.name), ['current-time', 'calculate', 'date-diff', 'web-search']);
  assert.equal(tools.validate('search-knowledge', { query: 'x' }).code, 'TOOL_UNAVAILABLE');
});

test('date-diff conta giorni di calendario dalla data locale e aggiunge giorni', async () => {
  const tools = registry();
  assert.deepEqual(await tools.invoke('date-diff', { to: '2026-12-25' }), { from: '2026-11-06', to: '2026-12-25', days: 49 });
  assert.equal((await tools.invoke('date-diff', { from: '2028-02-28', to: '2028-03-01' })).days, 2);
  assert.equal((await tools.invoke('date-diff', { from: '2026-03-28', addDays: 2 })).date, '2026-03-30');
  await assert.rejects(tools.invoke('date-diff', { from: '2026-02-30', to: '2026-03-01' }), /non valida/);
  await assert.rejects(tools.invoke('date-diff', { to: '2026-12-25', addDays: 3 }), /oppure/);
  // A mezzanotte e mezza UTC a Tokyo è già il giorno dopo.
  const late = registerCoreTools(new TypedToolRegistry(), { now: () => new Date('2026-11-06T23:30:00Z'), defaultTimeZone: 'Europe/Rome' });
  assert.equal((await late.invoke('date-diff', { to: '2026-11-08', timeZone: 'Asia/Tokyo' })).days, 1);
});

test('web-search ripiega senza filtro temporale non supportato e lo dichiara', async () => {
  const calls = [];
  const tools = registerCoreTools(new TypedToolRegistry(), { webResearch: { search: async (query, options) => {
    calls.push(options.timeRange);
    if (options.timeRange === 'week') throw new Error('SearXNG non supporta il filtro settimanale nativo.');
    return { provider: 'searxng', results: [{ title: 't', url: 'https://example.org', snippet: 's' }] };
  } } });
  const result = await tools.invoke('web-search', { query: 'novità', timeRange: 'week' });
  assert.deepEqual(calls, ['week', '']);
  assert.equal(result.timeRangeApplied, false);
  assert.equal(result.results.length, 1);
});

test('validateChatRequest accetta tool calling e rifiuta definizioni malformate', () => {
  const valid = validateChatRequest({ requestId: 'v1', messages: [
    { role: 'user', content: 'x' },
    { role: 'assistant', content: '', toolCalls: [{ name: 'calculate', arguments: { expression: '1+1' } }] },
    { role: 'tool', toolName: 'calculate', content: '2' }
  ], tools: [{ type: 'function', function: { name: 'calculate', parameters: { type: 'object', properties: {} } } }] });
  assert.equal(valid.messages[1].toolCalls[0].id, 'call_0');
  assert.equal(valid.messages[2].toolName, 'calculate');
  assert.throws(() => validateChatRequest({ requestId: 'v2', messages: [{ role: 'assistant', content: '' }] }), /non valido/);
  assert.throws(() => validateChatRequest({ requestId: 'v3', messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'bad name', parameters: { type: 'object' } } }] }), /non valida/);
  assert.throws(() => validateChatRequest({ requestId: 'v4', messages: [{ role: 'user', content: 'x' }], tools: [] }), /da 1 a/);
});

// #region Ollama: formato wire del function calling

async function ollamaServer(handler) {
  const instance = http.createServer(handler);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${instance.address().port}`, close: () => new Promise((resolve) => instance.close(resolve)) };
}

test('Ollama inoltra tools, converte i messaggi e normalizza tool_calls', async () => {
  let body;
  const local = await ollamaServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ model: 'qwen3:14b', done: true, message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'calculate', arguments: '{"expression":"2+2"}' } }] } }));
  });
  try {
    const config = { provider: 'ollama', ollama: { baseUrl: local.url, timeoutMs: 1000 }, chatModel: 'qwen3:14b' };
    const provider = new OllamaProvider(config);
    await provider.initialize(config);
    const result = await provider.chat({ requestId: 'o1', mode: 'quick', think: false, messages: [
      { role: 'user', content: 'quanto fa?' },
      { role: 'assistant', content: '', toolCalls: [{ name: 'current-time', arguments: {} }] },
      { role: 'tool', toolName: 'current-time', content: '{"iso":"x"}' }
    ], tools: [{ type: 'function', function: { name: 'calculate', description: 'calc', parameters: { type: 'object', properties: {} } } }] });
    assert.equal(body.tools[0].function.name, 'calculate');
    assert.deepEqual(body.messages[1].tool_calls, [{ function: { name: 'current-time', arguments: {} } }]);
    assert.equal(body.messages[1].toolCalls, undefined);
    assert.equal(body.messages[2].tool_name, 'current-time');
    assert.equal(result.finishReason, 'tool_calls');
    assert.deepEqual(result.message.toolCalls, [{ id: 'call_0', name: 'calculate', arguments: { expression: '2+2' } }]);
    // Senza tools nella richiesta una tool_call del modello viene ignorata e
    // un contenuto vuoto resta un errore, come prima.
    await assert.rejects(provider.chat({ requestId: 'o2', mode: 'quick', messages: [{ role: 'user', content: 'x' }] }),
      (error) => error.code === AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE);
  } finally { await local.close(); }
});

test('capability tools dedotte solo per famiglie con function calling', () => {
  assert.equal(inferModelCapabilities('qwen3:14b').tools, true);
  assert.equal(inferModelCapabilities('library/llama3.1:8b').tools, true);
  assert.equal(inferModelCapabilities('gemma2:9b').tools, false);
  assert.equal(inferModelCapabilities('nomic-embed-text').tools, false);
});

// #endregion
