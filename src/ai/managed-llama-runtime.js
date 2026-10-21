/**
 * @module ai/managed-llama-runtime
 * @description Lifecycle nativo isolato; la verifica del trasporto non ammette il binario in produzione.
 */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { sanitizedRuntimeEnvironment } = require('./managed-ollama-runtime');
const { spawnSupervisedLlamaProcess, terminateSupervisedLlamaProcess } = require('./native-runtime-supervisor');
const { LlamaCppProvider } = require('./providers/llama-cpp-provider');

// #region 01 — Confini immutabili e verifica del listener

function integer(value, fallback, min, max) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new TypeError('Parametro lifecycle nativo non valido.');
  return result;
}

async function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(error => resolve(!error)));
  });
}

async function withSignal(operation, signal) {
  signal.throwIfAborted();
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation, interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

class ManagedLlamaRuntime {
  #apiKey = randomBytes(32).toString('base64url');
  #probe;
  #startPromise = null;
  #stopPromise = null;
  #recoveryPromise = null;
  #startController = null;
  #closed = new WeakSet();
  #portWasOwned = false;

  constructor(options = {}, dependencies = {}) {
    const usage = options.securityUsage ?? 'distribution';
    if (!['evaluation', 'distribution'].includes(usage)) throw new TypeError('Profilo sicurezza nativo non valido.');
    if (!path.isAbsolute(options.executablePath || '') || !path.isAbsolute(options.modelPath || '')) {
      throw new TypeError('Il runtime nativo richiede percorsi assoluti.');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(options.model || '')) throw new TypeError('Alias modello nativo non valido.');
    const device = options.device ?? 'none';
    if (!/^(?:none|Vulkan\d{1,2})$/u.test(device)) throw new TypeError('Dispositivo nativo non valido.');
    const fixed = {
      enabled: options.enabled === true, securityUsage: usage,
      executablePath: path.resolve(options.executablePath), modelPath: path.resolve(options.modelPath),
      model: options.model, port: integer(options.port, 11436, 1024, 65535),
      contextTokens: integer(options.contextTokens, 4096, 256, 32768),
      reasoningBudget: integer(options.reasoningBudget, -1, -1, 16384),
      threads: integer(options.threads, 4, 1, 64), gpuLayers: integer(options.gpuLayers, 0, 0, 256), device,
      startupTimeoutMs: integer(options.startupTimeoutMs, 60000, 250, 300000),
      stopTimeoutMs: integer(options.stopTimeoutMs, 5000, 100, 30000),
      portReleaseTimeoutMs: integer(options.portReleaseTimeoutMs, 5000, 50, 30000),
      admissionTimeoutMs: integer(options.admissionTimeoutMs, 15000, 250, 300000)
    };
    for (const [key, value] of Object.entries(fixed)) Object.defineProperty(this, key, { value, enumerable: true });
    this.spawnProcess = dependencies.spawnProcess || spawnSupervisedLlamaProcess;
    this.terminateProcess = dependencies.terminateProcess || terminateSupervisedLlamaProcess;
    this.runtimeSecurityCheck = dependencies.runtimeSecurityCheck || (() => { throw new Error('Native admission not configured.'); });
    this.portFree = dependencies.portFree || isPortFree;
    this.logger = dependencies.logger;
    this.process = null;
    this.runtimeAdmitted = false;
    this.disposed = false;
    this.lifecycleGeneration = 0;
    this.restartAttempts = 0;
    this.nextRestartAt = 0;
    this.#probe = new LlamaCppProvider(this.providerConfig(), { fetch: dependencies.fetch || globalThis.fetch });
  }

  get baseUrl() { return `http://127.0.0.1:${this.port}`; }
  // Solo codice trusted: non salvare o inviare questa configurazione a renderer, log o IPC.
  providerConfig() {
    return { chatModel: this.model, llamaCpp: { baseUrl: this.baseUrl, apiKey: this.#apiKey, timeoutMs: 1500 } };
  }
  hasAdmittedProcess() {
    return Boolean(this.runtimeAdmitted && this.process && !this.#closed.has(this.process)
      && this.process.exitCode == null && this.process.signalCode == null);
  }
  state(available, reason) {
    return { managed: this.enabled, available, baseUrl: this.baseUrl, ...(reason ? { reason } : {}) };
  }
  async health() {
    if (this.disposed || !this.hasAdmittedProcess()) return false;
    const child = this.process, generation = this.lifecycleGeneration;
    const status = await this.#probe.health();
    return status.ok === true && !this.disposed && generation === this.lifecycleGeneration
      && child === this.process && this.hasAdmittedProcess();
  }
  arguments(modelPath) {
    return ['--host', '127.0.0.1', '--port', String(this.port), '--model', modelPath, '--alias', this.model,
      '--offline', '--no-webui', '--no-agent', '--no-ui-mcp-proxy', '--no-slots', '--no-mmproj',
      '--ctx-size', String(this.contextTokens), '--parallel', '1', '--threads', String(this.threads),
      '--device', this.device, '--n-gpu-layers', String(this.gpuLayers), '--fit', 'off', '--flash-attn', 'on',
      '--reasoning-format', 'deepseek', '--reasoning', 'on', '--reasoning-budget', String(this.reasoningBudget), '--timeout', '600'];
  }

  // #endregion

  // #region 02 — Avvio singolo, ammissione e cancellazione

  async start() {
    if (this.disposed) return this.state(false, 'runtime-stopped');
    if (!this.enabled) return this.state(false, 'runtime-disabled');
    if (this.#startPromise) return this.#startPromise;
    const controller = new AbortController();
    this.#startController = controller;
    const generation = this.lifecycleGeneration;
    const pending = this.startOwned(generation, controller.signal);
    this.#startPromise = pending;
    try { return await pending; }
    finally {
      if (this.#startPromise === pending) this.#startPromise = null;
      if (this.#startController === controller) this.#startController = null;
    }
  }

  async startOwned(generation, signal) {
    const current = () => !this.disposed && !signal.aborted && generation === this.lifecycleGeneration;
    if (this.#stopPromise) await this.#stopPromise;
    if (!current()) return this.state(false, 'runtime-stopped');
    if (this.process) {
      if (await this.health()) return this.state(true);
      return this.state(false, 'runtime-not-ready');
    }
    if (!await this.waitForPrivatePort(current, signal)) return this.state(false, current() ? 'port-in-use' : 'runtime-stopped');
    if (!current()) return this.state(false, 'runtime-stopped');
    let executablePath, modelPath;
    try {
      executablePath = fs.realpathSync(this.executablePath);
      modelPath = fs.realpathSync(this.modelPath);
      if (!fs.statSync(executablePath).isFile() || !fs.statSync(modelPath).isFile()) throw new Error('Not a file.');
    } catch { return this.state(false, 'runtime-or-model-missing'); }
    try {
      const admissionSignal = AbortSignal.any([signal, AbortSignal.timeout(this.admissionTimeoutMs)]);
      const verdict = await withSignal(Promise.resolve().then(() => this.runtimeSecurityCheck(executablePath, {
        usage: this.securityUsage, host: '127.0.0.1', modelPath, model: this.model,
        signal: admissionSignal
      })), admissionSignal);
      if (verdict?.admitted !== true || verdict.usage !== this.securityUsage
        || verdict.executablePath !== executablePath || verdict.modelPath !== modelPath || verdict.model !== this.model) {
        throw new Error('Native admission not bound to requested artifact.');
      }
    } catch {
      return this.state(false, current() ? 'runtime-security-blocked' : 'runtime-stopped');
    }
    if (!current()) return this.state(false, 'runtime-stopped');
    let child;
    try {
      child = this.spawnProcess(executablePath, this.arguments(modelPath), {
        windowsHide: true, detached: false, shell: false, stdio: 'ignore', cwd: path.dirname(executablePath),
        env: { ...sanitizedRuntimeEnvironment(), LLAMA_API_KEY: this.#apiKey, HF_HUB_OFFLINE: '1' }
      });
    } catch { return this.state(false, 'runtime-spawn-failed'); }
    this.process = child;
    this.runtimeAdmitted = true;
    let spawnFailed = false;
    child.once('error', () => { spawnFailed = true; this.runtimeAdmitted = false; });
    const ended = () => {
      this.#closed.add(child);
      if (this.process === child) { this.process = null; this.runtimeAdmitted = false; }
    };
    // IPC già disconnesso può non emettere close dopo exit. Non ci sono pipe
    // applicative: l'uscita del supervisore conferma che il nativo è terminato.
    child.once('exit', ended);
    child.once('close', ended);
    const deadline = Date.now() + this.startupTimeoutMs;
    while (current() && this.hasAdmittedProcess() && Date.now() < deadline) {
      if (await this.health() && current()) {
        this.#portWasOwned = true;
        this.restartAttempts = 0;
        this.nextRestartAt = 0;
        return this.state(true);
      }
      try { await delay(50, null, { signal }); } catch { break; }
    }
    const reason = !current() ? 'runtime-stopped' : spawnFailed ? 'runtime-spawn-failed' : 'runtime-not-ready';
    // Anche un fallimento di bind può lasciare un figlio vivo: arrestare solo quello creato qui.
    await this.stop();
    return this.state(false, reason);
  }

  async waitForPrivatePort(current, signal) {
    if (await this.portFree(this.port)) return true;
    if (!this.#portWasOwned) return false;
    // Su Windows la chiusura del supervisore può precedere il rilascio del
    // socket del discendente. Aspettare non autorizza a riusare un listener.
    const deadline = Date.now() + this.portReleaseTimeoutMs;
    while (current() && Date.now() < deadline) {
      try { await delay(Math.min(50, Math.max(1, deadline - Date.now())), null, { signal }); }
      catch { return false; }
      if (current() && await this.portFree(this.port)) return true;
    }
    return false;
  }

  // #endregion

  // #region 03 — Arresto atteso e recupero limitato

  async stop() {
    this.lifecycleGeneration += 1;
    this.#startController?.abort();
    this.runtimeAdmitted = false;
    if (this.#stopPromise) return this.#stopPromise;
    const child = this.process;
    if (!child) return true;
    const pending = this.stopOwned(child);
    this.#stopPromise = pending;
    try { return await pending; }
    finally { if (this.#stopPromise === pending) this.#stopPromise = null; }
  }

  async stopOwned(child) {
    if (this.#closed.has(child)) return true;
    let onClose;
    const closed = new Promise(resolve => {
      onClose = () => resolve(true);
      child.once('exit', onClose);
      child.once('close', onClose);
    });
    const wait = async () => {
      let timer;
      try { return await Promise.race([closed, new Promise(resolve => { timer = setTimeout(() => resolve(false), this.stopTimeoutMs); })]); }
      finally { clearTimeout(timer); }
    };
    try {
      try { this.terminateProcess(child); } catch { /* Nessun PID globale o processo non posseduto. */ }
      if (await wait()) return true;
      // Primo invio: chiusura del canale al supervisore. Se non termina in
      // tempo, il secondo forza soltanto il suo albero/gruppo ancora posseduto.
      try { this.terminateProcess(child); } catch { /* Conservare il figlio se anche il force fallisce. */ }
      return await wait();
    } finally { child.removeListener('exit', onClose); child.removeListener('close', onClose); }
  }

  async ensureHealthy({ requireDistribution = false } = {}) {
    if (this.disposed || !this.enabled) return this.state(false, this.disposed ? 'runtime-stopped' : 'runtime-disabled');
    if (requireDistribution && this.securityUsage !== 'distribution') return this.state(false, 'runtime-security-profile');
    if (this.#recoveryPromise) return this.#recoveryPromise;
    const pending = this.recover();
    this.#recoveryPromise = pending;
    try { return await pending; }
    finally { if (this.#recoveryPromise === pending) this.#recoveryPromise = null; }
  }

  async recover() {
    if (await this.health()) return { ...this.state(true), recovered: false };
    if (this.disposed) return this.state(false, 'runtime-stopped');
    // Non interrompere un caricamento che un altro chiamante sta già aspettando.
    if (this.#startPromise) return this.#startPromise;
    if (Date.now() < this.nextRestartAt) return this.state(false, 'restart-cooldown');
    this.restartAttempts = Math.min(this.restartAttempts + 1, 5);
    this.nextRestartAt = Date.now() + Math.min(30000, 1500 * (2 ** (this.restartAttempts - 1)));
    if (!await this.stop()) return this.state(false, 'runtime-stop-failed');
    const result = await this.start();
    return { ...result, recovered: result.available };
  }

  async shutdown() {
    this.disposed = true;
    await this.#probe.shutdown();
    return this.stop();
  }
  // #endregion
}

module.exports = { ManagedLlamaRuntime };
