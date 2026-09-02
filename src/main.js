/**
 * @module main
 * @description Entry point minimale: abilita il sandbox e avvia la composizione applicativa.
 */
// #region 01 — Diagnostica precoce e dipendenze
const { app, protocol } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const earlySmokeStagePath = process.env.NEXUS_SMOKE_TEST === '1'
  ? String(process.env.NEXUS_SMOKE_STAGE_PATH || '').trim()
  : '';
const recordEarlySmokeStage = (stage) => {
  if (!earlySmokeStagePath) return;
  try {
    fs.mkdirSync(path.dirname(earlySmokeStagePath), { recursive: true });
    fs.appendFileSync(earlySmokeStagePath, `${Date.now()} ${stage}\n`, 'utf8');
  } catch {}
};
recordEarlySmokeStage('main-entry');
const { bootstrapElectron } = require('./application/bootstrap');
recordEarlySmokeStage('bootstrap-module-loaded');
const { bootstrapPresence } = require('./application/presence-bootstrap');
recordEarlySmokeStage('presence-module-loaded');
const { createLogger } = require('./services/logger');
const { normalizeUserDataDirectoryCase } = require('./infrastructure/storage/user-data-migration');
const { resolvePortableUserData } = require('./infrastructure/storage/portable-user-data');
recordEarlySmokeStage('main-dependencies-loaded');
// #endregion

// #region 02 — Profilo, sandbox e bootstrap

// Il sandbox deve essere abilitato prima di app.whenReady().
const smokeTest = process.env.NEXUS_SMOKE_TEST === '1';
const smokeAllowsHardwareAcceleration = process.env.NEXUS_SMOKE_ALLOW_GPU === '1';
const serverMode = process.argv.includes('--server') || process.argv.includes('--background');
const presenceMode = process.argv.includes('--presence');
// I pacchetti Windows possono essere costruiti con i fuse che ignorano
// alcuni argomenti Chromium passati dalla shell. Lo smoke test espone quindi
// la porta DevTools in modo esplicito prima di app.whenReady(), senza attivare
// mai il debugging nelle build normali.
if (smokeTest) {
  const smokeDebugPort = Number(process.env.NEXUS_SMOKE_DEBUG_PORT || 9337);
  if (Number.isInteger(smokeDebugPort) && smokeDebugPort > 0 && smokeDebugPort < 65536) {
    app.commandLine.appendSwitch('remote-debugging-port', String(smokeDebugPort));
  }
  // Le verifiche headless non hanno una superficie GPU reale; disabilitarla
  // evita crash del driver Chromium su macchine/CI con GPU ibride, lasciando
  // invariata l'accelerazione nelle build usate dagli utenti.
  if (!smokeAllowsHardwareAcceleration) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
  }
}
if (serverMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}
const explicitSmokeProfile = smokeTest && process.argv.some((argument) => argument.startsWith('--user-data-dir='));
const temporarySmokeProfile = smokeTest && !explicitSmokeProfile
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-smoke-'))
  : '';
const smokeProfileArgument = explicitSmokeProfile
  ? process.argv.find((argument) => argument.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length)
  : '';
const portableUserData = smokeTest ? '' : resolvePortableUserData();
const userDataPath = smokeTest
  ? (smokeProfileArgument ? path.resolve(smokeProfileArgument) : temporarySmokeProfile || app.getPath('userData'))
  : portableUserData || normalizeUserDataDirectoryCase(app.getPath('appData'));
const chromiumProfilePath = !smokeTest && (serverMode || presenceMode)
  ? path.join(userDataPath, 'runtime-profiles', presenceMode ? 'presence' : 'core')
  : userDataPath;
app.setName('NexusNXS');
if (!smokeTest) process.env.NEXUS_SHARED_DATA_ROOT = userDataPath;
app.setPath('userData', chromiumProfilePath);
if (temporarySmokeProfile) {
  process.once('exit', () => {
    try { fs.rmSync(temporarySmokeProfile, { recursive: true, force: true }); } catch {}
  });
}
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{
  scheme: 'nexus',
  privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false, stream: true }
}]);
if (process.platform === 'win32') app.setAppUserModelId('local.nexus.ai');

const bootstrap = presenceMode ? bootstrapPresence : bootstrapElectron;
bootstrap().catch((error) => {
  createLogger({ scope: 'main' }).error('Bootstrap Electron fallito.', { error });
  // app.quit() attraversa la barriera di shutdown e non lascia processi figli
  // attivi anche quando il bootstrap fallisce dopo aver avviato un servizio.
  process.exitCode = 1;
  app.quit();
});
// #endregion
