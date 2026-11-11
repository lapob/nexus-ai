/**
 * @module infrastructure/electron/presence-settings
 * @description Stato del processo Presence senza finestre: impostazioni della parola di attivazione (persistite),
 * visibilità della UI completa e stato remoto per NexusNXS Control. Il pet desktop è stato rimosso: nessuna
 * finestra trasparente, nessuno sprite, nessuna azione remota sul «nucleo» o sui display.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PRESENCE_ACTIONS } = require('../../remote/desktop-presence-contract');

// #region 01 — Configurazione

/** Azioni remote ancora significative senza il pet: UI completa, Claude e applicazioni consentite. */
const DESKTOP_ACTIONS = Object.freeze(PRESENCE_ACTIONS.filter((action) => !['show-nucleus', 'hide-nucleus', 'select-display'].includes(action)));
const STATES = new Set(['booting', 'idle', 'listening', 'thinking', 'responding', 'speaking', 'executing', 'permission', 'offline', 'error']);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Normalizza le impostazioni della parola di attivazione; valori estranei ricadono su default sicuri. */
function normalizeWakeWordSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    wakeWordEnabled: source.wakeWordEnabled === true,
    wakeWordConfidence: clamp(numberOr(source.wakeWordConfidence, 0.84), 0.7, 0.95),
    wakeWordCooldownMs: Math.round(clamp(numberOr(source.wakeWordCooldownMs, 5_000), 2_000, 30_000)),
    wakeWordSuspended: source.wakeWordSuspended === true,
    wakeWordListening: source.wakeWordListening === true
  });
}

// #endregion

// #region 02 — Stato del processo

/**
 * @param {{ statePath: string, logger?: any }} options
 */
function createPresenceSettings({ statePath, logger } = {}) {
  let stored = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch { /* primo avvio o file illeggibile: default */ }
  let settings = normalizeWakeWordSettings({ ...stored, wakeWordSuspended: false, wakeWordListening: false });
  let state = 'idle';
  let applicationVisible = false;

  const persist = () => {
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const temporary = `${statePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({
        version: 5,
        wakeWordEnabled: settings.wakeWordEnabled,
        wakeWordConfidence: settings.wakeWordConfidence,
        wakeWordCooldownMs: settings.wakeWordCooldownMs
      }), { mode: 0o600 });
      fs.renameSync(temporary, statePath);
    } catch (error) {
      logger?.warn?.('Preferenze della parola di attivazione non salvate.', { error: error?.message });
    }
  };

  const configuration = () => Object.freeze({ ...settings, state });

  return {
    getSystemPresenceStatus: () => ({
      available: true,
      fullAppOpen: applicationVisible,
      logicalDisplays: [],
      allowedActions: [...DESKTOP_ACTIONS]
    }),
    getSystemPresenceConfiguration: configuration,
    setSystemPresenceConfiguration(snapshot = {}) {
      const next = normalizeWakeWordSettings({ ...snapshot, wakeWordListening: settings.wakeWordListening });
      const changed = next.wakeWordEnabled !== settings.wakeWordEnabled
        || next.wakeWordConfidence !== settings.wakeWordConfidence
        || next.wakeWordCooldownMs !== settings.wakeWordCooldownMs;
      settings = next;
      if (STATES.has(snapshot.state)) state = snapshot.state;
      if (changed) persist();
      return configuration();
    },
    setWakeWordListening(active) {
      settings = Object.freeze({ ...settings, wakeWordListening: active === true });
      return configuration();
    },
    setApplicationVisible(visible) {
      applicationVisible = visible === true;
      return { visible: applicationVisible };
    },
    updateState(next) {
      if (STATES.has(next)) state = next;
    },
    dispose() {}
  };
}

// #endregion

module.exports = { DESKTOP_ACTIONS, createPresenceSettings, normalizeWakeWordSettings };
