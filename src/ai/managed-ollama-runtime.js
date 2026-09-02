/**
 * @module ai/managed-ollama-runtime
 * @description Avvia il runtime Ollama privato incluso in NEXUSNXS senza interferire con installazioni globali.
 */
// #region 01 — Processo gestito

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { assertOllamaRuntimeSecure } = require('./ollama-runtime-security');

const RUNTIME_ENV_KEYS = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
  'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL'
]);

function sanitizedRuntimeEnvironment(source = process.env) {
  const safe = {};
  for (const key of RUNTIME_ENV_KEYS) {
    if (typeof source[key] === 'string' && source[key]) safe[key] = source[key];
  }
  return safe;
}

function terminateOwnedProcessTree(child, platform = process.platform, runTaskkill = spawnSync) {
  if (!child) return false;
  if ((child.exitCode !== undefined && child.exitCode !== null)
    || (child.signalCode !== undefined && child.signalCode !== null)) return false;
  if (platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    try {
      const result = runTaskkill('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5_000
      });
      if (result?.status === 0) return true;
    } catch { /* Il fallback nativo gestisce anche taskkill non disponibile. */ }
  }
  try {
    if (typeof child.kill !== 'function') return false;
    return child.kill('SIGKILL') !== false;
  } catch {
    return false;
  }
}

class ManagedOllamaRuntime {
  constructor(options = {}) {
    this.enabled = options.enabled === true;
    this.resourcesPath = options.resourcesPath;
    this.executableOverride = options.executablePath ? path.resolve(options.executablePath) : '';
    this.userDataPath = options.userDataPath;
    this.logger = options.logger;
    this.host = options.host || '127.0.0.1';
    this.port = Number(options.port) || 11435;
    this._modelsPath = options.modelsPath || null;
    this.runtimeTuning = options.runtimeTuning || null;
    this.process = null;
    this.ownedProcess = false;
    this.restartAttempts = 0;
    this.lastRestartAt = 0;
    this.platform = options.platform || process.platform;
    this.spawnProcess = options.spawnProcess || spawn;
    this.runtimeSecurityCheck = options.runtimeSecurityCheck || assertOllamaRuntimeSecure;
    // Limita taskkill al PID creato da questa istanza: un servizio Ollama
    // installato o avviato dall'utente non viene mai terminato da NexusNXS.
    this.terminateProcess = options.terminateProcess
      || ((child) => terminateOwnedProcessTree(child, this.platform, options.runTaskkill || spawnSync));
    this.lifecycleGeneration = 0;
    this.disposed = false;
    this.startPromise = null;
  }

  get baseUrl() { return `http://${this.host}:${this.port}`; }
  get modelsPath() { return this._modelsPath || path.join(this.userDataPath, 'ai', 'models'); }
  setModelsPath(modelsPath) {
    if (this.process) throw new Error('La libreria modelli non può cambiare mentre Ollama è attivo.');
    this._modelsPath = path.resolve(modelsPath);
    return this._modelsPath;
  }
  configureHardware(tuning) {
    if (this.process) throw new Error('Il profilo hardware non può cambiare mentre Ollama è attivo.');
    this.runtimeTuning = tuning || null;
  }
  get executablePath() {
    if (this.executableOverride) return this.executableOverride;
    const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    return path.join(this.resourcesPath, 'ollama', process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`, name);
  }
  get securityExecutablePath() {
    try { return fs.realpathSync(this.executablePath); }
    catch { return this.executablePath; }
  }

  // #region 02 — Salute e lifecycle

  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(1500) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async waitUntilReady(timeoutMs = 20000, generation = this.lifecycleGeneration) {
    const deadline = Date.now() + timeoutMs;
    while (!this.disposed && generation === this.lifecycleGeneration && Date.now() < deadline) {
      if (await this.health()) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async start() {
    if (this.disposed) return { managed: this.enabled, available: false, baseUrl: this.baseUrl, reason: 'runtime-stopped' };
    if (this.startPromise) return this.startPromise;
    const generation = this.lifecycleGeneration;
    const startPromise = this.startOwned(generation);
    this.startPromise = startPromise;
    try { return await startPromise; }
    finally { if (this.startPromise === startPromise) this.startPromise = null; }
  }

  async startOwned(generation) {
    if (!this.enabled) return { managed: false, available: await this.health(), baseUrl: this.baseUrl };
    // Il setup non riutilizza processi sconosciuti sulla porta privata: non è
    // possibile garantire che puntino alla libreria selezionata da NEXUSNXS.
    if (await this.health()) {
      if (this.disposed || generation !== this.lifecycleGeneration) {
        return { managed: true, available: false, baseUrl: this.baseUrl, reason: 'runtime-stopped' };
      }
      this.logger?.warn('Porta AI privata già occupata; runtime non riutilizzato.', { baseUrl: this.baseUrl });
      return { managed: true, available: false, baseUrl: this.baseUrl, reason: 'port-in-use' };
    }
    if (!fs.existsSync(this.executablePath)) {
      this.logger?.warn('Runtime AI NEXUSNXS non incluso nel pacchetto.', { executablePath: this.executablePath });
      return { managed: true, available: false, baseUrl: this.baseUrl, reason: 'runtime-missing' };
    }
    try {
      // Grype deve ricevere il percorso reale: su Windows non segue sempre i
      // junction usati per aggirare i limiti del loader ROCm.
      this.runtimeSecurityCheck(this.securityExecutablePath, {
        usage: 'development', host: this.host
      });
    } catch (error) {
      this.logger?.error('Runtime AI NEXUSNXS bloccato dal gate di sicurezza.', {
        code: error?.code || 'OLLAMA_SECURITY_BLOCKED', executablePath: this.executablePath
      });
      return { managed: true, available: false, baseUrl: this.baseUrl, reason: 'runtime-security-blocked' };
    }
    fs.mkdirSync(this.modelsPath, { recursive: true });
    if (this.disposed || generation !== this.lifecycleGeneration) {
      return { managed: true, available: false, baseUrl: this.baseUrl, reason: 'runtime-stopped' };
    }
    const child = this.spawnProcess(this.executablePath, ['serve'], {
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
      env: {
        ...sanitizedRuntimeEnvironment(),
        OLLAMA_HOST: `${this.host}:${this.port}`,
        OLLAMA_MODELS: this.modelsPath,
        // Il renderer non contatta Ollama direttamente: tutto passa dal main
        // process. Non impostiamo origin custom, che Ollama rifiuta perché il
        // protocollo app:// non è ammesso dalla propria validazione CORS.
        OLLAMA_NOPRUNE: '1',
        OLLAMA_KEEP_ALIVE: this.runtimeTuning?.keepAlive || '10m',
        OLLAMA_FLASH_ATTENTION: '1',
        OLLAMA_MAX_LOADED_MODELS: String(this.runtimeTuning?.maxLoadedModels || 1),
        OLLAMA_NUM_PARALLEL: String(this.runtimeTuning?.parallelRequests || 1),
        OLLAMA_CONTEXT_LENGTH: String(this.runtimeTuning?.contextTokens || 4096)
      }
    });
    this.process = child;
    this.ownedProcess = true;
    child.once('exit', (code, signal) => {
      this.logger?.info('Runtime AI NEXUSNXS terminato.', { code, signal });
      if (this.process === child) {
        this.process = null;
        this.ownedProcess = false;
      }
    });
    child.once('error', (error) => this.logger?.error('Avvio runtime AI NEXUSNXS fallito.', { error }));
    const available = await this.waitUntilReady(20000, generation);
    if (!available) this.stop();
    else this.restartAttempts = 0;
    return { managed: true, available, baseUrl: this.baseUrl, modelsPath: this.modelsPath };
  }

  async ensureHealthy() {
    if (this.disposed) return { available: false, recovered: false, reason: 'runtime-stopped' };
    if (await this.health()) return { available: true, recovered: false };
    if (this.disposed) return { available: false, recovered: false, reason: 'runtime-stopped' };
    if (!this.enabled) return { available: false, recovered: false, reason: 'external-runtime-offline' };
    const now = Date.now();
    const cooldown = Math.min(30_000, 1_500 * (2 ** this.restartAttempts));
    if (now - this.lastRestartAt < cooldown) return { available: false, recovered: false, reason: 'restart-cooldown' };
    this.lastRestartAt = now;
    this.restartAttempts = Math.min(5, this.restartAttempts + 1);
    this.stop();
    this.logger?.warn('Runtime AI non raggiungibile; avvio recupero controllato.', { attempt: this.restartAttempts });
    const result = await this.start();
    if (result.available) this.logger?.info('Runtime AI ripristinato automaticamente.');
    return { available: result.available, recovered: result.available, ...(result.reason ? { reason: result.reason } : {}) };
  }

  // #endregion

  // #region 03 — Arresto controllato

  stop() {
    if (!this.ownedProcess || !this.process) return false;
    const child = this.process;
    this.lifecycleGeneration += 1;
    try {
      this.terminateProcess(child);
    } catch {
      try { child.kill?.('SIGKILL'); } catch { /* Il processo può essere già uscito. */ }
    }
    if (this.process === child) {
      this.process = null;
      this.ownedProcess = false;
    }
    return true;
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    const stopped = this.stop();
    // Invalida anche un eventuale start che si trova ancora nella fase health.
    if (!stopped) this.lifecycleGeneration += 1;
    return stopped;
  }

  // #endregion
}

module.exports = { ManagedOllamaRuntime, sanitizedRuntimeEnvironment };

// #endregion
