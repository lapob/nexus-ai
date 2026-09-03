/**
 * @module application/bootstrap
 * @description Compone configurazione, servizi e lifecycle senza logica grafica.
 */
// #region 01 — Dipendenze e adapter

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const recordModuleStage = (stage) => {
  const target = process.env.NEXUS_SMOKE_TEST === '1'
    ? String(process.env.NEXUS_SMOKE_STAGE_PATH || '').trim()
    : '';
  if (!target) return;
  try { fs.appendFileSync(target, `${Date.now()} module:${stage}\n`, 'utf8'); } catch {}
};
recordModuleStage('builtins');
const { app, BrowserWindow, dialog, net, powerMonitor, safeStorage, shell } = require('electron');
recordModuleStage('electron-api');
const pythonRuntimeManifest = require('../../config/python-runtime.json');
const productSlo = require('../../config/product-slo.json');
recordModuleStage('config');
const { NexusIndex } = require('../knowledge/rag');
recordModuleStage('knowledge');
const {
  resolveVaultPath,
  saveUserVaultPath,
  ensurePublicKnowledgeVault,
  localDataLayout
} = require('../infrastructure/storage/portable-paths');
recordModuleStage('storage-paths');
const { loadRuntimeConfig } = require('../core/config');
const { createLogger } = require('../services/logger');
const { registerIpcHandlers } = require('./register-ipc');
const { createMainWindow } = require('../infrastructure/electron/create-main-window');
const { createSafeStorageSecretProtection } = require('../infrastructure/electron/safe-storage-secret');
const { shouldKeepApplicationAlive, startAppLifecycle } = require('../infrastructure/electron/app-lifecycle');
const { AMBIENT_VOICE_ARGUMENT, WAKE_WORD_ARGUMENT_PREFIX, launchSystemPresence } = require('../infrastructure/electron/desktop-launcher');
const { RENDERER_ENTRY_URL, registerRendererProtocol } = require('../infrastructure/electron/renderer-protocol');
recordModuleStage('electron');
const { AIProviderRegistry } = require('../ai/ai-provider-registry');
const { AIRuntime } = require('../ai/ai-runtime');
const { OllamaProvider } = require('../ai/providers/ollama-provider');
const { NexusServiceProvider } = require('../ai/providers/nexus-service-provider');
const { ManagedOllamaRuntime, selectManagedRuntimePort } = require('../ai/managed-ollama-runtime');
const { detectHardware, runtimeTuning } = require('../ai/hardware-profile');
const {
  MODEL_PROFILES,
  profileModels,
  recommendedProfile
} = require('../ai/model-manifest');
const { loaderSafeOllamaLibrary, resolveOllamaLibrary } = require('../ai/ollama-library');
recordModuleStage('ai');
const { ActionRuntime } = require('../agents/action-runtime');
const { WorkflowRuntime } = require('../agents/workflow-runtime');
const { NativeSpeechService } = require('../voice/native-speech');
const { NeuralSpeechService } = require('../voice/neural-speech');
const { ExpressiveSpeechService } = require('../voice/expressive-speech');
recordModuleStage('agents-voice');
const { TrainingStore } = require('../infrastructure/storage/training-store');
const { PersonalMemoryStore } = require('../infrastructure/storage/personal-memory-store');
const { ConversationStore } = require('../infrastructure/storage/conversation-store');
const { PerformanceMetricsStore } = require('../infrastructure/storage/performance-metrics-store');
const { PrivacyTelemetry } = require('../infrastructure/privacy-telemetry');
const { createAvailabilityMonitor } = require('../infrastructure/storage/availability-monitor');
const { SemanticResponseCache } = require('../infrastructure/storage/semantic-response-cache');
recordModuleStage('stores');
const { snapshotUserData } = require('../infrastructure/storage/version-snapshot');
const { RemoteSessionGateway } = require('../remote/remote-session-gateway');
const { createLocalPresenceBridgeClient } = require('../remote/local-presence-bridge');
const { SecurityEventStore } = require('../security/security-event-store');
recordModuleStage('remote-security');
const { configureContinuityTask } = require('../infrastructure/windows/continuity-task');
const { CrashReportStore } = require('../infrastructure/storage/crash-report-store');
const { createUpdateManager } = require('../infrastructure/electron/update-manager');
const { ProcessLock, isProcessAlive, readLock } = require('../infrastructure/electron/process-lock');
const { coordinateShutdown } = require('./shutdown-coordinator');
const { runtimeWarmupPolicy } = require('./runtime-warmup-policy');
const { ProactiveEventBus } = require('./proactive-event-bus');
const { ProactiveSensorHub } = require('./proactive-sensor-hub');
const { createHeadlessDesktopControl } = require('./headless-desktop-control');
const { WebResearchService } = require('../research/web-research-service');
const { ImageGenerationService } = require('../ai/image-generation-service');
recordModuleStage('complete');

// #endregion

// #region 02 — Composition root Electron

function bootstrapElectron({ env = process.env } = {}) {
  const appRoot = path.resolve(__dirname, '..', '..');
  const sharedDataRoot = path.resolve(String(env.NEXUS_SHARED_DATA_ROOT || app.getPath('userData')));
  const serverMode = process.argv.includes('--server');
  const deviceCoreMode = process.argv.includes('--background');
  const headlessMode = serverMode || deviceCoreMode;
  let ambientVoiceMode = process.argv.includes(AMBIENT_VOICE_ARGUMENT);
  const rendererRoot = path.join(appRoot, 'renderer-dist');
  const releaseConfigPath = path.join(appRoot, 'config', 'public-client.release.json');
  const distributionConfigPath = fs.existsSync(releaseConfigPath) ? releaseConfigPath : path.join(appRoot, 'config', 'public-client.json');
  let distributionConfig = {};
  try { distributionConfig = JSON.parse(fs.readFileSync(distributionConfigPath, 'utf8')); } catch {}
  const publicClientMode = deviceCoreMode || (!serverMode && (env.NEXUS_DISTRIBUTION_MODE === 'public'
    || (app.isPackaged && env.NEXUS_DISTRIBUTION_MODE !== 'developer')));
  const serviceUrl = String(env.NEXUS_SERVICE_URL || distributionConfig.serviceUrl || '').trim();
  const serviceFallbackUrls = String(env.NEXUS_SERVICE_FALLBACK_URLS || (distributionConfig.fallbackUrls || []).join(',')).trim();
  const managedRuntimeEnabled = !publicClientMode && (app.isPackaged || env.NEXUS_MANAGED_OLLAMA === '1')
    && env.NEXUS_USE_SYSTEM_OLLAMA !== '1';
  // Una porta per-sessione impedisce a installazioni Ollama globali, processi
  // orfani o un secondo profilo NexusNXS di essere scambiati per il runtime
  // posseduto dall'app. Il range resta esclusivamente loopback.
  const managedPort = selectManagedRuntimePort(process.pid);
  const managedBaseUrl = `http://127.0.0.1:${managedPort}`;
  const runtimeEnvironment = publicClientMode
    ? { ...env, NEXUS_AI_PROVIDER: 'nexus-service', NEXUS_SERVICE_URL: serviceUrl, NEXUS_SERVICE_FALLBACK_URLS: serviceFallbackUrls, NEXUS_AI_CHAT_MODEL: 'automatic', NEXUS_AI_FAST_MODEL: 'automatic', NEXUS_AI_EMBEDDING_MODEL: '' }
    : managedRuntimeEnabled
      ? { ...env, NEXUS_OLLAMA_BASE_URL: managedBaseUrl, NEXUS_OLLAMA_ALLOW_LAN: '0' }
      : env;
  const runtimeConfig = loadRuntimeConfig(runtimeEnvironment);
  const logger = createLogger({
    level: runtimeConfig.logging.level,
    scope: 'main',
    // I log ruotano nei dati utente e non entrano mai nella vault o nella
    // directory di installazione dell'applicazione.
    filePath: path.join(sharedDataRoot, 'logs', 'nexus.log')
  });
  const proactiveEvents = new ProactiveEventBus({
    logger,
    quietHours: env.NEXUS_QUIET_HOURS === 'off' ? false : (env.NEXUS_QUIET_HOURS || '22:00-07:00')
  });
  const updateManager = createUpdateManager({
    updateUrl: String(env.NEXUS_UPDATE_URL || distributionConfig.updatesUrl || '').trim(),
    channel: ['preview', 'beta', 'stable'].includes(String(distributionConfig.channel || 'stable')) ? distributionConfig.channel : 'stable',
    manifestPublicKey: String(distributionConfig.manifestPublicKey || '').trim(),
    manifestKeyId: String(distributionConfig.manifestKeyId || '').trim(),
    // Il percorso resta locale e viene soltanto sottoposto ad hash: stabilizza
    // la coorte senza trasmettere hostname, username o identificatori hardware.
    rolloutSeed: sharedDataRoot,
    trustedRendererUrl: RENDERER_ENTRY_URL,
    logger
  });
  updateManager.setWindowProvider(() => BrowserWindow.getAllWindows()[0] || null);
  const crashReports = new CrashReportStore({
    filePath: path.join(sharedDataRoot, 'logs', 'crash-reports.json'),
    enabled: env.NEXUS_LOCAL_CRASH_REPORTS !== '0'
  });
  app.on('render-process-gone', (_event, _contents, details) => crashReports.append('renderer', details));
  app.on('child-process-gone', (_event, details) => crashReports.append('child', details));
  const managedRuntime = new ManagedOllamaRuntime({
    enabled: managedRuntimeEnabled,
    resourcesPath: app.isPackaged ? process.resourcesPath : path.join(appRoot, 'vendor'),
    executablePath: String(env.NEXUS_OLLAMA_EXECUTABLE_PATH || '').trim() || null,
    userDataPath: sharedDataRoot,
    logger,
    port: managedRuntimeEnabled ? managedPort : 11434
  });
  const smokeTest = env.NEXUS_SMOKE_TEST === '1';
  const smokeStagePath = smokeTest ? String(env.NEXUS_SMOKE_STAGE_PATH || '').trim() : '';
  const recordSmokeStage = (stage) => {
    if (!smokeStagePath) return;
    try {
      fs.mkdirSync(path.dirname(smokeStagePath), { recursive: true });
      fs.appendFileSync(smokeStagePath, `${Date.now()} ${stage}\n`, 'utf8');
    } catch {}
  };
  recordSmokeStage('bootstrap-created');
  const screenshotPath = env.NEXUS_SCREENSHOT_PATH || '';
  const accessibilityReportPath = env.NEXUS_ACCESSIBILITY_REPORT_PATH || '';
  const smokeView = env.NEXUS_SMOKE_VIEW || '';
  const smokeViewport = {
    width: Number(env.NEXUS_SMOKE_WIDTH) || 0,
    height: Number(env.NEXUS_SMOKE_HEIGHT) || 0
  };
  let index;
  let headlessLock = null;
  let desktopUiLock = null;
  let ambientVoiceActivated = false;
  let ambientVoiceBecameActive = false;
  let ambientVoiceShutdownTimer = null;
  let headlessShutdownRequested = false;
  let actionRuntime;
  let workflowRuntime;
  let remoteGatewayInstance = null;
  const bridgeSecretProtection = createSafeStorageSecretProtection(safeStorage);
  const presenceBridgeClient = createLocalPresenceBridgeClient({
    sharedDataRoot,
    logger,
    unprotectSecret: bridgeSecretProtection.unprotectSecret
  });
  const headlessDesktopControl = createHeadlessDesktopControl({
    appRoot,
    sharedDataRoot,
    env,
    bridgeClient: presenceBridgeClient
  });
  const attachUiShutdownRequest = (lock) => lock?.onShutdownRequested(() => {
    logger.info('Chiusura coordinata dell interfaccia NexusNXS richiesta dal controllo privato.');
    app.quit();
  });
  const promoteAmbientWindow = () => {
    if (!ambientVoiceMode) return true;
    const promoted = new ProcessLock({ filePath: path.join(sharedDataRoot, 'desktop-ui.lock') });
    if (!promoted.acquire()) return false;
    desktopUiLock?.release();
    desktopUiLock = promoted;
    attachUiShutdownRequest(desktopUiLock);
    ambientVoiceMode = false;
    ambientVoiceActivated = false;
    ambientVoiceBecameActive = false;
    if (ambientVoiceShutdownTimer) clearTimeout(ambientVoiceShutdownTimer);
    ambientVoiceShutdownTimer = null;
    return true;
  };
  const deliverWakeWordActivation = ({ window, commandLine = [], initial = false } = {}) => {
    if (!window || window.isDestroyed?.()) return false;
    const argument = commandLine.find((value) => String(value || '').startsWith(WAKE_WORD_ARGUMENT_PREFIX));
    if (!argument) {
      if (!initial && ambientVoiceMode) return !promoteAmbientWindow();
      return false;
    }
    const ticket = String(argument).slice(WAKE_WORD_ARGUMENT_PREFIX.length);
    if (!presenceBridgeClient.verifyActivationTicket(ticket, 'voice')) {
      logger.warn('Richiamo vocale Presence rifiutato: ticket non valido o gia usato.');
      return false;
    }
    ambientVoiceActivated = true;
    if (ambientVoiceShutdownTimer) clearTimeout(ambientVoiceShutdownTimer);
    ambientVoiceShutdownTimer = setTimeout(() => {
      ambientVoiceShutdownTimer = null;
      if (ambientVoiceMode && !ambientVoiceBecameActive) app.quit();
    }, 45_000);
    ambientVoiceShutdownTimer.unref?.();
    const notify = () => {
      if (!window.isDestroyed?.()) window.webContents.send('nexus:wake-word-activation', {
        source: 'local-windows-sapi', detectedAt: Date.now()
      });
    };
    if (window.webContents.isLoadingMainFrame?.()) window.webContents.once('did-finish-load', notify);
    else notify();
    return true;
  };
  let ipcServices = null;
  let storeCloseables = [];
  let maintenanceWarmup = null;
  let aiWarmup = null;
  let aiKeepWarm = null;
  let speechWarmup = null;
  let indexWarmup = null;
  let proactiveUnsubscribe = null;
  let proactiveSensorHub = null;
  let availabilityMonitor = null;
  const proactivePowerListeners = [];
  const whisperDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'whisper', 'windows-x64')
    : path.join(appRoot, 'vendor', 'whisper', 'windows-x64');
  const speechService = new NativeSpeechService({ whisperDirectory });
  const pythonRuntimeDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'windows-x64')
    : path.join(appRoot, ...pythonRuntimeManifest.runtimeDirectory.split('/'));
  const neuralSpeechService = new NeuralSpeechService({
    runtimeDirectory: app.isPackaged
      ? path.join(process.resourcesPath, 'kokoro')
      : path.join(appRoot, 'vendor', 'kokoro'),
    pythonRuntimeDirectory
  });
  const expressiveSpeechService = new ExpressiveSpeechService({
    runtimeDirectory: app.isPackaged
      ? path.join(process.resourcesPath, 'chatterbox')
      : path.join(appRoot, 'vendor', 'chatterbox'),
    pythonRuntimeDirectory
  });
  let vaultLocation;
  const registry = new AIProviderRegistry()
    .register('ollama', (config) => new OllamaProvider(config))
    .register('nexus-service', (config) => new NexusServiceProvider(config));
  const aiRuntime = new AIRuntime({ registry, logger });
  aiRuntime.initialize(runtimeConfig.ai);
  // La ricerca resta nel motore della workstation: i client pubblici non
  // ricevono chiavi, non invocano provider terzi e rimangono renderer leggeri.
  const webResearchService = new WebResearchService({
    ...runtimeConfig.research,
    enabled: runtimeConfig.research.enabled && !publicClientMode,
    logger
  });
  let shutdownPromise = null;
  const shutdownApplication = () => {
    if (shutdownPromise) return shutdownPromise;
    if (ambientVoiceShutdownTimer) clearTimeout(ambientVoiceShutdownTimer);
    ambientVoiceShutdownTimer = null;
    aiWarmup?.cancel();
    if (aiKeepWarm) clearInterval(aiKeepWarm);
    speechWarmup?.cancel();
    indexWarmup?.cancel();
    maintenanceWarmup?.cancel();
    shutdownPromise = coordinateShutdown({
      logger,
      services: [
        { label: 'richieste e comandi', run: () => ipcServices?.shutdown()
          || Promise.allSettled([workflowRuntime?.shutdown?.(), actionRuntime?.shutdown?.(), aiRuntime.shutdown()]) },
        { label: 'riconoscimento vocale', run: () => speechService.shutdown?.() ?? speechService.stop() },
        { label: 'voce neurale', run: () => neuralSpeechService.shutdown() },
        { label: 'voce espressiva', run: () => expressiveSpeechService.shutdown() },
        { label: 'sessione remota', run: () => remoteGatewayInstance?.stop() },
        { label: 'bridge presenza', run: () => presenceBridgeClient.close() },
        { label: 'indice knowledge', run: () => index?.shutdown?.() },
        { label: 'runtime AI gestito', run: () => managedRuntime.shutdown() },
        { label: 'sensori proattivi', run: () => proactiveSensorHub?.stop() },
        { label: 'eventi proattivi', run: () => {
          proactiveUnsubscribe?.();
          for (const [name, listener] of proactivePowerListeners.splice(0)) powerMonitor.removeListener(name, listener);
          proactiveEvents.close();
        } },
        { label: 'aggiornamenti', run: () => updateManager.stop?.() },
        { label: 'monitor disponibilita', run: () => availabilityMonitor?.stop() }
      ],
      stores: storeCloseables.splice(0),
      // Il lock viene rilasciato per ultimo: un secondo avvio non può entrare
      // mentre gateway, database o runtime AI stanno ancora terminando.
      finalizers: [
        { label: 'lock UI', run: () => desktopUiLock?.release() },
        { label: 'lock Core', run: () => headlessLock?.release() }
      ]
    });
    return shutdownPromise;
  };

  return startAppLifecycle({
    logger,
    trustedRendererUrl: RENDERER_ENTRY_URL,
    // Il server headless deve convivere con la UI desktop: il task pianificato
    // ne impedisce già i duplicati, mentre il lock Electron resta riservato
    // alle sole finestre interattive.
    singleInstance: !smokeTest && !headlessMode,
    // La X chiude sempre il client desktop. Il server headless, se installato,
    // è un processo indipendente e non viene terminato dal client grafico.
    shouldKeepAlive: () => shouldKeepApplicationAlive({ headless: headlessMode }),
    headless: headlessMode,
    onExternalActivation: deliverWakeWordActivation,
    onShutdown: shutdownApplication,
    createWindow: () => {
      const window = createMainWindow({
        rendererUrl: RENDERER_ENTRY_URL,
        smokeTest,
        startHidden: ambientVoiceMode,
        screenshotPath,
        accessibilityReportPath,
        smokeViewport,
        smokeView,
        logger
      });
      return window;
    },
    onReady: async ({ showPrimaryWindow }) => {
      recordSmokeStage('electron-ready');
      registerRendererProtocol(rendererRoot);
      proactiveUnsubscribe = proactiveEvents.subscribe((proactiveEvent) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && window.webContents.getURL() === RENDERER_ENTRY_URL) {
            window.webContents.send('nexus:proactive-event', proactiveEvent);
          }
        }
        // Anche il Core headless inoltra soltanto metadati ai dispositivi
        // Console autenticati; il canale pubblico Chat non riceve telemetria.
        remoteGatewayInstance?.broadcast?.({ type: 'proactive-event', event: proactiveEvent }, 'console');
      });
      const registerPowerSignal = (name, type, metadata) => {
        const listener = () => proactiveEvents.publish(type, metadata);
        powerMonitor.on(name, listener);
        proactivePowerListeners.push([name, listener]);
      };
      registerPowerSignal('resume', 'system.resume', { state: 'available', summary: 'Sistema nuovamente disponibile' });
      registerPowerSignal('suspend', 'system.suspend', { state: 'suspended', summary: 'Sistema in sospensione' });
      registerPowerSignal('on-ac', 'power.source', { source: 'ac', summary: 'Alimentazione collegata' });
      registerPowerSignal('on-battery', 'power.source', { source: 'battery', summary: 'Alimentazione a batteria' });
      if (headlessMode) {
        headlessLock = new ProcessLock({
          filePath: path.join(sharedDataRoot, 'headless-server.lock')
        });
        if (!headlessLock.acquire()) {
          logger.info('Server NexusNXS già attivo; il secondo avvio termina senza creare processi duplicati.');
          app.quit();
          return;
        }
      } else if (!smokeTest) {
        desktopUiLock = new ProcessLock({
          filePath: path.join(sharedDataRoot, ambientVoiceMode ? 'ambient-voice-ui.lock' : 'desktop-ui.lock')
        });
        if (!desktopUiLock.acquire()) {
          logger.info('Interfaccia NexusNXS gia attiva; il secondo avvio viene inoltrato alla finestra esistente.');
          app.quit();
          return;
        }
        attachUiShutdownRequest(desktopUiLock);
        // La UI completa resta un processo on-demand. Avviando qui la shell
        // leggera, la X può liberare WebGL, voce e richieste AI mentre tray e
        // visualizer continuano a rappresentare NexusNXS senza duplicare il Core.
        launchSystemPresence({ appRoot, env })
          .catch((error) => logger.warn('Presence non avviata insieme alla UI; il client resta comunque utilizzabile.', { error }));
      }
      const coreDescriptor = readLock(path.join(sharedDataRoot, 'headless-server.lock'));
      const independentCoreRunning = !headlessMode && Boolean(coreDescriptor && isProcessAlive(coreDescriptor.pid));
      const hardwareProfile = await detectHardware({
        app,
        storagePath: managedRuntimeEnabled ? sharedDataRoot : app.getPath('home'),
        cachePath: path.join(sharedDataRoot, 'hardware-profile.json')
      });
      recordSmokeStage('hardware-ready');
      const tuning = runtimeTuning(hardwareProfile);
      // Chatterbox viene esposto soltanto con opt-in di sviluppo: il runtime
      // PyTorch CPU-only attuale supera il limite di latenza anche su hardware
      // performance. Sarà abilitato di default dopo un runtime GPU verificato.
      expressiveSpeechService.enabled = hardwareProfile.tier === 'performance'
        && env.NEXUS_DISABLE_EXPRESSIVE_VOICE !== '1';
      managedRuntime.configureHardware(tuning);
      const profileId = recommendedProfile(hardwareProfile);
      const requiredModels = publicClientMode ? [] : profileModels(MODEL_PROFILES[profileId]);
      if (managedRuntimeEnabled) {
        const existingLibrary = resolveOllamaLibrary(requiredModels, {
          env,
          preferredDriveRoots: [path.resolve(appRoot, '..')]
        });
        if (existingLibrary.existing) {
          managedRuntime.setModelsPath(loaderSafeOllamaLibrary(existingLibrary.path, { projectRoot: appRoot }));
        }
      }
      const managedRuntimeState = await managedRuntime.start();
      recordSmokeStage('runtime-ready');
      const userDataPath = sharedDataRoot;
      if (serverMode) {
        const publicKnowledgePath = String(env.NEXUS_PUBLIC_KNOWLEDGE_PATH || '').trim();
        vaultLocation = ensurePublicKnowledgeVault(
          userDataPath,
          publicKnowledgePath || path.join(appRoot, '..', '.knowledge-public')
        );
      } else if (publicClientMode) {
        // Il client distribuito non contiene né scopre documenti del server o
        // del proprietario. Tutto il retrieval pubblico avviene dietro il
        // gateway NexusNXS; questa vault vuota mantiene soltanto il contratto
        // locale dell'indice e non viene esposta dal renderer.
        vaultLocation = ensurePublicKnowledgeVault(userDataPath);
      } else try {
        vaultLocation = resolveVaultPath({ appRoot, env, userDataPath });
      } catch (initialError) {
        if (app.isPackaged) {
          vaultLocation = ensurePublicKnowledgeVault(userDataPath);
        } else {
          if (smokeTest) throw initialError;
          const selection = await dialog.showOpenDialog({
          title: 'Seleziona la biblioteca locale di NexusNXS',
          defaultPath: app.getPath('documents'),
          buttonLabel: 'Usa questa vault',
          properties: ['openDirectory']
          });
          if (selection.canceled || !selection.filePaths[0]) {
            app.quit();
            throw new Error('Nessuna vault selezionata. NEXUSNXS è stato chiuso senza modifiche.');
          }
          try {
            saveUserVaultPath(userDataPath, selection.filePaths[0]);
            vaultLocation = resolveVaultPath({ appRoot, env, userDataPath });
          } catch (error) {
            await dialog.showMessageBox({
            type: 'error',
            title: 'Vault non valida',
            message: 'La cartella selezionata non è una biblioteca NexusNXS valida.',
            detail: 'Seleziona la cartella della conoscenza locale configurata per NexusNXS.',
            buttons: ['Chiudi']
            });
            app.quit();
            throw error;
          }
        }
      }
      const localData = localDataLayout(sharedDataRoot);
      recordSmokeStage('storage-ready');
      index = new NexusIndex(vaultLocation.vaultPath, {
        cachePath: path.join(localData.vectorIndex, 'knowledge-index.json')
      });
      const trainingStore = new TrainingStore({
        filePath: path.join(localData.database, 'training-examples.jsonl')
      });
      const communityFeedbackStore = new TrainingStore({
        filePath: path.join(localData.database, 'community-feedback-quarantine.jsonl')
      });
      const memoryStore = new PersonalMemoryStore({
        filePath: path.join(localData.database, 'personal-memory.sqlite3')
      });
      const conversationStore = new ConversationStore({
        filePath: path.join(localData.database, 'conversations.sqlite3')
      });
      const securityEventStore = new SecurityEventStore({
        filePath: path.join(localData.logs, 'security-audit.jsonl')
      });
      const performanceStore = new PerformanceMetricsStore({
        filePath: path.join(localData.database, 'performance-metrics.sqlite3'),
        legacyFilePath: path.join(localData.logs, 'performance-metrics.jsonl')
      });
      const privacyTelemetry = new PrivacyTelemetry({
        sampleRate: Number(env.NEXUS_TELEMETRY_SAMPLE_RATE ?? 0.1),
        exporter: (span) => performanceStore.record({
          kind: 'remote',
          mode: span.attributes.tier || 'fast',
          durationMs: span.durationMs,
          success: span.attributes.outcome === 'success'
        })
      });
      const responseCache = new SemanticResponseCache({
        filePath: path.join(localData.database, 'response-cache.sqlite3'),
        encrypt: safeStorage.isEncryptionAvailable() ? (value) => safeStorage.encryptString(value).toString('base64') : null,
        decrypt: safeStorage.isEncryptionAvailable() ? (value) => safeStorage.decryptString(Buffer.from(value, 'base64')) : null
      });
      storeCloseables = [
        { label: 'cronologia', close: () => conversationStore.close() },
        { label: 'memoria personale', close: () => memoryStore.close() },
        { label: 'cache risposte', close: () => responseCache.close() },
        { label: 'metriche prestazioni', close: () => performanceStore.close() }
      ];
      const aiWarmupPolicy = runtimeWarmupPolicy({
        publicClientMode,
        serverMode,
        managedRuntimeAvailable: managedRuntimeState.available,
        performanceLevel: hardwareProfile.performanceLevel,
        keepAlive: tuning.keepAlive
      });
      const remoteGateway = new RemoteSessionGateway({
        statePath: path.join(localData.root, 'remote-access.json'),
        conversationStore,
        performanceStore,
        telemetry: privacyTelemetry,
        communityFeedbackStore,
        responseCache,
        securityEventStore,
        modelProvider: () => aiRuntime.listModels(),
        imageGenerationService: ImageGenerationService.fromEnvironment(env),
        researchAvailable: webResearchService?.enabled !== false,
        voiceTranscriber: ({ audio, language = 'auto', timeoutSeconds = 20 }) => speechService.transcribeAudio({
          audio,
          language,
          timeoutSeconds
        }),
        voiceSynthesizer: async ({ text, language, gender }) => {
          try { return await neuralSpeechService.synthesize({ text, language, gender, delivery: 'warm' }); }
          catch { return expressiveSpeechService.synthesize({ text, language, gender }); }
        },
        // Il listener headless può accettare health check immediatamente, ma
        // /readyz resta onesto finché il preload del modello rapido non termina.
        readinessProvider: () => !aiWarmupPolicy.requiresReadiness || ipcServices?.aiReadiness?.().ready === true,
        // Il server puo aprire le due applicazioni autorizzate anche quando la
        // Presence visiva e spenta; se viene avviata manualmente, il bridge
        // autenticato estende il contratto con i controlli del nucleo/display.
        presenceStatusProvider: () => headlessDesktopControl.status(),
        presenceActionExecutor: (command) => headlessDesktopControl.execute(command),
        serviceControlExecutor: headlessMode ? async (action) => {
          if (action !== 'stop') throw Object.assign(new Error('Azione servizio non consentita.'), { code: 'SERVICE_ACTION_NOT_ALLOWED' });
          const timer = setTimeout(() => {
            headlessShutdownRequested = true;
            logger.info('Arresto del server NexusNXS confermato dal dispositivo privato.');
            app.quit();
          }, 750);
          timer.unref?.();
          return { status: 'stopping', message: 'Server NexusNXS in arresto.' };
        } : null,
        logger,
        publicPort: serverMode ? Number(env.NEXUS_PUBLIC_PORT || 32147) : 0
      });
      remoteGatewayInstance = remoteGateway;
      actionRuntime = new ActionRuntime({
        vaultPath: vaultLocation.vaultPath,
        auditPath: path.join(localData.logs, 'action-audit.jsonl'),
        checkpointDirectory: path.join(localData.root, 'action-checkpoints'),
        securityEventStore,
        shell,
        logger
      });
      workflowRuntime = new WorkflowRuntime({
        actionRuntime,
        checkpointDirectory: path.join(localData.root, 'workflow-checkpoints')
      });
      ipcServices = registerIpcHandlers({
        trustedRendererUrl: RENDERER_ENTRY_URL,
        vaultPath: vaultLocation.vaultPath,
        vaultLocation,
        runtimeConfig,
        runtimeEndpointLocked: publicClientMode || managedRuntimeEnabled || Boolean(env.NEXUS_OLLAMA_BASE_URL),
        distributionMode: publicClientMode ? 'public' : serverMode ? 'server' : 'developer',
        logger,
        getIndex: () => index,
        aiRuntime,
        actionRuntime,
        workflowRuntime,
        speechService,
        neuralSpeechService,
        expressiveSpeechService,
        trainingStore,
        memoryStore,
        conversationStore,
        performanceStore,
        remoteGateway,
        webResearchService,
        hardwareProfile,
        runtimeTuning: tuning,
        managedRuntimeState,
        managedRuntime,
        presenceStateSynchronizer: async (snapshot) => {
          const result = await presenceBridgeClient.sync(snapshot);
          if (!ambientVoiceMode || !ambientVoiceActivated) return result;
          const state = String(snapshot?.state || 'idle');
          if (state !== 'idle') {
            ambientVoiceBecameActive = true;
            if (ambientVoiceShutdownTimer) clearTimeout(ambientVoiceShutdownTimer);
            ambientVoiceShutdownTimer = null;
          } else if (ambientVoiceBecameActive) {
            if (ambientVoiceShutdownTimer) clearTimeout(ambientVoiceShutdownTimer);
            ambientVoiceShutdownTimer = setTimeout(() => app.quit(), 1_800);
            ambientVoiceShutdownTimer.unref?.();
          }
          return result;
        }
      });
      recordSmokeStage('ipc-ready');
      proactiveSensorHub = new ProactiveSensorHub({
        eventBus: proactiveEvents,
        networkProvider: () => net.isOnline(),
        securityProvider: () => securityEventStore.summary(),
        updateProvider: () => updateManager.status(),
        healthProvider: () => {
          const totalMemory = os.totalmem();
          if (totalMemory > 0 && os.freemem() / totalMemory < 0.04) {
            return { state: 'degraded', category: 'memory-pressure', code: 'LOW_MEMORY', summary: 'Memoria di sistema quasi esaurita' };
          }
          if (!securityEventStore.verifyIntegrity()) {
            return { state: 'degraded', category: 'security-journal', code: 'AUDIT_INTEGRITY', summary: 'Il registro di sicurezza richiede una verifica' };
          }
          const warmup = ipcServices?.aiReadiness?.();
          if (warmup?.status === 'failed') {
            return { state: 'degraded', category: 'ai-runtime', code: 'AI_WARMUP_FAILED', summary: 'Il servizio intelligente richiede attenzione' };
          }
          if (headlessMode && remoteGateway.state.enabled && !remoteGateway.status().running) {
            return { state: 'degraded', category: 'remote-gateway', code: 'REMOTE_GATEWAY_OFFLINE', summary: 'Il collegamento remoto non è disponibile' };
          }
          return { state: warmup?.status === 'warming' ? 'warming' : 'healthy' };
        },
        logger
      });
      if (aiWarmupPolicy.startImmediately) {
        let cancelled = false;
        let retryTimer = null;
        let retryIndex = 0;
        const runHeadlessWarmup = () => {
          if (cancelled) return;
          ipcServices.warmupAI().catch((error) => {
            if (cancelled || retryIndex >= aiWarmupPolicy.retryDelaysMs.length) {
              logger.warn('Warm-up AI headless non completato; il servizio resta non pronto.', { error });
              return;
            }
            const delay = aiWarmupPolicy.retryDelaysMs[retryIndex++];
            logger.warn('Warm-up AI headless rimandato.', { error, retryInMs: delay });
            retryTimer = setTimeout(runHeadlessWarmup, delay);
            retryTimer.unref?.();
          });
        };
        runHeadlessWarmup();
        aiWarmup = { cancel: () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); } };
      }
      if (headlessMode) {
        // Il canale proprietario passa da Tailscale Serve e resta confinato a
        // loopback per impostazione predefinita. Il bind LAN è un'eccezione
        // esplicita per reti private amministrate, mai un fallback silenzioso.
        const allowLan = env.NEXUS_REMOTE_ALLOW_LAN === '1';
        const serverStateChanged = !remoteGateway.state.enabled || remoteGateway.state.allowLan !== allowLan;
        remoteGateway.state.enabled = true;
        remoteGateway.state.allowLan = allowLan;
        if (serverStateChanged) remoteGateway.persist();
      }
      if (remoteGateway.state.enabled) {
        if (process.platform === 'win32' && app.isPackaged && !serverMode) {
          // Migra dal vecchio LoginItem alla coppia di task Core + presenza:
          // un solo proprietario per ruolo, nessun secondo avvio al login.
          app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, name: 'NexusNXS' });
          configureContinuityTask({ executable: process.execPath, enabled: true, userDataRoot: sharedDataRoot })
            .catch((error) => logger.warn('Watchdog NexusNXS non registrato; resta attivo l’avvio con Windows.', { error }));
        }
        if (headlessMode) {
          // Il listener è il lock operativo definitivo. Attenderlo rende un
          // conflitto EADDRINUSE un errore di bootstrap: main.js attraversa la
          // barriera di shutdown, chiude store/runtime e rilascia il lock file.
          const status = await remoteGateway.start();
          ipcServices.syncRemoteWake(status);
          if (serverMode) {
            const availabilityPolicy = productSlo.objectives.availability;
            availabilityMonitor = createAvailabilityMonitor({
              endpoints: productSlo.objectives.readiness.endpoints,
              historyPath: path.join(sharedDataRoot, 'metrics', 'availability-samples.ndjson'),
              reportPath: path.join(sharedDataRoot, 'metrics', 'availability-report.json'),
              targetPercent: productSlo.objectives.availabilityTargetPercent,
              windowDays: productSlo.windowDays,
              minimumSamples: availabilityPolicy.minimumSamplesPerEndpoint,
              minimumCoveragePercent: availabilityPolicy.minimumCoveragePercent,
              timeoutMs: productSlo.objectives.readiness.maximumLatencyMs,
              onStateChange: ({ state, previous, failedEndpoints }) => {
                if (state === 'degraded') {
                  remoteGateway.securityEvents.append('availability.degraded', {
                    severity: 'critical',
                    detail: `${failedEndpoints} ingresso pubblico non disponibile`
                  });
                } else if (previous === 'degraded') {
                  remoteGateway.securityEvents.append('availability.recovered', {
                    severity: 'info',
                    detail: 'Ingressi pubblici nuovamente disponibili'
                  });
                }
              },
              logger
            });
            availabilityMonitor.start();
          }
          headlessLock.onShutdownRequested(() => {
            headlessShutdownRequested = true;
            logger.info('Arresto coordinato del server NexusNXS richiesto dal gestore locale.');
            app.quit();
          });
          if (headlessShutdownRequested) return;
          if (!smokeTest) {
            ipcServices.ensureRemoteServeRoute()
              .catch((error) => logger.warn('Route remota non sincronizzata; il gateway locale resta disponibile.', { error }));
          }
        } else if (independentCoreRunning) {
          // Il Core possiede già gateway, remoto e processi operativi. La UI è
          // soltanto un client interattivo e non tenta un secondo bind locale.
          logger.info('Gateway remoto affidato al Core NexusNXS gia attivo.');
        } else {
          remoteGateway.start()
            .then((status) => {
              ipcServices.syncRemoteWake(status);
              return smokeTest ? status : ipcServices.ensureRemoteServeRoute();
            })
            .catch((error) => logger.warn('Sessione remota non avviata.', { error }));
        }
      }
      proactiveSensorHub.start();
      // Preload e IPC sono operativi: la shell può apparire senza attendere la
      // scansione knowledge, il warm-up vocale o download di modelli.
      if (!headlessMode) {
        showPrimaryWindow();
        recordSmokeStage('window-created');
      }
      const scheduleIdleTask = (callback, delay, { idleSeconds = 2, retryMs = 2_000, maxWaitMs = 120_000 } = {}) => {
        let cancelled = false;
        const startedAt = Date.now();
        let timer = null;
        const attempt = () => {
          if (cancelled) return;
          let idle = true;
          try { idle = powerMonitor.getSystemIdleTime() >= idleSeconds; } catch {}
          if (!idle && Date.now() - startedAt < maxWaitMs) {
            timer = setTimeout(attempt, retryMs);
            timer.unref?.();
            return;
          }
          callback();
        };
        timer = setTimeout(attempt, delay);
        timer.unref?.();
        return { cancel: () => { cancelled = true; if (timer) clearTimeout(timer); } };
      };
      // Snapshot e rete non appartengono al percorso del primo paint. Partono
      // quando la shell è già utilizzabile e non competono con font/WebGL/IPC.
      maintenanceWarmup = scheduleIdleTask(() => {
        try {
          snapshotUserData(sharedDataRoot, app.getVersion(), {
            protect: safeStorage.isEncryptionAvailable()
              ? (bytes) => safeStorage.encryptString(bytes.toString('base64'))
              : null
          });
        } catch (error) { logger.warn('Snapshot iniziale rimandato.', { error }); }
        if (!headlessMode) updateManager.start();
      }, hardwareProfile.performanceLevel >= 3 ? 7_500 : 10_000);
      // Se esiste già un modello compatibile, lo seleziona e lo carica dopo
      // l'apertura della shell. Setup, npm start e npm run dev condividono così
      // lo stesso cold-start adattivo senza bloccare la finestra iniziale.
      // Non sovrappone il caricamento del modello alla compilazione WebGL.
      // Un messaggio inviato prima di questa finestra usa comunque il normale
      // percorso on-demand, quindi la reattività funzionale non viene ridotta.
      if (aiWarmupPolicy.enabled && !aiWarmupPolicy.startImmediately) {
        aiWarmup = scheduleIdleTask(() => {
          ipcServices.warmupAI()
            .catch((error) => logger.warn('Warm-up AI differito; verrà riprovato al primo messaggio.', { error }));
        }, aiWarmupPolicy.delayMs, { idleSeconds: aiWarmupPolicy.idleSeconds });
      }
      // Il modello rapido viene mantenuto pronto soltanto sui profili capaci di
      // sostenerlo. Il refresh è meno frequente del keep-alive configurato e non
      // carica il modello profondo: un saluto resta quindi leggero, mentre il
      // primo turno quotidiano non paga nuovamente l'intero cold start.
      aiKeepWarm = aiWarmupPolicy.keepWarm
        ? setInterval(() => {
          ipcServices.warmupAI({ preserveLoadedModel: true })
            .catch((error) => logger.warn('Mantenimento AI rimandato.', { error }));
        }, aiWarmupPolicy.keepWarmIntervalMs)
        : null;
      aiKeepWarm?.unref?.();
      // Evita di sovrapporre al primo dialogo il cold start della voce neurale.
      // Il servizio viene preparato soltanto dopo una finestra di inattività;
      // se l'utente parla prima, l'inizializzazione on-demand resta valida.
      // Sulle workstation il cold start del Python incorporato può richiedere
      // diversi secondi (soprattutto al primo avvio dopo l'installazione).
      // Prepararlo quasi subito evita che la prima risposta sembri muta. I PC
      // medi attendono qualche secondo; i profili Lite conservano il fallback
      // di sistema e non caricano un secondo runtime in background.
      // Python/Kokoro parte in una finestra distinta da AI, WebGL e snapshot:
      // era la principale causa dei picchi simultanei subito dopo il paint.
      const speechWarmupDelay = hardwareProfile.performanceLevel >= 3 ? 2_500 : 5_000;
      speechWarmup = headlessMode || hardwareProfile.tier === 'lite' ? null : scheduleIdleTask(() => {
        neuralSpeechService.warmUp();
      }, speechWarmupDelay, { idleSeconds: 1, retryMs: 1_000, maxWaitMs: 30_000 });

      // Il confronto usa solo percorso, dimensione e mtime: una cache invariata
      // non rilegge le note, mentre aggiunte, modifiche e rimozioni avviano una
      // reindicizzazione incrementale in un worker dopo il primo paint.
      const indexRequiresRefresh = index.needsRebuild();
      indexWarmup = indexRequiresRefresh ? scheduleIdleTask(() => {
        // Sul server il preload ha precedenza: l'indicizzazione pubblica non
        // contende CPU, RAM e disco al primo caricamento del modello. La stessa
        // promise singleflight viene condivisa se il warm-up è ancora attivo.
        const modelReady = serverMode && !ipcServices.aiReadiness().ready
          ? ipcServices.warmupAI().catch(() => null)
          : Promise.resolve();
        modelReady.then(() => index.rebuildAsync())
          .then((stats) => logger.info('Knowledge sincronizzata in background.', stats))
          .catch((error) => logger.warn('Sincronizzazione knowledge non riuscita; sarà possibile riprovare dall’interfaccia.', { error }));
      }, hardwareProfile.performanceLevel >= 3 ? 15_000 : 18_000) : null;
      // Sui profili non-lite Kokoro viene preriscaldato dopo il primo paint:
      // la voce naturale può così partire senza cold start nel dialogo live.
      logger.info(serverMode ? 'NEXUSNXS Server avviato.' : deviceCoreMode ? 'NEXUSNXS Core avviato.' : 'NEXUSNXS avviato.', {
        vaultSource: vaultLocation.source,
        notes: index.stats().notes,
        chunks: index.stats().chunks,
        hardwareTier: hardwareProfile.tier,
        managedRuntime: managedRuntimeState.managed
      });
    }
  });
}

module.exports = { bootstrapElectron };

// #endregion
