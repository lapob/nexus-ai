/**
 * @module scripts/ensure-ollama-runtime
 * @description Preflight di sviluppo: prepara Ollama e i modelli adatti al PC prima di Electron.
 *
 * Il setup distribuito usa il runtime gestito incluso nel pacchetto. Questo script
 * serve esclusivamente a rendere `npm start` ripetibile anche su una nuova macchina.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { detectHardware } = require('../src/ai/hardware-profile');
const {
  developmentProfile,
  canonicalModelId,
  MODEL_CATALOG,
  MODEL_PROFILES,
  profileModels,
} = require('../src/ai/model-manifest');
const { libraryModels, loaderSafeOllamaLibrary, resolveOllamaLibrary } = require('../src/ai/ollama-library');
const { assertOllamaRuntimeSecure } = require('../src/ai/ollama-runtime-security');

// #region 01 — Percorsi e diagnostica

const projectRoot = path.resolve(__dirname, '..');
const portableDirectory = path.join(projectRoot, 'vendor', 'ollama', 'windows-x64');
const portableExecutable = path.join(portableDirectory, 'ollama.exe');
// La libreria di sviluppo appartiene al workspace privato del proprietario.
// Il pacchetto commerciale non usa questo percorso hardcoded.
let modelsDirectory = null;
// NEXUSNXS usa una porta privata: un Ollama globale può essere già attivo sulla
// 11434 con una libreria diversa e non deve essere terminato o riconfigurato.
const baseUrl = 'http://127.0.0.1:11435';
const checkOnly = process.argv.includes('--check-only');
const runtimeOnly = process.argv.includes('--runtime-only');

function message(text) {
  process.stdout.write(`[NEXUSNXS AI] ${text}\n`);
}

async function request(route, options = {}) {
  return fetch(`${baseUrl}${route}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 2500)
  });
}

async function engineReady() {
  try {
    const response = await request('/api/version');
    return response.ok;
  } catch {
    return false;
  }
}

function findRuntime() {
  // Il runtime vendorizzato e verificato e la sorgente canonica anche in
  // sviluppo. L'installazione globale resta solo un fallback esplicito: in
  // questo modo il progetto continua a funzionare dopo la sua disinstallazione.
  const lookup = spawnSync('where.exe', ['ollama.exe'], {
    encoding: 'utf8',
    windowsHide: true
  });
  const installed = lookup.status === 0
    ? String(lookup.stdout).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  const candidates = [...new Set([...(fs.existsSync(portableExecutable) ? [portableExecutable] : []), ...installed])];
  const rejected = [];
  for (const candidate of candidates) {
    try {
      const audit = assertOllamaRuntimeSecure(candidate, { usage: 'development', host: '127.0.0.1' });
      message(`Runtime verificato: Ollama ${audit.version}.`);
      for (const warning of audit.warnings) message(`Avviso sicurezza ${warning.code}: ${warning.message}`);
      return candidate;
    } catch (error) {
      rejected.push(`${path.basename(candidate)}: ${error.message}`);
    }
  }
  if (rejected.length) throw new Error(`Nessun runtime Ollama supera il gate di sicurezza. ${rejected.join(' | ')}`);
  return null;
}

function resolveDevelopmentModelsDirectory() {
  const selected = resolveOllamaLibrary(Object.keys(MODEL_CATALOG), {
    env: process.env,
    preferredDriveRoots: [path.resolve(projectRoot, '..')]
  });
  const runtimePath = loaderSafeOllamaLibrary(selected.path, { projectRoot });
  message(`Libreria modelli: ${runtimePath} (${selected.source}).`);
  return runtimePath;
}

// #endregion

// #region 02 — Installazione e avvio del motore

function preparePortableRuntime() {
  message('Ollama non è installato: scarico il runtime ufficiale firmato...');
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'prepare-ollama-runtime.ps1'),
    '-Destination', portableDirectory
  ], { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0 || !fs.existsSync(portableExecutable)) {
    throw new Error('Installazione controllata del runtime Ollama non riuscita.');
  }
  assertOllamaRuntimeSecure(portableExecutable, { usage: 'development', host: '127.0.0.1' });
  return portableExecutable;
}

function startRuntime(executable) {
  fs.mkdirSync(modelsDirectory, { recursive: true });
  const child = spawn(executable, ['serve'], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11435',
      OLLAMA_MODELS: modelsDirectory,
      OLLAMA_NOPRUNE: '1',
      OLLAMA_KEEP_ALIVE: '15m',
      OLLAMA_FLASH_ATTENTION: '1'
    }
  });
  child.unref();
}

async function waitForRuntime(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await engineReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('Ollama non è diventato disponibile entro 30 secondi.');
}

// #endregion

// #region 03 — Verifica e download modelli

async function installedModels() {
  const response = await request('/api/tags', { timeoutMs: 5000 });
  if (!response.ok) throw new Error(`Catalogo modelli non disponibile (${response.status}).`);
  const payload = await response.json();
  return new Set((payload.models || []).map(canonicalModelId).filter(Boolean));
}

function hasModel(installed, requested) {
  return installed.has(canonicalModelId(requested));
}

async function pullModel(model) {
  message(`Scarico il modello mancante ${model}...`);
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal: AbortSignal.timeout(60 * 60 * 1000)
  });
  if (!response.ok || !response.body) throw new Error(`Download di ${model} rifiutato (${response.status}).`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastPercent = -1;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(String(event.error));
      const percent = event.total > 0 ? Math.floor(event.completed / event.total * 100) : -1;
      if (percent >= 0 && (percent === 100 || percent >= lastPercent + 5)) {
        lastPercent = percent;
        message(`${model}: ${percent}%`);
      }
    }
    if (done) break;
  }
}

// #endregion

// #region 04 — Orchestrazione preflight

async function localHardware() {
  return detectHardware({ storagePath: modelsDirectory || projectRoot });
}

async function main() {
  modelsDirectory = resolveDevelopmentModelsDirectory();
  const hardware = await localHardware();
  const installedFromDisk = fs.existsSync(path.join(modelsDirectory, 'manifests'))
    ? libraryModels(modelsDirectory)
    : [];
  const profileId = developmentProfile(hardware, installedFromDisk);
  const requiredModels = profileModels(MODEL_PROFILES[profileId]);
  message(`Profilo sviluppo selezionato: ${profileId} · ${hardware.gpuName || 'CPU'} · ${hardware.cpuThreads} thread.`);

  let ready = await engineReady();
  const reusedRuntime = ready;
  let executable = ready ? findRuntime() : findRuntime();
  if (checkOnly) {
    message(`Motore: ${ready ? 'attivo' : executable ? 'presente ma non attivo' : 'mancante'}.`);
    message(`Modelli richiesti: ${requiredModels.join(', ')}.`);
    return;
  }

  if (!ready) {
    executable ||= preparePortableRuntime();
    message(`Avvio Ollama con i modelli in ${modelsDirectory}...`);
    startRuntime(executable);
    await waitForRuntime();
    ready = true;
  }

  const installed = await installedModels();
  const missing = requiredModels.filter((model) => !hasModel(installed, model));
  if (!missing.length) {
    message('Runtime e modelli richiesti sono pronti.');
    return;
  }

  if (runtimeOnly) {
    message('Runtime pronto; i modelli mancanti potranno essere installati dall’interfaccia.');
    return;
  }

  // Una porta già occupata potrebbe appartenere a un Ollama avviato con una
  // libreria diversa. In quel caso non scarichiamo mai nel percorso ignoto.
  if (reusedRuntime) {
    throw new Error('La porta AI privata è occupata da un runtime non identificato; chiudilo e ripeti npm start.');
  }
  message(`Modelli mancanti: ${missing.join(', ')}.`);
  for (const model of missing) await pullModel(model);
  message('Preparazione AI completata.');
}

main().catch((error) => {
  process.stderr.write(`[NEXUSNXS AI] ${error.message}\n`);
  process.exitCode = 1;
});

// #endregion
