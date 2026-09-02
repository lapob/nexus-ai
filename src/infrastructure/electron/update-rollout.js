/**
 * @module infrastructure/electron/update-rollout
 * @description Applica in modo deterministico gli anelli di aggiornamento firmati.
 */
const crypto = require('node:crypto');

// #region Coorte deterministica e policy

function rolloutBucket(seed, channel = 'stable') {
  const normalized = String(seed || '').trim();
  if (!normalized) return null;
  const digest = crypto.createHash('sha256')
    .update('nexusnxs-update-rollout-v1\0')
    .update(String(channel || 'stable'))
    .update('\0')
    .update(normalized)
    .digest();
  return digest.readUInt32BE(0) % 100 + 1;
}

function evaluateUpdateRollout(manifest, { rolloutSeed = '' } = {}) {
  const policy = manifest?.updatePolicy || {};
  const percentage = Math.max(0, Math.min(100, Number(policy.initialPercentage) || 0));
  const channel = String(manifest?.channel || 'stable');
  if (policy.paused === true) {
    return Object.freeze({ eligible: false, reason: 'paused', percentage, bucket: null });
  }
  if (channel === 'preview' || policy.rollout === 'manual-preview') {
    return Object.freeze({ eligible: false, reason: 'manual-preview', percentage, bucket: null });
  }
  if (percentage >= 100) {
    return Object.freeze({ eligible: true, reason: 'all', percentage: 100, bucket: null });
  }
  const bucket = rolloutBucket(rolloutSeed, channel);
  if (bucket === null) {
    return Object.freeze({ eligible: false, reason: 'identity-unavailable', percentage, bucket: null });
  }
  return Object.freeze({
    eligible: bucket <= percentage,
    reason: bucket <= percentage ? 'cohort-enabled' : 'cohort-deferred',
    percentage,
    bucket
  });
}

// #endregion

module.exports = { evaluateUpdateRollout, rolloutBucket };
