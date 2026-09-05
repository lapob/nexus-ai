const test = require('node:test');
const assert = require('node:assert/strict');
const { NexusServiceProvider, publicActivityText, publicServiceUrl } = require('../src/ai/providers/nexus-service-provider');

test('il client pubblico accetta soltanto origini HTTPS pulite', () => {
  assert.equal(publicServiceUrl('https://ai.example.com/'), 'https://ai.example.com');
  assert.throws(() => publicServiceUrl('http://ai.example.com'), /HTTPS/);
  assert.throws(() => publicServiceUrl('https://user:pass@ai.example.com'), /HTTPS/);
  assert.equal(publicServiceUrl(''), '');
});

test('il provider pubblico non offre download o creazione di modelli', async () => {
  const provider = new NexusServiceProvider({ service: { baseUrl: '' } });
  assert.equal(provider.getCapabilities().remoteInference, true);
  assert.equal(provider.getCapabilities().modelManagement, false);
  assert.equal(provider.getCapabilities().voiceTranscription, true);
  await assert.rejects(provider.pullModel('model'), /gestiti dal servizio/);
  await assert.rejects(provider.createModel({}), /sviluppatore/);
});

test('il client desktop pubblico trascrive il WAV tramite il servizio NexusNXS', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/guest/bootstrap')) return new Response(JSON.stringify({ token: 'voice-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ text: 'Ciao Nexus', language: 'it' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });
  const wav = Buffer.alloc(48); wav.write('RIFF', 0, 'ascii'); wav.write('WAVE', 8, 'ascii');

  const result = await provider.transcribeAudio(wav, { language: 'it' });

  assert.equal(result.text, 'Ciao Nexus');
  assert.equal(result.backend, 'nexus-service');
  assert.equal(result.local, false);
  assert.equal(calls.at(-1).url, 'https://ai.example.com/api/guest/voice/transcribe');
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer voice-token');
  assert.equal(calls.at(-1).options.headers['Content-Type'], 'audio/wav');
  assert.ok(Buffer.isBuffer(calls.at(-1).options.body));
});

test('il servizio vocale pubblico rifiuta payload che non sono WAV', async () => {
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });
  await assert.rejects(provider.transcribeAudio(Buffer.alloc(48)), /Registrazione vocale non valida/);
});

test('il provider pubblico inoltra la chat e ricompone lo stream NexusNXS', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/guest/bootstrap')) return new Response(JSON.stringify({ token: 'guest-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return new Response(`${JSON.stringify({ type: 'phase', activity: { text: '  In attesa   · posizione 1  ' } })}\n${JSON.stringify({ type: 'phase', activity: { text: 'In attesa · posizione 1' } })}\n${JSON.stringify({ type: 'token', token: 'Ciao ' })}\n${JSON.stringify({ type: 'complete', message: 'Ciao mondo' })}\n`, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });
  const tokens = [];
  const activities = [];
  await provider.setModel('nexus-balanced');
  const result = await provider.streamChat({ requestId: 'turn-1', model: 'nexus-balanced', mode: 'quick', messages: [{ role: 'user', content: 'Ciao' }] }, {
    onToken: (token) => tokens.push(token),
    onThinking: (activity) => activities.push(activity)
  });
  assert.equal(result.message.content, 'Ciao mondo');
  assert.deepEqual(tokens, ['Ciao ']);
  assert.deepEqual(activities, ['In attesa · posizione 1']);
  const sent = JSON.parse(calls.at(-1).options.body);
  assert.equal(sent.text, 'Ciao');
  assert.equal(sent.model, 'nexus-balanced');
  assert.match(sent.clientMessageId, /^[a-f0-9]{40}$/);
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer guest-token');
});

test('la chat non-stream aggrega lo stream e tollera heartbeat durante risposte lunghe', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/guest/bootstrap')) {
      return new Response(JSON.stringify({ token: 'guest-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    const frames = [
      { type: 'heartbeat' },
      { type: 'phase', activity: { text: 'Ragiono sulla richiesta' } },
      { type: 'heartbeat' },
      { type: 'token', token: 'Risposta ' },
      { type: 'heartbeat' },
      { type: 'complete', message: 'Risposta completa' }
    ];
    return new Response(`${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });

  const result = await provider.chat({ requestId: 'long-non-stream', messages: [{ role: 'user', content: 'Analizza in profondità' }] });

  assert.equal(result.message.content, 'Risposta completa');
  assert.equal(result.requestId, 'long-non-stream');
  assert.equal(calls.at(-1).url, 'https://ai.example.com/api/guest/messages/stream');
  assert.equal(calls.some((call) => call.url.endsWith('/api/guest/messages')), false);
});

test('le attività pubbliche sono brevi e prive di caratteri di controllo', () => {
  assert.equal(publicActivityText({ activity: { text: `  Analizzo\u0000   la richiesta ${'x'.repeat(200)}` } }).length, 160);
  assert.equal(publicActivityText({ activity: { text: '  Analizzo\nla richiesta  ' } }), 'Analizzo la richiesta');
  assert.equal(publicActivityText({ activity: { text: '' } }), '');
});

test('il provider passa automaticamente a un endpoint HTTPS di riserva per i controlli sicuri', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://primary.example.com')) throw new TypeError('offline');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://primary.example.com', fallbackUrls: ['https://backup.example.com'] } });
  const health = await provider.health();
  assert.equal(health.ok, true);
  assert.equal(provider.activeBaseUrl, 'https://backup.example.com');
  assert.deepEqual(calls.map((call) => call.url), ['https://primary.example.com/readyz', 'https://backup.example.com/readyz']);
  assert.equal(Object.hasOwn(calls.at(-1).options, 'health'), false);
});

for (const legacyReadyStatus of [401, 404]) {
  test(`health usa liveness per gateway legacy con readiness HTTP ${legacyReadyStatus}`, async (t) => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url) => {
      calls.push(String(url));
      return String(url).endsWith('/readyz')
        ? new Response('', { status: legacyReadyStatus })
        : new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };
    t.after(() => { global.fetch = originalFetch; });
    const provider = new NexusServiceProvider({ service: { baseUrl: 'https://legacy.example.com' } });
    assert.equal((await provider.health()).ok, true);
    assert.deepEqual(calls, ['https://legacy.example.com/readyz', 'https://legacy.example.com/healthz']);
  });
}

test('health non maschera errori readiness diversi da 401 e 404', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response('', { status: 403 });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://blocked.example.com' } });
  assert.equal((await provider.health()).ok, false);
  assert.deepEqual(calls, ['https://blocked.example.com/readyz']);
});

test('segmenti e continuazioni producono chiavi idempotenti distinte', () => {
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });
  const messages = [{ role: 'user', content: 'Continua' }];
  const initial = provider.payload({ requestId: 'turn-123', messages });
  const continuation = provider.payload({ requestId: 'turn-123-continuation-1', messages });
  assert.notEqual(initial.clientMessageId, continuation.clientMessageId);
  assert.match(initial.clientMessageId, /^[a-f0-9]{40}$/);
  assert.match(continuation.clientMessageId, /^[a-f0-9]{40}$/);
});

test('il client invia soltanto contributi esplicitamente approvati alla coda di revisione', () => {
  const source = require('node:fs').readFileSync(require.resolve('../src/ai/providers/nexus-service-provider'), 'utf8');
  assert.match(source, /consent:\s*true/);
  assert.match(source, /\/api\/guest\/feedback/);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
});

test('shutdown interrompe i controlli HTTPS ancora attivi', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com', timeoutMs: 10_000 } });
  const pending = provider.listModels();
  await new Promise((resolve) => setImmediate(resolve));

  await provider.shutdown();
  await assert.rejects(pending);
  assert.equal(provider.token, '');
});

test('bootstrap e preload remoto sono singleflight anche con più richieste contemporanee', async (t) => {
  const originalFetch = global.fetch;
  let bootstrapCalls = 0;
  let releaseBootstrap;
  const bootstrapReady = new Promise((resolve) => { releaseBootstrap = resolve; });
  global.fetch = async (url) => {
    assert.match(String(url), /\/api\/guest\/bootstrap$/);
    bootstrapCalls += 1;
    await bootstrapReady;
    return new Response(JSON.stringify({ token: 'single-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://ai.example.com' } });
  const pending = Array.from({ length: 7 }, () => provider.ensureToken());
  const preload = provider.preloadModel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bootstrapCalls, 1);
  releaseBootstrap();
  assert.deepEqual(await Promise.all(pending), Array(7).fill('single-token'));
  assert.deepEqual(await preload, { status: 'ready', remote: true, warmed: true, endpoint: 'https://ai.example.com' });
});

test('lo stream cambia endpoint soltanto prima del primo token', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const target = String(url); calls.push(target);
    if (target.endsWith('/api/guest/bootstrap')) {
      return new Response(JSON.stringify({ token: 'guest-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    if (target.startsWith('https://primary.example.com')) {
      return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('transport reset')); } }), { status: 200 });
    }
    return new Response(`${JSON.stringify({ type: 'token', token: 'Riserva' })}\n${JSON.stringify({ type: 'complete', message: 'Riserva' })}\n`, { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://primary.example.com', fallbackUrls: ['https://backup.example.com'] } });
  const tokens = [];
  const result = await provider.streamChat({ requestId: 'pre-token', messages: [{ role: 'user', content: 'Ciao' }] }, { onToken: (token) => tokens.push(token) });
  assert.equal(result.message.content, 'Riserva');
  assert.deepEqual(tokens, ['Riserva']);
  assert.ok(calls.some((url) => url === 'https://backup.example.com/api/guest/messages/stream'));
});

test('lo stream non cambia endpoint dopo avere consegnato il primo token', async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const target = String(url); calls.push(target);
    if (target.endsWith('/api/guest/bootstrap')) {
      return new Response(JSON.stringify({ token: 'guest-token', expiresAt: Date.now() + 86_400_000 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(`${JSON.stringify({ type: 'token', token: 'Già visibile' })}\n{frame-non-valido}\n`, { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });
  const provider = new NexusServiceProvider({ service: { baseUrl: 'https://primary.example.com', fallbackUrls: ['https://backup.example.com'] } });
  const tokens = [];
  await assert.rejects(
    provider.streamChat({ requestId: 'post-token', messages: [{ role: 'user', content: 'Ciao' }] }, { onToken: (token) => tokens.push(token) })
  );
  assert.deepEqual(tokens, ['Già visibile']);
  assert.equal(calls.some((url) => url === 'https://backup.example.com/api/guest/messages/stream'), false);
});
