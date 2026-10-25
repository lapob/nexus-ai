/** @module voice/resident-transcriber Owned CPU ASR candidate for isolated evaluation. */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { hashFile } = require('../ai/native-runtime-inventory');
const { spawnSupervisedLlamaProcess, terminateSupervisedLlamaProcess } = require('../ai/native-runtime-supervisor');
const { pcmWave } = require('./speech-segments');
const { LANGUAGE_PATTERN, normalizeTranscript, whisperLanguage } = require('./native-speech');
const { NexusError } = require('../core/errors');
const manifest = require('../../config/whisper-runtime.json');

// #region Integrity and bounded protocol
function failure(code, message = 'Il riconoscimento vocale locale non è disponibile.') {
  return new NexusError(message, { code, publicMessage: message });
}
function cancelled() { return failure('VOICE_CANCELLED', 'Trascrizione annullata.'); }
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const port = server.address().port; server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function portFree(port) {
  return new Promise(resolve => {
    const server = net.createServer(); server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}
async function verifyResidentFiles(directory, signal, policy = manifest) {
  const root = await fs.promises.realpath(directory);
  if (!policy.residentFiles || !Object.hasOwn(policy.residentFiles, 'whisper-server.exe')) throw failure('VOICE_INTEGRITY_FAILED');
  const files = { ...policy.residentFiles, [policy.model.file]: policy.model.sha256 };
  // ggml discovers CPU backends dynamically. Reject unknown neighboring DLLs,
  // rather than only hashing the most obvious direct dependency.
  for (const name of await fs.promises.readdir(root)) {
    if (/\.dll$/i.test(name) && !Object.hasOwn(files, name)) throw failure('VOICE_INTEGRITY_FAILED');
  }
  for (const [name, expected] of Object.entries(files)) {
    signal?.throwIfAborted();
    if (!/^[a-zA-Z0-9.-]+$/.test(name) || !/^[a-f0-9]{64}$/.test(expected)) throw failure('VOICE_INTEGRITY_FAILED');
    const target = path.join(root, name), real = await fs.promises.realpath(target);
    if (real !== target) throw failure('VOICE_INTEGRITY_FAILED');
    const before = await fs.promises.stat(target, { bigint: true });
    if (!before.isFile() || await hashFile(target, signal) !== expected) throw failure('VOICE_INTEGRITY_FAILED');
    const after = await fs.promises.stat(target, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino) throw failure('VOICE_INTEGRITY_FAILED');
  }
  return root;
}
async function boundedJson(response, maximum = 65536) {
  if (!response.ok || !/application\/json/i.test(response.headers.get('content-type') || '')) throw failure('VOICE_INVALID_RESULT');
  const chunks = []; let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maximum) throw failure('VOICE_INVALID_RESULT');
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw failure('VOICE_INVALID_RESULT'); }
}
const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const languages = new Map();
for (let a = 97; a <= 122; ++a) for (let b = 97; b <= 122; ++b) {
  const code = String.fromCharCode(a, b), name = languageNames.of(code);
  if (name) { languages.set(name.toLowerCase(), code); languages.set(code, code); }
}
function detectedLanguage(value, requested) {
  return requested !== 'auto' ? whisperLanguage(requested) : languages.get(String(value || '').toLowerCase()) || 'und';
}
// #endregion

// #region Single owner, no-context inference, cancellation and process death
class ResidentTranscriber {
  #child = null; #closed = null; #url = ''; #port = 0; #generation = 0;
  #starting = null; #stopping = null; #startupController = null; #active = null; #disposed = false; #stopFailed = false;
  constructor({ directory, verify = verifyResidentFiles, spawn = spawnSupervisedLlamaProcess,
    terminate = terminateSupervisedLlamaProcess, request = fetch, allocatePort = freePort,
    isPortFree = portFree, startupMs = 45000, stopMs = 5000 } = {}) {
    this.directory = directory; this.verify = verify; this.spawn = spawn; this.terminate = terminate;
    this.request = request; this.allocatePort = allocatePort; this.isPortFree = isPortFree;
    this.startupMs = startupMs; this.stopMs = stopMs;
  }
  state() { return { backend: 'whisper-resident-cpu', ready: Boolean(this.#url && this.#child && !this.#stopping), disposed: this.#disposed }; }
  async #ensure() {
    if (this.#disposed) throw cancelled();
    if (this.#stopping) await this.#stopping;
    if (this.#stopFailed) throw failure('VOICE_STOP_FAILED');
    if (this.#disposed) throw cancelled();
    if (this.#starting) return this.#starting;
    if (this.#url && this.#child) return;
    const generation = this.#generation, controller = new AbortController(); this.#startupController = controller;
    const pending = this.#start(generation, controller.signal).finally(() => {
      if (this.#starting === pending) { this.#starting = null; this.#startupController = null; }
    });
    this.#starting = pending; return pending;
  }
  async #start(generation, signal) {
    const deadline = setTimeout(() => this.#startupController?.abort(), this.startupMs);
    try {
      const directory = await this.verify(this.directory, signal), port = await this.allocatePort();
      signal.throwIfAborted();
      if (generation !== this.#generation || this.#disposed) throw cancelled();
      const capability = randomBytes(32).toString('hex'), prefix = '/' + capability;
      const child = this.spawn(path.join(directory, 'whisper-server.exe'), [
        '-m', path.join(directory, manifest.model.file), '-ng', '-nlp', '-bs', '5', '-bo', '5', '-nt', '-sow',
        '-t', String(Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)))), '-nth', '0.68', '-sns',
        '--host', '127.0.0.1', '--port', String(port), '--request-path', prefix
      ], { cwd: directory, env: { LLAMA_API_KEY: capability } });
      this.#child = child; this.#port = port;
      let exited = false;
      this.#closed = new Promise(resolve => {
        // Node's IPC supervisor can emit exit without close after disconnect
        // on Windows. It exits only after its native child's close handler.
        const finish = () => {
        exited = true;
        if (this.#child === child) { this.#child = null; this.#url = ''; }
        child.removeListener('exit', finish); child.removeListener('close', finish);
        resolve();
        };
        child.once('exit', finish); child.once('close', finish);
      });
      child.on('error', () => { exited = true; });
      const url = `http://127.0.0.1:${port}${prefix}`;
      for (;;) {
        signal.throwIfAborted();
        if (exited) throw failure('VOICE_BACKEND_UNAVAILABLE');
        try {
          const response = await this.request(url + '/health', { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(750)]) });
          const data = await boundedJson(response, 1024);
          if (data.status === 'ok') {
            signal.throwIfAborted();
            if (generation !== this.#generation || this.#disposed) throw cancelled();
            this.#url = url; return;
          }
        } catch { signal.throwIfAborted(); }
        await delay(50, undefined, { signal });
      }
    } finally { clearTimeout(deadline); }
  }
  async warmUp() {
    try { await this.#ensure(); return true; }
    catch { await this.#stop(); return false; }
  }
  async transcribeAudio({ audio, language = 'auto', timeoutSeconds = 30, signal } = {}) {
    if (this.#disposed || signal?.aborted) throw cancelled();
    if (this.#active) throw failure('VOICE_BUSY', 'NexusNXS sta già elaborando la voce.');
    if (!LANGUAGE_PATTERN.test(language)) throw failure('VOICE_INVALID_LANGUAGE', 'Lingua del riconoscimento non valida.');
    const buffer = Buffer.from(audio || []);
    try {
      if (buffer.length > 2000000) throw new Error();
      const { format } = pcmWave(buffer);
      if (format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 16000) throw new Error();
    } catch { throw failure('VOICE_INVALID_AUDIO', 'La registrazione vocale non è valida.'); }
    const controller = new AbortController(); this.#active = controller;
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, Math.max(1, Math.min(60, Number(timeoutSeconds) || 30)) * 1000);
    // Disconnecting HTTP alone does NOT stop whisper.cpp's decoder.
    const stopping = () => { void this.#stop().catch(() => {}); };
    controller.signal.addEventListener('abort', stopping, { once: true });
    try {
      await this.#ensure(); controller.signal.throwIfAborted();
      const form = new FormData();
      form.set('file', new Blob([buffer], { type: 'audio/wav' }), 'audio.wav');
      form.set('language', whisperLanguage(language)); form.set('response_format', 'verbose_json');
      // The pinned server defaults no_context=true and resets parameters for
      // every request. No prompt, filename, model or other client fields pass.
      const response = await this.request(this.#url + '/inference', { method: 'POST', body: form, redirect: 'error', signal: controller.signal });
      const data = await boundedJson(response);
      controller.signal.throwIfAborted();
      if (typeof data.text !== 'string' || data.text.length > 16000) throw failure('VOICE_INVALID_RESULT');
      const text = normalizeTranscript(data.text);
      if (!text) throw failure('VOICE_NO_SPEECH', 'Nessuna voce rilevata.');
      return { ok: true, available: true, local: true, backend: 'whisper-resident-cpu',
        text, language: detectedLanguage(data.language, language), confidence: null };
    } catch (error) {
      if (error?.code !== 'VOICE_NO_SPEECH') await this.#stop();
      if (controller.signal.aborted || this.#disposed) throw signal?.aborted || this.#disposed ? cancelled()
        : failure('VOICE_TIMEOUT', 'La trascrizione vocale ha impiegato troppo tempo.');
      throw error instanceof NexusError ? error : failure('VOICE_BACKEND_UNAVAILABLE');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', stopping);
      if (this.#active === controller) this.#active = null;
    }
  }
  #stop() {
    if (this.#stopping) return this.#stopping;
    ++this.#generation; this.#startupController?.abort(); this.#url = '';
    const child = this.#child, closed = this.#closed, port = this.#port;
    const pending = (async () => {
      if (child) {
        this.terminate(child);
        let ended = false, forced = false; closed.then(() => { ended = true; });
        const started = Date.now();
        while (!ended && Date.now() - started < this.stopMs) {
          if (!forced && Date.now() - started > this.stopMs / 2) { forced = true; this.terminate(child); }
          await delay(25);
        }
        if (!ended) throw failure('VOICE_STOP_FAILED');
      }
      if (port) {
        const started = Date.now();
        while (!await this.isPortFree(port)) {
          if (Date.now() - started > this.stopMs) throw failure('VOICE_STOP_FAILED');
          await delay(25);
        }
      }
      this.#port = 0; this.#closed = null; this.#stopFailed = false;
    })().catch(error => { this.#stopFailed = true; throw error; })
      .finally(() => { if (this.#stopping === pending) this.#stopping = null; });
    this.#stopping = pending; return pending;
  }
  async shutdown() {
    this.#disposed = true; this.#active?.abort();
    const starting = this.#starting;
    await this.#stop();
    if (starting) await starting.catch(() => {});
    await this.#stop();
  }
}
module.exports = { ResidentTranscriber, verifyResidentFiles, detectedLanguage };
// #endregion
