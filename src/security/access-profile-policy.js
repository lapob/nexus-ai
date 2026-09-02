/**
 * @module security/access-profile-policy
 * @description Profili server-side per beta pubblica, dispositivi invitati e sviluppo.
 */
const crypto = require('node:crypto');
const policy = require('../../config/access-profiles.json');

const PROFILE_IDS = Object.freeze(Object.keys(policy.profiles));

// #region Validazione e binding

function validateAccessProfilePolicy(value = policy) {
  if (value?.schemaVersion !== 1 || !PROFILE_IDS.includes(value.defaultProfile)) return false;
  if (value.invariants?.clientCannotSelectProfile !== true
    || value.invariants?.abuseProtectionAlwaysEnabled !== true
    || value.invariants?.capacityProtectionAlwaysEnabled !== true
    || value.invariants?.developerBypassRequiresServerBinding !== true) return false;
  return PROFILE_IDS.every((id) => {
    const profile = value.profiles[id];
    return ['observe', 'unmetered'].includes(profile?.commercialMetering)
      && Number.isInteger(profile?.priority) && profile.priority >= 0
      && (profile.dailySafetyMultiplier === null || Number(profile.dailySafetyMultiplier) >= 1);
  });
}

function parseBindings(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return Object.freeze({});
    return Object.freeze(Object.fromEntries(Object.entries(parsed)
      .filter(([key, profile]) => /^[a-f0-9]{64}$/i.test(key) && PROFILE_IDS.includes(String(profile)))
      .map(([key, profile]) => [key.toLowerCase(), String(profile)])));
  } catch { return Object.freeze({}); }
}

function installationBinding(installationId, secret) {
  if (!secret || String(secret).length < 24) return '';
  return crypto.createHmac('sha256', String(secret)).update(String(installationId)).digest('hex');
}

function resolveAccessProfile({ installationId, secret, bindings } = {}) {
  const binding = installationBinding(installationId, secret);
  const requested = binding ? parseBindings(bindings)[binding] : null;
  const id = PROFILE_IDS.includes(requested) ? requested : policy.defaultProfile;
  return Object.freeze({ id, ...policy.profiles[id] });
}

// #endregion
// #region Quote di sicurezza

function profileSafetyLimit(profile, baseLimit) {
  if (profile?.commercialMetering === 'unmetered') return null;
  return Math.max(1, Math.round(Number(baseLimit) * Number(profile?.dailySafetyMultiplier || 1)));
}

// #endregion

module.exports = {
  PROFILE_IDS,
  installationBinding,
  parseBindings,
  profileSafetyLimit,
  resolveAccessProfile,
  validateAccessProfilePolicy
};
