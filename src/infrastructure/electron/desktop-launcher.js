/**
 * @module infrastructure/electron/desktop-launcher
 * @description Avvia la UI interattiva senza riusare il processo Core o quello di presenza.
 */
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isProcessAlive, readLock } = require('./process-lock');
const WAKE_WORD_ARGUMENT_PREFIX = '--wake-word-voice=';
const AMBIENT_VOICE_ARGUMENT = '--ambient-voice';
const PRESENCE_ARGUMENT = '--presence';

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

function presenceLaunchArguments({
  defaultApp = process.defaultApp,
  appRoot = path.resolve(__dirname, '..', '..', '..')
} = {}) {
  return defaultApp ? [appRoot, PRESENCE_ARGUMENT] : [PRESENCE_ARGUMENT];
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


function launchIndependentWindowsProcess(executable, args, { cwd, env }, runFile = execFile) {
  const argumentsText = args.map(value => '"' + String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"').join(' ');
  const payload = Buffer.from(JSON.stringify({ executable, argumentsText, cwd }), 'utf8').toString('base64');
  // ShellExecute prevents inheritable Chromium GPU handles from reaching the
  // long-lived sibling. Detaching CreateProcess alone does not prevent this.
  const script = "$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + payload + "')) | ConvertFrom-Json; $info=New-Object Diagnostics.ProcessStartInfo; $info.FileName=$p.executable; $info.Arguments=$p.argumentsText; $info.WorkingDirectory=$p.cwd; $info.UseShellExecute=$true; $info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden; $started=[Diagnostics.Process]::Start($info); $started.Id";
  return new Promise((resolve, reject) => {
    runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { cwd, env, windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) return reject(new Error('Avvio del processo desktop indipendente non riuscito.'));
        const pid = Number(String(stdout).trim());
        if (!Number.isInteger(pid) || pid <= 0) return reject(new Error('PID desktop indipendente non valido.'));
        resolve({ launched: true, pid });
      });
  });
}

function launchInteractiveDesktop({
  executable = process.execPath,
  defaultApp = process.defaultApp,
  appRoot = path.resolve(__dirname, '..', '..', '..'),
  launch = spawn,
  env = process.env,
  platform = process.platform,
  activationTicket = ''
} = {}) {
  if (!executable || (path.isAbsolute(executable) && !fs.existsSync(executable))) {
    return Promise.reject(new Error('Eseguibile NexusNXS non disponibile.'));
  }
  if (platform === 'win32') return launchIndependentWindowsProcess(executable, interactiveLaunchArguments({ defaultApp, appRoot, activationTicket }), {
    cwd: defaultApp ? appRoot : path.dirname(executable),
    env: { ...env, NEXUS_USER_DATA_ROOT: env.NEXUS_SHARED_DATA_ROOT || env.NEXUS_USER_DATA_ROOT || '', NEXUS_MANAGED_OLLAMA: env.NEXUS_MANAGED_OLLAMA || '0' }
  });
  return new Promise((resolve, reject) => {
    const child = launch(executable, interactiveLaunchArguments({ defaultApp, appRoot, activationTicket }), {
      // ASAR is an Electron virtual filesystem, never a valid OS cwd.
      cwd: defaultApp ? appRoot : path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env, NEXUS_USER_DATA_ROOT: env.NEXUS_SHARED_DATA_ROOT || env.NEXUS_USER_DATA_ROOT || '', NEXUS_MANAGED_OLLAMA: env.NEXUS_MANAGED_OLLAMA || '0' }
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve({ launched: true, pid: Number(child.pid) || null });
    });
  });
}

function launchSystemPresence({
  executable = process.execPath,
  defaultApp = process.defaultApp,
  appRoot = path.resolve(__dirname, '..', '..', '..'),
  launch = spawn,
  env = process.env,
  platform = process.platform
} = {}) {
  if (!executable || (path.isAbsolute(executable) && !fs.existsSync(executable))) {
    return Promise.reject(new Error('Eseguibile NexusNXS non disponibile.'));
  }
  if (platform === 'win32') return launchIndependentWindowsProcess(executable, presenceLaunchArguments({ defaultApp, appRoot }), {
    cwd: defaultApp ? appRoot : path.dirname(executable),
    env: { ...env, NEXUS_USER_DATA_ROOT: env.NEXUS_SHARED_DATA_ROOT || env.NEXUS_USER_DATA_ROOT || '', NEXUS_MANAGED_OLLAMA: '0' }
  });
  return new Promise((resolve, reject) => {
    const child = launch(executable, presenceLaunchArguments({ defaultApp, appRoot }), {
      cwd: defaultApp ? appRoot : path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...env, NEXUS_USER_DATA_ROOT: env.NEXUS_SHARED_DATA_ROOT || env.NEXUS_USER_DATA_ROOT || '', NEXUS_MANAGED_OLLAMA: '0' }
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve({ launched: true, pid: Number(child.pid) || null });
    });
  });
}

module.exports = {
  launchIndependentWindowsProcess,
  AMBIENT_VOICE_ARGUMENT,
  PRESENCE_ARGUMENT,
  WAKE_WORD_ARGUMENT_PREFIX,
  interactiveLaunchArguments,
  launchInteractiveDesktop,
  launchSystemPresence,
  presenceLaunchArguments,
  processLockState
};

// #endregion
