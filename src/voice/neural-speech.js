/**
 * @module voice/neural-speech
 * @description Sintesi Kokoro ONNX locale isolata, rapida e con limiti.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const KOKORO_LANGUAGES = Object.freeze(['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh']);

// #region 01 — Configurazione e capability

function addWavePreroll(audio, milliseconds = 140) {
  if (!Buffer.isBuffer(audio) || audio.length < 44
    || audio.toString('ascii', 0, 4) !== 'RIFF'
    || audio.toString('ascii', 8, 12) !== 'WAVE') return audio;

  let offset = 12;
  let formatOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= audio.length) {
    const chunkName = audio.toString('ascii', offset, offset + 4);
    const chunkSize = audio.readUInt32LE(offset + 4);
    if (chunkName === 'fmt ') formatOffset = offset + 8;
    if (chunkName === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, audio.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (formatOffset < 0 || dataOffset < 0 || formatOffset + 22 > audio.length) return audio;

  const sampleRate = audio.readUInt32LE(formatOffset + 4);
  const blockAlign = audio.readUInt16LE(formatOffset + 12);
  if (!sampleRate || !blockAlign) return audio;
  const prerollSize = Math.round(sampleRate * Math.max(0, milliseconds) / 1000) * blockAlign;
  if (!prerollSize) return audio;

  const result = Buffer.alloc(audio.length + prerollSize);
  audio.copy(result, 0, 0, dataOffset);
  audio.copy(result, dataOffset + prerollSize, dataOffset, dataOffset + dataSize);
  audio.copy(result, dataOffset + prerollSize + dataSize, dataOffset + dataSize);
  result.writeUInt32LE(dataSize + prerollSize, dataOffset - 4);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
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

class NeuralSpeechService {
  constructor({ runtimeDirectory, pythonRuntimeDirectory, platform = process.platform, spawnProcess = spawn, runTaskkill = spawnSync, terminateProcess } = {}) {
    this.runtimeDirectory = runtimeDirectory || '';
    this.pythonRuntimeDirectory = pythonRuntimeDirectory || '';
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.terminateProcess = terminateProcess || ((child) => terminateOwnedProcessTree(child, this.platform, runTaskkill));
    this.child = null;
    this.pending = new Map();
    this.buffer = '';
    this.ready = false;
    this.readyWaiters = new Set();
    this.inflightSynthesis = new Map();
    this.audioCache = new Map();
    this.audioCacheBytes = 0;
    this.audioCacheLimitBytes = 24 * 1024 * 1024;
    this.diagnostic = '';
    this.disposed = false;
  }

  paths() {
    const windowlessPython = path.join(this.pythonRuntimeDirectory, 'pythonw.exe');
    return {
      python: process.platform === 'win32' && fs.existsSync(windowlessPython) ? windowlessPython : path.join(this.pythonRuntimeDirectory, 'python.exe'),
      sitePackages: path.join(this.runtimeDirectory, '.venv', 'Lib', 'site-packages'),
      worker: path.join(this.runtimeDirectory, 'worker.py'),
      model: path.join(this.runtimeDirectory, 'models', 'kokoro-v1.0.onnx'),
      voices: path.join(this.runtimeDirectory, 'models', 'voices-v1.0.bin')
    };
  }

  capabilities() {
    const files = this.paths();
    const available = [files.python, files.sitePackages, files.worker, files.model, files.voices].every(fs.existsSync);
    return { available, backend: available ? 'kokoro-onnx' : null, local: true, genders: ['male', 'female'], languages: [...KOKORO_LANGUAGES] };
  }

  cancelRequests(child, message = 'Sintesi neurale interrotta.') {
    let cancelled = false;
    for (const [id, request] of this.pending) {
      if (child && request.child !== child) continue;
      clearTimeout(request.timer);
      try { fs.unlinkSync(request.output); } catch {}
      request.reject(new Error(message));
      this.pending.delete(id);
      cancelled = true;
    }
    return cancelled;
  }

  settleReadyWaiters(error = null, child = null) {
    for (const waiter of this.readyWaiters) {
      if (child && waiter.child !== child) continue;
      clearTimeout(waiter.timer);
      if (error) waiter.reject(error);
      else waiter.resolve();
      this.readyWaiters.delete(waiter);
    }
  }

  // #endregion

  // #region 02 — Processo isolato e protocollo JSONL

  ensureWorker() {
    if (this.disposed) throw new Error('Sintesi neurale terminata.');
    if (this.child && !this.child.killed) return this.child;
    const files = this.paths();
    if (!this.capabilities().available) throw new Error('Voce neurale locale non disponibile.');
    // Un processo terminato può aver lasciato una riga JSON incompleta. Il
    // protocollo del nuovo worker deve sempre iniziare da un buffer vuoto.
    this.buffer = '';
    const safeEnvironment = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PATH: [this.pythonRuntimeDirectory, path.join(this.runtimeDirectory, '.venv', 'Scripts')].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: '1',
      OMP_NUM_THREADS: '4',
      ORT_NUM_THREADS: '4'
    };
    const bootstrap = [
      'import runpy,sys',
      `sys.path.insert(0,${JSON.stringify(files.sitePackages)})`,
      `runpy.run_path(${JSON.stringify(files.worker)},run_name='__main__')`
    ].join(';');
    const child = this.spawnProcess(files.python, ['-I', '-c', bootstrap], {
      cwd: this.runtimeDirectory,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: safeEnvironment
    });
    this.child = child;
    this.ready = false;
    // Ogni callback resta associata al worker che l'ha emessa. Dopo uno stop
    // Windows può consegnare ancora stdout/exit del processo precedente: tali
    // eventi non devono sbloccare o interrompere il worker appena ricreato.
    child.stdout.on('data', (chunk) => this.consume(chunk, child));
    child.stderr.on('data', (chunk) => {
      // Conserva soltanto una coda locale limitata per la diagnostica. Non
      // viene mai inviata al renderer né inclusa nei messaggi pubblici.
      this.diagnostic = `${this.diagnostic}${chunk}`.slice(-16_384);
    });
    child.once('error', () => {
      if (this.child === child) {
        this.child = null;
        this.ready = false;
      }
      this.settleReadyWaiters(new Error('Sintesi neurale non disponibile.'), child);
      this.cancelRequests(child, 'Sintesi neurale non disponibile.');
    });
    child.once('exit', () => {
      if (this.child === child) {
        this.child = null;
        this.ready = false;
      }
      this.settleReadyWaiters(new Error('Sintesi neurale interrotta.'), child);
      this.cancelRequests(child);
    });
    return child;
  }

  warmUp() {
    if (this.disposed) return false;
    if (!this.capabilities().available) return false;
    try {
      this.ensureWorker();
      return true;
    } catch {
      return false;
    }
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
        this.settleReadyWaiters(null, child);
        continue;
      }
      const request = this.pending.get(event.id);
      if (!request) continue;
      this.pending.delete(event.id);
      clearTimeout(request.timer);
      if (!event.ok) {
        try { fs.unlinkSync(request.output); } catch {}
        request.reject(new Error('Sintesi neurale non riuscita.'));
      }
      else request.resolve(request.output);
    }
  }

  // #endregion

  // #region 03 — Sintesi, limiti e arresto

  waitUntilReady(child, timeoutMs = 45_000) {
    if (this.ready && this.child === child) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null, child };
      waiter.timer = setTimeout(() => {
        this.readyWaiters.delete(waiter);
        reject(new Error('Avvio della voce neurale troppo lento.'));
      }, timeoutMs);
      this.readyWaiters.add(waiter);
    });
  }

  async synthesize({ text, gender = 'male', language = 'it', delivery = 'neutral' } = {}) {
    if (this.disposed) throw new Error('Sintesi neurale terminata.');
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 520);
    if (!clean) throw new Error('Testo vocale mancante.');
    const safeDelivery = ['neutral', 'warm', 'calm', 'serious', 'energetic'].includes(delivery) ? delivery : 'neutral';
    const signature = `${language}\u0000${gender}\u0000${safeDelivery}\u0000${clean}`;
    const cached = this.audioCache.get(signature);
    if (cached) {
      // LRU: reinserire porta l'elemento in fondo senza duplicare memoria.
      this.audioCache.delete(signature);
      this.audioCache.set(signature, cached);
      return cached;
    }
    const existing = this.inflightSynthesis.get(signature);
    if (existing) return existing;
    const task = this.synthesizeWithRecovery({ clean, gender, language, delivery: safeDelivery });
    this.inflightSynthesis.set(signature, task);
    try {
      const result = await task;
      const bytes = Number(result?.audio?.byteLength || 0);
      if (bytes > 0 && bytes <= 8 * 1024 * 1024) {
        this.audioCache.set(signature, result);
        this.audioCacheBytes += bytes;
        while (this.audioCacheBytes > this.audioCacheLimitBytes && this.audioCache.size > 1) {
          const oldestKey = this.audioCache.keys().next().value;
          const oldest = this.audioCache.get(oldestKey);
          this.audioCache.delete(oldestKey);
          this.audioCacheBytes -= Number(oldest?.audio?.byteLength || 0);
        }
      }
      return result;
    } finally {
      if (this.inflightSynthesis.get(signature) === task) this.inflightSynthesis.delete(signature);
    }
  }

  async synthesizeWithRecovery(options) {
    try {
      return await this.synthesizeOnce(options);
    } catch (error) {
      if (/interrotta|mancante|non disponibile/i.test(String(error?.message || error))) throw error;
      this.terminateWorker('Sintesi neurale interrotta.');
      return this.synthesizeOnce(options);
    }
  }

  async synthesizeOnce({ clean, gender, language, delivery }) {
    // Politica last-one-wins: una risposta nuova sostituisce quella ancora in
    // sintesi. In questo modo il worker non crea una coda che sembra un blocco.
    if (this.pending.size) this.stop();
    const id = randomUUID();
    const output = path.join(os.tmpdir(), `nexus-tts-${id}.wav`);
    const child = this.ensureWorker();
    // La prima richiesta attende una sola volta il cold start: non richiede un
    // secondo clic e non lascia un worker orfano dopo un falso errore.
    try {
      await this.waitUntilReady(child);
    } catch (error) {
      if (this.child === child) {
        this.terminateProcess(child);
        if (this.child === child) this.child = null;
        this.ready = false;
      }
      throw error;
    }
    const outputPath = await new Promise((resolve, reject) => {
      const timeoutMs = Math.min(25_000, 12_000 + clean.length * 15);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (this.child === child) {
          this.terminateProcess(child);
          if (this.child === child) this.child = null;
        }
        try { fs.unlinkSync(output); } catch {}
        reject(new Error('Sintesi neurale troppo lenta.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, output, child });
      child.stdin.write(`${JSON.stringify({ id, text: clean, language, gender, delivery, output })}\n`);
    });
    try {
      const audio = fs.readFileSync(outputPath);
      if (!audio.length || audio.length > 32 * 1024 * 1024) throw new Error('Audio neurale non valido.');
      // Alcuni driver USB/Bluetooth perdono o spezzano il primo fonema mentre
      // riattivano l'uscita. Un preroll silenzioso PCM rende l'attacco stabile
      // senza rallentare la sintesi o dipendere dall'hardware installato.
      return { backend: 'kokoro-onnx', mimeType: 'audio/wav', audio: addWavePreroll(audio) };
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }

  stop() {
    const child = this.child;
    const cancelled = this.cancelRequests(child || undefined);
    const wasStarting = this.readyWaiters.size > 0;
    if (wasStarting) this.settleReadyWaiters(new Error('Sintesi neurale interrotta.'));
    if (!child) return cancelled || wasStarting;
    // Un worker caldo ma inattivo resta disponibile. Lo stop deve terminare
    // soltanto un'inferenza realmente in corso, non reintrodurre il cold start.
    if (!cancelled && !wasStarting) return false;
    this.ready = false;
    this.buffer = '';
    this.terminateProcess(child);
    if (this.child === child) this.child = null;
    return true;
  }

  terminateWorker(message = 'Sintesi neurale terminata.') {
    const child = this.child;
    this.ready = false;
    this.buffer = '';
    const waiting = this.readyWaiters.size > 0;
    this.settleReadyWaiters(new Error(message));
    const cancelled = this.cancelRequests(null, message);
    if (child) this.terminateProcess(child);
    if (this.child === child) this.child = null;
    return Boolean(child) || waiting || cancelled;
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    this.audioCache.clear();
    this.audioCacheBytes = 0;
    return this.terminateWorker('Sintesi neurale terminata.');
  }
}

module.exports = { KOKORO_LANGUAGES, NeuralSpeechService, addWavePreroll };

// #endregion
