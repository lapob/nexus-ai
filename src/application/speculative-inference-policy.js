/**
 * @module application/speculative-inference-policy
 * @description Governa il candidato rapido usando soltanto metriche aggregate e privacy-safe.
 */

// #region 01 — Policy adattiva

function finiteRatio(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function speculativeInferencePolicy({
  mode = 'fast',
  fastModel = null,
  primaryModel = null,
  summary = {},
  minimumSamples = 20,
  maximumCorrectionRate = 0.25,
  maximumFailureRate = 0.12,
  maximumFirstTokenP95Ms = 8_000
} = {}) {
  const deep = mode === 'deep';
  const candidate = fastModel || primaryModel;
  if (deep || !candidate || !primaryModel || candidate === primaryModel) {
    return Object.freeze({
      candidateModel: primaryModel || candidate,
      verifierModel: null,
      speculative: false,
      reason: deep ? 'deep-request' : 'single-model'
    });
  }

  const samples = Math.max(0, Number(summary.samples) || 0);
  if (samples < Math.max(5, Number(minimumSamples) || 20)) {
    return Object.freeze({
      candidateModel: candidate,
      verifierModel: primaryModel,
      speculative: true,
      reason: 'learning-window'
    });
  }

  const correctionRate = finiteRatio((Number(summary.corrected) || 0) / samples);
  const failureRate = finiteRatio((Number(summary.failures) || 0) / samples);
  const firstTokenP95Ms = Math.max(0, Number(summary.firstTokenP95Ms) || 0);
  const healthy = correctionRate <= maximumCorrectionRate
    && failureRate <= maximumFailureRate
    && (!firstTokenP95Ms || firstTokenP95Ms <= maximumFirstTokenP95Ms);

  return Object.freeze({
    candidateModel: healthy ? candidate : primaryModel,
    verifierModel: healthy ? primaryModel : null,
    speculative: healthy,
    reason: healthy ? 'measured-fast-path' : 'quality-guard',
    metrics: Object.freeze({ samples, correctionRate, failureRate, firstTokenP95Ms })
  });
}

// #endregion

module.exports = { speculativeInferencePolicy };
