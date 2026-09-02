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
