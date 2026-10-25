const test = require('node:test');
const assert = require('node:assert/strict');
const { PrivacyTelemetry, createPrivacySpan } = require('../src/infrastructure/privacy-telemetry');

test('la telemetria elimina contenuto, percorsi, rete e identita', () => {
  const span = createPrivacySpan({
    name: 'guest message', startedAt: 10, endedAt: 35,
    attributes: { component: 'gateway', durationMs: 25, prompt: 'segreto', response: 'privata', path: 'C:\\utente', ip: '192.168.1.2' }
  });
  assert.equal(span.durationMs, 25);
  assert.deepEqual(span.attributes, { component: 'gateway', durationMs: 25 });
  assert.doesNotMatch(JSON.stringify(span), /segreto|privata|utente|192\.168/);
});

test('il campionamento è esplicito e fail-closed senza exporter', () => {
  const exported = [];
  assert.equal(new PrivacyTelemetry({ sampleRate: 1 }).emit({ name: 'x' }), false);
  assert.equal(new PrivacyTelemetry({ exporter: (span) => exported.push(span), sampleRate: 1, random: () => 0 }).emit({ name: 'x' }), true);
  assert.equal(exported.length, 1);
});

test('async stages share only their own trace and inherit one sampling decision', async () => {
  const spans = []; let randomCalls = 0;
  const telemetry = new PrivacyTelemetry({ sampleRate: 1, random: () => { ++randomCalls; return 0; }, exporter: span => spans.push(span) });
  await Promise.all(['one', 'two'].map(name => telemetry.measure(name, { component: 'gateway', prompt: 'private' }, async () => {
    await new Promise(resolve => setImmediate(resolve));
    await telemetry.measure(`${name}.queue`, { operation: 'queue' }, async () => 42);
    telemetry.emit({ name: `${name}.token`, attributes: { outcome: 'success' }, context: { traceId: 'a'.repeat(32) } });
  })));
  assert.equal(randomCalls, 2); assert.equal(spans.length, 6);
  for (const name of ['one', 'two']) {
    const root = spans.find(span => span.name === name), children = spans.filter(span => span.name.startsWith(`${name}.`));
    assert.equal(children.length, 2);
    assert.ok(children.every(span => span.traceId === root.traceId && span.parentSpanId === root.spanId));
  }
  assert.notEqual(spans.find(span => span.name === 'one').traceId, spans.find(span => span.name === 'two').traceId);
  assert.doesNotMatch(JSON.stringify(spans), /private|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});

test('zero sampling and exporter failure never change operation results', async () => {
  let calls = 0;
  const off = new PrivacyTelemetry({ exporter: () => { ++calls; }, sampleRate: 0, random: () => 0 });
  assert.equal(await off.measure('off', {}, async () => 42), 42); assert.equal(off.emit({ name: 'off' }), false); assert.equal(calls, 0);
  const broken = new PrivacyTelemetry({ exporter: () => { throw new Error('storage offline'); }, sampleRate: 1 });
  assert.equal(await broken.measure('ok', {}, async () => 42), 42);
  const original = Object.assign(new Error('cancel'), { code: 'VOICE_CANCELLED' });
  await assert.rejects(broken.measure('cancel', {}, async () => { throw original; }), error => error === original);
});

test('nested failure and cancellation are recorded without error contents', async () => {
  const spans = [], telemetry = new PrivacyTelemetry({ exporter: span => spans.push(span), sampleRate: 1 });
  await assert.rejects(telemetry.measure('voice', {}, () => telemetry.measure('voice.stt', {}, async () => {
    throw Object.assign(new Error('private recording'), { name: 'AbortError' });
  })));
  assert.ok(spans.every(span => span.attributes.outcome === 'cancelled'));
  assert.doesNotMatch(JSON.stringify(spans), /private recording/);
});
