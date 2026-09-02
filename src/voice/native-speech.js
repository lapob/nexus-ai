/**
 * @module voice/native-speech
 * @description Coordina il backend vocale nativo e la trascrizione Whisper locale.
 */
// #region 01 — Dipendenze e parsing

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { NexusError } = require('../core/errors');

const LANGUAGE_PATTERN = /^(?:auto|[a-z]{2}(?:-[A-Z]{2})?)$/;
const WHISPER_MODELS = Object.freeze([
  // Small è il modello verificato su CPU Windows eterogenee. Turbo resta
  // installato per un futuro backend adattivo, ma su alcuni driver termina
  // prima della trascrizione e non può essere imposto globalmente.
  'ggml-small.bin',
  'ggml-large-v3-turbo-q5_0.bin',
  'ggml-large-v3-turbo.bin',
  'ggml-medium-q5_0.bin',
  'ggml-base.bin'
]);

function findWhisperModel(directory) {
  return WHISPER_MODELS
    .map((name) => path.join(directory, name))
    .find((candidate) => fs.existsSync(candidate)) || null;
}

function speechError(code, publicMessage, cause) {
  return new NexusError(publicMessage, { code, publicMessage, cause });
}

function parseSpeechResult(output) {
  const lines = String(output || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === 'object' && value.backend === 'windows-sapi') return value;
    } catch { /* Cerca l'ultima riga JSON valida. */ }
  }
  throw speechError('VOICE_INVALID_RESULT', 'Il riconoscimento vocale non ha prodotto un risultato valido.');
}

function parseCaptureDevices(output) {
  const devices = [];
  const pattern = /Capture device #(\d+):\s*'([^']+)'/gi;
  for (const match of String(output || '').matchAll(pattern)) {
    devices.push({ id: Number(match[1]), label: match[2].trim() });
  }
  return devices;
}

function adaptiveThreadCount() {
  return Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2) || 2));
}

function whisperLanguage(language) {
  return language === 'auto' ? 'auto' : language.split('-')[0].toLowerCase();
}

function detectedWhisperLanguage(diagnostic, requested = 'auto') {
  const match = String(diagnostic || '').match(/(?:auto[- ]detected language|detected language)\s*:\s*([a-z]{2,3})\b/i);
  return match?.[1]?.toLowerCase() || (requested === 'auto' ? 'und' : whisperLanguage(requested));
}

function detectedWhisperConfidence(diagnostic) {
  const match = String(diagnostic || '').match(/(?:auto[- ]detected language|detected language)[^\n]*?\bp\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)\b/i);
  return match ? Math.max(0, Math.min(1, Number(match[1]))) : null;
}

function sapiLanguage(language) {
  if (language !== 'auto') return language;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  return /^[a-z]{2}-[A-Z]{2}$/.test(locale) ? locale : 'en-US';
}

function normalizeTranscript(value) {
  const text = String(value || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /^(?:music|musica|applause|applausi|silence|silenzio|inaudible|non udibile)$/i.test(text)) return '';
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const unique = [];
  for (const sentence of sentences) {
    const clean = sentence.trim();
    const key = clean.toLocaleLowerCase().replace(/[.!?]+$/, '').trim();
    const previous = unique.at(-1)?.key;
    if (key && key !== previous) unique.push({ key, text: clean });
  }
  let normalized = unique.map((item) => item.text).join(' ').trim();
  // Alcuni backend reiterano l'intera finestra quando la frase supera una
  // pausa. Eliminiamo soltanto duplicati adiacenti abbastanza lunghi, così
  // ripetizioni intenzionali brevi ("no, no") restano intatte.
  const duplicatedHalf = /^(.{12,}?[.!?]?)\s+\1$/iu.exec(normalized);
  if (duplicatedHalf) normalized = duplicatedHalf[1].trim();
  normalized = normalized.replace(/\b((?:\p{L}+[’'\-]?\s+){3,}\p{L}+[.!?]?)\s+\1\b/giu, '$1');
  return normalized.trim();
}

function transcriptStabilityThreshold(value) {
  const text = String(value || '').trim();
  if (/[.!?…]$/.test(text)) return 3;
  if (text.length >= 12 || text.split(/\s+/).length >= 3) return 4;
  return 5;
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

// #endregion

// #region 02 — Servizio vocale nativo

class NativeSpeechService extends EventEmitter {
  constructor({ platform = process.platform, spawnProcess = spawn, runTaskkill = spawnSync, terminateProcess, scriptPath, whisperDirectory } = {}) {
    super();
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.terminateProcess = terminateProcess || ((child) => terminateOwnedProcessTree(child, this.platform, runTaskkill));
    this.scriptPath = scriptPath || path.join(__dirname, 'windows-speech.ps1');
    this.whisperDirectory = whisperDirectory || '';
    this.active = null;
    this.captureProbes = new Set();
    this.captureDeviceCache = [];
    this.captureDeviceCacheAt = 0;
    this.disposed = false;
  }

  capabilities() {
    const whisperModel = findWhisperModel(this.whisperDirectory);
    const whisper = this.platform === 'win32'
      && fs.existsSync(path.join(this.whisperDirectory, 'whisper-stream.exe'))
      && Boolean(whisperModel);
    return {
      available: whisper || this.platform === 'win32',
      backend: whisper ? 'whisper.cpp' : this.platform === 'win32' ? 'windows-sapi' : null,
      local: true,
      language: 'auto',
      multilingual: whisper
    };
  }

  captureDevices() {
    if (this.disposed) return Promise.resolve([]);
    if (this.captureDeviceCache.length && Date.now() - this.captureDeviceCacheAt < 5000) {
      return Promise.resolve([...this.captureDeviceCache]);
    }
    if (this.platform !== 'win32' || this.capabilities().backend !== 'whisper.cpp' || this.active) {
      return Promise.resolve([]);
    }
    const executable = path.join(this.whisperDirectory, 'whisper-stream.exe');
    const model = findWhisperModel(this.whisperDirectory);
    return new Promise((resolve) => {
      const child = this.spawnProcess(executable, [
        '-m', model, '-l', 'it', '-c', '-1', '--step', '500', '--length', '1000'
      ], { cwd: this.whisperDirectory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.captureProbes.add(child);
      let diagnostic = '';
      let settled = false;
      const finish = (shouldTerminate = true) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const devices = parseCaptureDevices(diagnostic);
        if (devices.length) {
          this.captureDeviceCache = devices;
          this.captureDeviceCacheAt = Date.now();
        }
        if (shouldTerminate) this.terminateProcess(child);
        this.captureProbes.delete(child);
        resolve([...devices]);
      };
      const timer = setTimeout(finish, 2500);
      child.nexusCancelProbe = finish;
      child.stderr.on('data', (chunk) => {
        diagnostic = `${diagnostic}${chunk}`.slice(-32768);
        if (/attempt to open (?:default )?capture device/i.test(diagnostic)) finish();
      });
      child.on('error', () => finish(false));
      child.on('exit', () => finish(false));
    });
  }

  transcribe({ language = 'auto', timeoutSeconds = 15, captureDeviceId = -1 } = {}) {
    if (this.disposed) return Promise.reject(speechError('VOICE_CANCELLED', 'Il servizio vocale è stato arrestato.'));
    if (this.platform !== 'win32') return Promise.resolve({ ...this.capabilities(), text: '', error: 'Riconoscimento nativo non disponibile su questo sistema.' });
    if (!LANGUAGE_PATTERN.test(language)) return Promise.reject(speechError('VOICE_INVALID_LANGUAGE', 'Lingua del riconoscimento non valida.'));
    const timeout = Math.max(2, Math.min(30, Number(timeoutSeconds) || 15));
    if (this.active) return Promise.reject(speechError('VOICE_BUSY', 'NEXUSNXS sta già ascoltando.'));
    const capture = Number.isInteger(captureDeviceId) && captureDeviceId >= -1 && captureDeviceId <= 64
      ? captureDeviceId
      : -1;
    if (this.capabilities().backend === 'whisper.cpp') {
      return this.transcribeWhisper({ language, timeout, captureDeviceId: capture }).catch(async (error) => {
        // Chromium e SDL possono enumerare gli ingressi in ordine diverso.
        // Se una scelta esplicita non è valida per Whisper, il dispositivo
        // predefinito mantiene disponibile la funzione senza un errore grezzo.
        if (capture >= 0 && error?.code === 'VOICE_CAPTURE_FAILED') {
          try {
            return await this.transcribeWhisper({ language, timeout, captureDeviceId: -1 });
          } catch (fallbackError) {
            if (fallbackError?.code !== 'VOICE_CAPTURE_FAILED') throw fallbackError;
          }
        }
        // Alcuni driver Windows (in particolare mixer virtuali e periferiche
        // gaming) rifiutano SDL pur restando disponibili tramite Speech API.
        if (error?.code === 'VOICE_CAPTURE_FAILED') return this.transcribeSapi({ language, timeout });
        throw error;
      });
    }
    return this.transcribeSapi({ language, timeout });
  }

  transcribeSapi({ language, timeout }) {
    const selectedLanguage = sapiLanguage(language);
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', this.scriptPath, '-Language', selectedLanguage, '-TimeoutSeconds', String(timeout)
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.nexusBackend = 'windows-sapi';
      this.active = child;
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        if (this.active === child) this.active = null;
        callback(value);
      };
      const killTimer = setTimeout(() => {
        this.terminateProcess(child);
        finish(reject, speechError('VOICE_TIMEOUT', 'Tempo di ascolto scaduto.'));
      }, (timeout + 6) * 1000);
      child.nexusCancel = () => {
        child.nexusCancelled = true;
        this.terminateProcess(child);
        finish(reject, speechError('VOICE_CANCELLED', 'Ascolto annullato.'));
      };
      child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-32768); });
      child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8192); });
      child.on('error', (error) => finish(reject, speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.', error)));
      child.on('exit', (code) => {
        if (child.nexusCancelled) {
          return finish(reject, speechError('VOICE_CANCELLED', 'Ascolto annullato.'));
        }
        try {
          const result = parseSpeechResult(stdout);
          if (code !== 0 || result.ok === false) {
            return finish(reject, speechError('VOICE_CAPTURE_FAILED', 'Non è stato possibile riconoscere la voce.', result.error || stderr));
          }
          finish(resolve, { ...result, available: true, local: true });
        } catch (error) {
          finish(reject, speechError('VOICE_CAPTURE_FAILED', 'Non è stato possibile riconoscere la voce.', stderr || error));
        }
      });
    });
  }

  transcribeWhisper({ language, timeout, captureDeviceId = -1 }) {
    const executable = path.join(this.whisperDirectory, 'whisper-stream.exe');
    const model = findWhisperModel(this.whisperDirectory);
    if (!model) return Promise.reject(speechError('VOICE_MODEL_MISSING', 'Il modello di riconoscimento vocale non è disponibile.'));
    const outputPath = path.join(os.tmpdir(), `nexus-voice-${randomUUID()}.txt`);
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(executable, [
        '-m', model,
        '-l', whisperLanguage(language),
        '-t', String(adaptiveThreadCount()),
        '-c', String(captureDeviceId),
        // Finestre brevi producono attività e testo parziale durante la voce,
        // invece di attendere la fine dell'intera frase in modalità VAD.
        '--step', '500',
        '--length', '5000',
        '--keep', '300',
        '--max-tokens', '96',
        '--beam-size', '3',
        // 0.50 evita che ventole, tastiere e rumore continuo mantengano
        // "voce rilevata" attivo, senza penalizzare una voce normale.
        '--vad-thold', '0.50',
        '--keep-context',
        '--file', outputPath
      ], { cwd: this.whisperDirectory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.nexusBackend = 'whisper.cpp';
      this.active = child;
      let stderr = '';
      let settled = false;
      let previous = '';
      let stableReads = 0;
      let activityStarted = false;
      let activityActive = false;
      let stdoutTail = '';
      const pulseActivity = (level = 0.82) => {
        activityStarted = true;
        activityActive = true;
        this.emit('activity', { active: true, level });
        clearTimeout(child.nexusActivityTimer);
        child.nexusActivityTimer = setTimeout(() => {
          activityActive = false;
          this.emit('activity', { active: false, level: 0 });
        }, 850);
      };
      const cleanup = () => {
        clearTimeout(killTimer);
        clearInterval(pollTimer);
        clearTimeout(child.nexusFinishTimer);
        clearTimeout(child.nexusActivityTimer);
        if (activityActive) this.emit('activity', { active: false, level: 0 });
        if (this.active === child) this.active = null;
        try { fs.unlinkSync(outputPath); } catch { /* Il file può non essere stato creato. */ }
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const readTranscript = () => {
        try {
          const text = normalizeTranscript(fs.readFileSync(outputPath, 'utf8'));
          if (!text) return '';
          const changed = text !== previous;
          if (changed) {
            pulseActivity(0.72);
            this.emit('partial', { text });
          }
          stableReads = text === previous ? stableReads + 1 : 0;
          previous = text;
          // Whisper aggiorna il file per segmenti, non per campione audio.
          // Manteniamo il VAD visivo continuo fra due segmenti e chiudiamo
          // soltanto dopo circa un secondo e mezzo di testo invariato.
          const stableTranscriptReads = transcriptStabilityThreshold(text);
          if (!changed && activityStarted && stableReads < stableTranscriptReads) {
            pulseActivity(0.58);
          }
          if (stableReads >= stableTranscriptReads) {
            this.terminateProcess(child);
            finish(resolve, { ok: true, available: true, local: true, backend: 'whisper.cpp', language: detectedWhisperLanguage(stderr, language), confidence: detectedWhisperConfidence(stderr), text });
          }
          return text;
        } catch { return ''; }
      };
      const pollTimer = setInterval(readTranscript, 220);
      const killTimer = setTimeout(() => {
        const text = readTranscript();
        this.terminateProcess(child);
        finish(resolve, { ok: true, available: true, local: true, backend: 'whisper.cpp', language: detectedWhisperLanguage(stderr, language), confidence: detectedWhisperConfidence(stderr), text });
      }, (timeout + 4) * 1000);
      child.nexusCancel = () => {
        child.nexusCancelled = true;
        this.terminateProcess(child);
        finish(reject, speechError('VOICE_CANCELLED', 'Ascolto annullato.'));
      };
      child.stdout.on('data', (chunk) => {
        // "[Start speaking]" è il prompt di disponibilità di whisper-stream,
        // non un evento VAD: non deve accendere il visualizer nel silenzio.
        // Il marker può comunque essere diviso fra più chunk del pipe nativo.
        const output = String(chunk);
        stdoutTail = `${stdoutTail}${output}`.slice(-256);
        if (/\[Start speaking\]/i.test(stdoutTail)) {
          activityStarted = true;
          stdoutTail = '';
          return;
        }
        // Dopo il VAD, ogni frammento trascritto rinnova l'attività. In
        // assenza di nuovi frammenti il rilascio riporta lo stato in ascolto.
        const spokenOutput = output.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
        if (activityStarted && spokenOutput.length > 1) pulseActivity(0.72);
      });
      child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-16384); });
      child.on('error', (error) => finish(reject, speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.', error)));
      child.on('exit', (code) => {
        if (settled) return;
        if (child.nexusCancelled) {
          return finish(reject, speechError('VOICE_CANCELLED', 'Ascolto annullato.'));
        }
        const text = readTranscript();
        if (text) return finish(resolve, { ok: true, available: true, local: true, backend: 'whisper.cpp', language: detectedWhisperLanguage(stderr, language), confidence: detectedWhisperConfidence(stderr), text });
        finish(reject, code === 0
          ? speechError('VOICE_NO_SPEECH', 'Nessuna voce rilevata.')
          : speechError('VOICE_CAPTURE_FAILED', 'Il riconoscimento vocale locale non è riuscito.', stderr));
      });
    });
  }

  transcribeAudio({ audio, language = 'auto', timeoutSeconds = 30 } = {}) {
    if (this.disposed) {
      return Promise.reject(speechError('VOICE_CANCELLED', 'Il servizio vocale è stato arrestato.'));
    }
    if (this.platform !== 'win32') {
      return Promise.reject(speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.'));
    }
    if (this.active) return Promise.reject(speechError('VOICE_BUSY', 'NEXUSNXS sta già elaborando la voce.'));
    if (!LANGUAGE_PATTERN.test(language)) {
      return Promise.reject(speechError('VOICE_INVALID_LANGUAGE', 'Lingua del riconoscimento non valida.'));
    }
    const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
    if (buffer.length < 44 || buffer.length > 2_000_000
      || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
      || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
      return Promise.reject(speechError('VOICE_INVALID_AUDIO', 'La registrazione vocale non è valida.'));
    }
    const executable = path.join(this.whisperDirectory, 'whisper-cli.exe');
    const model = findWhisperModel(this.whisperDirectory);
    if (!fs.existsSync(executable) || !model) {
      return Promise.reject(speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.'));
    }
    const id = randomUUID();
    const inputPath = path.join(os.tmpdir(), `nexus-recording-${id}.wav`);
    const outputBase = path.join(os.tmpdir(), `nexus-transcript-${id}`);
    const outputPath = `${outputBase}.txt`;
    fs.writeFileSync(inputPath, buffer, { mode: 0o600 });
    return new Promise((resolve, reject) => {
      const argumentsList = [
        '-m', model,
        '-f', inputPath,
        '-l', whisperLanguage(language),
        '-t', String(adaptiveThreadCount()),
        '-bs', '10',
        '-bo', '10',
        // L'audio arriva già da un VAD locale: una soglia no-speech meno
        // aggressiva conserva parole basse, mentre suppress-nst elimina
        // fischi, respiri e token non linguistici.
        '-nth', '0.68',
        '-sns',
        '-sow',
        '-nt',
        '-np',
        '-otxt',
        '-of', outputBase
      ];
      let child;
      try {
        child = this.spawnProcess(executable, argumentsList, {
          cwd: this.whisperDirectory,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) {
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
        reject(speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.', error));
        return;
      }
      child.nexusBackend = 'whisper-cli';
      this.active = child;
      let stderr = '';
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        if (this.active === child) this.active = null;
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const timer = setTimeout(() => {
        this.terminateProcess(child);
        finish(reject, speechError('VOICE_TIMEOUT', 'La trascrizione vocale ha impiegato troppo tempo.'));
      }, Math.max(10, Math.min(60, Number(timeoutSeconds) || 30)) * 1000);
      child.nexusCancel = () => {
        child.nexusCancelled = true;
        this.terminateProcess(child);
        finish(reject, speechError('VOICE_CANCELLED', 'Trascrizione annullata.'));
      };
      child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-16384); });
      child.on('error', (error) => finish(reject, speechError('VOICE_BACKEND_UNAVAILABLE', 'Il servizio vocale locale non è disponibile.', error)));
      child.on('exit', (code) => {
        if (settled) return;
        if (child.nexusCancelled) {
          return finish(reject, speechError('VOICE_CANCELLED', 'Trascrizione annullata.'));
        }
        let text = '';
        try {
          text = normalizeTranscript(fs.readFileSync(outputPath, 'utf8'));
        } catch {}
        if (code === 0 && text) {
          return finish(resolve, {
            ok: true,
            available: true,
            local: true,
            backend: 'whisper-cli',
            language: detectedWhisperLanguage(stderr, language),
            confidence: detectedWhisperConfidence(stderr),
            text
          });
        }
        finish(reject, code === 0
          ? speechError('VOICE_NO_SPEECH', 'Nessuna voce rilevata.')
          : speechError('VOICE_CAPTURE_FAILED', 'La trascrizione vocale locale non è riuscita.', stderr));
      });
    });
  }

  stop() {
    if (!this.active) return false;
    const child = this.active;
    clearTimeout(child.nexusFinishTimer);
    // Il marker viene letto dall'handler exit: uno stop intenzionale non deve
    // essere scambiato per guasto del device e attivare il fallback Whisper.
    if (typeof child.nexusCancel === 'function') child.nexusCancel();
    else {
      child.nexusCancelled = true;
      this.terminateProcess(child);
      if (this.active === child) this.active = null;
    }
    return true;
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    let stopped = this.stop();
    for (const child of [...this.captureProbes]) {
      stopped = true;
      child.nexusCancelProbe?.();
      if (this.captureProbes.has(child)) {
        this.terminateProcess(child);
        this.captureProbes.delete(child);
      }
    }
    this.captureDeviceCache = [];
    this.captureDeviceCacheAt = 0;
    return stopped;
  }

  finish() {
    if (!this.active) return false;
    const child = this.active;
    if (child.nexusFinishRequested) return true;
    // Windows Speech Recognition conclude autonomamente appena ottiene una
    // frase. Applicargli il kill ritardato pensato per whisper-stream tronca
    // proprio le sessioni di fallback, soprattutto dal secondo ascolto.
    if (child.nexusBackend === 'windows-sapi') {
      child.nexusFinishRequested = true;
      return true;
    }
    // whisper-stream scrive l'ultima finestra su disco in modo asincrono.
    // Ucciderlo nello stesso istante in cui il VAD rileva il silenzio perdeva
    // spesso l'intera frase e riportava l'interfaccia a "Pronto".
    child.nexusFinishRequested = true;
    child.nexusFinishTimer = setTimeout(() => {
      if (this.active === child) this.terminateProcess(child);
    }, 450);
    return true;
  }
}

module.exports = { LANGUAGE_PATTERN, NativeSpeechService, detectedWhisperConfidence, detectedWhisperLanguage, findWhisperModel, normalizeTranscript, parseCaptureDevices, parseSpeechResult, sapiLanguage, transcriptStabilityThreshold, whisperLanguage };

// #endregion
