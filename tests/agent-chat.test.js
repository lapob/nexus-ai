const test = require('node:test');
const assert = require('node:assert/strict');
const { agentModelFor, createTurnTools, createNativeToolConsent, runAgentTurn } = require('../src/application/agent-chat');
const { validateSettings, mergeSettings, DEFAULTS } = require('../src/core/config');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { validateChatRequest } = require('../src/ai/ai-provider');

test('agentMode è opt-in, persiste e resta booleano', () => {
  assert.equal(validateSettings({}, DEFAULTS.ai).agentMode, false);
  const enabled = mergeSettings(validateSettings({}, DEFAULTS.ai), { agentMode: true });
  assert.equal(enabled.agentMode, true);
  assert.equal(mergeSettings(enabled, { temperature: 0.2 }).agentMode, true);
  assert.equal(mergeSettings(enabled, { agentMode: 'yes' }).agentMode, false);
});

test('idoneità agente: opt-in, solo privato, niente allegati, solo modelli con strumenti', () => {
  const settings = { agentMode: true, chatModel: 'qwen3:14b' };
  const base = { settings, selectedModel: 'qwen3:8b', distributionMode: 'developer', providerTools: true };
  assert.equal(agentModelFor(base), 'qwen3:8b');
  assert.equal(agentModelFor({ ...base, settings: { ...settings, agentMode: false } }), null);
  assert.equal(agentModelFor({ ...base, distributionMode: 'public' }), null);
  assert.equal(agentModelFor({ ...base, attachmentCount: 1 }), null);
  assert.equal(agentModelFor({ ...base, providerTools: false }), null);
  assert.equal(agentModelFor({ ...base, selectedModel: 'gemma2:2b' }), 'qwen3:14b');
  assert.equal(agentModelFor({ ...base, selectedModel: 'gemma2:2b', settings: { agentMode: true, chatModel: 'phi3' } }), null);
});

test('gli strumenti del turno raccolgono soltanto fonti web HTTPS deduplicate', async () => {
  const tools = createTurnTools({
    getIndex: () => ({ search: () => [{ title: 'Nota', heading: 'H', relativePath: 'a.md', status: 'verified', text: 'testo' }] }),
    webResearchService: { search: async () => ({ provider: 'searxng', retrievedAt: '2026-11-06T00:00:00Z', results: [
      { title: 'Uno', url: 'https://example.org/a', snippet: 's' },
      { title: 'Doppio', url: 'https://example.org/a', snippet: 's' },
      { title: 'Insicuro', url: 'http://example.org/b', snippet: 's' }
    ] }) }
  });
  assert.deepEqual(tools.registry.list().map((tool) => tool.name), ['current-time', 'calculate', 'date-diff', 'search-knowledge', 'web-search', 'update-plan']);
  await tools.registry.invoke('web-search', { query: 'novità' });
  assert.deepEqual(tools.sources.map((source) => source.url), ['https://example.org/a']);
  assert.equal(tools.sources[0].sourceKind, 'web');
  const notes = await tools.registry.invoke('search-knowledge', { query: 'nota' });
  assert.equal(notes[0].path, 'a.md');
});

test('un indice non disponibile non impedisce gli altri strumenti', () => {
  const tools = createTurnTools({ getIndex: () => { throw new Error('non pronto'); } });
  assert.deepEqual(tools.registry.list().map((tool) => tool.name), ['current-time', 'calculate', 'date-diff', 'update-plan']);
});

test('consenso nativo: rifiuto, finestra chiusa e annullamento non autorizzano', async () => {
  const window = { isDestroyed: () => false };
  const answer = (response) => ({ showMessageBox: async () => ({ response }) });
  assert.equal(await createNativeToolConsent({ dialog: answer(1), getWindow: () => window })({ tool: 'x', risk: 'high' }), true);
  assert.equal(await createNativeToolConsent({ dialog: answer(0), getWindow: () => window })({ tool: 'x', risk: 'high' }), false);
  assert.equal(await createNativeToolConsent({ dialog: answer(1), getWindow: () => null })({ tool: 'x', risk: 'high' }), false);
  const controller = new AbortController(); controller.abort();
  assert.equal(await createNativeToolConsent({ dialog: answer(1), getWindow: () => window })({ tool: 'x', risk: 'high', signal: controller.signal }), false);
});

test('runAgentTurn inoltra le opzioni runtime, pubblica le fasi e restituisce le fonti', async () => {
  const seen = [];
  const script = [
    { content: '', toolCalls: [{ name: 'web-search', arguments: { query: 'release' } }] },
    { content: 'Vedi [Uno](https://example.org/a).' }
  ];
  const provider = {
    name: 'scripted', async initialize() { return this; }, async health() { return {}; }, async listModels() { return []; }, getCurrentModel() { return 'qwen3:14b'; },
    async setModel() {}, async createModel() {}, async pullModel() {}, async preloadModel() {}, getCapabilities() { return { tools: true }; },
    async chat(request) { const valid = validateChatRequest(request); seen.push(valid); return { model: 'qwen3:14b', message: { role: 'assistant', ...script.shift() }, usage: {} }; },
    async streamChat() {}, cancel() {}, async embed() {}, async shutdown() {}
  };
  const aiRuntime = new AIRuntime({ registry: { create: () => provider } });
  await aiRuntime.initialize({ provider: 'scripted' });
  const tools = createTurnTools({ aiRuntime, webResearchService: { search: async () => ({ provider: 'searxng', results: [{ title: 'Uno', url: 'https://example.org/a', snippet: 's' }] }) } });
  const phases = [];
  const outcome = await runAgentTurn({ aiRuntime, requestId: 'chat1', messages: [{ role: 'system', content: 'Sei Nexus.' }, { role: 'user', content: 'ultima release?' }],
    model: 'qwen3:14b', mode: 'quick', requestOptions: { numCtx: 8192, maxTokens: 512, tools: 'ignorato' }, tools, onPhase: (label) => phases.push(label) });
  assert.equal(outcome.content, 'Vedi [Uno](https://example.org/a).');
  assert.equal(outcome.sources.length, 1);
  assert.deepEqual(phases, ['Cerco fonti aggiornate sul web']);
  assert.equal(seen[0].numCtx, 8192);
  assert.equal(seen[0].maxTokens, 512);
  assert.equal(Array.isArray(seen[0].tools), true);
});
