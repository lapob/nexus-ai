const test = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopStatusSampler } = require('../src/application/desktop-status-sampler');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('cold desktop status responds immediately while a native probe is blocked', async () => {
  const probe = deferred();
  let calls = 0;
  const sampler = createDesktopStatusSampler({ initial: { chatGptOpen: null }, load: () => { calls++; return probe.promise; } });
  assert.deepEqual(sampler.read(), { chatGptOpen: null });
  for (let index = 0; index < 100; index++) sampler.read();
  await Promise.resolve();
  assert.equal(calls, 1);
  const pending = sampler.refresh();
  probe.resolve({ chatGptOpen: true });
  await pending;
  assert.equal(sampler.read().chatGptOpen, true);
});

test('fresh observations are shared and expired observations refresh in the background', async () => {
  let clock = 0;
  let calls = 0;
  const sampler = createDesktopStatusSampler({ initial: { open: false }, now: () => clock, ttlMs: 50, load: async () => ({ open: ++calls === 1 }) });
  await sampler.refresh();
  clock = 49;
  assert.equal(sampler.read().open, true);
  assert.equal(calls, 1);
  clock = 50;
  assert.equal(sampler.read().open, true);
  await sampler.refresh();
  assert.equal(sampler.read().open, false);
  assert.equal(calls, 2);
});

test('a completed action cannot be overwritten by an older native observation', async () => {
  const probe = deferred();
  const sampler = createDesktopStatusSampler({ initial: { open: false }, load: () => probe.promise });
  const pending = sampler.refresh();
  await Promise.resolve();
  sampler.patch({ open: true });
  probe.resolve({ open: false });
  await pending;
  assert.equal(sampler.read().open, true);
  sampler.dispose();
});

test('native probe failure retains the last observation and permits recovery', async () => {
  let calls = 0;
  const errors = [];
  const sampler = createDesktopStatusSampler({ initial: { open: null }, load: async () => {
    if (++calls === 1) throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    return { open: true };
  }, onError: error => errors.push(error.code) });
  await sampler.refresh();
  assert.deepEqual(errors, ['TIMEOUT']);
  assert.equal(sampler.read().open, null);
  await sampler.refresh();
  assert.equal(sampler.read().open, true);
});

test('shutdown ignores an outstanding observation and cannot start new probes', async () => {
  const probe = deferred();
  let updates = 0;
  const sampler = createDesktopStatusSampler({ initial: { open: null }, load: () => probe.promise, onUpdate: () => updates++ });
  const pending = sampler.refresh();
  sampler.dispose();
  probe.resolve({ open: true });
  await pending;
  assert.equal(sampler.read().open, null);
  assert.equal(sampler.refresh(), null);
  assert.equal(updates, 0);
});
