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
    AbortSignal, navigator: { onLine: true },
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

