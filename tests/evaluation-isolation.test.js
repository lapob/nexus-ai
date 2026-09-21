const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluationPlan } = require('../scripts/lib/evaluation-isolation');
const resources = { freeBytes: 24 * 2 ** 30, modelBytes: 10 * 2 ** 30 };
test('eval dedicata usa CPU quando il servizio e attivo', () => {
  const plan = evaluationPlan({ ...resources, activeEndpoint: 'http://127.0.0.1:16904' });
  assert.deepEqual(plan.options, { num_gpu: 0 });
  assert.equal(plan.endpoint, 'http://127.0.0.1:11435');
});
test('rifiuta alias dell endpoint attivo, rete esterna e RAM insufficiente', () => {
  assert.throws(() => evaluationPlan({ ...resources, endpoint: 'http://localhost:16904', activeEndpoint: 'http://127.0.0.1:16904' }), /servizio attivo/);
  for (const endpoint of ['https://example.com', 'http://192.168.1.4:11435', 'http://user:pass@localhost:11435', 'http://localhost:11435/api']) {
    assert.throws(() => evaluationPlan({ ...resources, endpoint }));
  }
  assert.throws(() => evaluationPlan({ ...resources, activeEndpoint: 'http://localhost:16904', freeBytes: 2 ** 30 }), /RAM insufficiente/);
});
test('GPU disponibile soltanto senza servizio attivo', () => {
  assert.deepEqual(evaluationPlan(resources).options, {});
});
