const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker } = require('../src/ai/circuit-breaker');

test('apre il circuito, blocca richieste e consente una sola prova dopo il raffreddamento', () => {
  let now = 1000;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 500, now: () => now });
  assert.equal(breaker.permit(), true);
  breaker.failure();
  breaker.failure();
  assert.equal(breaker.status().state, 'open');
  assert.equal(breaker.permit(), false);
  now += 501;
  assert.equal(breaker.permit(), true);
  assert.equal(breaker.status().state, 'half-open');
  assert.equal(breaker.permit(), false);
  breaker.success();
  assert.equal(breaker.status().state, 'closed');
});
