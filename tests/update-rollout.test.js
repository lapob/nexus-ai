/**
 * @module tests/update-rollout
 * @description Verifica rollout deterministico, pausa e fail-closed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateUpdateRollout, rolloutBucket } = require('../src/infrastructure/electron/update-rollout');

test('la coorte resta stabile per la stessa installazione', () => {
  const first = rolloutBucket('opaque-local-installation', 'stable');
  assert.equal(first, rolloutBucket('opaque-local-installation', 'stable'));
  assert.ok(first >= 1 && first <= 100);
});

test('il rollout completo abilita tutti e la pausa blocca ogni installazione', () => {
  const base = { channel: 'stable', updatePolicy: { rollout: 'staged', initialPercentage: 100 } };
  assert.equal(evaluateUpdateRollout(base, { rolloutSeed: 'one' }).eligible, true);
  assert.deepEqual(evaluateUpdateRollout({
    ...base, updatePolicy: { ...base.updatePolicy, paused: true }
  }, { rolloutSeed: 'one' }), { eligible: false, reason: 'paused', percentage: 100, bucket: null });
});

test('una coorte parziale non procede senza identità stabile', () => {
  const manifest = { channel: 'stable', updatePolicy: { rollout: 'staged', initialPercentage: 10 } };
  assert.deepEqual(evaluateUpdateRollout(manifest), {
    eligible: false, reason: 'identity-unavailable', percentage: 10, bucket: null
  });
});

test('preview rimane manuale anche al cento per cento', () => {
  const result = evaluateUpdateRollout({
    channel: 'preview', updatePolicy: { rollout: 'manual-preview', initialPercentage: 100 }
  }, { rolloutSeed: 'one' });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'manual-preview');
});
