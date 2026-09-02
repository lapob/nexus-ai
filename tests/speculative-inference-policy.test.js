const test = require('node:test');
const assert = require('node:assert/strict');
const { speculativeInferencePolicy } = require('../src/application/speculative-inference-policy');

test('usa il candidato rapido durante una finestra di apprendimento misurata', () => {
  const policy = speculativeInferencePolicy({
    fastModel: 'fast', primaryModel: 'primary', summary: { samples: 8 }
  });
  assert.equal(policy.candidateModel, 'fast');
  assert.equal(policy.verifierModel, 'primary');
  assert.equal(policy.speculative, true);
});

test('disattiva il percorso speculativo quando correzioni o guasti superano il gate', () => {
  const policy = speculativeInferencePolicy({
    fastModel: 'fast', primaryModel: 'primary',
    summary: { samples: 40, corrected: 14, failures: 1, firstTokenP95Ms: 900 }
  });
  assert.equal(policy.candidateModel, 'primary');
  assert.equal(policy.verifierModel, null);
  assert.equal(policy.reason, 'quality-guard');
});

test('mantiene il modello principale per ragionamento approfondito o profilo singolo', () => {
  assert.equal(speculativeInferencePolicy({ mode: 'deep', fastModel: 'fast', primaryModel: 'primary' }).candidateModel, 'primary');
  assert.equal(speculativeInferencePolicy({ fastModel: 'primary', primaryModel: 'primary' }).speculative, false);
});
