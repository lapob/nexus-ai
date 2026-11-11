/**
 * @module infrastructure/electron/update-health
 * @description Segnale di salute anonimo della versione installata, usato dal sito per fermare da solo un
 * rollout difettoso. Invia solo {version, channel, event} con event "healthy" o "crash": nessun identificativo,
 * nessun percorso, nessun contenuto. Al massimo un segnale per tipo e versione per installazione.
 * Disattivabile con NEXUS_DISABLE_UPDATE_HEALTH=1.
 */
const fs = require('node:fs');
const path = require('node:path');

const EVENTS = new Set(['healthy', 'crash']);

// #region 01 — Stato locale

function readState(statePath) {
  try {
    const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporary = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, statePath);
  } catch {
    // Lo stato di salute non deve mai bloccare l'avvio.
  }
}

// #endregion

// #region 02 — Segnale di salute
/**
 * @param {{ statePath: string, version: string, channel: string, endpoint: string, send: (url: string, body: string) => Promise<unknown>,
 *   logger?: any, healthyAfterMs?: number, enabled?: boolean }} options
 */
function createUpdateHealth({ statePath, version, channel, endpoint, send, logger, healthyAfterMs = 3 * 60_000, enabled = true }) {
  let timer = null;
  let state = {};
  const active = Boolean(enabled && statePath && endpoint && /^\d+\.\d+\.\d+/.test(String(version || '')));

  const report = (event) => {
    if (!active || !EVENTS.has(event) || state[event]) return false;
    state = { ...state, [event]: Date.now() };
    writeState(statePath, state);
    Promise.resolve()
      .then(() => send(endpoint, JSON.stringify({ version, channel, event })))
      .catch((error) => logger?.debug?.('Segnale di salute aggiornamento non inviato.', { error: error?.message }));
    return true;
  };

  return {
    start() {
      if (!active || timer) return;
      const previous = readState(statePath);
      state = previous.version === version ? previous : { version };
      // Chiusura non pulita della stessa versione (processo terminato, blocco): conta come crash.
      if (previous.version === version && previous.running === true) report('crash');
      state = { ...state, running: true };
      writeState(statePath, state);
      timer = setTimeout(() => { if (!state.crash) report('healthy'); }, healthyAfterMs);
      timer.unref?.();
    },
    crash() { return report('crash'); },
    stop() {
      clearTimeout(timer);
      timer = null;
      if (!active || !state.running) return;
      state = { ...state, running: false };
      writeState(statePath, state);
    },
    snapshot: () => ({ ...state })
  };
}

/** Le uscite anomale che contano come crash (non le chiusure normali o le terminazioni volute). */
function isCrashExit(details = {}) {
  return ['crashed', 'oom', 'launch-failed', 'integrity-failure'].includes(String(details.reason || ''));
}

// #endregion

module.exports = { createUpdateHealth, isCrashExit };
