const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { enhancePublicAiHtml } = require('../src/remote/public-demo');
const { PUBLIC_AI_SERVICE_WORKER } = require('../src/remote/remote-session-gateway');

function offlineWorker({ network = async () => new Response('online', { headers: { 'Content-Type': 'text/html' } }), quota = false } = {}) {
  const events = {}, deleted = [], writes = [], timers = new Map();
  let timerId = 0, claimed = false, installed = false;
  const active = /const CACHE=PREFIX\+'([^']+)'/.exec(PUBLIC_AI_SERVICE_WORKER)[1];
  const current = `nexusnxs-ai-shell-${active}`;
  const cache = { match: async () => new Response('cached AI'),
    addAll: async paths => { assert.deepEqual(Array.from(paths), ['/', '/manifest.webmanifest', '/nexus-icon.png', '/inter-latin.woff2']); },
    put: async (key, response) => { if (quota) throw new Error('quota'); writes.push({ key, text: await response.text() }); } };
  vm.runInNewContext(PUBLIC_AI_SERVICE_WORKER, {
    URL, Response, Headers, Blob, AbortController, fetch: network,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    caches: { open: async name => { assert.equal(name, current); return cache; },
      keys: async () => [current, 'nexusnxs-ai-shell-v5', 'another-app-cache'],
      delete: async key => { deleted.push(key); return true; } },
    self: { location: { origin: 'https://ai.example.test' }, addEventListener: (name, fn) => { events[name] = fn; },
      skipWaiting: async () => { installed = true; }, clients: { claim: async () => { claimed = true; } } }
  });
  const lifecycle = async name => { let promise; events[name]({ waitUntil: value => { promise = value; } }); await promise; };
  const request = (pathname, mode = 'navigate', method = 'GET') => {
    const pending = []; let response;
    events.fetch({ request: { url: `https://ai.example.test${pathname}`, mode, method },
      respondWith: value => { response = value; }, waitUntil: value => pending.push(value) });
    return { response, settle: async () => { const value = await response; await Promise.all(pending); return value; } };
  };
  return { lifecycle, request, deleted, writes, timers, states: () => ({ installed, claimed }) };
}

test('offline worker upgrades only its own shell cache and never intercepts API or other pages', async () => {
  const worker = offlineWorker();
  await worker.lifecycle('install'); await worker.lifecycle('activate');
  assert.deepEqual(worker.states(), { installed: true, claimed: true });
  assert.deepEqual(worker.deleted, ['nexusnxs-ai-shell-v5']);
  for (const [pathname, method] of [['/api/guest/messages', 'GET'], ['/api/guest/messages', 'POST'], ['/settings', 'GET'], ['/readyz', 'GET']]) {
    assert.equal(worker.request(pathname, 'navigate', method).response, undefined);
  }
});

test('a working network response survives cache quota failure and non-shell responses cannot poison root', async () => {
  const full = offlineWorker({ quota: true });
  assert.equal(await (await full.request('/').settle()).text(), 'online');
  assert.equal(full.timers.size, 0);
  const normal = offlineWorker();
  assert.equal(await (await normal.request('/index.html').settle()).text(), 'online');
  assert.deepEqual(normal.writes, [{ key: '/', text: 'online' }]);
  const json = offlineWorker({ network: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }) });
  await json.request('/').settle(); assert.equal(json.writes.length, 0);
  const redirected = new Response('other page', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(redirected, 'url', { value: 'https://ai.example.test/login' });
  const other = offlineWorker({ network: async () => redirected });
  await other.request('/').settle(); assert.equal(other.writes.length, 0);
});

test('offline and stalled navigation return the current cached shell without caching an error', async () => {
  for (const network of [async () => { throw new Error('offline'); }, async () => new Response('unavailable', { status: 503 })]) {
    const worker = offlineWorker({ network });
    assert.equal(await (await worker.request('/').settle()).text(), 'cached AI');
    assert.equal(worker.writes.length, 0); assert.equal(worker.timers.size, 0);
  }
  const stalled = offlineWorker({ network: (_request, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }) });
  const navigation = stalled.request('/');
  assert.equal(stalled.timers.size, 1); [...stalled.timers.values()][0]();
  assert.equal(await (await navigation.settle()).text(), 'cached AI');
  assert.equal(stalled.timers.size, 0);
});

test('headers followed by a stalled or oversized HTML body cannot replace the offline shell', async () => {
  const worker = offlineWorker({ network: async (_request, options) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html>partial'));
      options.signal.addEventListener('abort', () => controller.error(new Error('body timeout')), { once: true });
    }
  }), { headers: { 'Content-Type': 'text/html' } }) });
  const pending = worker.request('/');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.timers.size, 1, 'The deadline includes receiving the body');
  [...worker.timers.values()][0]();
  assert.equal(await (await pending.settle()).text(), 'cached AI');
  assert.equal(worker.writes.length, 0);
  const oversized = offlineWorker({ network: async () => new Response('x'.repeat(1048577), { headers: { 'Content-Type': 'text/html' } }) });
  assert.equal(await (await oversized.request('/').settle()).text(), 'cached AI');
  assert.equal(oversized.writes.length, 0);
});

test('la pagina passa da preparazione a pronta e offline senza polling duplicato', async () => {
  const html = enhancePublicAiHtml({ base: '<html><head></head><body></body></html>', coreStyle: '', coreScript: '' });
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('function publicReadinessRuntime'));
  assert.ok(script);
  let status = 503, calls = 0;
  const badge = { dataset: {}, setAttribute() {} };
  const events = {}, timers = new Map(); let id = 0;
  const context = vm.createContext({
    document: { hidden: false, body: { dataset: {} }, getElementById: () => null, querySelector: () => badge, addEventListener: (name, fn) => { events[name] = fn; } },
    addEventListener: (name, fn) => { events[name] = fn; },
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id),
    AbortSignal, AbortController, navigator: { onLine: true },
    fetch: async () => { calls++; if (status === 0) throw new Error('offline'); return { ok: status === 200, status, json: async () => ({ status: status === 200 ? 'ready' : 'not_ready' }) }; }
  });
  vm.runInContext(script, context);
  await context.nexusCheckReadiness();
  assert.equal(badge.dataset.readiness, 'warming');
  status = 200;
  await Promise.all([events.online(), events.pageshow()]);
  assert.equal(badge.dataset.readiness, 'ready');
  assert.equal(timers.size, 1);
  status = 0;
  assert.equal(await context.nexusCheckReadiness(), false);
  assert.equal(badge.dataset.readiness, 'offline');
  events.pagehide();
  assert.equal(timers.size, 0);
  assert.equal(calls, 3);
});

for (const interruption of ['offline', 'pagehide', 'visibilitychange']) {
  test(`readiness ignora risposte precedenti dopo ${interruption} e riprende con una nuova verifica`, async () => {
    const html = enhancePublicAiHtml({ base: '<html><head></head><body></body></html>', coreStyle: '', coreScript: '' });
    const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('function publicReadinessRuntime'));
    const events = {}, timers = new Map(), requests = [];
    let id = 0;
    const badge = { dataset: {}, setAttribute() {} }, core = {}, send = { dataset: {} };
    const document = { hidden: false, body: { dataset: {} }, querySelector: () => badge,
      getElementById: name => ({ core, send }[name] || null),
      addEventListener: (name, fn) => { events[name] = fn; } };
    const navigator = { onLine: true };
    const context = vm.createContext({ document, navigator, AbortController, AbortSignal,
      addEventListener: (name, fn) => { events[name] = fn; },
      setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id),
      fetch: (url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal })) });
    vm.runInContext(script, context);
    const first = context.nexusCheckReadiness();
    assert.equal(requests.length, 1);
    if (interruption === 'offline') navigator.onLine = false;
    if (interruption === 'visibilitychange') document.hidden = true;
    send.dataset.mode = 'stop';
    send.disabled = false;
    events[interruption]();
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(send.disabled, false, 'Interrompi resta disponibile anche senza rete');
    navigator.onLine = true;
    document.hidden = false;
    const resumed = events.pageshow();
    assert.equal(requests.length, 2);
    requests[0].resolve({ ok: true, status: 200, json: async () => ({ status: 'ready' }) });
    assert.equal(await first, false);
    assert.notEqual(badge.dataset.readiness, 'ready');
    assert.equal(core.disabled, true);
    // A late completion must neither enable controls nor clear the new singleflight.
    const shared = context.nexusCheckReadiness();
    assert.equal(requests.length, 2);
    requests[1].resolve({ ok: true, status: 200, json: async () => ({ status: 'ready' }) });
    await Promise.all([resumed, shared]);
    assert.equal(badge.dataset.readiness, 'ready');
    assert.equal(core.disabled, false);
    assert.equal(timers.size, 1);
    events.pagehide();
    assert.equal(timers.size, 0);
  });
}


for (const fontState of ['loaded', 'rejected', 'stalled']) {
  test(`first paint reveals one bound UI after font ${fontState}, with a bounded wait`, async () => {
    const html = enhancePublicAiHtml({ base: '<html lang="it"><head></head><body><main class="shell"></main></body></html>', coreStyle: '', coreScript: '' });
    assert.match(html, /<html data-nxs-boot="pending"/);
    assert.match(html, /<main inert class="shell"/);
    const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes('function publicUiReadyRuntime'));
    let settle, rejectFont, timeout, removed = false;
    const frames = [], dataset = { nxsBoot: 'pending' };
    const ready = new Promise((resolve, reject) => { settle = resolve; rejectFont = reject; });
    vm.runInNewContext(code, {
      document: { documentElement: { dataset }, fonts: { ready }, querySelector: () => ({ removeAttribute: name => { assert.equal(name, 'inert'); removed = true; } }) },
      setTimeout: (callback, delay) => { assert.equal(delay, 800); timeout = callback; return 1; }, clearTimeout() {},
      requestAnimationFrame: callback => frames.push(callback)
    });
    assert.equal(dataset.nxsBoot, 'pending');
    assert.equal(removed, false);
    if (fontState === 'loaded') settle(); else if (fontState === 'rejected') rejectFont(new Error('font unavailable')); else timeout();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(dataset.nxsBoot, 'pending');
    frames.shift()();
    assert.equal(dataset.nxsBoot, 'ready');
    assert.equal(removed, true);
  });
}
test('initial controls wait for restored history instead of flashing the idle layout', async () => {
  const html = enhancePublicAiHtml({ base: '<html><head></head><body></body></html>', coreStyle: '', coreScript: '' });
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes('function publicUiReadyRuntime'));
  let restore;
  const restored = new Promise(resolve => { restore = resolve; });
  const frames = [], dataset = { nxsBoot: 'pending' };
  vm.runInNewContext(code, {
    nexusUiRestored: restored,
    document: { documentElement: { dataset }, fonts: { ready: Promise.resolve() }, querySelector: () => ({ removeAttribute() {} }) },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => frames.push(callback)
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dataset.nxsBoot, 'pending');
  assert.equal(frames.length, 0);
  restore();
  await new Promise(resolve => setImmediate(resolve));
  frames.shift()(); frames.shift()();
  assert.equal(dataset.nxsBoot, 'ready');
});
