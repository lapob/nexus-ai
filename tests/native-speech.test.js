const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const os = require('node:os');
const path = require('node:path');
const { LANGUAGE_PATTERN, NativeSpeechService, detectedWhisperConfidence, detectedWhisperLanguage, findWhisperModel, normalizeTranscript, parseCaptureDevices, parseSpeechResult, transcriptStabilityThreshold } = require('../src/voice/native-speech');
const { NexusError, publicErrorMessage } = require('../src/core/errors');

test('interpreta soltanto il risultato JSON del backend vocale locale', () => {
  const result = parseSpeechResult('messaggio informativo\n{"ok":true,"text":"ciao NexusNXS","confidence":0.8,"backend":"windows-sapi"}\n');
  assert.equal(result.text, 'ciao NexusNXS');
  assert.equal(result.backend, 'windows-sapi');
  assert.throws(() => parseSpeechResult('nessun risultato'), /risultato valido/);
});

test('enumera gli ingressi SDL senza dipendere dal loro ordine', () => {
  const devices = parseCaptureDevices(`
init:    - Capture device #0: 'Voicemeeter Out B1 (VB-Audio Voicemeeter VAIO)'
init:    - Capture device #2: 'Microfono (Logitech G733 Gaming Headset)'
init:    - Capture device #9: 'Microfono (fifine Microphone)'
  `);
  assert.deepEqual(devices, [
    { id: 0, label: 'Voicemeeter Out B1 (VB-Audio Voicemeeter VAIO)' },
    { id: 2, label: 'Microfono (Logitech G733 Gaming Headset)' },
    { id: 9, label: 'Microfono (fifine Microphone)' }
  ]);
});

test('dichiara indisponibile il backend nativo fuori da Windows senza avviare processi', async () => {
  const service = new NativeSpeechService({ platform: 'linux', spawnProcess: () => { throw new Error('non deve essere chiamato'); } });
  assert.equal(service.capabilities().available, false);
  const result = await service.transcribe();
  assert.equal(result.available, false);
  assert.match(result.error, /non disponibile/);
  assert.equal(LANGUAGE_PATTERN.test('it-IT'), true);
  assert.equal(LANGUAGE_PATTERN.test('auto'), true);
  assert.equal(LANGUAGE_PATTERN.test('../it'), false);
});

test('non espone percorsi, DLL o diagnostica nativa nei messaggi pubblici', () => {
  const diagnostic = 'load_backend: D:\\NexusNXS\\.AI\\vendor\\whisper\\ggml-cpu.dll node:internal stack';
  assert.equal(publicErrorMessage(new Error(diagnostic), 'Errore vocale.'), 'Errore vocale.');
  assert.equal(
    publicErrorMessage(new NexusError('diagnostica interna', {
      code: 'VOICE_CAPTURE_FAILED',
      publicMessage: 'Il riconoscimento vocale locale non è riuscito.',
      cause: diagnostic
    })),
    'Il riconoscimento vocale locale non è riuscito.'
  );
});

test('preferisce il modello Whisper più accurato disponibile', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-model-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  assert.match(findWhisperModel(directory), /ggml-base\.bin$/);
  fs.writeFileSync(path.join(directory, 'ggml-large-v3-turbo-q5_0.bin'), '');
  assert.match(findWhisperModel(directory), /ggml-large-v3-turbo-q5_0\.bin$/);
});

test('Whisper non propaga stderr diagnostico quando il processo fallisce', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'whisper-stream.exe'), '');
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  const children = [];
  const spawnArguments = [];
  const service = new NativeSpeechService({
    platform: 'win32',
    whisperDirectory: directory,
    spawnProcess: (_executable, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};
      children.push(child);
      spawnArguments.push(args);
      return child;
    }
  });
  const transcription = service.transcribe({ language: 'it-IT', timeoutSeconds: 2, captureDeviceId: 3 });
  assert.deepEqual(spawnArguments[0].slice(spawnArguments[0].indexOf('-c'), spawnArguments[0].indexOf('-c') + 2), ['-c', '3']);
  assert.deepEqual(spawnArguments[0].slice(spawnArguments[0].indexOf('--vad-thold'), spawnArguments[0].indexOf('--vad-thold') + 2), ['--vad-thold', '0.50']);
  assert.equal(spawnArguments[0].includes('--no-gpu'), false);
  children[0].stderr.write(`load_backend: loaded CPU backend from ${directory}\\ggml-cpu.dll`);
  children[0].emit('exit', 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(spawnArguments[1].slice(spawnArguments[1].indexOf('-c'), spawnArguments[1].indexOf('-c') + 2), ['-c', '-1']);
  children[1].stderr.write(`load_backend: loaded CPU backend from ${directory}\\ggml-cpu.dll`);
  children[1].emit('exit', 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spawnArguments[2].includes('it-IT'), true);
  children[2].stdout.write('{"ok":false,"error":"backend unavailable","language":"it-IT","backend":"windows-sapi"}');
  children[2].emit('exit', 1);
  await assert.rejects(transcription, (error) => {
    assert.equal(error.code, 'VOICE_CAPTURE_FAILED');
    assert.equal(error.message, 'Non è stato possibile riconoscere la voce.');
    assert.doesNotMatch(error.message, /[a-z]:[\\/]|\.dll|vendor/i);
    return true;
  });
});

test('Whisper non scambia il prompt iniziale per voce e rileva la trascrizione', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-activity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'whisper-stream.exe'), '');
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  let child;
  const service = new NativeSpeechService({
    platform: 'win32',
    whisperDirectory: directory,
    spawnProcess: () => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => setImmediate(() => child.emit('exit', 0));
      return child;
    }
  });
  const activity = [];
  service.on('activity', (value) => activity.push(value));
  const transcription = service.transcribe({ timeoutSeconds: 2 });
  child.stdout.write('[Start spe');
  child.stdout.write('aking]\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(activity, []);
  child.stdout.write('ciao NexusNXS');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(activity.at(-1), { active: true, level: 0.72 });
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.deepEqual(activity.at(-1), { active: false, level: 0 });
  child.stdout.write('continua');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(activity.at(-1), { active: true, level: 0.72 });
  assert.equal(service.stop(), true);
  await assert.rejects(transcription, (error) => error.code === 'VOICE_CANCELLED');
  assert.deepEqual(activity.at(-1), { active: false, level: 0 });
});

test('Whisper non spezza una frase durante una pausa naturale', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-pause-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'whisper-stream.exe'), '');
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  let child;
  let spawnArguments;
  const service = new NativeSpeechService({
    platform: 'win32',
    whisperDirectory: directory,
    spawnProcess: (_executable, args) => {
      spawnArguments = args;
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => setImmediate(() => child.emit('exit', 0));
      return child;
    }
  });
  const activity = [];
  const partials = [];
  service.on('activity', (value) => activity.push(value));
  service.on('partial', (value) => partials.push(value));
  let completed = false;
  const transcription = service.transcribe({ timeoutSeconds: 3 }).finally(() => { completed = true; });
  const outputPath = spawnArguments[spawnArguments.indexOf('--file') + 1];
  fs.writeFileSync(outputPath, 'questa è una frase');
  await new Promise((resolve) => setTimeout(resolve, 850));
  assert.equal(completed, false);
  assert.equal(activity.at(-1)?.active, true);
  assert.deepEqual(partials.at(-1), { text: 'questa è una frase' });
  assert.equal(service.stop(), true);
  await assert.rejects(transcription, (error) => error.code === 'VOICE_CANCELLED');
});

test('finish concede a Whisper il tempo di salvare la trascrizione parziale', async () => {
  const service = new NativeSpeechService();
  let killed = false;
  const child = { nexusBackend: 'whisper.cpp', kill() { killed = true; } };
  service.active = child;
  assert.equal(service.finish(), true);
  assert.equal(child.nexusFinishRequested, true);
  assert.equal(child.nexusCancelled, undefined);
  assert.equal(killed, false);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(killed, true);
});

test('finish non tronca Windows SAPI durante una sessione di fallback', async () => {
  const service = new NativeSpeechService();
  let killed = false;
  const child = { nexusBackend: 'windows-sapi', kill() { killed = true; } };
  service.active = child;
  assert.equal(service.finish(), true);
  assert.equal(child.nexusFinishRequested, true);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(killed, false);
  assert.equal(service.active, child);
});

test('whisper-cli trascrive una singola registrazione WAV e pulisce i file temporanei', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'whisper-stream.exe'), '');
  fs.writeFileSync(path.join(directory, 'whisper-cli.exe'), '');
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  let inputPath = '';
  let outputPath = '';
  let whisperArguments = [];
  const service = new NativeSpeechService({
    platform: 'win32',
    whisperDirectory: directory,
    spawnProcess: (_executable, args) => {
      whisperArguments = args;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};
      inputPath = args[args.indexOf('-f') + 1];
      outputPath = `${args[args.indexOf('-of') + 1]}.txt`;
      setImmediate(() => {
        fs.writeFileSync(outputPath, ' una sola frase riconosciuta ');
        child.emit('exit', 0);
      });
      return child;
    }
  });
  const wav = Buffer.alloc(44 + 3200);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  const result = await service.transcribeAudio({ audio: wav });
  assert.equal(result.backend, 'whisper-cli');
  assert.equal(result.text, 'una sola frase riconosciuta');
  assert.equal(whisperArguments.includes('-bs'), false, 'beam search e best-of non devono essere combinati su whisper.cpp 1.9');
  assert.equal(whisperArguments.includes('-bo'), false, 'il decoder usa i default compatibili della build distribuita');
  assert.equal(whisperArguments[whisperArguments.indexOf('-nth') + 1], '0.68');
  assert.equal(whisperArguments.includes('-sns'), true);
  assert.equal(whisperArguments.includes('--prompt'), false);
  assert.equal(whisperArguments[whisperArguments.indexOf('-l') + 1], 'auto');
  assert.equal(fs.existsSync(inputPath), false);
  assert.equal(fs.existsSync(outputPath), false);
});

test('whisper-cli pulisce la registrazione anche se il processo non può partire', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-whisper-spawn-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'whisper-stream.exe'), '');
  fs.writeFileSync(path.join(directory, 'whisper-cli.exe'), '');
  fs.writeFileSync(path.join(directory, 'ggml-base.bin'), '');
  let inputPath = '';
  const service = new NativeSpeechService({
    platform: 'win32',
    whisperDirectory: directory,
    spawnProcess: (_executable, args) => {
      inputPath = args[args.indexOf('-f') + 1];
      throw new Error('spawn failed');
    }
  });
  const wav = Buffer.alloc(44 + 3200);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  await assert.rejects(service.transcribeAudio({ audio: wav }), (error) => error.code === 'VOICE_BACKEND_UNAVAILABLE');
  assert.ok(inputPath);
  assert.equal(fs.existsSync(inputPath), false);
});

test('propaga la lingua rilevata automaticamente da Whisper', () => {
  assert.equal(detectedWhisperLanguage('whisper: auto-detected language: fr (p = 0.94)'), 'fr');
  assert.equal(detectedWhisperLanguage('nessuna diagnostica', 'de-DE'), 'de');
  assert.equal(detectedWhisperLanguage('nessuna diagnostica', 'auto'), 'und');
});

test('propaga una confidenza linguistica valida senza inventarla', () => {
  assert.equal(detectedWhisperConfidence('auto-detected language: it (p = 0.94)'), 0.94);
  assert.equal(detectedWhisperConfidence('nessuna probabilità'), null);
});

test('elimina rumore dichiarato e segmenti consecutivi duplicati', () => {
  assert.equal(normalizeTranscript('[Music]'), '');
  assert.equal(normalizeTranscript('Apri il browser. Apri il browser. Poi cerca NexusNXS.'), 'Apri il browser. Poi cerca NexusNXS.');
  assert.equal(normalizeTranscript('Crea una nuova cartella sul desktop Crea una nuova cartella sul desktop'), 'Crea una nuova cartella sul desktop');
});

test('chiude prima una frase completa e protegge i frammenti molto brevi', () => {
  assert.equal(transcriptStabilityThreshold('Apri Brave.'), 3);
  assert.equal(transcriptStabilityThreshold('Apri il browser'), 4);
  assert.equal(transcriptStabilityThreshold('Sì'), 5);
});

test('shutdown ferma ascolto e sonde microfono senza poterle riavviare', async () => {
  const taskkillCalls = [];
  let service;
  let activeKilled = false;
  let probeKilled = false;
  const active = {
    pid: 7101,
    kill(signal) {
      assert.equal(service.active, active);
      assert.equal(signal, 'SIGKILL');
      activeKilled = true;
      return true;
    }
  };
  const probe = {
    pid: 7102,
    nexusCancelProbe() {},
    kill(signal) {
      assert.equal(service.captureProbes.has(probe), true);
      assert.equal(signal, 'SIGKILL');
      probeKilled = true;
      return true;
    }
  };
  service = new NativeSpeechService({
    platform: 'win32',
    runTaskkill(command, args, options) {
      assert.equal(command, 'taskkill.exe');
      assert.deepEqual(args.slice(-2), ['/t', '/f']);
      assert.equal(options.windowsHide, true);
      taskkillCalls.push(args);
      return { status: 1 };
    }
  });
  service.active = active;
  service.captureProbes.add(probe);

  assert.equal(service.shutdown(), true);
  assert.equal(activeKilled, true);
  assert.equal(probeKilled, true);
  assert.deepEqual(taskkillCalls.map((args) => args[1]), ['7101', '7102']);
  assert.equal(service.active, null);
  assert.equal(service.captureProbes.size, 0);
  assert.equal(service.shutdown(), false);
  assert.deepEqual(await service.captureDevices(), []);
  await assert.rejects(service.transcribe(), (error) => error.code === 'VOICE_CANCELLED');
});
