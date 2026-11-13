/**
 * @module voice/voice-pack
 * @description Optional voice packs downloaded on request (Qwen3-TTS GGUF):
 * layout, sha256 manifest, verified installation and removal. The installer
 * never contains them; Kokoro remains the voice whenever a pack is missing.
 * Installation runs in the Electron main process, so all heavy work (hashing
 * 1.6 GB, extraction, retries) is asynchronous and never blocks the windows.
 */
// #region 01 — Layout e manifest

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const QWEN3_PACK_ID = 'qwen3-tts-gguf-0.6b';
const MANIFEST = 'manifest.json';
const MANIFEST_SCHEMA = 1;
// Relative POSIX paths only: no drive, backslash, control characters or ".." segments.
const SAFE_RELATIVE = { test: (value) => typeof value === 'string' && value.length > 0 && value.length <= 240
  && !/[\\:*?"<>|\u0000-\u001f]/.test(value) && !value.startsWith('/')
  && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..') };
// Qwen3 needs a Vulkan GPU with room for the TTS next to the LLM (docs/QWEN3-TTS-EVALUATION.md).
const MIN_GPU_BYTES = 12 * 1024 ** 3;
// qwen3_tts_gguf opens its log file under src/log on import: the only place a pack may write.
const MUTABLE_PREFIX = 'src/log/';

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

/** Synchronous hash, for the offline prepare script only. */
function sha256FileSync(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
    let read;
    while ((read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}

/** Streaming hash that yields to the event loop; onBytes reports progress. */
function sha256File(file, { onBytes, signal } = {}) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    const abort = () => stream.destroy(abortedError());
    signal?.addEventListener('abort', abort, { once: true });
    stream.on('data', (chunk) => { hash.update(chunk); onBytes?.(chunk.length); });
    stream.once('error', (error) => { signal?.removeEventListener('abort', abort); reject(error); });
    stream.once('end', () => { signal?.removeEventListener('abort', abort); resolve(hash.digest('hex')); });
  });
}

function abortedError() { return Object.assign(new Error('Installazione annullata.'), { code: 'ABORTED' }); }

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
  const files = listFiles(directory).filter((file) => file !== MANIFEST && !file.startsWith(MUTABLE_PREFIX)).sort().map((file) => {
    const full = path.join(directory, ...file.split('/'));
    return { path: file, size: fs.statSync(full).size, sha256: sha256FileSync(full) };
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
 * Fast structural check against the manifest: every listed file present with
 * its size, nothing unlisted (except the library log), the entry points there.
 */
function verifyPack(directory, { expectedId = QWEN3_PACK_ID } = {}) {
  const manifest = readManifest(directory);
  if (expectedId && manifest.id !== expectedId) throw new Error('Il pacchetto voce non corrisponde a quello richiesto.');
  const listed = new Set(manifest.files.map((file) => file.path));
  const extra = listFiles(directory).filter((file) => file !== MANIFEST && !listed.has(file) && !file.startsWith(MUTABLE_PREFIX));
  if (extra.length) throw new Error(`File non previsti nel pacchetto voce: ${extra.slice(0, 3).join(', ')}`);
  for (const file of manifest.files) {
    let stat;
    try { stat = fs.statSync(path.join(directory, ...file.path.split('/'))); } catch { throw new Error(`File mancante nel pacchetto voce: ${file.path}`); }
    if (!stat.isFile() || stat.size !== file.size) throw new Error(`Dimensione non valida: ${file.path}`);
  }
  for (const required of ['python/python.exe', 'worker.py']) {
    if (!listed.has(required)) throw new Error(`Il pacchetto voce non contiene ${required}.`);
  }
  return manifest;
}

/** Structural check plus the sha256 of every file, asynchronously, with byte progress. */
async function verifyPackIntegrity(directory, { expectedId = QWEN3_PACK_ID, onProgress, signal } = {}) {
  const manifest = verifyPack(directory, { expectedId });
  let done = 0;
  for (const file of manifest.files) {
    if (signal?.aborted) throw abortedError();
    const digest = await sha256File(path.join(directory, ...file.path.split('/')), { signal,
      onBytes: (bytes) => { done += bytes; onProgress?.({ phase: 'verify', received: done, total: manifest.bytes }); } });
    if (digest !== file.sha256) throw new Error(`Integrità non valida: ${file.path}`);
  }
  return manifest;
}

// #endregion
// #region 02 — Installazione verificata

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Windows keeps the DLLs of a worker that has just exited mapped for a moment (EBUSY/EPERM).
async function renameWithRetry(from, to, { attempts = 20, delayMs = 250 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try { await fs.promises.rename(from, to); return; } catch (error) {
      if (attempt >= attempts || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
      await pause(delayMs);
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
      if (signal?.aborted) throw abortedError();
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      onProgress?.({ phase: 'download', received, total });
    }
  } finally { await new Promise((resolve) => out.end(resolve)); }
  return hash.digest('hex');
}

function extractTar(archive, destination, { spawnProcess = spawn, signal } = {}) {
  // bsdtar di Windows rifiuta percorsi assoluti e "..": i file finiscono solo nella cartella di staging.
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return new Promise((resolve, reject) => {
    const child = spawnProcess(tar, ['-xf', archive, '-C', destination], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-400); });
    child.once('error', (error) => { signal?.removeEventListener('abort', abort); reject(error); });
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(abortedError());
      else if (code === 0) resolve();
      else reject(new Error(`Estrazione del pacchetto voce non riuscita${stderr ? `: ${stderr.trim().slice(0, 200)}` : ''}.`));
    });
  });
}

/**
 * Installs a pack from a local archive (.tar) or from the HTTPS URL of the
 * catalog. The archive sha256 must match the pinned value; every file is then
 * checked against the manifest before the staging folder replaces the old one.
 */
async function installPack({ packsRoot, archivePath, url, sha256, id = QWEN3_PACK_ID, fetchImpl, signal, onProgress, spawnProcess } = {}) {
  if (!packsRoot) throw new Error('Cartella dei pacchetti voce non configurata.');
  if (!archivePath && !url) throw new Error('Nessuna sorgente per il pacchetto voce.');
  if (url && !/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) throw new Error('Digest del pacchetto voce mancante.');
  await fs.promises.mkdir(packsRoot, { recursive: true });
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
      const total = (await fs.promises.stat(archive)).size;
      let received = 0;
      onProgress?.({ phase: 'hash', received, total });
      digest = await sha256File(archive, { signal, onBytes: (bytes) => { received += bytes; onProgress?.({ phase: 'hash', received, total }); } });
    }
    if (sha256 && digest !== String(sha256).toLowerCase()) throw new Error('Digest del pacchetto voce non corrispondente.');
    if (signal?.aborted) throw abortedError();
    await fs.promises.mkdir(staging);
    onProgress?.({ phase: 'extract' });
    await extractTar(archive, staging, { spawnProcess, signal });
    onProgress?.({ phase: 'verify', received: 0, total: 0 });
    const manifest = await verifyPackIntegrity(staging, { expectedId: id, onProgress, signal });
    const target = packDirectory(packsRoot, id);
    const previous = `${target}.old-${stamp}`;
    if (fs.existsSync(target)) await renameWithRetry(target, previous);
    try { await renameWithRetry(staging, target); } catch (error) {
      if (fs.existsSync(previous)) await renameWithRetry(previous, target);
      throw error;
    }
    await fs.promises.rm(previous, { recursive: true, force: true });
    onProgress?.({ phase: 'done' });
    return { id, version: manifest.version, bytes: manifest.bytes, directory: target };
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    await fs.promises.rm(download, { force: true });
  }
}

async function removePack({ packsRoot, id = QWEN3_PACK_ID } = {}) {
  const target = packDirectory(packsRoot, id);
  if (!fs.existsSync(target)) return false;
  // Rinomina prima di cancellare: un processo che usa ancora i file non lascia un pacchetto a metà.
  const trash = `${target}.removing-${process.pid}-${Date.now()}`;
  await renameWithRetry(target, trash);
  await fs.promises.rm(trash, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
  localArchive = '', localSha256 = '', activePackVersion = null, install = installPack, remove = removePack, restartApp = null } = {}) {
  let busy = null;
  let abort = null;
  let restartRequired = false;
  const status = () => {
    const current = packStatus({ packsRoot, hardware: getHardware(), catalog });
    return { ...current, available: current.available || Boolean(localArchive), busy, active: activePackVersion !== null && current.installed && !restartRequired,
      restartRequired: restartRequired || (current.installed && activePackVersion === null), canRestart: typeof restartApp === 'function' };
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
        await releaseVoice();
        const result = await install({ packsRoot, ...source, signal: abort.signal, onProgress });
        restartRequired = true;
        return { ...result, restartRequired: true };
      } finally { busy = null; abort = null; }
    },
    async remove() {
      if (busy) throw new Error('Operazione sul pacchetto voce già in corso.');
      busy = 'remove';
      try {
        await releaseVoice();
        const removed = await remove({ packsRoot });
        if (removed) restartRequired = activePackVersion !== null;
        return { removed, restartRequired };
      } finally { busy = null; }
    },
    cancel() { abort?.abort(); return Boolean(abort); },
    /** Restarts NexusNXS only when a pack change is waiting for it: the renderer cannot restart the app at will. */
    restart() {
      if (busy) throw new Error('Operazione sul pacchetto voce in corso.');
      if (!status().restartRequired || typeof restartApp !== 'function') return false;
      restartApp();
      return true;
    }
  };
}

// #endregion

module.exports = { QWEN3_PACK_ID, MIN_GPU_BYTES, packLayout, sha256File, sha256FileSync, buildManifest, readManifest, verifyPack,
  verifyPackIntegrity, packDirectory, installedPack, eligibility, packStatus, installPack, removePack, createVoicePackController };
