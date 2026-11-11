/**
 * @module application/presence-bootstrap
 * @description Processo grafico minimo: presenza di sistema, tray e richiamo della UI completa.
 */
const path = require('node:path');
const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { app, globalShortcut, Menu, safeStorage, shell, Tray } = require('electron');
const { createSystemPresenceManager } = require('../infrastructure/electron/companion-window');
const { configureSessionSecurity, installShutdownBarrier } = require('../infrastructure/electron/app-lifecycle');
const { launchInteractiveDesktop, processLockState } = require('../infrastructure/electron/desktop-launcher');
const { ProcessLock, requestProcessShutdown } = require('../infrastructure/electron/process-lock');
const { RENDERER_ENTRY_URL, registerRendererProtocol } = require('../infrastructure/electron/renderer-protocol');
const { createSafeStorageSecretProtection } = require('../infrastructure/electron/safe-storage-secret');
const { closeDesktopApplication, desktopApplicationStatus, foregroundDesktopApplication, openDesktopApplication } = require('../infrastructure/windows/desktop-application-catalog');
const { createLocalPresenceBridgeServer } = require('../remote/local-presence-bridge');
const { createWakeWordListener } = require('../infrastructure/windows/wake-word-listener');
const { createLogger } = require('../services/logger');
const { createDesktopStatusSampler } = require('./desktop-status-sampler');
const { createQuickBar } = require('../infrastructure/electron/quick-bar');
const { writeQuickPrompt } = require('./quick-prompt');

const PRESENCE_LOCK = 'system-presence.lock';
const UI_LOCK = 'desktop-ui.lock';
const AMBIENT_UI_LOCK = 'ambient-voice-ui.lock';
const CLAUDE_WINDOWS_APP_ID = 'Claude_pzs8sxrjxfjjc!Claude';
const execFileAsync = promisify(execFile);

// #region 01 — Contratto presenza

function presenceCapabilities({ platform = process.platform, shortcutRegistered = false, trayVisible = platform === 'win32' } = {}) {
  return Object.freeze({
    mode: 'system-presence',
    lightweight: true,
    ownsAiRuntime: false,
    ownsRemoteGateway: false,
    multiDisplay: true,
    opensFullUiOnDemand: true,
    tray: trayVisible,
    shortcut: shortcutRegistered ? 'CommandOrControl+Shift+Space' : null,
    visibilityShortcut: shortcutRegistered ? 'CommandOrControl+Alt+Space' : null
  });
}

async function openClaudeDesktop({
  platform = process.platform,
  spawnProcess = spawn,
  openExternal = shell.openExternal
} = {}) {
  if (platform === 'win32') {
    try {
      await new Promise((resolve, reject) => {
        const child = spawnProcess(
          'explorer.exe',
          [`shell:AppsFolder\\${CLAUDE_WINDOWS_APP_ID}`],
          { detached: true, stdio: 'ignore', windowsHide: true }
        );
        child.once('spawn', resolve);
        child.once('error', reject);
        child.unref?.();
      });
      return Object.freeze({ target: 'desktop-app' });
    } catch {}
  }
  await openExternal('https://claude.ai');
  return Object.freeze({ target: 'desktop-browser' });
}

// Claude Desktop (pacchetto Store) e Claude Code condividono il nome "claude.exe":
// chiudere per nome terminerebbe anche le sessioni di Claude Code. Si riconoscono
// quindi soltanto i processi dell'eseguibile del pacchetto, con una query fissa.
const CLAUDE_DESKTOP_PROCESS_QUERY = "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | Where-Object { $_.ExecutablePath -like '*\\WindowsApps\\Claude_*\\app\\Claude.exe' } | ForEach-Object { $_.ProcessId }";

async function claudeDesktopProcessIds({ platform = process.platform, listProcesses = execFileAsync } = {}) {
  if (platform !== 'win32') return [];
  try {
    const { stdout = '' } = await listProcesses('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', CLAUDE_DESKTOP_PROCESS_QUERY], {
      windowsHide: true, timeout: 4_000, encoding: 'utf8'
    });
    return [...new Set(String(stdout).split(/\s+/).filter((value) => /^[1-9]\d{0,9}$/.test(value)))];
  } catch { return []; }
}

async function isClaudeDesktopRunning(options = {}) {
  return (await claudeDesktopProcessIds(options)).length > 0;
}

async function closeClaudeDesktop({ platform = process.platform, listProcesses = execFileAsync, terminateProcess = execFileAsync, force = false } = {}) {
  if (platform !== 'win32') {
    throw Object.assign(new Error('Chiusura Claude disponibile solo su Windows.'), { code: 'CLAUDE_CLOSE_UNSUPPORTED' });
  }
  const ids = await claudeDesktopProcessIds({ platform, listProcesses });
  if (!ids.length) return Object.freeze({ closed: false, alreadyClosed: true });
  try {
    await terminateProcess('taskkill.exe', [...ids.flatMap((id) => ['/PID', id]), '/T', ...(force ? ['/F'] : [])], {
      windowsHide: true, timeout: 4_000, encoding: 'utf8'
    });
    return Object.freeze({ closed: true, forced: force });
  } catch (error) {
    const output = `${error?.stdout || ''}\n${error?.stderr || ''}`;
    if (/not found|non trovato|impossibile trovare|nessuna attivit|no running instance/i.test(output)) {
      return Object.freeze({ closed: false, alreadyClosed: true });
    }
    if (!force) {
      // L'app Microsoft Store può rifiutare WM_CLOSE per uno dei processi
      // sandbox. Il fallback resta confinato ai PID del pacchetto Claude e non
      // riceve argomenti liberi dal client remoto.
      return closeClaudeDesktop({ platform, listProcesses, terminateProcess, force: true });
    }
    throw Object.assign(new Error('Claude non e stato chiuso in modo verificabile.'), {
      code: 'CLAUDE_CLOSE_FAILED', cause: error
    });
  }
}

async function activateFromWakeWord({
  manager,
  createActivationTicket,
  openFullUi,
  waitForFullUi
} = {}) {
  let activationTicket = '';
  try { activationTicket = createActivationTicket?.('voice') || ''; }
  catch { return { launched: false, reason: 'ticket-unavailable' }; }
  if (!activationTicket) return { launched: false, reason: 'ticket-unavailable' };

  manager?.updateState?.('listening');
  try {
    const launch = await openFullUi?.({ activationTicket });
    if (launch?.error) {
      manager?.updateState?.('idle');
      return { launched: false, reason: 'launch-failed' };
    }
    if (await waitForFullUi?.({ ambient: true })) return { launched: true };
  } catch {}

  manager?.updateState?.('idle');
  return { launched: false, reason: 'ui-timeout' };
}

// #endregion
// #region 02 — Bootstrap minimo

async function bootstrapPresence({ env = process.env } = {}) {
  const appRoot = path.resolve(__dirname, '..', '..');
  const rendererRoot = path.join(appRoot, 'renderer-dist');
  const sharedDataRoot = path.resolve(String(env.NEXUS_SHARED_DATA_ROOT || app.getPath('userData')));
  const logger = createLogger({ scope: 'presence', filePath: path.join(sharedDataRoot, 'logs', 'presence.log') });
  const presenceLock = new ProcessLock({ filePath: path.join(sharedDataRoot, PRESENCE_LOCK) });
  if (!presenceLock.acquire()) {
    logger.info('Presenza NexusNXS gia attiva; il secondo processo termina.');
    app.quit();
    return;
  }

  let manager = null;
  let tray = null;
  const bridgeOnly = env.NEXUS_DESKTOP_BRIDGE_ONLY === '1';
  let refreshTrayMenu = () => {};
  let presenceBridge = null;
  let wakeWordListener = null;
  let stateTimer = null;
  let lockWatcher = null;
  let syncQueued = false;
  let shortcutRegistered = false;
  let quickBar = null;
  let stopping = false;
  let claudeOpen = null;
  let applications = [];
  const desktopStatus = createDesktopStatusSampler({
    initial: { claudeOpen: null, applications: [], foregroundApplicationId: '' },
    load: async () => {
      const [claudeOpen, applications, foreground] = await Promise.all([
        isClaudeDesktopRunning(), desktopApplicationStatus({ env }), foregroundDesktopApplication({ env })
      ]);
      return { claudeOpen, applications, foregroundApplicationId: foreground?.id || '' };
    },
    onUpdate: value => { claudeOpen = value.claudeOpen; applications = value.applications; },
    onError: error => logger.debug?.('Desktop status refresh unavailable.', { code: error?.code })
  });
  let backgroundActivity = 'idle';
  const uiLockPath = path.join(sharedDataRoot, UI_LOCK);
  const openFullUi = async ({ activationTicket = '' } = {}) => {
    // Una seconda istanza e intenzionale: Electron la inoltra alla UI gia
    // attiva, che puo cosi ripristinarsi e tornare in primo piano. Evitare lo
    // spawn quando il lock esisteva rendeva la Presence incapace di riaprire
    // una finestra minimizzata o nascosta.
    try { return await launchInteractiveDesktop({ appRoot, env, activationTicket }); }
    catch (error) {
      logger.warn('Richiamo della UI NexusNXS non riuscito.', { error });
      return { launched: false, error };
    }
  };
  const waitForFullUi = async ({ timeoutMs = 3_000, intervalMs = 50, ambient = false } = {}) => {
    const lockPath = path.join(sharedDataRoot, ambient ? AMBIENT_UI_LOCK : UI_LOCK);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (processLockState(lockPath).running) return true;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return processLockState(lockPath).running;
  };
  const activateFullUi = async (options = {}) => {
    const launch = await openFullUi(options);
    if (launch?.error) return launch;
    if (!await waitForFullUi()) {
      return {
        launched: false,
        error: Object.assign(new Error('Interfaccia NexusNXS non avviata in tempo.'), { code: 'PRESENCE_UI_START_TIMEOUT' })
      };
    }
    return { ...launch, launched: true };
  };
  const closeFullUi = async () => {
    const requested = requestProcessShutdown(uiLockPath);
    if (!requested) {
      manager?.setApplicationVisible?.(false);
      return { closed: true, alreadyClosed: true };
    }
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline && processLockState(uiLockPath).running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const closed = !processLockState(uiLockPath).running;
    if (closed) manager?.setApplicationVisible?.(false);
    return { closed };
  };
  const quitDesktop = async () => {
    await closeFullUi();
    app.quit();
  };
  const shutdown = async () => {
    desktopStatus.dispose();
    if (stopping) return;
    stopping = true;
    if (stateTimer) clearInterval(stateTimer);
    lockWatcher?.close?.();
    globalShortcut.unregisterAll();
    quickBar?.dispose();
    try {
      await wakeWordListener?.stop?.();
      await presenceBridge?.stop?.();
    } finally {
      manager?.dispose?.();
      tray?.destroy?.();
      presenceLock.release();
    }
  };

  installShutdownBarrier({ application: app, onShutdown: shutdown, logger, timeoutMs: 4_000 });
  presenceLock.onShutdownRequested(() => app.quit());
  app.on('window-all-closed', () => {});
  await app.whenReady();
  const bridgeSecretProtection = createSafeStorageSecretProtection(safeStorage);
  registerRendererProtocol(rendererRoot);
  configureSessionSecurity(RENDERER_ENTRY_URL);
  manager = createSystemPresenceManager({
    logger,
    openPrimaryWindow: activateFullUi,
    closePrimaryWindow: closeFullUi,
    quitApplication: quitDesktop,
    activateVoice: () => activateFromWakeWord({
      manager,
      createActivationTicket: (kind) => presenceBridge?.createActivationTicket?.(kind),
      openFullUi,
      waitForFullUi
    }),
    startHidden: bridgeOnly,
    onStatusChange: status => { if (status.nucleusVisible) ensureTray(); refreshTrayMenu(); },
    defaultSystemPresence: true
  });
  wakeWordListener = createWakeWordListener({
    logger,
    onListeningChange: (active) => manager?.setWakeWordListening?.(active),
    onWake: () => activateFromWakeWord({
      manager,
      createActivationTicket: (kind) => presenceBridge?.createActivationTicket?.(kind),
      openFullUi,
      waitForFullUi
    })
  });
  const wakeWordConfiguration = () => ({
    ...manager.getSystemPresenceConfiguration(),
    wakeWordLocale: app.getLocale?.() || 'en-US'
  });
  const initialPresence = manager.startSystemPresence?.() || { nucleusVisible: false };
  presenceBridge = createLocalPresenceBridgeServer({
    sharedDataRoot,
    logger,
    statusProvider: () => ({ ...manager.getSystemPresenceStatus(), ...desktopStatus.read() }),
    stateSynchronizer: async (snapshot) => {
      if (snapshot.activityOnly === true) {
        backgroundActivity = snapshot.state;
        if (!processLockState(uiLockPath).running) manager.updateState(backgroundActivity);
        return;
      }
      manager.setSystemPresenceConfiguration(snapshot);
      if (!bridgeOnly || processLockState(uiLockPath).running) await wakeWordListener.configure(wakeWordConfiguration());
    },
    actionExecutor: async (command) => {
      try {
      if (command.action === 'show-nucleus') {
        manager.setSystemPresenceEnabled(true);
        return;
      }
      if (command.action === 'hide-nucleus') {
        manager.setSystemPresenceEnabled(false);
        return;
      }
      if (command.action === 'select-display') {
        if (!manager.selectSystemPresenceDisplay(command.displayId)) {
          throw Object.assign(new Error('Display logico non disponibile.'), { code: 'PRESENCE_DISPLAY_UNAVAILABLE' });
        }
        return;
      }
      if (command.action === 'open-full-app') {
        const launch = await activateFullUi();
        if (launch.error) throw launch.error;
        manager.setApplicationVisible(true);
        return;
      }
      if (command.action === 'close-full-app') {
        if ((await closeFullUi()).closed) return;
        throw Object.assign(new Error('NexusNXS non si e chiusa in tempo.'), { code: 'PRESENCE_UI_STOP_TIMEOUT' });
      }
      if (command.action === 'open-claude') {
        await openClaudeDesktop();
        const deadline = Date.now() + 4_000;
        do {
          claudeOpen = await isClaudeDesktopRunning();
          if (claudeOpen) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        if (!claudeOpen) throw Object.assign(new Error('Claude non si e aperta in tempo.'), { code: 'CLAUDE_START_TIMEOUT' });
        return;
      }
      if (command.action === 'close-claude') {
        await closeClaudeDesktop();
        let deadline = Date.now() + 1_500;
        do {
          claudeOpen = await isClaudeDesktopRunning();
          if (!claudeOpen) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        // La versione Store può accettare WM_CLOSE ma mantenere un processo
        // in background. Dopo la finestra ordinata usa il fallback forzato,
        // sempre confinato ai PID dell'eseguibile del pacchetto Claude Desktop.
        if (claudeOpen) {
          await closeClaudeDesktop({ force: true });
          deadline = Date.now() + 4_000;
          do {
            claudeOpen = await isClaudeDesktopRunning();
            if (!claudeOpen) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          } while (Date.now() < deadline);
        }
        if (claudeOpen) throw Object.assign(new Error('Claude non si e chiusa in tempo.'), { code: 'CLAUDE_STOP_TIMEOUT' });
        return;
      }
      if (command.action === 'open-application') {
        await openDesktopApplication(command.applicationId, { env });
        const deadline = Date.now() + 3_000;
        do {
          applications = await desktopApplicationStatus({ env });
          if (applications.some((entry) => entry.id === command.applicationId && entry.open)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        return;
      }
      if (command.action === 'close-application') {
        await closeDesktopApplication(command.applicationId, { env });
        const deadline = Date.now() + 3_000;
        do {
          applications = await desktopApplicationStatus({ env });
          if (applications.some((entry) => entry.id === command.applicationId && !entry.open)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        return;
      }
      throw Object.assign(new Error('Azione Presence non consentita.'), { code: 'PRESENCE_ACTION_NOT_ALLOWED' });
      } finally { desktopStatus.patch({ claudeOpen, applications }); }
    },
    protectSecret: bridgeSecretProtection.protectSecret
  });
  await presenceBridge.start();
  void desktopStatus.refresh();
  if (!bridgeOnly) await wakeWordListener.configure(wakeWordConfiguration());

  const iconPath = path.join(appRoot, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const ensureTray = () => {
    if (tray || process.platform !== 'win32') return;
    const italian = /^it(?:-|$)/i.test(String(app.getLocale?.() || ''));
    tray = new Tray(iconPath);
    tray.setToolTip('NexusNXS');
    refreshTrayMenu = () => tray?.setContextMenu(Menu.buildFromTemplate([
      { label: italian ? 'Apri NexusNXS' : 'Open NexusNXS', click: activateFullUi },
      { label: italian ? 'Riduci al tray' : 'Minimize to tray', click: closeFullUi },
      { type: 'separator' },
      {
        label: italian ? 'Mostra pet' : 'Show pet',
        type: 'checkbox',
        checked: manager.getSystemPresenceStatus().nucleusVisible,
        click: (item) => { manager.setSystemPresenceEnabled?.(item.checked); refreshTrayMenu(); }
      },
      { label: italian ? 'Scegli pet' : 'Choose pet', submenu: ['orb', 'robot', 'fox'].map((pet, index) => ({
        label: (italian ? ['Orbita', 'Robot', 'Volpe'] : ['Orb', 'Robot', 'Fox'])[index],
        type: 'radio', checked: manager.getPet() === pet, click: () => { manager.selectPet(pet); refreshTrayMenu(); }
      })) },
      { type: 'separator' },
      { label: italian ? 'Esci da NexusNXS' : 'Quit NexusNXS', click: quitDesktop }
    ]));
    refreshTrayMenu();
    tray.on('right-click', refreshTrayMenu);
    tray.on('click', activateFullUi);
  };
  if (!bridgeOnly) ensureTray();
  // Barra rapida sopra qualsiasi programma: la domanda passa alla UI con un file monouso e la UI la invia.
  quickBar = createQuickBar({
    logger,
    onSubmit: async (text, { image = null } = {}) => {
      if (!writeQuickPrompt(sharedDataRoot, text, { image })) return;
      await activateFullUi();
    }
  });
  const openShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+Space', () => quickBar.toggle());
  const visibilityShortcutRegistered = globalShortcut.register('CommandOrControl+Alt+Space', () => {
    const visible = manager.getSystemPresenceStatus().nucleusVisible;
    manager.setSystemPresenceEnabled(!visible);
  });
  shortcutRegistered = openShortcutRegistered && visibilityShortcutRegistered;

  let uiWasRunning = false;
  const syncVisibility = () => {
    const state = processLockState(uiLockPath);
    if (uiWasRunning && !state.running) manager.updateState?.(backgroundActivity);
    uiWasRunning = state.running;
    if (state.running) ensureTray();
    manager.setApplicationVisible?.(state.running);
  };
  syncVisibility();
  // fs.watch rende il passaggio UI/Presence immediato senza un polling
  // aggressivo permanente. Il timer lento e solo un fallback per filesystem
  // o driver che possono perdere una notifica.
  const queueVisibilitySync = () => {
    if (syncQueued || stopping) return;
    syncQueued = true;
    setImmediate(() => {
      syncQueued = false;
      if (!stopping) syncVisibility();
    });
  };
  try {
    lockWatcher = fs.watch(sharedDataRoot, { persistent: false }, (_event, fileName) => {
      if (String(fileName || '').toLowerCase() === UI_LOCK.toLowerCase()) queueVisibilitySync();
    });
  } catch (error) {
    logger.debug?.('Watch lock UI non disponibile; resta attivo il controllo periodico.', { code: error?.code });
  }
  stateTimer = setInterval(syncVisibility, 5_000);
  stateTimer.unref?.();
  logger.info('Presenza NexusNXS avviata.', presenceCapabilities({ shortcutRegistered, trayVisible: Boolean(tray) }));
}

module.exports = {
  CLAUDE_WINDOWS_APP_ID,
  CLAUDE_DESKTOP_PROCESS_QUERY,
  AMBIENT_UI_LOCK,
  PRESENCE_LOCK,
  UI_LOCK,
  activateFromWakeWord,
  bootstrapPresence,
  isClaudeDesktopRunning,
  openClaudeDesktop,
  closeClaudeDesktop,
  presenceCapabilities,
};

// #endregion
