/**
 * @module voice/qwen3-speech
 * @description Voce Qwen3-TTS locale opzionale (GPU), in streaming e interrompibile,
 * con fallback automatico a Kokoro tramite FallbackSpeechService.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { VramGate, requiredVramMb } = require('./gpu-memory');

const QWEN3_LANGUAGES = Object.freeze(['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zh']);
const QWEN3_MODELS = Object.freeze({ '0.6b': 'Qwen3-TTS-12Hz-0.6B-Base', '1.7b': 'Qwen3-TTS-12Hz-1.7B-Base' });

// #region 01 — Opzione e capability

const QWEN3_RUNTIMES = Object.freeze(['torch', 'gguf']);

/**
 * L'opzione è spenta per impostazione predefinita: serve NEXUS_VOICE_ENGINE=qwen3.
 * NEXUS_QWEN3_RUNTIME sceglie il worker: "torch" (PyTorch ROCm, predefinito) o
 * "gguf" (llama.cpp Vulkan + ONNX DirectML).
 */
function qwen3Option(env = process.env) {
  const enabled = String(env.NEXUS_VOICE_ENGINE || '').trim().toLowerCase() === 'qwen3';
  const size = String(env.NEXUS_QWEN3_SIZE || '0.6b').trim().toLowerCase();
  const runtime = String(env.NEXUS_QWEN3_RUNTIME || 'torch').trim().toLowerCase();
  return { enabled, size: Object.hasOwn(QWEN3_MODELS, size) ? size : '0.6b', runtime: QWEN3_RUNTIMES.includes(runtime) ? runtime : 'torch' };
}

function terminateOwnedProcessTree(child, platform = process.platform, runTaskkill = spawnSync) {
  if (!child) return false;
  if ((child.exitCode !== undefined && child.exitCode !== null)
    || (child.signalCode !== undefined && child.signalCode !== null)) return false;
  if (platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    try {
      const result = runTaskkill('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore', timeout: 5_000 });
      if (result?.status === 0) return true;
    } catch { /* fallback nativo */ }
  }
  try { return typeof child.kill === 'function' && child.kill('SIGKILL') !== false; } catch { return false; }
}

function cancelledError(message = 'Sintesi Qwen3 interrotta.') {
  return Object.assign(new Error(message), { code: 'VOICE_CANCELLED' });
}

function waveFromPcm(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

class Qwen3SpeechService {
  constructor({ runtimeDirectory, workerPath, enabled = false, size = '0.6b', platform = process.platform,
    spawnProcess = spawn, runTaskkill = spawnSync, terminateProcess, cancelGraceMs = 1_500, readyTimeoutMs = 120_000 } = {}) {
    this.runtimeDirectory = runtimeDirectory || '';
    this.workerPath = workerPath || '';
    this.enabled = enabled === true;
    this.size = Object.hasOwn(QWEN3_MODELS, size) ? size : '0.6b';
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.terminateProcess = terminateProcess || ((child) => terminateOwnedProcessTree(child, this.platform, runTaskkill));
    this.cancelGraceMs = cancelGraceMs;
    this.readyTimeoutMs = readyTimeoutMs;
    this.child = null;
    this.ready = false;
    this.sampleRate = 24_000;
    this.buffer = '';
    this.pending = new Map();
    this.readyWaiters = new Set();
    this.disposed = false;
    this.vramGate = null;
  }

  /**
   * VRAM budget (voice/gpu-memory): when the LLM leaves no room, capabilities()
   * reports unavailable so FallbackSpeechService speaks with Kokoro, and an idle
   * worker is closed to give its VRAM back to the LLM.
   */
  attachVramGate(gate) {
    this.vramGate = gate || null;
    if (!gate) return false;
    gate.ownPid = () => this.child?.pid ?? null;
    gate.onChange = (verdict) => {
      if (!verdict.allowed) this.releaseIdleWorker();
      else if (this.enabled && !this.disposed) this.warmUp();
    };
    return gate.start?.() ?? false;
  }

  vramAllowed() { return !this.vramGate || this.vramGate.allowed(); }

  /** Closes the warm worker only when nothing is being synthesized. */
  releaseIdleWorker() {
    const child = this.child;
    if (!child || this.pending.size) return false;
    this.child = null;
    this.ready = false;
    this.terminateProcess(child);
    return true;
  }

  paths() {
    const venv = path.join(this.runtimeDirectory, '.venv');
    return {
      python: path.join(venv, 'Scripts', 'python.exe'),
      worker: this.workerPath || path.join(this.runtimeDirectory, 'worker.py'),
      model: path.join(this.runtimeDirectory, 'models', QWEN3_MODELS[this.size], 'model.safetensors'),
      tokenizer: path.join(this.runtimeDirectory, 'models', QWEN3_MODELS[this.size], 'speech_tokenizer', 'model.safetensors'),
      maleVoice: path.join(this.runtimeDirectory, 'voices', 'nexus-male-reference.wav')
    };
  }

  capabilities() {
    const files = this.paths();
    const installed = this.enabled && !this.disposed && Object.values(files).every((file) => fs.existsSync(file));
    const available = installed && this.vramAllowed();
    return { available, backend: available ? 'qwen3-tts' : null, local: true, streaming: true, model: QWEN3_MODELS[this.size],
      genders: ['male', 'female'], languages: [...QWEN3_LANGUAGES],
      ...(installed && !available ? { unavailableReason: `vram-${this.vramGate?.verdict?.reason || 'full'}` } : {}) };
  }

  // #endregion

  // #region 02 — Worker JSONL

  /** Variabili aggiuntive per il worker (le sottoclassi le estendono). */
  workerEnv() { return {}; }

  /** Interpreter arguments: isolated mode, plus the pack's site-packages when present. */
  workerArgs(files) {
    if (!files.sitePackages) return ['-I', files.worker];
    // -I ignores PYTHONPATH and PYTHONDONTWRITEBYTECODE: -B keeps the verified
    // pack free of __pycache__, site.addsitedir also honours its .pth files.
    return ['-I', '-B', '-c',['import runpy,site', `site.addsitedir(${JSON.stringify(files.sitePackages)})`,
      `runpy.run_path(${JSON.stringify(files.worker)},run_name='__main__')`].join(';')];
  }

  ensureWorker() {
    if (this.disposed) throw new Error('Sintesi Qwen3 terminata.');
    if (this.child && !this.child.killed) return this.child;
    if (!this.capabilities().available) throw new Error('Voce Qwen3 non disponibile.');
    const files = this.paths();
    this.buffer = '';
    this.ready = false;
    const child = this.spawnProcess(files.python, this.workerArgs(files), {
      cwd: this.runtimeDirectory,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        // HIP/ROCm and PyTorch keep compiled-kernel caches under the user
        // profile: without these paths every start recompiles and stalls.
        USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        APPDATA: process.env.APPDATA,
        PATH: [path.dirname(files.python), path.join(this.runtimeDirectory, '.venv', 'Scripts'), path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')].join(path.delimiter),
        PYTHONDONTWRITEBYTECODE: '1',
        NEXUS_QWEN3_ROOT: this.runtimeDirectory,
        NEXUS_QWEN3_SIZE: this.size,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_HUB_DISABLE_TELEMETRY: '1',
        TOKENIZERS_PARALLELISM: 'false',
        ...this.workerEnv()
      }
    });
    this.child = child;
    child.stdout.on('data', (chunk) => this.consume(chunk, child));
    child.stderr.on('data', () => {});
    child.once('error', () => this.failWorker(child, 'Voce Qwen3 non disponibile.'));
    child.once('exit', () => this.failWorker(child, 'Sintesi Qwen3 interrotta.'));
    return child;
  }

  warmUp() {
    if (!this.capabilities().available) return false;
    try { this.ensureWorker(); return true; } catch { return false; }
  }

  failWorker(child, message) {
    if (this.child === child) { this.child = null; this.ready = false; }
    for (const waiter of [...this.readyWaiters]) {
      if (waiter.child !== child) continue;
      clearTimeout(waiter.timer);
      this.readyWaiters.delete(waiter);
      waiter.reject(new Error(message));
    }
    this.rejectPending(child, () => new Error(message));
  }

  rejectPending(child, makeError) {
    let rejected = false;
    for (const [id, request] of this.pending) {
      if (child && request.child !== child) continue;
      this.pending.delete(id);
      clearTimeout(request.timer);
      clearTimeout(request.cancelTimer);
      try { fs.unlinkSync(request.output); } catch {}
      request.reject(makeError(request));
      rejected = true;
    }
    return rejected;
  }

  consume(chunk, child = null) {
    if (child && this.child !== child) return;
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'ready') {
        this.ready = true;
        if (Number.isInteger(event.sampleRate) && event.sampleRate >= 8_000) this.sampleRate = event.sampleRate;
        this.readyInfo = { vramReservedMb: event.vramReservedMb, gpuFreeMb: event.gpuFreeMb, model: event.model };
        for (const waiter of [...this.readyWaiters]) {
          if (waiter.child !== child && child) continue;
          clearTimeout(waiter.timer);
          this.readyWaiters.delete(waiter);
          waiter.resolve();
        }
        continue;
      }
      const request = this.pending.get(event.id);
      if (!request) continue;
      if (event.type === 'chunk') {
        if (request.cancelled || typeof event.pcm !== 'string') continue;
        const pcm = Buffer.from(event.pcm, 'base64');
        request.bytes += pcm.length;
        if (request.firstChunkAt === null) request.firstChunkAt = performance.now();
        try { request.onChunk?.({ backend: 'qwen3-tts', mimeType: 'audio/wav', audio: waveFromPcm(pcm, this.sampleRate), seq: event.seq }); } catch {}
        continue;
      }
      this.pending.delete(event.id);
      clearTimeout(request.timer);
      clearTimeout(request.cancelTimer);
      if (event.ok) {
        const metrics = {};
        for (const key of ['firstChunkMs', 'totalMs', 'audioMs', 'vramReservedMb', 'vramPeakMb', 'gpuFreeMb']) {
          if (Number.isFinite(event[key])) metrics[key] = event[key];
        }
        request.resolve({ output: request.output, metrics });
      }
      else {
        try { fs.unlinkSync(request.output); } catch {}
        request.reject(request.cancelled || event.cancelled ? cancelledError() : new Error('Sintesi Qwen3 non riuscita.'));
      }
    }
  }

  waitUntilReady(child) {
    if (this.ready && this.child === child) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, child, timer: null };
      waiter.timer = setTimeout(() => {
        this.readyWaiters.delete(waiter);
        reject(new Error('Avvio della voce Qwen3 troppo lento.'));
      }, this.readyTimeoutMs);
      waiter.timer.unref?.();
      this.readyWaiters.add(waiter);
    });
  }

  // #endregion

  // #region 03 — Sintesi in streaming e barge-in

  async synthesize({ text, gender = 'male', language = 'it', onChunk } = {}) {
    if (this.disposed) throw new Error('Sintesi Qwen3 terminata.');
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('Testo vocale mancante.');
    if (clean.length > 520) throw new Error('Segmento vocale troppo lungo.');
    if (!QWEN3_LANGUAGES.includes(language)) throw new Error('Lingua non supportata da Qwen3.');
    if (this.pending.size) this.stop();
    const child = this.ensureWorker();
    try { await this.waitUntilReady(child); }
    catch (error) {
      if (this.child === child) { this.terminateProcess(child); this.child = null; this.ready = false; }
      throw error;
    }
    const id = randomUUID();
    const output = path.join(os.tmpdir(), `nexus-qwen3-${id}.wav`);
    const startedAt = performance.now();
    const result = await new Promise((resolve, reject) => {
      const request = { resolve, reject, child, output, onChunk, bytes: 0, firstChunkAt: null, cancelled: false, timer: null, cancelTimer: null };
      request.timer = setTimeout(() => {
        this.pending.delete(id);
        if (this.child === child) { this.terminateProcess(child); this.child = null; this.ready = false; }
        try { fs.unlinkSync(output); } catch {}
        reject(new Error('Sintesi Qwen3 troppo lenta.'));
      }, Math.min(60_000, 15_000 + clean.length * 60));
      request.timer.unref?.();
      this.pending.set(id, request);
      child.stdin.write(`${JSON.stringify({ id, text: clean, language, gender: gender === 'female' ? 'female' : 'male', output })}\n`);
    });
    try {
      const audio = fs.readFileSync(result.output);
      if (audio.length <= 44 || audio.length > 32 * 1024 * 1024) throw new Error('Audio Qwen3 non valido.');
      return { backend: 'qwen3-tts', mimeType: 'audio/wav', audio, metrics: { ...result.metrics, wallMs: Math.round(performance.now() - startedAt) } };
    } finally {
      try { fs.unlinkSync(result.output); } catch {}
    }
  }

  /** Barge-in: il worker resta caldo; se non conferma entro la grazia viene terminato. */
  stop() {
    const child = this.child;
    let active = false;
    for (const [id, request] of this.pending) {
      if (request.cancelled) { active = true; continue; }
      request.cancelled = true;
      active = true;
      try { child?.stdin?.write(`${JSON.stringify({ type: 'cancel', id })}\n`); } catch {}
      request.cancelTimer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        if (this.child === request.child) { this.terminateProcess(request.child); this.child = null; this.ready = false; }
        this.rejectPending(request.child, () => cancelledError());
      }, this.cancelGraceMs);
      request.cancelTimer.unref?.();
    }
    return active;
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    this.vramGate?.stop?.();
    const child = this.child;
    this.rejectPending(null, () => new Error('Sintesi Qwen3 terminata.'));
    if (child) this.terminateProcess(child);
    this.child = null;
    this.ready = false;
    return Boolean(child);
  }
}

// #endregion

// #region 04 — Runtime GGUF (llama.cpp Vulkan + ONNX DirectML)

/**
 * Same interface and JSONL protocol as Qwen3SpeechService, on the GGUF runtime:
 * talker/predictor on llama.cpp Vulkan, codec decoder on ONNX Runtime DirectML.
 * Misurato su RX 9070 XT: RTF 0,18 / 1,2 GB (0.6B), 0,21 / 1,7 GB (1.7B)
 * (docs/QWEN3-TTS-EVALUATION.md). The runtime directory holds `.venv`
 * (Python 3.14 + onnxruntime-directml), `src/qwen3_tts_gguf` with the llama.cpp
 * DLLs in `inference/bin`, and the exports in `models/<model>`.
 */
class Qwen3GgufSpeechService extends Qwen3SpeechService {
  constructor({ voicesDirectory, pythonExecutable, sitePackages, onnxProvider = 'DML', vulkanDevices = '0', ...options } = {}) {
    super(options);
    this.voicesDirectory = voicesDirectory || path.join(this.runtimeDirectory, 'voices');
    // Voice pack (voice/voice-pack): its own CPython and site-packages instead of a local venv.
    this.pythonExecutable = pythonExecutable || '';
    this.sitePackages = sitePackages || '';
    this.onnxProvider = ['DML', 'CPU'].includes(onnxProvider) ? onnxProvider : 'DML';
    // llama.cpp would otherwise split the layers across every Vulkan device,
    // integrated GPU included (Ryzen 9800X3D + RX 9070 XT).
    this.vulkanDevices = /^\d+(,\d+)*$/.test(String(vulkanDevices)) ? String(vulkanDevices) : '0';
  }

  paths() {
    const venv = path.join(this.runtimeDirectory, '.venv');
    const model = path.join(this.runtimeDirectory, 'models', QWEN3_MODELS[this.size]);
    return {
      python: this.pythonExecutable || path.join(venv, 'Scripts', 'python.exe'),
      ...(this.sitePackages ? { sitePackages: this.sitePackages } : {}),
      worker: this.workerPath || path.join(this.runtimeDirectory, 'worker.py'),
      llama: path.join(this.runtimeDirectory, 'src', 'qwen3_tts_gguf', 'inference', 'bin', 'llama.dll'),
      talker: path.join(model, 'qwen3_tts_talker.q5_k.gguf'),
      predictor: path.join(model, 'qwen3_tts_predictor.q8_0.gguf'),
      decoder: path.join(model, 'qwen3_tts_decoder.fp16.onnx'),
      codecEncoder: path.join(model, 'qwen3_tts_codec_encoder.fp16.onnx'),
      speakerEncoder: path.join(model, 'qwen3_tts_speaker_encoder.fp16.onnx'),
      tokenizer: path.join(model, 'tokenizer.json'),
      maleVoice: path.join(this.voicesDirectory, 'nexus-male-reference.wav')
    };
  }

  capabilities() {
    return { ...super.capabilities(), runtime: 'gguf' };
  }

  workerEnv() {
    return { NEXUS_QWEN3_VOICES: this.voicesDirectory, NEXUS_QWEN3_ONNX_PROVIDER: this.onnxProvider, GGML_VK_VISIBLE_DEVICES: this.vulkanDevices };
  }
}

/** Builds the worker requested by qwen3Option().runtime. */
/**
 * Builds the worker requested by qwen3Option().runtime. When enabled it also
 * attaches the VRAM budget: Kokoro speaks whenever the LLM leaves no room
 * (owner's choice, 12/11/2026). `vramGate: false` disables it; a gate object
 * replaces the default one (tests).
 */
function createQwen3SpeechService({ runtime = 'torch', vramGate, ...options } = {}) {
  const service = runtime === 'gguf' ? new Qwen3GgufSpeechService(options) : new Qwen3SpeechService(options);
  if (vramGate === false || !service.enabled) return service;
  service.attachVramGate(vramGate || new VramGate({ requiredMb: requiredVramMb(runtime === 'gguf' ? 'gguf' : 'torch', service.size),
    platform: service.platform }));
  return service;
}

// #endregion

// #region 05 — Fallback automatico a Kokoro

/** Stessa interfaccia di NeuralSpeechService: Qwen3 se pronto, altrimenti Kokoro. */
class FallbackSpeechService {
  constructor({ primary, fallback, failureLimit = 2, cooldownMs = 5 * 60_000, now = () => Date.now() } = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.failureLimit = failureLimit;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.disabledUntil = 0;
    this.lastBackend = null;
  }

  get runtimeDirectory() { return this.fallback?.runtimeDirectory; }
  get workerPath() { return this.fallback?.workerPath; }

  primaryUsable(language) {
    if (this.now() < this.disabledUntil) return false;
    const caps = this.primary?.capabilities?.() || {};
    return caps.available === true && (caps.languages || []).includes(language);
  }

  capabilities() {
    const fallback = this.fallback?.capabilities?.() || { available: false, languages: [] };
    const primary = this.primary?.capabilities?.() || { available: false, languages: [] };
    const primaryReady = primary.available === true && this.now() >= this.disabledUntil;
    const languages = [...new Set([...(fallback.available ? fallback.languages || [] : []), ...(primaryReady ? primary.languages || [] : [])])].sort();
    return { ...fallback, available: Boolean(fallback.available || primaryReady), backend: primaryReady ? primary.backend : fallback.backend,
      fallbackBackend: fallback.available ? fallback.backend : null, streaming: primaryReady, languages };
  }

  async synthesize(options = {}) {
    const language = String(options.language || 'it');
    const forward = typeof options.onChunk === 'function' ? options.onChunk : null;
    const { onChunk: _ignored, ...plain } = options;
    if (this.primaryUsable(language)) {
      let emitted = 0;
      try {
        const result = await this.primary.synthesize(forward
          ? { ...plain, onChunk: (chunk) => { emitted += 1; forward(chunk); } }
          : plain);
        this.failures = 0;
        this.lastBackend = result.backend;
        return result;
      } catch (error) {
        if (error?.code === 'VOICE_CANCELLED') throw error;
        this.failures += 1;
        if (this.failures >= this.failureLimit) { this.disabledUntil = this.now() + this.cooldownMs; this.failures = 0; }
        // Part of the sentence was already heard: repeating it with Kokoro would
        // say it twice. The caller falls back to the next segment instead.
        if (emitted > 0) throw error;
      }
    }
    const result = await this.fallback.synthesize(plain);
    this.lastBackend = result?.backend || null;
    // In streaming the renderer receives every segment as a block, Kokoro too.
    if (forward && result?.audio) forward({ ...result, seq: 0 });
    return result;
  }

  warmUp() {
    const primary = this.primary?.warmUp?.() || false;
    const fallback = this.fallback?.warmUp?.() || false;
    return primary || fallback;
  }

  stop() {
    const primary = this.primary?.stop?.() || false;
    const fallback = this.fallback?.stop?.() || false;
    return primary || fallback;
  }

  shutdown() {
    const primary = this.primary?.shutdown?.() || false;
    const fallback = this.fallback?.shutdown?.() || false;
    return primary || fallback;
  }
}

// #endregion

module.exports = { QWEN3_LANGUAGES, QWEN3_MODELS, QWEN3_RUNTIMES, Qwen3SpeechService, Qwen3GgufSpeechService, FallbackSpeechService,
  createQwen3SpeechService, qwen3Option, waveFromPcm };
