/**
 * @module scripts/start-electron
 * @description Avvia Electron con runtime AI privato e processo console nascosto.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { isProcessAlive, readLock } = require('../src/infrastructure/electron/process-lock');

const electronCli = path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js');
const projectRoot = path.resolve(__dirname, '..');
const serverMode = process.argv.slice(2).some((argument) => ['--server', '--background'].includes(argument));
const presenceMode = process.argv.slice(2).includes('--presence');
const portableBackgroundMode = serverMode || presenceMode;
const portableDataRoot = path.resolve(projectRoot, '..', '.nexus-data');
const portableTempRoot = path.join(portableDataRoot, 'tmp');
const coreDescriptor = portableBackgroundMode
  ? null
  : readLock(path.join(portableDataRoot, 'headless-server.lock'));
const reusableCoreRuntime = Boolean(coreDescriptor
  && isProcessAlive(coreDescriptor.pid)
  && process.env.NEXUS_REUSE_CORE_RUNTIME !== '0');
const coreRuntimeBaseUrl = reusableCoreRuntime
  ? `http://127.0.0.1:${12000 + (coreDescriptor.pid % 1000)}`
  : '';
const CHROMIUM_WIDGETHOST_NOISE = /interface_endpoint_client\.cc:\d+.*Message \d+ rejected by interface blink\.mojom\.WidgetHost/i;
let stderrBuffer = '';
let requestedExitCode = null;
let terminationTimer = null;

function loaderSafeRuntimeExecutable() {
  const explicit = String(process.env.NEXUS_OLLAMA_EXECUTABLE_PATH || '').trim();
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);
  if (process.platform !== 'win32') return '';
  const runtimeDirectory = path.join(projectRoot, 'vendor', 'ollama', 'windows-x64');
  const runtimeExecutable = path.join(runtimeDirectory, 'ollama.exe');
  if (!/[\[\]]/.test(runtimeExecutable) || !fs.existsSync(runtimeExecutable)) return '';
  // Il loader ROCm di Windows non rileva alcune GPU quando il percorso contiene
  // parentesi quadre. Il junction resta sullo stesso SSD e non duplica il runtime.
  const aliasDirectory = path.join(path.parse(projectRoot).root, 'NexusNXS-Runtime');
  try {
    let aliasEntry = null;
    try { aliasEntry = fs.lstatSync(aliasDirectory); } catch {}
    let aliasMatches = false;
    if (aliasEntry) {
      try {
        aliasMatches = fs.realpathSync(aliasDirectory).toLowerCase() === fs.realpathSync(runtimeDirectory).toLowerCase();
      } catch {}
    }
    if (aliasEntry && !aliasMatches) {
      // Una junction contiene il target assoluto del volume al momento della
      // creazione. Se Windows cambia lettera, rimuoviamo soltanto il link
      // obsoleto; una directory reale non viene mai modificata.
      if (!aliasEntry.isSymbolicLink()) return '';
      fs.unlinkSync(aliasDirectory);
      aliasEntry = null;
    }
    if (!aliasEntry) fs.symlinkSync(runtimeDirectory, aliasDirectory, 'junction');
    if (fs.realpathSync(aliasDirectory).toLowerCase() !== fs.realpathSync(runtimeDirectory).toLowerCase()) return '';
    const aliasExecutable = path.join(aliasDirectory, 'ollama.exe');
    return fs.existsSync(aliasExecutable) ? aliasExecutable : '';
  } catch {
    return '';
  }
}

const runtimeExecutableOverride = loaderSafeRuntimeExecutable();
fs.mkdirSync(portableTempRoot, { recursive: true });

// #region 01 — Avvio del processo Electron

const forwardedArguments = process.argv.slice(2);
const child = spawn(process.execPath, [electronCli, '.', ...forwardedArguments], {
  cwd: projectRoot,
  // Electron e i suoi processi Chromium non devono ereditare l'handle console
  // di PowerShell: alla chiusura Windows può invalidarlo mentre pwsh sta ancora
  // completando la propria coda I/O (PostQueuedCompletionStatus, errore 6).
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true,
  env: {
    ...process.env,
    // Cache e file temporanei creati dal processo NexusNXS restano accanto ai
    // dati portatili. Non cambia TEMP/TMP globalmente e non coinvolge Windows.
    TEMP: portableTempRoot,
    TMP: portableTempRoot,
    ...(portableBackgroundMode ? { NEXUS_USER_DATA_ROOT: portableDataRoot } : {}),
    ...(runtimeExecutableOverride ? { NEXUS_OLLAMA_EXECUTABLE_PATH: runtimeExecutableOverride } : {}),
    // La UI riusa il runtime posseduto dal Core già autenticato dal lock
    // locale. Avviata da sola, conserva invece il proprio fallback gestito.
    NEXUS_MANAGED_OLLAMA: presenceMode || reusableCoreRuntime ? '0' : '1',
    ...(coreRuntimeBaseUrl ? { NEXUS_OLLAMA_BASE_URL: coreRuntimeBaseUrl } : {}),
    NEXUS_OLLAMA_ALLOW_LAN: '0'
  }
});

// #endregion
// #region 02 — Arresto coordinato

function terminateChildTree(signal = 'SIGTERM') {
  if (!child.pid || child.exitCode !== null || child.signalCode) return;
  if (process.platform === 'win32') {
    // Chiudere il terminale npm non deve lasciare Electron, Chromium, Kokoro,
    // Ollama o un comando autorizzato come processi orfani. Il target resta il
    // solo albero creato da questo launcher.
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t'], {
      stdio: 'ignore',
      windowsHide: true
    });
    terminationTimer = setTimeout(() => {
      if (child.exitCode === null && !child.signalCode) {
        spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true
        });
      }
    }, 3000);
    terminationTimer.unref?.();
    return;
  }
  child.kill(signal);
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.once(signal, () => {
    requestedExitCode = exitCode;
    terminateChildTree(signal);
  });
}

// #endregion
// #region 03 — Output e risultato

const forwardStderr = (text, flush = false) => {
  stderrBuffer += String(text || '');
  const lines = stderrBuffer.split(/(?<=\n)/);
  stderrBuffer = flush ? '' : (lines.pop() || '');
  for (const line of lines) {
    if (!CHROMIUM_WIDGETHOST_NOISE.test(line)) process.stderr.write(line);
  }
  if (flush && stderrBuffer && !CHROMIUM_WIDGETHOST_NOISE.test(stderrBuffer)) {
    process.stderr.write(stderrBuffer);
    stderrBuffer = '';
  }
};

child.stderr.on('data', (chunk) => forwardStderr(chunk));

child.once('error', (error) => {
  process.stderr.write(`[NEXUSNXS] Avvio Electron fallito: ${error.message}\n`);
  process.exitCode = 1;
});

// `close`, diversamente da `exit`, viene emesso soltanto dopo la chiusura delle
// pipe. In questo modo il launcher non termina con letture asincrone pendenti.
child.once('close', (code, signal) => {
  if (terminationTimer) clearTimeout(terminationTimer);
  forwardStderr('', true);
  process.exitCode = requestedExitCode ?? (signal ? 1 : (code ?? 1));
});

// #endregion
