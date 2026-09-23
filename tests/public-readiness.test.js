const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { enhancePublicAiHtml } = require('../src/remote/public-demo');

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

