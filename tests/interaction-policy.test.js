const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../src/renderer/systems/InteractionPolicy.ts'), 'utf8')
  .replace(/export function /g, 'function ')
  .replace(/: boolean/g, '');
const factory = new Function(`${source}\nreturn { canActivateVoiceShortcut, canStartVoiceTurn, shouldQueueTurn };`);
const { canActivateVoiceShortcut, canStartVoiceTurn, shouldQueueTurn } = factory();
const controllerSource = fs.readFileSync(require.resolve('../src/renderer/hooks/useNexusController.ts'), 'utf8');

test('Space può aprire un turno vocale anche mentre la risposta continua', () => {
  assert.equal(canStartVoiceTurn(true), true);
  assert.equal(canStartVoiceTurn(false), true);
});

test('un nuovo messaggio viene accodato soltanto durante una generazione', () => {
  assert.equal(shouldQueueTurn(true), true);
  assert.equal(shouldQueueTurn(false), false);
});

test('Space attiva la voce soltanto dalla superficie principale', () => {
  assert.equal(canActivateVoiceShortcut(false, false, false, false, false, false), true);
  assert.equal(canActivateVoiceShortcut(true, false, false, false, false, false), false);
  assert.equal(canActivateVoiceShortcut(false, true, false, false, false, false), false);
  assert.equal(canActivateVoiceShortcut(false, false, true, false, false, false), false);
  assert.equal(canActivateVoiceShortcut(false, false, false, true, false, false), false);
  assert.equal(canActivateVoiceShortcut(false, false, false, false, true, false), false);
  assert.equal(canActivateVoiceShortcut(false, false, false, false, false, true), false);
});

test('una seconda pressione intenzionale di Space può annullare anche l avvio del microfono', () => {
  assert.doesNotMatch(controllerSource, /lastVoiceToggleAt|<\s*320/);
  assert.match(
    controllerSource,
    /const session = \+\+voiceSession\.current;[\s\S]{0,500}listening\.current = true;[\s\S]{0,120}try\s*\{/
  );
});
