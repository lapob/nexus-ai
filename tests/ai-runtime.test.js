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

test('un segnale esterno già annullato impedisce l avvio del provider', async () => {
  let calls = 0;
  const provider = new MockProvider();
  provider.chat = async (request) => {
    calls++;
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
  assert.equal(calls, 0);
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


test('il pet riceve solo stati reali e resta attivo fino alla fine delle richieste concorrenti', async () => {
  const pending = new Map();
  const provider = new MockProvider();
  provider.streamChat = (request, handlers) => new Promise((resolve) => {
    pending.set(request.requestId, { token: () => handlers.onToken('private content'), resolve });
  });
  const runtime = new AIRuntime({ registry: new AIProviderRegistry().register('mock', () => provider) });
  await runtime.initialize({ provider: 'mock' });
  const states = [], tokens = [];
  runtime.subscribeActivity(() => { throw new Error('Broken visual observer'); });
  const unsubscribe = runtime.subscribeActivity(state => states.push(state));
  const request = id => runtime.streamChat({ requestId: id, mode: 'quick', messages: [{ role: 'user', content: 'private prompt' }] }, { onToken: token => tokens.push(token) });
  const first = request('first'), second = request('second');
  pending.get('first').token();
  pending.get('first').resolve({}); await first;
  assert.deepEqual(states, ['thinking', 'responding', 'thinking']);
  pending.get('second').resolve({}); await second;
  assert.deepEqual(states, ['thinking', 'responding', 'thinking', 'idle']);
  assert.deepEqual(tokens, ['private content']);
  unsubscribe(); await runtime.shutdown();
});

test('annullamento scarta anche una risposta completa di un provider che ignora il signal', async () => {
  let release;
  const provider = new MockProvider();
  provider.chat = () => new Promise(resolve => { release = resolve; });
  const runtime = new AIRuntime({ registry: new AIProviderRegistry().register('mock', () => provider) });
  await runtime.initialize({ provider: 'mock' });
  const pending = runtime.chat({ requestId: 'late-full', messages: [{ role: 'user', content: 'prima' }] });
  runtime.cancel('late-full'); release({ message: { content: 'late answer' } });
  await assert.rejects(pending, error => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
  assert.equal(runtime.requests.size, 0); assert.equal(runtime.circuitStatus().chat.failures, 0);
});

test('token, ragionamento e completamento buffered dopo cancel non raggiungono UI o attività', async () => {
  const provider = new MockProvider(), events = [], states = [];
  provider.streamChat = async (_request, handlers) => {
    handlers.onStart({}); handlers.onToken('first');
    handlers.onThinking('late reasoning'); handlers.onToken('late');
    handlers.onComplete({ message: { content: 'late complete' } }); handlers.onCancel();
    return { message: { content: 'late result' } };
  };
  const runtime = new AIRuntime({ registry: new AIProviderRegistry().register('mock', () => provider) });
  await runtime.initialize({ provider: 'mock' }); runtime.subscribeActivity(state => states.push(state));
  await assert.rejects(runtime.streamChat({ requestId: 'buffered', messages: [{ role: 'user', content: 'hi' }] }, {
    onStart: () => events.push('start'),
    onToken: token => { events.push(token); runtime.cancel('buffered'); },
    onThinking: () => events.push('thinking'), onComplete: () => events.push('complete'),
    onCancel: () => events.push('cancel')
  }), error => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
  assert.deepEqual(events, ['start', 'first', 'cancel']);
  assert.deepEqual(states, ['thinking', 'responding', 'idle']);
});

test('callback conservate dal provider dopo il finally non riattivano il core', async () => {
  const provider = new MockProvider(), events = [], states = []; let saved;
  provider.streamChat = async (_request, handlers) => { saved = handlers; return {}; };
  const runtime = new AIRuntime({ registry: new AIProviderRegistry().register('mock', () => provider) });
  await runtime.initialize({ provider: 'mock' }); runtime.subscribeActivity(state => states.push(state));
  await runtime.streamChat({ requestId: 'finished', messages: [{ role: 'user', content: 'hi' }] }, {
    onToken: () => events.push('token'), onThinking: () => events.push('thinking'),
    onComplete: () => events.push('complete'), onError: () => events.push('error'), onCancel: () => events.push('cancel')
  });
  saved.onToken('late'); saved.onThinking('late'); saved.onComplete({}); saved.onError({}); saved.onCancel();
  assert.deepEqual(events, []); assert.deepEqual(states, ['thinking', 'idle']); assert.equal(runtime.activity.size, 0);
});

test('i listener di abort esterni si liberano dopo successo, errore e shutdown', async () => {
  const { getEventListeners } = require('node:events');
  const provider = new MockProvider(), external = new AbortController();
  const runtime = new AIRuntime({ registry: new AIProviderRegistry().register('mock', () => provider) });
  await runtime.initialize({ provider: 'mock' });
  const request = id => ({ requestId: id, signal: external.signal, messages: [{ role: 'user', content: 'hi' }] });
  for (let i = 0; i < 20; i++) await runtime.chat(request('complete-' + i));
  assert.equal(getEventListeners(external.signal, 'abort').length, 0);
  provider.chat = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(runtime.chat(request('failed'))); assert.equal(getEventListeners(external.signal, 'abort').length, 0);
  let release; provider.chat = () => new Promise(resolve => { release = resolve; });
  const pending = runtime.chat(request('shutdown')); assert.equal(getEventListeners(external.signal, 'abort').length, 1);
  await runtime.shutdown(); assert.equal(getEventListeners(external.signal, 'abort').length, 0);
  release({}); await assert.rejects(pending, error => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
});

test('finally ed errori della vecchia sessione non cancellano richieste o circuito della nuova', async () => {
  const old = new MockProvider(), fresh = new MockProvider(); let rejectOld, resolveFresh, call = 0;
  old.chat = () => new Promise((_resolve, reject) => { rejectOld = reject; });
  fresh.chat = () => new Promise(resolve => { resolveFresh = resolve; });
  const registry = new AIProviderRegistry().register('mock', () => call++ === 0 ? old : fresh);
  const runtime = new AIRuntime({ registry, breakerOptions: { failureThreshold: 1 } });
  await runtime.initialize({ provider: 'mock' });
  const request = { requestId: 'shared-id', messages: [{ role: 'user', content: 'hi' }] };
  const previous = runtime.chat(request); await runtime.initialize({ provider: 'mock' });
  const next = runtime.chat(request), controller = runtime.requests.get('shared-id');
  rejectOld(new TypeError('fetch failed'));
  await assert.rejects(previous, error => error.code === AI_ERROR_CODES.REQUEST_CANCELLED);
  assert.equal(runtime.requests.get('shared-id'), controller); assert.equal(runtime.activity.get('shared-id'), 'thinking');
  assert.equal(runtime.circuitStatus().chat.state, 'closed');
  resolveFresh({ message: { content: 'current' } }); assert.equal((await next).message.content, 'current');
  assert.equal(runtime.requests.size, 0);
});
