const test = require('node:test');
const assert = require('node:assert/strict');
const { AIProviderRegistry } = require('../src/ai/ai-provider-registry');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { MockProvider } = require('../src/ai/providers/mock-provider');
const { AI_ERROR_CODES } = require('../src/ai/ai-errors');

test('registry registra, crea e lista provider validati', () => { const registry = new AIProviderRegistry().register('mock', (config) => new MockProvider(config)); assert.equal(registry.has('mock'), true); assert.deepEqual(registry.listProviders(), ['mock']); assert.equal(registry.create('mock', {}).name, 'mock'); assert.throws(() => registry.register('mock', () => new MockProvider()), /già registrato/); });
test('runtime inoltra health, modelli, creazione, chat ed embedding al provider attivo', async () => { const registry = new AIProviderRegistry().register('mock', (config) => new MockProvider(config)); const runtime = new AIRuntime({ registry }); await runtime.initialize({ provider: 'mock', chatModel: 'mock-chat' }); assert.equal((await runtime.health()).status, 'ready'); assert.equal((await runtime.listModels()).length, 1); const created = await runtime.createModel({ name: 'nexus-test', from: 'mock-chat', system: 'test' }); assert.equal(created.id, 'nexus-test'); assert.equal((await runtime.pullModel('qwen3:8b')).status, 'success'); const chat = await runtime.chat({ requestId: 'chat-1', mode: 'quick', messages: [{ role: 'user', content: 'ciao' }] }); assert.equal(chat.message.content, 'mock:ciao'); const embedding = await runtime.embed(['a', 'bb']); assert.equal(embedding.vectors.length, 2); assert.equal(runtime.requests.size, 0); await runtime.shutdown(); });
test('runtime impedisce collisioni e cancella soltanto la richiesta indicata', async () => { let started; const gate = new Promise((resolve) => { started = resolve; }); const provider = new MockProvider(); provider.chat = async (request) => { started(); await new Promise((resolve, reject) => { request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); }); }; const registry = new AIProviderRegistry().register('slow', () => provider); const runtime = new AIRuntime({ registry }); await runtime.initialize({ provider: 'slow' }); const pending = runtime.chat({ requestId: 'slow-1', mode: 'quick', messages: [{ role: 'user', content: 'wait' }] }); await gate; assert.equal(runtime.cancel('slow-1'), true); await assert.rejects(pending, (error) => error.code === AI_ERROR_CODES.REQUEST_CANCELLED); assert.equal(runtime.requests.size, 0); });
test('MockProvider produce streaming ed embedding deterministici senza fallback produzione', async () => { const provider = new MockProvider(); const tokens = []; const result = await provider.streamChat({ requestId: 'stream-1', mode: 'quick', messages: [{ role: 'user', content: 'x' }] }, { onToken: (token) => tokens.push(token) }); assert.deepEqual(tokens, ['mock:', 'x']); assert.equal(result.message.content, 'mock:x'); assert.deepEqual((await provider.embed('abc')).vectors, [[3, 294, 1]]); });
test('il contratto AI conserva immagini base64 valide e rifiuta payload arbitrari', async () => { const provider = new MockProvider(); const valid = await provider.chat({ requestId: 'vision-1', mode: 'deep', messages: [{ role: 'user', content: 'Descrivi', images: [Buffer.from([1, 2, 3]).toString('base64')] }] }); assert.equal(valid.message.content, 'mock:Descrivi'); await assert.rejects(() => provider.chat({ requestId: 'vision-2', mode: 'deep', messages: [{ role: 'user', content: 'Descrivi', images: ['not base64!'] }] }), /Immagine AI non valida/); });

test('runtime isola un provider instabile e consente una singola prova di recupero', async () => {
  let now = 1000;
  let attempts = 0;
  const provider = new MockProvider();
  provider.chat = async () => { attempts += 1; throw new TypeError('fetch failed'); };
  const registry = new AIProviderRegistry().register('unstable', () => provider);
  const runtime = new AIRuntime({ registry, breakerOptions: { failureThreshold: 2, resetAfterMs: 500, now: () => now } });
  await runtime.initialize({ provider: 'unstable' });
  const request = (id) => runtime.chat({ requestId: id, mode: 'quick', messages: [{ role: 'user', content: 'ciao' }] });
  await assert.rejects(request('failure-1'), (error) => error.code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE);
  await assert.rejects(request('failure-2'), (error) => error.code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(runtime.circuitStatus().chat.state, 'open');
  await assert.rejects(request('blocked'), (error) => error.code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE && error.details.retryAt === 1500);
  assert.equal(attempts, 2);
  now = 1500;
  provider.chat = async (value) => ({ requestId: value.requestId, message: { role: 'assistant', content: 'ok' } });
  assert.equal((await request('recovery')).message.content, 'ok');
  assert.equal(runtime.circuitStatus().chat.state, 'closed');
});

test('annullamenti e input non validi non aprono il circuito del provider', async () => {
  const registry = new AIProviderRegistry().register('mock', () => new MockProvider());
  const runtime = new AIRuntime({ registry, breakerOptions: { failureThreshold: 1 } });
  await runtime.initialize({ provider: 'mock' });
  await assert.rejects(() => runtime.chat({ requestId: '', mode: 'quick', messages: [] }));
  assert.equal(runtime.circuitStatus().chat.state, 'closed');
});

test('propaga anche un segnale esterno già annullato prima dell avvio provider', async () => {
  const provider = new MockProvider();
  provider.chat = async (request) => {
    assert.equal(request.signal.aborted, true);
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  };
  const registry = new AIProviderRegistry().register('cancelled', () => provider);
  const runtime = new AIRuntime({ registry });
  await runtime.initialize({ provider: 'cancelled' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.chat({ requestId: 'cancelled-before-begin', mode: 'quick', messages: [{ role: 'user', content: 'ciao' }], signal: controller.signal }),
    (error) => error.code === AI_ERROR_CODES.REQUEST_CANCELLED
  );
  assert.equal(runtime.requests.size, 0);
});

test('non riusa un requestId finché il trasporto annullato non è terminato', async () => {
  let releaseTransport;
  let providerStarted;
  const transportGate = new Promise((resolve) => { releaseTransport = resolve; });
  const started = new Promise((resolve) => { providerStarted = resolve; });
  const provider = new MockProvider();
  provider.chat = async (request) => {
    providerStarted();
    await transportGate;
    if (request.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return { requestId: request.requestId, message: { role: 'assistant', content: 'ok' } };
  };
  const registry = new AIProviderRegistry().register('slow-cancel', () => provider);
  const runtime = new AIRuntime({ registry });
  await runtime.initialize({ provider: 'slow-cancel' });
  const first = runtime.chat({ requestId: 'stable-id', mode: 'quick', messages: [{ role: 'user', content: 'prima' }] });
  await started;
  assert.equal(runtime.cancel('stable-id'), true);
  await assert.rejects(
    runtime.chat({ requestId: 'stable-id', mode: 'quick', messages: [{ role: 'user', content: 'seconda' }] }),
    (error) => error.code === AI_ERROR_CODES.CONFIGURATION_INVALID
  );
  releaseTransport();
  await assert.rejects(first, (error) => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
  assert.equal(runtime.requests.size, 0);
});
