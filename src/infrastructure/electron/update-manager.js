/**
 * @module infrastructure/electron/update-manager
 * @description Aggiornamenti firmati, silenziosi e confinati al processo principale.
 */
const { app, ipcMain, net } = require('electron');
const { createUpdateHealth, isCrashExit } = require('./update-health');
const { NsisUpdater } = require('electron-updater');
const { Provider } = require('electron-updater/out/providers/Provider');
const { CHANNELS } = require('../../application/ipc-contracts');
const { verifyRemoteReleaseFeed } = require('../../security/release-integrity');
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

// electron-updater's supported custom-provider interface lets each check own
// one verified snapshot. GenericProvider would fetch mutable <channel>.yml
// again, losing the Ed25519 binding established for latest.yml.
class VerifiedReleaseProvider extends Provider {
  constructor(configuration, _updater, runtimeOptions) {
    super(runtimeOptions);
    this.feed = configuration.verifiedFeed ? JSON.parse(JSON.stringify(configuration.verifiedFeed)) : null;
  }

  async getLatestVersion() {
    if (!this.feed) throw new Error('Distinta aggiornamenti non ancora verificata.');
    return JSON.parse(JSON.stringify(this.feed.updateInfo));
  }

  resolveFiles(info) {
    if (!this.feed || info.version !== this.feed.updateInfo.version) throw new Error('Versione aggiornamento non autorizzata.');
    return [{ url: new URL(this.feed.installerUrl), info: { ...this.feed.updateInfo.files[0] } }];
  }
}

/** Pausa tra lo stato "installing" e la chiusura: lascia vedere l'animazione di riavvio. */
const INSTALL_DELAY_MS = 1400;

function createUpdateManager({ updateUrl, channel = 'stable', manifestPublicKey = '', manifestKeyId = '', rolloutSeed = '', trustedRendererUrl, logger, healthStatePath = '' }) {
  channel = ['preview', 'beta', 'stable'].includes(channel) ? channel : 'stable';
  let updater = null;
  let health = null;
  let initialTimer = null;
  let recurringTimer = null;
  let state = { status: 'disabled', version: app.getVersion(), currentVersion: app.getVersion(), progress: 0, channel, lastCheckedAt: 0 };
  let installWhenReady = false;
  let installing = false;
  let windowProvider = () => null;
  const publish = () => {
    const window = windowProvider();
    if (window && !window.isDestroyed()) window.webContents.send(CHANNELS.updateEvent, state);
  };
  const setState = (next) => { state = { ...state, ...next }; publish(); };
  const busy = () => ['downloading', 'ready', 'installing'].includes(state.status);
  const assertTrusted = (event) => {
    if (!event?.sender || event.sender.getURL() !== trustedRendererUrl) throw new Error('Renderer non autorizzato.');
  };

  ipcMain.handle(CHANNELS.updateStatus, (event) => { assertTrusted(event); return state; });
  ipcMain.handle(CHANNELS.updateCheck, async (event) => {
    assertTrusted(event);
    if (!updater) return state;
    // Controllo chiesto dall'utente: salta la coorte del rollout graduale, mai la pausa o il blocco di salute.
    await checkTrustedUpdates({ seeker: true });
    return state;
  });
  // Riavvio con installazione silenziosa e rilancio automatico: la UI mostra
  // prima lo stato "installing" per un istante, poi l'app si chiude da sola.
  const installNow = () => {
    if (!updater || installing) return false;
    installing = true;
    setState({ status: 'installing', progress: 100 });
    const timer = setTimeout(() => {
      try { updater.quitAndInstall(true, true); } catch (error) {
        installing = false;
        logger.warn('Installazione aggiornamento non avviata.', { error });
        setState({ status: 'error', phase: 'install', progress: 0 });
      }
    }, INSTALL_DELAY_MS);
    timer.unref?.();
    return true;
  };
  ipcMain.handle(CHANNELS.updateInstall, (event) => {
    assertTrusted(event);
    if (!updater || state.status !== 'ready') return false;
    return installNow();
  });
  // "Aggiorna": scarica la versione verificata e, appena pronta, riavvia l'app.
  ipcMain.handle(CHANNELS.updateDownload, async (event) => {
    assertTrusted(event);
    if (!updater) return state;
    if (state.status === 'ready') { installNow(); return state; }
    if (state.status === 'downloading' || state.status === 'installing') { installWhenReady = true; return state; }
    if (!['available', 'error'].includes(state.status) || !state.version || state.version === app.getVersion()) return state;
    installWhenReady = true;
    setState({ status: 'downloading', phase: 'download', progress: 0, transferred: 0, total: state.total || 0, bytesPerSecond: 0 });
    updater.downloadUpdate().catch((error) => {
      installWhenReady = false;
      logger.warn('Download aggiornamento non riuscito.', { error });
      setState({ status: 'error', phase: 'download', progress: 0 });
    });
    return state;
  });

  if (!app.isPackaged || !updateUrl || process.env.NEXUS_DISABLE_UPDATES === '1') {
    return { start() {}, stop() {}, setWindowProvider(provider) { windowProvider = provider; }, status: () => state };
  }
  if (!manifestPublicKey || !manifestKeyId) {
    logger.warn('Aggiornamenti disattivati: identità della distinta firmata non configurata.');
    return { start() {}, stop() {}, setWindowProvider(provider) { windowProvider = provider; }, status: () => state };
  }
  const checkTrustedUpdates = async ({ seeker = false } = {}) => {
    // Un download o un riavvio già avviati non vengono interrotti dal controllo periodico.
    if (busy()) return null;
    // Con un aggiornamento già proposto la scheda resta visibile durante il ricontrollo.
    if (state.status !== 'available') setState({ status: 'checking', progress: 0, lastCheckedAt: Date.now() });
    const verifiedFeed = await verifyRemoteReleaseFeed({
      updateUrl: cleanUpdateUrl(updateUrl), publicKey: manifestPublicKey,
      keyId: manifestKeyId, channel
    });
    const rollout = evaluateUpdateRollout(verifiedFeed.manifest, { rolloutSeed, seeker });
    if (!rollout.eligible) {
      setState({
        status: rollout.reason === 'paused' ? 'paused' : 'deferred',
        progress: 0,
        rollout: { reason: rollout.reason, percentage: rollout.percentage }
      });
      return null;
    }
    setState({ rollout: { reason: rollout.reason, percentage: rollout.percentage } });
    updater.setFeedURL({ provider: 'custom', updateProvider: VerifiedReleaseProvider, verifiedFeed });
    return updater.checkForUpdates();
  };
  try {
    cleanUpdateUrl(updateUrl);
    updater = new NsisUpdater({ provider: 'custom', updateProvider: VerifiedReleaseProvider });
    updater.disableWebInstaller = true;
    // Il download parte solo quando l'utente sceglie "Aggiorna" (updateDownload).
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = channel !== 'stable';
    updater.logger = logger;
    updater.on('checking-for-update', () => { if (!busy() && state.status !== 'available') setState({ status: 'checking', progress: 0, lastCheckedAt: Date.now() }); });
    updater.on('update-not-available', () => { if (!busy()) setState({ status: 'current', progress: 0, lastCheckedAt: Date.now() }); });
    updater.on('update-available', (info) => {
      if (busy()) return;
      const size = Number(info?.files?.[0]?.size) || 0;
      setState({ status: 'available', phase: '', progress: 0, total: size, lastCheckedAt: Date.now(), ...publicUpdateInfo(info) });
    });
    updater.on('download-progress', (progress) => setState({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      transferred: Math.max(0, Number(progress.transferred) || 0),
      total: Math.max(0, Number(progress.total) || state.total || 0),
      bytesPerSecond: Math.max(0, Number(progress.bytesPerSecond) || 0)
    }));
    updater.on('update-downloaded', (info) => {
      setState({ status: 'ready', progress: 100, downloadedAt: Date.now(), ...publicUpdateInfo(info) });
      if (installWhenReady) installNow();
    });
    updater.on('error', (error) => {
      logger.warn('Controllo aggiornamenti non riuscito; NexusNXS continuerà con la versione installata.', { error });
      // Un ricontrollo fallito non nasconde un aggiornamento già proposto o scaricato.
      if (installing || state.status === 'ready' || state.status === 'available') return;
      const phase = state.status === 'downloading' ? 'download' : 'check';
      installWhenReady = false;
      setState({ status: 'error', phase, progress: 0, lastCheckedAt: Date.now() });
    });
    state.status = 'current';
    health = createUpdateHealth({
      statePath: healthStatePath,
      version: app.getVersion(),
      channel,
      endpoint: `${cleanUpdateUrl(updateUrl)}/health`,
      enabled: process.env.NEXUS_DISABLE_UPDATE_HEALTH !== '1',
      logger,
      send: (url, body) => net.fetch(url, {
        method: 'POST', body, redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000)
      })
    });
  } catch (error) {
    logger.warn('Origine aggiornamenti non valida; aggiornamenti automatici disattivati.', { error });
  }
  return {
    setWindowProvider(provider) { windowProvider = provider; },
    status: () => state,
    /** Uscita anomala di un processo dell'app (renderer, GPU): segnale di crash per la versione attuale. */
    reportProcessGone(details) { if (isCrashExit(details)) health?.crash(); },
    start() {
      if (initialTimer || recurringTimer) return;
      health?.start();
      initialTimer = setTimeout(() => checkTrustedUpdates().catch((error) => {
        logger.warn('Verifica della distinta aggiornamento non riuscita.', { error });
        setState({ status: 'error', progress: 0, lastCheckedAt: Date.now() });
      }), 12_000);
      initialTimer.unref?.();
      recurringTimer = setInterval(() => checkTrustedUpdates().catch((error) => {
        logger.warn('Verifica periodica della distinta aggiornamento non riuscita.', { error });
        setState({ status: 'error', progress: 0, lastCheckedAt: Date.now() });
      }), 30 * 60 * 1000); // ogni 30 minuti: una nuova versione arriva in giornata, scaricata in background
      recurringTimer.unref?.();
    },
    stop() {
      health?.stop();
      clearTimeout(initialTimer);
      clearInterval(recurringTimer);
      initialTimer = null;
      recurringTimer = null;
    }
  };
}

module.exports = { cleanUpdateUrl, createUpdateManager, publicUpdateInfo, VerifiedReleaseProvider };

// #endregion
