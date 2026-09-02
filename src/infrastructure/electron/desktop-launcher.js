/**
 * @module infrastructure/electron/desktop-launcher
 * @description Avvia la UI interattiva senza riusare il processo Core o quello di presenza.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isProcessAlive, readLock } = require('./process-lock');
const WAKE_WORD_ARGUMENT_PREFIX = '--wake-word-voice=';
const AMBIENT_VOICE_ARGUMENT = '--ambient-voice';

// #region 01 — Stato e argomenti

function interactiveLaunchArguments({
  defaultApp = process.defaultApp,
  appRoot = path.resolve(__dirname, '..', '..', '..'),
  activationTicket = ''
} = {}) {
  const args = defaultApp ? [appRoot, '--ui'] : ['--ui'];
  if (/^[A-Za-z0-9_-]{80,2048}$/.test(String(activationTicket || ''))) {
    args.push(AMBIENT_VOICE_ARGUMENT);
    args.push(`${WAKE_WORD_ARGUMENT_PREFIX}${activationTicket}`);
  }
  return args;
}

function processLockState(filePath, { processAlive = isProcessAlive } = {}) {
  const lock = readLock(filePath);
  return {
    running: Boolean(lock && processAlive(lock.pid)),
    pid: lock && processAlive(lock.pid) ? lock.pid : null
  };
}

// #endregion
// #region 02 — Avvio separato della UI

function launchInteractiveDesktop({
  executable = process.execPath,
  defaultApp = process.defaultApp,
  appRoot = path.resolve(__dirname, '..', '..', '..'),
  launch = spawn,
  env = process.env,
  activationTicket = ''
} = {}) {
  if (!executable || (path.isAbsolute(executable) && !fs.existsSync(executable))) {
    return Promise.reject(new Error('Eseguibile NexusNXS non disponibile.'));
  }
  return new Promise((resolve, reject) => {
    const child = launch(executable, interactiveLaunchArguments({ defaultApp, appRoot, activationTicket }), {
      cwd: appRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env, NEXUS_MANAGED_OLLAMA: env.NEXUS_MANAGED_OLLAMA || '0' }
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve({ launched: true, pid: Number(child.pid) || null });
    });
  });
}

module.exports = { AMBIENT_VOICE_ARGUMENT, WAKE_WORD_ARGUMENT_PREFIX, interactiveLaunchArguments, launchInteractiveDesktop, processLockState };

// #endregion
