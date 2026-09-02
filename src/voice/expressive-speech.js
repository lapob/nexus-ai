/**
 * @module voice/expressive-speech
 * @description Sintesi Chatterbox locale espressiva, opzionale e isolata.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const CHATTERBOX_LANGUAGES = Object.freeze([
  'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja',
  'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh'
]);

// #region 01 — Runtime e capability

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

class ExpressiveSpeechService {
  constructor({ runtimeDirectory, pythonRuntimeDirectory, enabled = true, platform = process.platform, spawnProcess = spawn, runTaskkill = spawnSync, terminateProcess } = {}) {
    this.runtimeDirectory = runtimeDirectory || '';
    this.pythonRuntimeDirectory = pythonRuntimeDirectory || '';
    this.enabled = enabled;
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.terminateProcess = terminateProcess || ((child) => terminateOwnedProcessTree(child, this.platform, runTaskkill));
    this.child = null;
    this.pending = new Map();
    this.buffer = '';
    this.disposed = false;
  }

  paths(gender = 'male') {
    const windowlessPython = path.join(this.pythonRuntimeDirectory, 'pythonw.exe');
    return {
      python: process.platform === 'win32' && fs.existsSync(windowlessPython) ? windowlessPython : path.join(this.pythonRuntimeDirectory, 'python.exe'),
      sitePackages: path.join(this.runtimeDirectory, '.venv', 'Lib', 'site-packages'),
      worker: path.join(this.runtimeDirectory, 'worker.py'),
      modelCache: path.join(this.runtimeDirectory, 'models', 'hub'),
      reference: path.join(this.runtimeDirectory, 'voices', gender === 'female'
        ? 'nexus-female-reference.wav'
        : 'nexus-male-reference.wav')
    };
  }

  capabilities() {
    const male = this.paths('male');
    const female = this.paths('female');
    const available = this.enabled && [
      male.python, male.sitePackages, male.worker, male.modelCache
    ].every(fs.existsSync);
    return {
      available,
      backend: available ? 'chatterbox-multilingual' : null,
      local: true,
      recommended: this.enabled,
      customReferences: {
        male: fs.existsSync(male.reference),
        female: fs.existsSync(female.reference)
      },
      genders: ['male', 'female'],
      languages: [...CHATTERBOX_LANGUAGES]
    };
  }

  // #endregion

  // #region 02 — Worker JSONL

  ensureWorker() {
    if (this.disposed) throw new Error('Sintesi espressiva terminata.');
    if (this.child && !this.child.killed) return this.child;
    const files = this.paths();
    if (!this.capabilities().available) throw new Error('Voce espressiva non disponibile su questo computer.');
    this.buffer = '';
    const bootstrap = [
      'import runpy,sys',
      `sys.path.insert(0,${JSON.stringify(files.sitePackages)})`,
      `runpy.run_path(${JSON.stringify(files.worker)},run_name='__main__')`
    ].join(';');
    const child = this.spawnProcess(files.python, ['-I', '-c', bootstrap], {
      cwd: this.runtimeDirectory,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: [this.pythonRuntimeDirectory, path.join(this.runtimeDirectory, '.venv', 'Scripts')].join(path.delimiter),
        PYTHONDONTWRITEBYTECODE: '1',
        HF_HOME: path.dirname(files.modelCache),
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_HUB_DISABLE_TELEMETRY: '1',
        TOKENIZERS_PARALLELISM: 'false'
      }
    });
    this.child = child;
    child.stdout.on('data', (chunk) => this.consume(chunk, child));
    child.stderr.on('data', () => {});
    child.once('error', () => this.failWorker(child, 'Voce espressiva non disponibile.'));
    child.once('exit', () => this.failWorker(child, 'Sintesi espressiva interrotta.'));
    return child;
  }

  consume(chunk, child = null) {
    // Gli ultimi eventi del processo terminato possono arrivare dopo la
    // creazione del successivo: non devono contaminare il suo protocollo JSONL.
    if (child && this.child !== child) return;
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const request = this.pending.get(event.id);
      if (!request) continue;
      this.pending.delete(event.id);
      clearTimeout(request.timer);
      if (!event.ok) request.reject(new Error('Sintesi espressiva non riuscita.'));
      else request.resolve(request.output);
    }
  }

  failWorker(child, message) {
    if (this.child === child) this.child = null;
    return this.cancelRequests(child, message);
  }

  cancelRequests(child = null, message = 'Sintesi espressiva interrotta.') {
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

  // #endregion

  // #region 03 — Sintesi e stop

  async synthesize({ text, gender = 'male', language = 'it' } = {}) {
    if (this.disposed) throw new Error('Sintesi espressiva terminata.');
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 520);
    if (!clean) throw new Error('Testo vocale mancante.');
    if (this.pending.size) this.stop();
    const id = randomUUID();
    const output = path.join(os.tmpdir(), `nexus-expressive-${id}.wav`);
    const child = this.ensureWorker();
    const outputPath = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        try { fs.unlinkSync(output); } catch {}
        if (this.child === child) {
          this.terminateProcess(child);
          if (this.child === child) this.child = null;
        }
        reject(new Error('Sintesi espressiva troppo lenta.'));
      }, 120_000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, output, child });
      child.stdin.write(`${JSON.stringify({
        id,
        text: clean,
        language,
        reference: fs.existsSync(this.paths(gender).reference) ? this.paths(gender).reference : null,
        output
      })}\n`);
    });
    try {
      const audio = fs.readFileSync(outputPath);
      if (!audio.length || audio.length > 64 * 1024 * 1024) throw new Error('Audio espressivo non valido.');
      return { backend: 'chatterbox-multilingual', mimeType: 'audio/wav', audio };
    } finally {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }

  stop() {
    const child = this.child;
    if (!child) return false;
    const active = [...this.pending.values()].some((request) => request.child === child);
    if (!active) return false;
    this.buffer = '';
    this.terminateProcess(child);
    if (this.child === child) this.child = null;
    this.failWorker(child, 'Sintesi espressiva interrotta.');
    return true;
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    const child = this.child;
    this.buffer = '';
    const cancelled = this.cancelRequests(null, 'Sintesi espressiva terminata.');
    if (child) this.terminateProcess(child);
    if (this.child === child) this.child = null;
    return Boolean(child) || cancelled;
  }
}

module.exports = { CHATTERBOX_LANGUAGES, ExpressiveSpeechService };

// #endregion
