/**
 * @module infrastructure/electron/update-manager
 * @description Aggiornamenti firmati, silenziosi e confinati al processo principale.
 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, ipcMain, net } = require('electron');
const { createUpdateHealth, isCrashExit } = require('./update-health');
const { createUpdateRollback } = require('./update-rollback');
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
/** Primo controllo dopo l'avvio e cadenza dei controlli in background. */
const INITIAL_CHECK_MS = 12_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Copia di sé che ogni installer NSIS di electron-builder lascia in %LOCALAPPDATA%\<nome>-updater. */
function defaultInstallerCopyPath() {
  const local = process.env.LOCALAPPDATA || path.join(app.getPath?.('appData') || '', '..', 'Local');
  return path.join(local, 'nexusnxs-updater', 'installer.exe');
}

/** Reinstallazione silenziosa del punto di ripristino, staccata dal processo che sta per chiudersi. */
function launchRestoreInstaller(file) {
  spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function createUpdateManager({
  updateUrl, channel = 'stable', manifestPublicKey = '', manifestKeyId = '', rolloutSeed = '', trustedRendererUrl, logger, healthStatePath = '',
  bootGuard = true, autoDownload = true, installerCopyPath = '', restoreDir = '', rollbackStatePath = '',
  launchInstaller = launchRestoreInstaller, quit = () => (app.isReady?.() ? app.quit() : app.exit(0)),
  initialCheckMs = INITIAL_CHECK_MS, checkIntervalMs = CHECK_INTERVAL_MS
}) {
  channel = ['preview', 'beta', 'stable'].includes(channel) ? channel : 'stable';
  let updater = null;
  let health = null;
  let rollback = null;
  let initialTimer = null;
  let recurringTimer = null;
  let state = { status: 'disabled', version: app.getVersion(), currentVersion: app.getVersion(), progress: 0, channel, lastCheckedAt: 0, automatic: false };
  let installWhenReady = false;
  let installing = false;
  // Il controllo in corso è automatico (timer) o chiesto dall'utente: solo quello automatico scarica da solo.
  let automaticCheck = false;
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
    startDownload({ automatic: false });
    return state;
  });
  // Download verificato: electron-updater confronta SHA-512 e dimensione con i dati della distinta firmata.
  // In background un errore resta discreto (phase "background") e si riprova al controllo successivo.
  const startDownload = ({ automatic }) => {
    const phase = automatic ? 'background' : 'download';
    setState({ status: 'downloading', phase, automatic, progress: 0, transferred: 0, total: state.total || 0, bytesPerSecond: 0 });
    updater.downloadUpdate().catch((error) => {
      installWhenReady = false;
      logger.warn(automatic ? 'Download in background dell’aggiornamento non riuscito; nuovo tentativo al prossimo controllo.' : 'Download aggiornamento non riuscito.', { error });
      setState({ status: 'error', phase, progress: 0 });
    });
  };

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
    automaticCheck = !seeker;
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
    // Una versione già ripristinata per crash all'avvio non torna: si attende la successiva firmata.
    if (rollback?.isBlocked(verifiedFeed.manifest.version)) {
      setState({ status: 'current', progress: 0, blockedVersion: verifiedFeed.manifest.version, lastCheckedAt: Date.now() });
      return null;
    }
    setState({ rollout: { reason: rollout.reason, percentage: rollout.percentage } });
    updater.setFeedURL({ provider: 'custom', updateProvider: VerifiedReleaseProvider, verifiedFeed });
    return updater.checkForUpdates();
  };
  // Rollback: prima di qualsiasi altra cosa, un avvio fallito della versione in prova riporta a quella sana.
  rollback = createUpdateRollback({
    statePath: rollbackStatePath || (healthStatePath ? path.join(path.dirname(healthStatePath), 'rollback.json') : ''),
    restoreDir: restoreDir || path.join(path.dirname(installerCopyPath || defaultInstallerCopyPath()), 'rollback'),
    installerCopyPath: installerCopyPath || defaultInstallerCopyPath(),
    version: app.getVersion(), launchInstaller, quit, logger
  });
  if (bootGuard && rollback.boot().action === 'rollback') {
    state = { ...state, status: 'rolling-back' };
    return { start() {}, stop() {}, setWindowProvider(provider) { windowProvider = provider; }, status: () => state, reportProcessGone() {} };
  }
  try {
    cleanUpdateUrl(updateUrl);
    updater = new NsisUpdater({ provider: 'custom', updateProvider: VerifiedReleaseProvider });
    updater.disableWebInstaller = true;
    // electron-updater non scarica da solo: il download automatico parte qui, solo dopo la verifica della
    // distinta firmata e della policy di rollout, così ogni byte resta legato alla firma Ed25519.
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
      const automatic = autoDownload && automaticCheck;
      setState({ status: 'available', phase: '', automatic, progress: 0, total: size, lastCheckedAt: Date.now(), ...publicUpdateInfo(info) });
      // Controllo in background: scarica e verifica subito, poi avvisa con discrezione quando è pronto.
      if (automatic) startDownload({ automatic: true });
    });
    updater.on('download-progress', (progress) => setState({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      transferred: Math.max(0, Number(progress.transferred) || 0),
      total: Math.max(0, Number(progress.total) || state.total || 0),
      bytesPerSecond: Math.max(0, Number(progress.bytesPerSecond) || 0)
    }));
    updater.on('update-downloaded', (info) => {
      // Dal primo avvio la nuova versione è in prova: un crash all'avvio la ripristina da sola.
      rollback.arm(String(info?.version || ''));
      setState({ status: 'ready', progress: 100, downloadedAt: Date.now(), ...publicUpdateInfo(info) });
      if (installWhenReady) installNow();
    });
    updater.on('error', (error) => {
      logger.warn('Controllo aggiornamenti non riuscito; NexusNXS continuerà con la versione installata.', { error });
      // Un ricontrollo fallito non nasconde un aggiornamento già proposto o scaricato.
      if (installing || state.status === 'ready' || state.status === 'available') return;
      const phase = state.status === 'downloading' ? (state.phase === 'background' ? 'background' : 'download') : 'check';
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
      // Versione sana: chiude la prova e conserva l'installer verificato come punto di ripristino.
      onEvent: (event) => { if (event === 'healthy') void rollback.confirmHealthy(); },
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
    reportProcessGone(details) {
      if (!isCrashExit(details)) return;
      health?.crash();
      rollback.recordCrash();
    },
    start() {
      if (initialTimer || recurringTimer) return;
      health?.start();
      // Un errore di verifica in background non disturba: resta discreto e si riprova al giro successivo.
      const failed = (message) => (error) => {
        logger.warn(message, { error });
        if (!busy() && state.status !== 'available') setState({ status: 'error', phase: 'check', progress: 0, lastCheckedAt: Date.now() });
      };
      initialTimer = setTimeout(() => checkTrustedUpdates().catch(failed('Verifica della distinta aggiornamento non riuscita.')), initialCheckMs);
      initialTimer.unref?.();
      // Ogni 30 minuti: una nuova Preview arriva in giornata, scaricata e verificata in background.
      recurringTimer = setInterval(() => checkTrustedUpdates().catch(failed('Verifica periodica della distinta aggiornamento non riuscita.')), checkIntervalMs);
      recurringTimer.unref?.();
    },
    stop() {
      rollback.cleanExit();
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
