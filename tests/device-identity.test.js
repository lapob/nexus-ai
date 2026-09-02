const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, verify } = require('node:crypto');
const {
  DeviceIdentityChallengeStore,
  canonicalChallengePayload,
  isVerifiedDeviceIdentity,
  publicDeviceIdentity
} = require('../src/security/device-identity');

function signedFixture() {
  const keys = generateKeyPairSync('ed25519');
  let now = 1_000;
  const store = new DeviceIdentityChallengeStore({
    now: () => now,
    verifySignature: ({ payload, signature }) => verify(null, payload, keys.publicKey, signature)
  });
  return {
    store,
    advance(milliseconds) { now += milliseconds; },
    sign(challenge) { return sign(null, canonicalChallengePayload(challenge), keys.privateKey); }
  };
}

test('la challenge firmata produce un’identita opaca e verificata', async () => {
  const fixture = signedFixture();
  const challenge = fixture.store.issue({ deviceId: 'phone-owner', keyId: 'android-keystore-main' });
  const identity = await fixture.store.verify({
    challengeId: challenge.challengeId,
    deviceId: challenge.deviceId,
    keyId: challenge.keyId,
    signature: fixture.sign(challenge)
  });
  assert.equal(isVerifiedDeviceIdentity(identity), true);
  assert.match(identity.subjectId, /^[a-f0-9]{64}$/);
  assert.match(identity.keyFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(identity).includes('phone-owner'), false);
  assert.deepEqual(Object.keys(publicDeviceIdentity(identity)), ['subjectId', 'keyFingerprint', 'proofId', 'verifiedAt']);
});

test('challenge e firma sono monouso, legate a dispositivo, chiave e scopo', async () => {
  const fixture = signedFixture();
  const mismatch = fixture.store.issue({ deviceId: 'phone-a', keyId: 'key-a' });
  await assert.rejects(
    fixture.store.verify({ challengeId: mismatch.challengeId, deviceId: 'phone-b', keyId: 'key-a', signature: fixture.sign(mismatch) }),
    (error) => error.code === 'DEVICE_CHALLENGE_MISMATCH'
  );
  await assert.rejects(
    fixture.store.verify({ challengeId: mismatch.challengeId, deviceId: 'phone-a', keyId: 'key-a', signature: fixture.sign(mismatch) }),
    (error) => error.code === 'DEVICE_CHALLENGE_INVALID'
  );

  const invalid = fixture.store.issue({ deviceId: 'phone-a', keyId: 'key-a', purpose: 'authorize-action' });
  await assert.rejects(
    fixture.store.verify({ challengeId: invalid.challengeId, deviceId: 'phone-a', keyId: 'key-a', purpose: 'authorize-action', signature: Buffer.alloc(64) }),
    (error) => error.code === 'DEVICE_SIGNATURE_INVALID'
  );
  await assert.rejects(
    fixture.store.verify({ challengeId: invalid.challengeId, deviceId: 'phone-a', keyId: 'key-a', signature: fixture.sign(invalid) }),
    (error) => error.code === 'DEVICE_CHALLENGE_INVALID'
  );
});

test('una challenge scaduta fallisce chiusa senza invocare nuovamente la chiave', async () => {
  const fixture = signedFixture();
  const challenge = fixture.store.issue({ deviceId: 'phone-a', keyId: 'key-a' });
  fixture.advance(100_000);
  await assert.rejects(
    fixture.store.verify({ challengeId: challenge.challengeId, deviceId: 'phone-a', keyId: 'key-a', signature: fixture.sign(challenge) }),
    (error) => error.code === 'DEVICE_CHALLENGE_EXPIRED'
  );
});
