/**
 * @module infrastructure/electron/update-manager
 * @description Aggiornamenti firmati, silenziosi e confinati al processo principale.
 */
const { app, ipcMain } = require('electron');
const { NsisUpdater } = require('electron-updater');
const { CHANNELS } = require('../../application/ipc-contracts');
const { verifyRemoteReleaseManifest } = require('../../security/release-integrity');
const { evaluateUpdateRollout } = require('./update-rollout');

// #region 01 — Validazione e stato

function cleanUpdateUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('L’origine aggiornamenti deve essere HTTPS e senza credenziali incorporate.');
  }
  return url.toString().replace(/\/$/, '');
}

function publicUpdateInfo(info = {}) {
  const rawNotes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((item) => item?.note || '').join('\n')
    : String(info.releaseNotes || '');
  return {
    version: String(info.version || ''),
    releaseName: typeof info.releaseName === 'string' ? info.releaseName.slice(0, 120) : '',
    releaseNotes: rawNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)
  };
}

// #endregion

// #region 02 — Lifecycle updater

function createUpdateManager({ updateUrl, channel = 'stable', manifestPublicKey = '', manifestKeyId = '', rolloutSeed = '', trustedRendererUrl, logger }) {
  channel = ['preview', 'beta', 'stable'].includes(channel) ? channel : 'stable';
  let updater = null;
  let initialTimer = null;
  let recurringTimer = null;
  let state = { status: 'disabled', version: app.getVersion(), progress: 0, channel, lastCheckedAt: 0 };
  let windowProvider = () => null;
  const publish = () => {
    const window = windowProvider();
    if (window && !window.isDestroyed()) window.webContents.send(CHANNELS.updateEvent, state);
  };
  const setState = (next) => { state = { ...state, ...next }; publish(); };
  const assertTrusted = (event) => {
    if (!event?.sender || event.sender.getURL() !== trustedRendererUrl) throw new Error('Renderer non autorizzato.');
  };

  ipcMain.handle(CHANNELS.updateStatus, (event) => { assertTrusted(event); return state; });
  ipcMain.handle(CHANNELS.updateCheck, async (event) => {
    assertTrusted(event);
    if (!updater) return state;
    await checkTrustedUpdates();
    return state;
  });
  ipcMain.handle(CHANNELS.updateInstall, (event) => {
    assertTrusted(event);
    if (!updater || state.status !== 'ready') return false;
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  });

  if (!app.isPackaged || !updateUrl || process.env.NEXUS_DISABLE_UPDATES === '1') {
    return { start() {}, stop() {}, setWindowProvider(provider) { windowProvider = provider; }, status: () => state };
  }
  if (!manifestPublicKey || !manifestKeyId) {
    logger.warn('Aggiornamenti disattivati: identità della distinta firmata non configurata.');
    return { start() {}, stop() {}, setWindowProvider(provider) { windowProvider = provider; }, status: () => state };
  }
  const checkTrustedUpdates = async () => {
    setState({ status: 'checking', progress: 0, lastCheckedAt: Date.now() });
    const manifest = await verifyRemoteReleaseManifest({
      updateUrl: cleanUpdateUrl(updateUrl), publicKey: manifestPublicKey,
      keyId: manifestKeyId, channel
    });
    const rollout = evaluateUpdateRollout(manifest, { rolloutSeed });
    if (!rollout.eligible) {
      setState({
        status: rollout.reason === 'paused' ? 'paused' : 'deferred',
        progress: 0,
        rollout: { reason: rollout.reason, percentage: rollout.percentage }
      });
      return null;
    }
    setState({ rollout: { reason: rollout.reason, percentage: rollout.percentage } });
    return updater.checkForUpdates();
  };
  try {
    updater = new NsisUpdater({ provider: 'generic', url: cleanUpdateUrl(updateUrl), channel });
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = channel !== 'stable';
    updater.logger = logger;
    updater.on('checking-for-update', () => setState({ status: 'checking', progress: 0, lastCheckedAt: Date.now() }));
    updater.on('update-not-available', () => setState({ status: 'current', progress: 0, lastCheckedAt: Date.now() }));
    updater.on('update-available', (info) => setState({ status: 'downloading', progress: 0, ...publicUpdateInfo(info) }));
    updater.on('download-progress', (progress) => setState({ status: 'downloading', progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) }));
    updater.on('update-downloaded', (info) => setState({ status: 'ready', progress: 100, downloadedAt: Date.now(), ...publicUpdateInfo(info) }));
    updater.on('error', (error) => {
      logger.warn('Controllo aggiornamenti non riuscito; NexusNXS continuerà con la versione installata.', { error });
      setState({ status: 'error', progress: 0, lastCheckedAt: Date.now() });
    });
    state.status = 'current';
  } catch (error) {
    logger.warn('Origine aggiornamenti non valida; aggiornamenti automatici disattivati.', { error });
  }
  return {
    setWindowProvider(provider) { windowProvider = provider; },
    status: () => state,
    start() {
      if (initialTimer || recurringTimer) return;
      initialTimer = setTimeout(() => checkTrustedUpdates().catch((error) => {
        logger.warn('Verifica della distinta aggiornamento non riuscita.', { error });
        setState({ status: 'error', progress: 0, lastCheckedAt: Date.now() });
      }), 12_000);
      initialTimer.unref?.();
      recurringTimer = setInterval(() => checkTrustedUpdates().catch((error) => {
        logger.warn('Verifica periodica della distinta aggiornamento non riuscita.', { error });
        setState({ status: 'error', progress: 0, lastCheckedAt: Date.now() });
      }), 6 * 60 * 60 * 1000);
      recurringTimer.unref?.();
    },
    stop() {
      clearTimeout(initialTimer);
      clearInterval(recurringTimer);
      initialTimer = null;
      recurringTimer = null;
    }
  };
}

module.exports = { cleanUpdateUrl, createUpdateManager, publicUpdateInfo };

// #endregion
