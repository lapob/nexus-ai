/**
 * @module tests/access-profile-policy
 * @description Impedisce che un client pubblico si promuova a profilo fidato.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installationBinding,
  profileSafetyLimit,
  resolveAccessProfile,
  validateAccessProfilePolicy
} = require('../src/security/access-profile-policy');

test('la beta resta pubblica senza piano commerciale imposto', () => {
  assert.equal(validateAccessProfilePolicy(), true);
  const profile = resolveAccessProfile({ installationId: '019fa53a-public-installation' });
  assert.equal(profile.id, 'public-beta');
  assert.equal(profile.commercialMetering, 'observe');
  assert.equal(profileSafetyLimit(profile, 240), 240);
});

test('sviluppatore e invitati richiedono un binding HMAC conservato sul server', () => {
  const secret = 'server-only-profile-binding-secret';
  const installationId = '019fa53a-private-installation';
  const binding = installationBinding(installationId, secret);
  const bindings = JSON.stringify({ [binding]: 'developer' });
  assert.equal(resolveAccessProfile({ installationId, secret, bindings }).id, 'developer');
  assert.equal(resolveAccessProfile({ installationId: `${installationId}-other`, secret, bindings }).id, 'public-beta');
  assert.equal(resolveAccessProfile({ installationId, secret: 'short', bindings }).id, 'public-beta');
  assert.equal(profileSafetyLimit(resolveAccessProfile({ installationId, secret, bindings }), 240), null);
});
