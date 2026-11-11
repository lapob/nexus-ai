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

/**
 * Percentuale attiva secondo le fasi firmate e il tempo trascorso dalla pubblicazione. Un orologio locale
 * indietro non anticipa nulla (tempo negativo = fase 0); senza fasi vale la percentuale iniziale.
 */
function stagedPercentage(policy, generatedAt, now = Date.now()) {
  const initial = Math.max(0, Math.min(100, Number(policy?.initialPercentage) || 0));
  if (!Array.isArray(policy?.stages) || !policy.stages.length) return initial;
  const published = Date.parse(String(generatedAt || ''));
  const hours = Number.isFinite(published) ? Math.max(0, (now - published) / 3_600_000) : 0;
  let percentage = policy.stages[0].percentage;
  for (const stage of policy.stages) if (hours >= stage.afterHours) percentage = stage.percentage;
  return Math.max(0, Math.min(100, percentage));
}

/**
 * @param {object} manifest distinta già verificata
 * @param {{ rolloutSeed?: string, now?: number, seeker?: boolean }} options seeker = controllo chiesto dall'utente:
 * salta la coorte (come «Controlla aggiornamenti» di Windows/Chrome) ma rispetta sempre la pausa firmata.
 */
function evaluateUpdateRollout(manifest, { rolloutSeed = '', now = Date.now(), seeker = false } = {}) {
  const policy = manifest?.updatePolicy || {};
  const channel = String(manifest?.channel || 'stable');
  const autoPreview = channel === 'preview' && policy.rollout === 'preview-auto';
  // Preview firmata senza fasi: tutti subito (compatibilità con le distinte 0.3.37).
  const percentage = autoPreview && !Array.isArray(policy.stages) ? 100 : stagedPercentage(policy, manifest?.generatedAt, now);
  if (policy.paused === true) {
    return Object.freeze({ eligible: false, reason: 'paused', percentage, bucket: null });
  }
  if (!autoPreview && (channel === 'preview' || policy.rollout === 'manual-preview')) {
    return Object.freeze({ eligible: false, reason: 'manual-preview', percentage, bucket: null });
  }
  if (seeker) {
    return Object.freeze({ eligible: true, reason: 'seeker', percentage, bucket: null });
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

module.exports = { evaluateUpdateRollout, rolloutBucket, stagedPercentage };
