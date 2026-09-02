/**
 * @module core/interaction-state-protocol
 * @description Contratto unico per colori e alias degli stati su desktop, Android e demo pubblica.
 */
const protocol = require('../../config/nexus-interaction-states.json');

const CANONICAL_STATES = Object.freeze(Object.keys(protocol.states));
const CANONICAL_STATE_SET = new Set(CANONICAL_STATES);

// #region Risoluzione e contratto client

function resolveInteractionState(value, fallback = 'idle') {
  const requested = String(value || '').trim().toLowerCase();
  if (CANONICAL_STATE_SET.has(requested)) return requested;
  const alias = protocol.aliases[requested];
  return CANONICAL_STATE_SET.has(alias) ? alias : fallback;
}

function interactionStateDescriptor(value) {
  const state = resolveInteractionState(value);
  return Object.freeze({ state, ...protocol.states[state] });
}

function interactionStatePalette({ rgb = false } = {}) {
  return Object.freeze(Object.fromEntries(CANONICAL_STATES.map((state) => [
    state,
    rgb ? [...protocol.states[state].rgb] : protocol.states[state].color
  ])));
}

function interactionClientContract({ rgb = false } = {}) {
  return Object.freeze({
    schemaVersion: protocol.schemaVersion,
    contractId: protocol.contractId,
    states: Object.freeze(Object.fromEntries(CANONICAL_STATES.map((state) => {
      const entry = protocol.states[state];
      return [state, Object.freeze({
        color: rgb ? [...entry.rgb] : entry.color,
        energy: entry.energy,
        motion: entry.motion,
        inputPolicy: entry.inputPolicy || 'enabled',
        allowedActions: Object.freeze([...(entry.allowedActions || ['primary-input'])])
      })];
    }))),
    presentation: interactionPresentation(),
    privacy: Object.freeze({ ...protocol.privacy })
  });
}

// #endregion
// #region Validazione e presentazione

function validateInteractionStateProtocol(value = protocol) {
  if (value?.schemaVersion !== 1 || value?.contractId !== 'nexusnxs-interaction-state') return false;
  if (!value.states || !value.aliases || value.privacy?.exposeChainOfThought !== false) return false;
  const presentation = value.presentation;
  if (presentation?.semanticMotionOnly !== true
    || presentation?.continuum?.id !== 'nexus-cosmic-continuum-v1'
    || presentation?.continuum?.primitive !== 'neural-particle-field'
    || presentation?.continuum?.singleClock !== true
    || presentation?.continuum?.stateTransitionsPreservePhase !== true
    || presentation?.continuum?.suspendWhenHidden !== true
    || presentation?.accessibility?.respectReducedMotion !== true
    || presentation?.accessibility?.respectFontScale !== true
    || Number(presentation?.accessibility?.minimumTouchTargetDp) < 48
    || Number(presentation?.viewportClasses?.compactMaxDp) >= Number(presentation?.viewportClasses?.mediumMaxDp)) return false;
  if (value.states.offline?.inputPolicy !== 'blocked-until-online'
    || !Array.isArray(value.states.offline?.allowedActions)
    || !value.states.offline.allowedActions.includes('retry-connection')) return false;
  return CANONICAL_STATES.every((state) => {
    const entry = value.states[state];
    return /^#[0-9A-F]{6}$/i.test(String(entry?.color || ''))
      && Array.isArray(entry?.rgb) && entry.rgb.length === 3
      && entry.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
      && Number.isFinite(entry?.energy) && entry.energy >= 0 && entry.energy <= 1
      && typeof entry?.motion === 'string' && entry.motion.length > 0;
  });
}

function interactionPresentation() {
  return Object.freeze({
    ...protocol.presentation,
    continuum: Object.freeze({ ...protocol.presentation.continuum }),
    viewportClasses: Object.freeze({ ...protocol.presentation.viewportClasses }),
    qualityTiers: Object.freeze(Object.fromEntries(Object.entries(protocol.presentation.qualityTiers)
      .map(([name, value]) => [name, Object.freeze({ ...value })]))),
    accessibility: Object.freeze({ ...protocol.presentation.accessibility })
  });
}

// #endregion

module.exports = {
  CANONICAL_STATES,
  interactionClientContract,
  interactionStateDescriptor,
  interactionStatePalette,
  interactionPresentation,
  protocol,
  resolveInteractionState,
  validateInteractionStateProtocol
};
