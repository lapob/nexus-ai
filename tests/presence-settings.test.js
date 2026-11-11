/**
 * @module tests/presence-settings
 * @description Processo Presence senza pet: solo impostazioni della parola di attivazione e azioni remote utili.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPresenceSettings, normalizeWakeWordSettings, DESKTOP_ACTIONS } = require('../src/infrastructure/electron/presence-settings');

const temporary = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-presence-')), 'system-presence.json');

test('la parola di attivazione viene normalizzata entro limiti sicuri', () => {
  assert.deepEqual(normalizeWakeWordSettings({ wakeWordEnabled: 'yes', wakeWordConfidence: 3, wakeWordCooldownMs: 10 }), {
    wakeWordEnabled: false, wakeWordConfidence: 0.95, wakeWordCooldownMs: 2_000, wakeWordSuspended: false, wakeWordListening: false
  });
});

test('le impostazioni persistono solo quando cambiano e sopravvivono al riavvio, senza dati del pet', () => {
  const statePath = temporary();
  const settings = createPresenceSettings({ statePath });
  settings.setSystemPresenceConfiguration({ state: 'thinking', wakeWordEnabled: true, wakeWordConfidence: 0.9, pet: 'fox', appearance: 'neural' });
  assert.equal(settings.getSystemPresenceConfiguration().state, 'thinking');
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['version', 'wakeWordConfidence', 'wakeWordCooldownMs', 'wakeWordEnabled']);
  const reopened = createPresenceSettings({ statePath });
  assert.equal(reopened.getSystemPresenceConfiguration().wakeWordEnabled, true);
  assert.equal(reopened.getSystemPresenceConfiguration().wakeWordConfidence, 0.9);
  reopened.setWakeWordListening(true);
  assert.equal(reopened.getSystemPresenceConfiguration().wakeWordListening, true);
  reopened.updateState('nonsense');
  assert.equal(reopened.getSystemPresenceConfiguration().state, 'idle');
});

test('Control non riceve più azioni sul nucleo o sui display', () => {
  const settings = createPresenceSettings({ statePath: temporary() });
  const status = settings.getSystemPresenceStatus();
  assert.deepEqual(DESKTOP_ACTIONS, ['open-full-app', 'close-full-app', 'open-claude', 'close-claude', 'open-application', 'close-application']);
  assert.deepEqual(status.allowedActions, DESKTOP_ACTIONS);
  assert.equal('nucleusVisible' in status, false);
  settings.setApplicationVisible(true);
  assert.equal(settings.getSystemPresenceStatus().fullAppOpen, true);
});
