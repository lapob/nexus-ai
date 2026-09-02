/**
 * @module scripts/provision-expressive-voice
 * @description Installa opzionalmente Chatterbox V3 solo su workstation compatibili.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { detectHardware, GIB } = require('../src/ai/hardware-profile');
const pythonRuntimeManifest = require('../config/python-runtime.json');

// #region 01 — Compatibilità e percorsi

const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'vendor', 'chatterbox');
const python = path.join(root, ...pythonRuntimeManifest.runtimeDirectory.split('/'), 'python.exe');
const sitePackages = path.join(runtime, '.venv', 'Lib', 'site-packages');
const pipCache = path.resolve(root, '..', '.toolchains', 'cache', 'pip');
const force = process.argv.includes('--force');

// #endregion

// #region 02 — Installazione verificabile

(async () => {
  const hardware = await detectHardware();
  const totalMemoryGb = Math.round(hardware.totalMemoryBytes / GIB);
  const gpuMemoryGb = Math.round(hardware.gpuMemoryBytes / GIB);
  const compatible = hardware.performanceLevel >= 4 && gpuMemoryGb >= 8 && totalMemoryGb >= 24;
  if (!compatible && !force) {
    process.stdout.write(`Chatterbox non installato: servono almeno 24 GB RAM e 8 GB VRAM (rilevati ${totalMemoryGb} GB RAM, ${gpuMemoryGb} GB VRAM). Kokoro resta attivo.\n`);
    return;
  }
  if (!fs.existsSync(python)) throw new Error('Runtime Python portabile mancante.');
  fs.mkdirSync(sitePackages, { recursive: true });
  fs.mkdirSync(pipCache, { recursive: true });
  const result = spawnSync(python, ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--upgrade', '--target', sitePackages, 'chatterbox-tts'], {
    cwd: runtime,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PIP_CACHE_DIR: pipCache }
  });
  if (result.status !== 0) throw new Error('Installazione Chatterbox non riuscita.');
  fs.mkdirSync(path.join(runtime, 'models', 'hub'), { recursive: true });
  process.stdout.write('Runtime Chatterbox installato. Il modello V3 sarà scaricato e verificato al primo warm-up.\n');
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

// #endregion
