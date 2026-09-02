/**
 * @module security/device-identity
 * @description Challenge monouso e identita dispositivo verificata senza gestire chiavi di produzione.
 */

const { createHash, randomBytes } = require('node:crypto');

const VERIFIED_DEVICE_IDENTITY = Symbol('nexusnxs.verified-device-identity');
const DEFAULT_TTL_MS = 90 * 1000;
const MAX_PENDING_CHALLENGES = 256;

// #region 01 — Identità opaca e payload canonico

function identityError(message, code) {
  return Object.assign(new Error(message), { code });
}

function boundedIdentifier(value, name) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 128 || !/^[A-Za-z0-9._:@-]+$/.test(text)) {
    throw identityError(`${name} non e valido.`, 'DEVICE_IDENTITY_INVALID');
  }
  return text;
}

function deviceSubjectId(deviceId, keyId) {
  return createHash('sha256')
    .update('nexusnxs-device-subject-v1\0')
    .update(deviceId)
    .update('\0')
    .update(keyId)
    .digest('hex');
}

function keyFingerprint(keyId) {
  return createHash('sha256').update('nexusnxs-device-key-v1\0').update(keyId).digest('hex');
}

function canonicalChallengePayload(challenge) {
  return Buffer.from(JSON.stringify({
    version: 1,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    deviceId: challenge.deviceId,
    keyId: challenge.keyId,
    purpose: challenge.purpose,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt
  }), 'utf8');
}

function verifiedIdentity(challenge, verifiedAt) {
  const identity = {
    subjectId: deviceSubjectId(challenge.deviceId, challenge.keyId),
    keyFingerprint: keyFingerprint(challenge.keyId),
    proofId: challenge.challengeId,
    verifiedAt
  };
  Object.defineProperties(identity, {
    [VERIFIED_DEVICE_IDENTITY]: { value: true },
    deviceId: { value: challenge.deviceId },
    keyId: { value: challenge.keyId }
  });
  return Object.freeze(identity);
}

function isVerifiedDeviceIdentity(value) {
  return Boolean(value && value[VERIFIED_DEVICE_IDENTITY] === true
    && /^[a-f0-9]{64}$/.test(String(value.subjectId || ''))
    && /^[a-f0-9]{64}$/.test(String(value.keyFingerprint || '')));
}

function assertVerifiedDeviceIdentity(value) {
  if (!isVerifiedDeviceIdentity(value)) {
    throw identityError('Serve una prova crittografica valida del dispositivo.', 'DEVICE_IDENTITY_REQUIRED');
  }
  return value;
}

function publicDeviceIdentity(value) {
  const identity = assertVerifiedDeviceIdentity(value);
  return Object.freeze({
    subjectId: identity.subjectId,
    keyFingerprint: identity.keyFingerprint,
    proofId: identity.proofId,
    verifiedAt: identity.verifiedAt
  });
}

// #endregion
// #region 02 — Challenge monouso

class DeviceIdentityChallengeStore {
  constructor({ verifySignature, now = () => Date.now(), ttlMs = DEFAULT_TTL_MS, randomBytesFn = randomBytes } = {}) {
    if (typeof verifySignature !== 'function') {
      throw new TypeError('Il verificatore delle firme dispositivo e obbligatorio.');
    }
    this.verifySignature = verifySignature;
    this.now = now;
    this.ttlMs = Math.max(10_000, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, 5 * 60 * 1000));
    this.randomBytes = randomBytesFn;
    this.pending = new Map();
  }

  issue({ deviceId, keyId, purpose = 'authorize-action' } = {}) {
    const current = this.now();
    for (const [id, challenge] of this.pending) {
      if (challenge.expiresAt <= current) this.pending.delete(id);
    }
    if (this.pending.size >= MAX_PENDING_CHALLENGES) {
      throw identityError('Troppe verifiche dispositivo in attesa.', 'DEVICE_CHALLENGE_LIMIT');
    }
    const challenge = Object.freeze({
      version: 1,
      challengeId: this.randomBytes(18).toString('base64url'),
      nonce: this.randomBytes(32).toString('base64url'),
      deviceId: boundedIdentifier(deviceId, 'Il dispositivo'),
      keyId: boundedIdentifier(keyId, 'La chiave dispositivo'),
      purpose: boundedIdentifier(purpose, 'Lo scopo'),
      issuedAt: current,
      expiresAt: current + this.ttlMs
    });
    this.pending.set(challenge.challengeId, challenge);
    return { ...challenge };
  }

  async verify({ challengeId, deviceId, keyId, purpose = 'authorize-action', signature } = {}) {
    const id = boundedIdentifier(challengeId, 'La challenge');
    const challenge = this.pending.get(id);
    // Ogni tentativo consuma la challenge: una firma errata non puo essere usata
    // come oracolo per provare firme ripetute sullo stesso nonce.
    this.pending.delete(id);
    if (!challenge) throw identityError('La challenge dispositivo non esiste o e gia stata usata.', 'DEVICE_CHALLENGE_INVALID');
    if (challenge.expiresAt <= this.now()) throw identityError('La challenge dispositivo e scaduta.', 'DEVICE_CHALLENGE_EXPIRED');
    const claimedDevice = boundedIdentifier(deviceId, 'Il dispositivo');
    const claimedKey = boundedIdentifier(keyId, 'La chiave dispositivo');
    const claimedPurpose = boundedIdentifier(purpose, 'Lo scopo');
    if (claimedDevice !== challenge.deviceId || claimedKey !== challenge.keyId || claimedPurpose !== challenge.purpose) {
      throw identityError('La challenge non appartiene a questo dispositivo o scopo.', 'DEVICE_CHALLENGE_MISMATCH');
    }
    if ((!Buffer.isBuffer(signature) && typeof signature !== 'string') || !signature.length || signature.length > 8192) {
      throw identityError('La firma dispositivo non e valida.', 'DEVICE_SIGNATURE_INVALID');
    }
    const valid = await this.verifySignature({
      deviceId: challenge.deviceId,
      keyId: challenge.keyId,
      purpose: challenge.purpose,
      payload: canonicalChallengePayload(challenge),
      signature
    });
    if (valid !== true) throw identityError('La firma dispositivo non e stata verificata.', 'DEVICE_SIGNATURE_INVALID');
    return verifiedIdentity(challenge, this.now());
  }
}

// #endregion

module.exports = {
  DeviceIdentityChallengeStore,
  assertVerifiedDeviceIdentity,
  canonicalChallengePayload,
  deviceSubjectId,
  isVerifiedDeviceIdentity,
  publicDeviceIdentity
};
