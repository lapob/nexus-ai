const test = require('node:test');
const assert = require('node:assert/strict');
const { coordinateShutdown, settleWithTimeout } = require('../src/application/shutdown-coordinator');

test('un servizio bloccato non impedisce chiusura store e rilascio lock', async () => {
  const events = [];
  const warnings = [];
  const result = await coordinateShutdown({
    logger: { warn: (message) => warnings.push(message) },
    serviceTimeoutMs: 30,
    storeTimeoutMs: 100,
    finalizerTimeoutMs: 100,
    services: [
      { label: 'bloccato', run: () => new Promise(() => {}) },
      { label: 'rapido', run: async () => { events.push('service'); } }
    ],
    stores: [{ label: 'database', close: async () => { events.push('store'); } }],
    finalizers: [{ label: 'lock server', run: async () => { events.push('lock'); } }]
  });
  assert.equal(result.serviceResults[0].status, 'timeout');
  assert.deepEqual(events, ['service', 'store', 'lock']);
  assert.match(warnings[0], /bloccato/);
});

test('errori di un servizio vengono isolati senza rejection non gestite', async () => {
  const warnings = [];
  const result = await settleWithTimeout({
    label: 'difettoso',
    run: async () => { throw new Error('failure'); }
  }, {
    logger: { warn: (message) => warnings.push(message) },
    timeoutMs: 100
  });
  assert.equal(result.status, 'rejected');
  assert.match(warnings[0], /difettoso/);
});
