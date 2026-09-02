/**
 * @module infrastructure/electron/app-lifecycle
 * @description Adapter infrastrutturale Electron isolato dalla logica applicativa.
 */
const { app, BrowserWindow, Menu, session } = require('electron');

// #region 01 — Sicurezza della sessione

function shouldBlockRendererRequest(value) {
  try {
    const raw = String(value || '');
    const url = new URL(raw);
    if (url.protocol === 'nexus:') return url.hostname !== 'app' || Boolean(url.username || url.password);
    if (url.protocol === 'blob:') return !raw.startsWith('blob:nexus://app/');
    return url.protocol !== 'data:';
  } catch {
    return true;
  }
}

function isAudioOnlyMediaRequest(details = {}) {
  if (Array.isArray(details.mediaTypes)) {
    return details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video');
  }
  return details.mediaType === 'audio';
}

function shouldQuitAfterAllWindowsClosed(platform, keepAlive) {
  return platform !== 'darwin' && keepAlive !== true;
}

function shouldKeepApplicationAlive({ headless = false } = {}) {
  return headless === true;
}

function installShutdownBarrier({ application = app, onShutdown = async () => {}, logger, timeoutMs = 10_000 } = {}) {
  let state = 'idle';
  let shutdownPromise = null;
  const beginShutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    state = 'running';
    shutdownPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger?.warn?.('Arresto NexusNXS oltre il tempo previsto; chiusura forzata del processo Electron.', { timeoutMs });
        resolve({ timedOut: true });
      }, timeoutMs);
      Promise.resolve()
        .then(onShutdown)
        .then(() => resolve({ timedOut: false }))
        .catch((error) => {
          logger?.warn?.('Arresto NexusNXS completato con errori.', { error });
          resolve({ timedOut: false, error });
        })
        .finally(() => clearTimeout(timeout));
    }).finally(() => {
      state = 'finished';
      application.quit();
    });
    return shutdownPromise;
  };
  application.on('before-quit', (event) => {
    if (state === 'finished') return;
    event.preventDefault();
    void beginShutdown();
  });
  return { beginShutdown, get state() { return state; } };
}

function configureSessionSecurity(trustedRendererUrl) {
  Menu.setApplicationMenu(null);
  const isTrusted = (webContents) => Boolean(trustedRendererUrl && webContents && webContents.getURL() === trustedRendererUrl);
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details = {}) => {
    const audioOnly = isAudioOnlyMediaRequest(details);
    return permission === 'media' && audioOnly && isTrusted(webContents);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const audioOnly = permission === 'media' && isAudioOnlyMediaRequest(details);
    callback(Boolean(audioOnly && isTrusted(webContents)));
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // Il renderer non comunica direttamente con Ollama né con Internet:
    // qualsiasi trasporto AI attraversa IPC validato nel main process.
    // Bloccare anche localhost impedisce a un renderer compromesso di
    // interrogare servizi locali estranei all'applicazione.
    callback({ cancel: shouldBlockRendererRequest(details.url) });
  });
}

// #endregion

// #region 02 — Lifecycle della finestra

function startAppLifecycle({
  createWindow,
  onReady,
  onShutdown,
  onExternalActivation = () => {},
  initialCommandLine = process.argv,
  logger,
  trustedRendererUrl,
  singleInstance = true,
  shouldKeepAlive = () => false,
  headless = false,
  shutdownTimeoutMs = 10_000
}) {
  let primaryWindow = null;
  installShutdownBarrier({ application: app, onShutdown, logger, timeoutMs: shutdownTimeoutMs });
  const showPrimaryWindow = () => {
    if (primaryWindow && !primaryWindow.isDestroyed()) return primaryWindow;
    primaryWindow = createWindow();
    primaryWindow.once('closed', () => { primaryWindow = null; });
    return primaryWindow;
  };
  if (singleInstance && !app.requestSingleInstanceLock()) {
    app.quit();
    return Promise.resolve();
  }
  // Finestre native temporanee possono essere usate durante il bootstrap
  // (consenso modelli, errori setup). La loro chiusura non deve terminare
  // Electron prima che esista la finestra applicativa principale.
  app.on('window-all-closed', () => {
    primaryWindow = null;
    if (shouldQuitAfterAllWindowsClosed(process.platform, shouldKeepAlive())) app.quit();
  });
  if (singleInstance && !headless) app.on('second-instance', (_event, commandLine) => {
    const window = showPrimaryWindow();
    if (!window) return;
    const handledWithoutWindow = onExternalActivation({
      window,
      commandLine: Array.isArray(commandLine) ? commandLine : [],
      initial: false
    }) === true;
    if (handledWithoutWindow) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return app.whenReady().then(async () => {
    if (!headless) configureSessionSecurity(trustedRendererUrl);
    // Il composition root può mostrare la shell non appena gli IPC minimi sono
    // registrati, continuando poi inizializzazioni non essenziali. Il fallback
    // conserva la compatibilità con callback onReady che non usano l'hook.
    await onReady({ showPrimaryWindow });
    if (!headless) {
      const window = showPrimaryWindow();
      onExternalActivation({ window, commandLine: Array.isArray(initialCommandLine) ? initialCommandLine : [], initial: true });
    }
    app.on('activate', () => {
      if (!headless) showPrimaryWindow();
    });
  }).catch((error) => {
    logger.error('Lifecycle Electron fallito.', { error });
    throw error;
  });
}

module.exports = { configureSessionSecurity, installShutdownBarrier, isAudioOnlyMediaRequest, shouldBlockRendererRequest, shouldKeepApplicationAlive, shouldQuitAfterAllWindowsClosed, startAppLifecycle };

// #endregion
