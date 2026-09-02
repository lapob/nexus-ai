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

const PRESENCE_LOCK = 'system-presence.lock';
const UI_LOCK = 'desktop-ui.lock';
const AMBIENT_UI_LOCK = 'ambient-voice-ui.lock';
const CHATGPT_WINDOWS_APP_ID = 'OpenAI.Codex_2p2nqsd0c76g0!App';
const execFileAsync = promisify(execFile);

// #region 01 — Contratto presenza

function presenceCapabilities({ platform = process.platform, shortcutRegistered = false } = {}) {
  return Object.freeze({
    mode: 'system-presence',
    lightweight: true,
    ownsAiRuntime: false,
    ownsRemoteGateway: false,
    multiDisplay: true,
    opensFullUiOnDemand: true,
    tray: platform === 'win32',
    shortcut: shortcutRegistered ? 'CommandOrControl+Shift+Space' : null
  });
}

async function openChatGptDesktop({
  platform = process.platform,
  spawnProcess = spawn,
  openExternal = shell.openExternal
} = {}) {
  if (platform === 'win32') {
    try {
      await new Promise((resolve, reject) => {
        const child = spawnProcess(
          'explorer.exe',
          [`shell:AppsFolder\\${CHATGPT_WINDOWS_APP_ID}`],
          { detached: true, stdio: 'ignore', windowsHide: true }
        );
        child.once('spawn', resolve);
        child.once('error', reject);
        child.unref?.();
      });
      return Object.freeze({ target: 'desktop-app' });
    } catch {}
  }
  await openExternal('https://chatgpt.com');
  return Object.freeze({ target: 'desktop-browser' });
}

async function isChatGptDesktopRunning({ platform = process.platform, listProcesses = execFileAsync } = {}) {
  if (platform !== 'win32') return false;
  try {
    const { stdout = '' } = await listProcesses('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq ChatGPT.exe'], {
      windowsHide: true, timeout: 1_500, encoding: 'utf8'
    });
    return /"ChatGPT\.exe"/i.test(String(stdout));
  } catch { return false; }
}

async function closeChatGptDesktop({ platform = process.platform, terminateProcess = execFileAsync, force = false } = {}) {
  if (platform !== 'win32') {
    throw Object.assign(new Error('Chiusura ChatGPT disponibile solo su Windows.'), { code: 'CHATGPT_CLOSE_UNSUPPORTED' });
  }
  try {
    await terminateProcess('taskkill.exe', ['/IM', 'ChatGPT.exe', '/T', ...(force ? ['/F'] : [])], {
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
      // sandbox. Il fallback resta confinato al nome statico e non riceve
      // argomenti liberi dal client remoto.
      return closeChatGptDesktop({ platform, terminateProcess, force: true });
    }
    throw Object.assign(new Error('ChatGPT non e stato chiuso in modo verificabile.'), {
      code: 'CHATGPT_CLOSE_FAILED', cause: error
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
  let presenceBridge = null;
  let wakeWordListener = null;
  let stateTimer = null;
  let lockWatcher = null;
  let syncQueued = false;
  let shortcutRegistered = false;
  let stopping = false;
  let chatGptOpen = false;
  let chatGptCheckedAt = 0;
  let applications = [];
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
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (stateTimer) clearInterval(stateTimer);
    lockWatcher?.close?.();
    globalShortcut.unregisterAll();
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
    statusProvider: async () => {
      if (Date.now() - chatGptCheckedAt > 1_500) {
        [chatGptOpen, applications] = await Promise.all([
          isChatGptDesktopRunning(),
          desktopApplicationStatus({ env })
        ]);
        chatGptCheckedAt = Date.now();
      }
      const foregroundApplication = await foregroundDesktopApplication({ env });
      return { ...manager.getSystemPresenceStatus(), chatGptOpen, applications, foregroundApplicationId: foregroundApplication?.id || '' };
    },
    stateSynchronizer: async (snapshot) => {
      manager.setSystemPresenceConfiguration(snapshot);
      await wakeWordListener.configure(wakeWordConfiguration());
    },
    actionExecutor: async (command) => {
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
        const requested = requestProcessShutdown(uiLockPath);
        if (!requested) return;
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline && processLockState(uiLockPath).running) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!processLockState(uiLockPath).running) {
          manager.setApplicationVisible(false);
          return;
        }
        throw Object.assign(new Error('NexusNXS non si e chiusa in tempo.'), { code: 'PRESENCE_UI_STOP_TIMEOUT' });
      }
      if (command.action === 'open-chatgpt') {
        await openChatGptDesktop();
        const deadline = Date.now() + 4_000;
        do {
          chatGptOpen = await isChatGptDesktopRunning();
          if (chatGptOpen) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        if (!chatGptOpen) throw Object.assign(new Error('ChatGPT non si e aperta in tempo.'), { code: 'CHATGPT_START_TIMEOUT' });
        chatGptCheckedAt = Date.now();
        return;
      }
      if (command.action === 'close-chatgpt') {
        await closeChatGptDesktop();
        let deadline = Date.now() + 1_500;
        do {
          chatGptOpen = await isChatGptDesktopRunning();
          if (!chatGptOpen) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        // La versione Store può accettare WM_CLOSE ma mantenere un processo
        // in background. Dopo la finestra ordinata usa il fallback forzato,
        // sempre confinato al nome statico ChatGPT.exe già autorizzato.
        if (chatGptOpen) {
          await closeChatGptDesktop({ force: true });
          deadline = Date.now() + 4_000;
          do {
            chatGptOpen = await isChatGptDesktopRunning();
            if (!chatGptOpen) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          } while (Date.now() < deadline);
        }
        if (chatGptOpen) throw Object.assign(new Error('ChatGPT non si e chiusa in tempo.'), { code: 'CHATGPT_STOP_TIMEOUT' });
        chatGptCheckedAt = Date.now();
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
        chatGptCheckedAt = Date.now();
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
        chatGptCheckedAt = Date.now();
        return;
      }
      throw Object.assign(new Error('Azione Presence non consentita.'), { code: 'PRESENCE_ACTION_NOT_ALLOWED' });
    },
    protectSecret: bridgeSecretProtection.protectSecret
  });
  await presenceBridge.start();
  await wakeWordListener.configure(wakeWordConfiguration());

  const iconPath = path.join(appRoot, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  if (process.platform === 'win32') {
    const italian = /^it(?:-|$)/i.test(String(app.getLocale?.() || ''));
    tray = new Tray(iconPath);
    tray.setToolTip('NexusNXS');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: italian ? 'Apri NexusNXS' : 'Open NexusNXS', click: activateFullUi },
      { type: 'separator' },
      {
        label: italian ? 'Presenza di sistema' : 'System presence',
        type: 'checkbox',
        checked: initialPresence.nucleusVisible,
        click: (item) => manager.setSystemPresenceEnabled?.(item.checked)
      },
      { label: italian ? 'Termina presenza' : 'Quit presence', click: () => app.quit() }
    ]));
    tray.on('click', activateFullUi);
  }
  shortcutRegistered = globalShortcut.register('CommandOrControl+Shift+Space', activateFullUi);

  let uiWasRunning = false;
  const syncVisibility = () => {
    const state = processLockState(uiLockPath);
    if (uiWasRunning && !state.running) manager.updateState?.('idle');
    uiWasRunning = state.running;
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
  logger.info('Presenza NexusNXS avviata.', presenceCapabilities({ shortcutRegistered }));
}

module.exports = {
  CHATGPT_WINDOWS_APP_ID,
  AMBIENT_UI_LOCK,
  PRESENCE_LOCK,
  UI_LOCK,
  activateFromWakeWord,
  bootstrapPresence,
  isChatGptDesktopRunning,
  openChatGptDesktop,
  closeChatGptDesktop,
  presenceCapabilities,
};

// #endregion
