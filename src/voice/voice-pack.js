/**
 * @module voice/voice-pack
 * @description Optional voice packs downloaded on request (Qwen3-TTS GGUF):
 * layout, sha256 manifest, verified installation and removal. The installer
 * never contains them; Kokoro remains the voice whenever a pack is missing.
 */
// #region 01 — Layout e manifest

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const QWEN3_PACK_ID = 'qwen3-tts-gguf-0.6b';
const MANIFEST = 'manifest.json';
const MANIFEST_SCHEMA = 1;
// Relative POSIX paths only: no drive, backslash, control characters or ".." segments.
const SAFE_RELATIVE = { test: (value) => typeof value === 'string' && value.length > 0 && value.length <= 240
  && !/[\\:*?"<>|\u0000-\u001f]/.test(value) && !value.startsWith('/')
  && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..') };
// Qwen3 needs a Vulkan GPU with room for the TTS next to the LLM (docs/QWEN3-TTS-EVALUATION.md).
const MIN_GPU_BYTES = 12 * 1024 ** 3;

function packLayout(directory) {
  return {
    root: directory,
    manifest: path.join(directory, MANIFEST),
    python: path.join(directory, 'python', 'python.exe'),
    sitePackages: path.join(directory, 'site-packages'),
    worker: path.join(directory, 'worker.py'),
    voices: path.join(directory, 'voices')
  };
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
    let read;
    while ((read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}

function listFiles(root, relative = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Collegamento non ammesso nel pacchetto: ${child}`);
    if (entry.isDirectory()) out.push(...listFiles(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

/** Builds the manifest of a prepared pack directory (used by the prepare script). */
function buildManifest(directory, { id = QWEN3_PACK_ID, version, engine = 'qwen3-tts-gguf', size = '0.6b' } = {}) {
  const files = listFiles(directory).filter((file) => file !== MANIFEST && !file.startsWith('src/log/')).sort().map((file) => {
    const full = path.join(directory, ...file.split('/'));
    return { path: file, size: fs.statSync(full).size, sha256: sha256File(full) };
  });
  return { schema: MANIFEST_SCHEMA, id, version: String(version || '1'), engine, size, bytes: files.reduce((sum, file) => sum + file.size, 0), files };
}

function readManifest(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, MANIFEST), 'utf8'));
  if (manifest?.schema !== MANIFEST_SCHEMA || typeof manifest.id !== 'string' || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Manifest del pacchetto voce non valido.');
  }
  for (const file of manifest.files) {
    if (!SAFE_RELATIVE.test(String(file?.path || '')) || file.path === MANIFEST
      || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(String(file.sha256 || ''))) {
      throw new Error(`Voce del manifest non valida: ${String(file?.path || '').slice(0, 80)}`);
    }
  }
  return manifest;
}

/**
 * Checks a pack directory against its manifest: files present with the
 * expected size (fast) and, with deep, the sha256 of each file. Files that
 * the manifest does not list are refused.
 */
function verifyPack(directory, { deep = false, expectedId = QWEN3_PACK_ID } = {}) {
  const manifest = readManifest(directory);
  if (expectedId && manifest.id !== expectedId) throw new Error('Il pacchetto voce non corrisponde a quello richiesto.');
  const listed = new Set(manifest.files.map((file) => file.path));
  // qwen3_tts_gguf opens its log file under src/log on import: the only place a pack may write.
  const extra = listFiles(directory).filter((file) => file !== MANIFEST && !listed.has(file) && !file.startsWith('src/log/'));
  if (extra.length) throw new Error(`File non previsti nel pacchetto voce: ${extra.slice(0, 3).join(', ')}`);
  for (const file of manifest.files) {
    const full = path.join(directory, ...file.path.split('/'));
    let stat;
    try { stat = fs.statSync(full); } catch { throw new Error(`File mancante nel pacchetto voce: ${file.path}`); }
    if (!stat.isFile() || stat.size !== file.size) throw new Error(`Dimensione non valida: ${file.path}`);
    if (deep && sha256File(full) !== file.sha256) throw new Error(`Integrità non valida: ${file.path}`);
  }
  for (const required of ['python/python.exe', 'worker.py']) {
    if (!listed.has(required)) throw new Error(`Il pacchetto voce non contiene ${required}.`);
  }
  return manifest;
}

// #endregion
// #region 02 — Installazione verificata

// Windows keeps the DLLs of a worker that has just exited mapped for a moment (EBUSY/EPERM).
function renameWithRetry(from, to, { attempts = 20, delayMs = 250 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try { fs.renameSync(from, to); return; } catch (error) {
      if (attempt >= attempts || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

function packDirectory(packsRoot, id = QWEN3_PACK_ID) { return path.join(packsRoot, id); }

function installedPack(packsRoot, id = QWEN3_PACK_ID) {
  const directory = packDirectory(packsRoot, id);
  try { return { directory, layout: packLayout(directory), manifest: verifyPack(directory, { expectedId: id }) }; } catch { return null; }
}

function eligibility(hardware = {}) {
  const gpuBytes = Number(hardware.gpuMemoryBytes) || 0;
  const windows = (hardware.platform || process.platform) === 'win32';
  if (!windows) return { eligible: false, reason: 'platform' };
  if (gpuBytes < MIN_GPU_BYTES) return { eligible: false, reason: 'gpu-memory' };
  return { eligible: true, reason: null };
}

function packStatus({ packsRoot, hardware, catalog = {}, id = QWEN3_PACK_ID } = {}) {
  const installed = installedPack(packsRoot, id);
  const offer = catalog[id] || {};
  return {
    id,
    installed: Boolean(installed),
    version: installed?.manifest.version || null,
    bytes: installed?.manifest.bytes || null,
    available: Boolean(offer.url && offer.sha256),
    downloadBytes: Number(offer.bytes) || null,
    ...eligibility(hardware)
  };
}

async function downloadTo(url, target, { fetchImpl = fetch, signal, onProgress } = {}) {
  if (!/^https:\/\//i.test(String(url))) throw new Error('Il pacchetto voce si scarica solo via HTTPS.');
  const response = await fetchImpl(url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download del pacchetto voce non riuscito (${response.status}).`);
  const total = Number(response.headers?.get?.('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(target, { flags: 'wx' });
  let received = 0;
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      onProgress?.({ phase: 'download', received, total });
    }
  } finally { await new Promise((resolve) => out.end(resolve)); }
  return hash.digest('hex');
}

function extractTar(archive, destination, { runTar = spawnSync } = {}) {
  // bsdtar di Windows rifiuta percorsi assoluti e "..": i file finiscono solo nella cartella di staging.
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const result = runTar(tar, ['-xf', archive, '-C', destination], { windowsHide: true, encoding: 'utf8', timeout: 20 * 60_000 });
  if (result.error || result.status !== 0) throw new Error(`Estrazione del pacchetto voce non riuscita${result.stderr ? `: ${String(result.stderr).trim().slice(0, 200)}` : ''}.`);
}

/**
 * Installs a pack from a local archive (.tar) or from the HTTPS URL of the
 * catalog. The archive sha256 must match the pinned value; every file is then
 * checked against the manifest before the staging folder replaces the old one.
 */
async function installPack({ packsRoot, archivePath, url, sha256, id = QWEN3_PACK_ID, fetchImpl, signal, onProgress, runTar } = {}) {
  if (!packsRoot) throw new Error('Cartella dei pacchetti voce non configurata.');
  if (!archivePath && !url) throw new Error('Nessuna sorgente per il pacchetto voce.');
  if (url && !/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) throw new Error('Digest del pacchetto voce mancante.');
  fs.mkdirSync(packsRoot, { recursive: true });
  const stamp = `${process.pid}-${Date.now()}`;
  const staging = path.join(packsRoot, `.staging-${id}-${stamp}`);
  const download = path.join(packsRoot, `.download-${id}-${stamp}.tar`);
  try {
    let archive = archivePath;
    let digest;
    if (url) {
      digest = await downloadTo(url, download, { fetchImpl, signal, onProgress });
      archive = download;
    } else if (sha256) {
      onProgress?.({ phase: 'hash' });
      digest = sha256File(archive);
    }
    if (sha256 && digest !== String(sha256).toLowerCase()) throw new Error('Digest del pacchetto voce non corrispondente.');
    if (signal?.aborted) throw Object.assign(new Error('Installazione annullata.'), { code: 'ABORTED' });
    fs.mkdirSync(staging);
    onProgress?.({ phase: 'extract' });
    extractTar(archive, staging, { runTar });
    onProgress?.({ phase: 'verify' });
    const manifest = verifyPack(staging, { deep: true, expectedId: id });
    const target = packDirectory(packsRoot, id);
    const previous = `${target}.old-${stamp}`;
    if (fs.existsSync(target)) renameWithRetry(target, previous);
    try { fs.renameSync(staging, target); } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, target);
      throw error;
    }
    fs.rmSync(previous, { recursive: true, force: true });
    onProgress?.({ phase: 'done' });
    return { id, version: manifest.version, bytes: manifest.bytes, directory: target };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(download, { force: true });
  }
}

function removePack({ packsRoot, id = QWEN3_PACK_ID } = {}) {
  const target = packDirectory(packsRoot, id);
  if (!fs.existsSync(target)) return false;
  // Rinomina prima di cancellare: un processo che usa ancora i file non lascia un pacchetto a metà.
  const trash = `${target}.removing-${process.pid}-${Date.now()}`;
  renameWithRetry(target, trash);
  fs.rmSync(trash, { recursive: true, force: true });
  return true;
}

// #endregion
// #region 03 — Controller per l'app

/**
 * One install/remove at a time, from the pinned catalog (config/voice-packs.json)
 * or, for the owner, from a local archive (NEXUS_QWEN3_PACK_ARCHIVE). The
 * running voice is released before files change; the new pack is used after
 * NexusNXS restarts, Kokoro speaks meanwhile.
 */
function createVoicePackController({ packsRoot, catalog = {}, getHardware = () => ({}), releaseVoice = () => {},
  localArchive = '', localSha256 = '', activePackVersion = null, install = installPack, remove = removePack } = {}) {
  let busy = null;
  let abort = null;
  let restartRequired = false;
  const status = () => {
    const current = packStatus({ packsRoot, hardware: getHardware(), catalog });
    return { ...current, available: current.available || Boolean(localArchive), busy, active: activePackVersion !== null && current.installed && !restartRequired,
      restartRequired: restartRequired || (current.installed && activePackVersion === null) };
  };
  return {
    status,
    async install({ onProgress } = {}) {
      if (busy) throw new Error('Operazione sul pacchetto voce già in corso.');
      const current = status();
      if (!current.eligible) throw new Error('Questo computer non ha la GPU richiesta dalla voce Qwen3 (almeno 12 GB di VRAM).');
      const offer = catalog[QWEN3_PACK_ID] || {};
      const source = offer.url && offer.sha256 ? { url: offer.url, sha256: offer.sha256 } : localArchive ? { archivePath: localArchive, sha256: localSha256 || undefined } : null;
      if (!source) throw new Error('Il pacchetto voce Qwen3 non è ancora pubblicato.');
      busy = 'install';
      abort = new AbortController();
      try {
        releaseVoice();
        const result = await install({ packsRoot, ...source, signal: abort.signal, onProgress });
        restartRequired = true;
        return { ...result, restartRequired: true };
      } finally { busy = null; abort = null; }
    },
    remove() {
      if (busy) throw new Error('Operazione sul pacchetto voce già in corso.');
      busy = 'remove';
      try {
        releaseVoice();
        const removed = remove({ packsRoot });
        if (removed) restartRequired = activePackVersion !== null;
        return { removed, restartRequired };
      } finally { busy = null; }
    },
    cancel() { abort?.abort(); return Boolean(abort); }
  };
}

// #endregion

module.exports = { QWEN3_PACK_ID, MIN_GPU_BYTES, packLayout, sha256File, buildManifest, readManifest, verifyPack,
  packDirectory, installedPack, eligibility, packStatus, installPack, removePack, createVoicePackController };
