/**
 * @module tests/interaction-state-protocol
 * @description Impedisce divergenze cromatiche e semantiche tra le superfici NexusNXS.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CANONICAL_STATES,
  interactionClientContract,
  interactionStateDescriptor,
  interactionStatePalette,
  interactionPresentation,
  resolveInteractionState,
  validateInteractionStateProtocol
} = require('../src/core/interaction-state-protocol');

const root = path.resolve(__dirname, '..');

test('il protocollo di stato è completo, valido e non espone chain-of-thought', () => {
  assert.equal(validateInteractionStateProtocol(), true);
  assert.deepEqual(CANONICAL_STATES, [
    'booting', 'idle', 'listening', 'speaking', 'thinking', 'responding',
    'executing', 'permission', 'offline', 'error'
  ]);
  assert.equal(resolveInteractionState('researching'), 'thinking');
  assert.equal(resolveInteractionState('consent'), 'permission');
  assert.equal(resolveInteractionState('unknown'), 'idle');
  const presentation = interactionPresentation();
  assert.equal(presentation.semanticMotionOnly, true);
  assert.equal(presentation.continuum.id, 'nexus-cosmic-continuum-v1');
  assert.equal(presentation.continuum.singleClock, true);
  assert.equal(presentation.continuum.stateTransitionsPreservePhase, true);
  assert.equal(presentation.accessibility.minimumTouchTargetDp, 48);
  assert.equal(presentation.viewportClasses.compactMaxDp, 599);
  const offline = interactionStateDescriptor('offline');
  assert.equal(offline.inputPolicy, 'blocked-until-online');
  assert.deepEqual(offline.allowedActions, ['retry-connection', 'read-status']);
  const client = interactionClientContract({ rgb: true });
  assert.equal(client.contractId, 'nexusnxs-interaction-state');
  assert.equal(client.states.idle.inputPolicy, 'enabled');
  assert.deepEqual(client.states.idle.allowedActions, ['primary-input']);
  assert.equal(client.states.offline.inputPolicy, 'blocked-until-online');
  assert.equal(client.privacy.exposeChainOfThought, false);
});

test('desktop, Presence, Android e NexusNXS AI consumano la palette autoritativa', () => {
  const palette = interactionStatePalette();
  const desktop = fs.readFileSync(path.join(root, 'src/renderer/scene/NexusCore.tsx'), 'utf8');
  const presence = fs.readFileSync(path.join(root, 'src/infrastructure/electron/companion-window.js'), 'utf8');
  const gateway = fs.readFileSync(path.join(root, 'src/remote/remote-session-gateway.js'), 'utf8');
  const android = fs.readFileSync(path.join(root, 'android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt'), 'utf8');
  const generatedAndroid = fs.readFileSync(path.join(root, 'android/shared-motion/src/main/java/local/nexus/motion/NexusInteractionStates.java'), 'utf8');
  const generatedDesktop = fs.readFileSync(path.join(root, 'src/renderer/types/interaction-states.generated.ts'), 'utf8');
  assert.match(desktop, /nexus-interaction-states\.json/);
  assert.match(presence, /interactionStatePalette/);
  assert.match(gateway, /PUBLIC_AI_CORE_CONTRACT = interactionClientContract/);
  assert.match(gateway, /publicAiCosmicCoreScript/);
  assert.match(desktop, /interactionStates\.states\[state\]/);
  assert.match(android, /NEXUS_COSMIC_CONTINUUM_ID = NexusInteractionStates\.CONTINUUM_ID/);
  assert.match(android, /Color\(NexusInteractionStates\.THINKING\)/);
  assert.match(generatedDesktop, /nexus-cosmic-continuum-v1/);
  for (const state of ['booting', 'idle', 'listening', 'thinking', 'responding', 'executing', 'offline', 'error']) {
    assert.match(generatedAndroid, new RegExp(palette[state].replace('#', '0xFF'), 'i'));
  }
});

test('i contratti generati restano sincronizzati con la sorgente unica', () => {
  const result = require('node:child_process').spawnSync(process.execPath, ['scripts/generate-interaction-contracts.js', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
