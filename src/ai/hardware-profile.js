/**
 * @module ai/hardware-profile
 * @description Rileva le risorse locali e produce una classe hardware stabile e testabile.
 */
// #region 01 — Classificazione pura

const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const GIB = 1024 ** 3;

function hardwareFingerprint() {
  const cpu = os.cpus()[0]?.model || 'unknown-cpu';
  return [process.platform, process.arch, os.hostname(), cpu, os.cpus().length].join('|');
}

function finiteBytes(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function classifyHardware(input = {}) {
  const totalMemoryBytes = finiteBytes(input.totalMemoryBytes);
  const gpuMemoryBytes = finiteBytes(input.gpuMemoryBytes);
  const cpuThreads = Math.max(1, Number(input.cpuThreads) || 1);
  const freeDiskBytes = input.freeDiskBytes == null ? null : finiteBytes(input.freeDiskBytes);
  const accelerated = Boolean(input.accelerated || gpuMemoryBytes >= 2 * GIB);
  let tier = 'lite';
  // Le soglie privilegiano stabilità e memoria libera per sistema operativo,
  // graph e voce: il modello massimo non viene proposto su macchine borderline.
  // Windows riserva una piccola parte della RAM fisica: 15/30 GiB
  // rappresentano rispettivamente macchine commercializzate come 16/32 GB.
  if (totalMemoryBytes >= 30 * GIB && (gpuMemoryBytes >= 10 * GIB || cpuThreads >= 16)) tier = 'performance';
  else if (totalMemoryBytes >= 15 * GIB && (gpuMemoryBytes >= 4 * GIB || cpuThreads >= 8)) tier = 'balanced';
  const performanceLevel = tier === 'performance'
    ? (totalMemoryBytes >= 30 * GIB && gpuMemoryBytes >= 14 * GIB)
      || (totalMemoryBytes >= 48 * GIB && cpuThreads >= 24) ? 5 : 4
    : tier === 'balanced'
      ? totalMemoryBytes >= 24 * GIB && (gpuMemoryBytes >= 6 * GIB || cpuThreads >= 12) ? 4 : 3
      : totalMemoryBytes >= 10 * GIB && cpuThreads >= 6 ? 2 : 1;
  return {
    tier,
    performanceLevel,
    totalMemoryBytes,
    gpuMemoryBytes,
    cpuThreads,
    freeDiskBytes,
    accelerated,
    gpuName: String(input.gpuName || '').slice(0, 160),
    platform: String(input.platform || process.platform)
  };
}

function runtimeTuning(hardware = {}) {
  const profile = classifyHardware(hardware);
  const memoryGiB = profile.totalMemoryBytes / GIB;
  const gpuGiB = profile.gpuMemoryBytes / GIB;
  const clamp = (minimum, maximum, value) => Math.max(minimum, Math.min(maximum, value));
  const stepped = (value, step) => Math.floor(value / step) * step;
  // Le formule crescono in modo continuo con il computer. La VRAM concede un
  // piccolo margine, mentre RAM e thread determinano contesto e output senza
  // legare il runtime a categorie commerciali o modelli specifici.
  const baseContext = profile.performanceLevel === 1 ? 1536 : 2048;
  const minimumContext = profile.performanceLevel >= 5 ? 16384
    : profile.performanceLevel >= 4 ? 8192 : baseContext;
  const maximumContext = profile.performanceLevel >= 5 ? 32768
    : profile.performanceLevel >= 4 ? 16384 : 12288;
  const contextTokens = clamp(minimumContext, maximumContext, stepped(
    baseContext + (Math.max(0, memoryGiB - 8) * 256) + (Math.min(gpuGiB, 16) * 64),
    512
  ));
  const cpuScale = clamp(0.72, 1, profile.cpuThreads / 12);
  const quickTokens = stepped(clamp(profile.performanceLevel === 1 ? 224 : 320, 1024, (contextTokens / 6) * cpuScale), 32);
  const deepTokens = stepped(clamp(640, profile.performanceLevel >= 5 ? 8192 : 4096, (contextTokens / 3) * cpuScale), 64);
  const plannerTokens = stepped(clamp(96, 384, (contextTokens / 20) * cpuScale), 16);
  const keepAliveMinutes = Math.round(clamp(3, 15, 3 + ((memoryGiB - 8) / 4) + Math.min(2, gpuGiB / 8)));
  // Il timeout cresce quando la velocità attesa diminuisce: un PC Lite non
  // deve fallire una risposta corretta solo perché genera meno token/secondo.
  // Sui PC veloci resta più breve, così un blocco reale viene recuperato prima.
  const quickTimeoutMs = profile.performanceLevel <= 1 ? 240_000
    : profile.performanceLevel === 2 ? 180_000 : 120_000;
  const deepTimeoutMs = profile.performanceLevel <= 1 ? 600_000
    : profile.performanceLevel === 2 ? 480_000
      : profile.performanceLevel === 3 ? 360_000 : 240_000;
  return Object.freeze({
    tier: profile.tier,
    performanceLevel: profile.performanceLevel,
    contextTokens,
    plannerTokens,
    quickTokens,
    deepTokens,
    keepAlive: `${keepAliveMinutes}m`,
    quickTimeoutMs,
    deepTimeoutMs,
    // Due modelli restano residenti soltanto quando esiste margine reale per
    // sistema, voce e WebGL. Su una workstation 32/16 il profilo Ultra può
    // occupare da solo VRAM e parte della RAM: Ollama deve quindi scaricare il
    // precedente invece di provocare paging e scatti dell'interfaccia.
    maxLoadedModels: profile.totalMemoryBytes >= 48 * GIB && profile.gpuMemoryBytes >= 20 * GIB ? 2 : 1,
    parallelRequests: 1
  });
}

// #endregion

// #region 02 — Rilevamento sistema

async function windowsVideoControllers() {
  if (process.platform !== 'win32') return [];
  const command = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"
  ];
  try {
    const { stdout } = await execFileAsync('powershell.exe', command, {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 256 * 1024
    });
    const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  } catch {
    return [];
  }
}

async function windowsRegistryVideoControllers() {
  if (process.platform !== 'win32') return [];
  const command = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$root='Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'; @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue; if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { [pscustomobject]@{ Name=[string]$p.DriverDesc; AdapterRAM=[uint64]$p.'HardwareInformation.qwMemorySize' } } }) | ConvertTo-Json -Compress"
  ];
  try {
    const { stdout } = await execFileAsync('powershell.exe', command, {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 256 * 1024
    });
    const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((controller) => (
      controller?.Name && finiteBytes(controller.AdapterRAM)
    ));
  } catch {
    return [];
  }
}

function parseNvidiaSmi(output) {
  return String(output || '').split(/\r?\n/).map((line) => {
    const separator = line.lastIndexOf(',');
    if (separator < 0) return null;
    const name = line.slice(0, separator).trim();
    const memoryMiB = Number(line.slice(separator + 1).trim());
    return name && Number.isFinite(memoryMiB) && memoryMiB > 0
      ? { Name: name, AdapterRAM: memoryMiB * 1024 ** 2 }
      : null;
  }).filter(Boolean);
}

async function nvidiaVideoControllers() {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('nvidia-smi.exe', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits'
    ], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 256 * 1024
    });
    return parseNvidiaSmi(stdout);
  } catch {
    return [];
  }
}

async function detectHardware({ app, storagePath, cachePath } = {}) {
  const deviceFingerprint = hardwareFingerprint();
  if (cachePath) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // Una cache breve mantiene rapido l'avvio ma rileva entro un giorno RAM,
      // GPU o driver sostituiti senza richiedere manutenzione manuale.
      const fresh = Date.now() - Number(cached.detectedAt) < 24 * 60 * 60 * 1000;
      const sameMemory = Math.abs(Number(cached.profile?.totalMemoryBytes) - os.totalmem()) < 512 * 1024 ** 2;
      const sameDevice = cached.deviceFingerprint === deviceFingerprint;
      if (cached.schemaVersion === 3 && fresh && sameMemory && sameDevice && cached.profile?.platform === process.platform) {
        return classifyHardware(cached.profile);
      }
    } catch {}
  }
  let freeDiskBytes = null;
  try {
    const stats = fs.statfsSync(storagePath || os.homedir());
    freeDiskBytes = stats.bavail * stats.bsize;
  } catch {}
  // NVIDIA SMI espone la VRAM reale anche quando Win32_VideoController la
  // tronca a 4 GiB. CIM resta il fallback portabile per gli altri produttori.
  // Le sonde sono indipendenti: in parallelo evitiamo fino a dieci secondi
  // sequenziali sui PC senza NVIDIA o con WMI lento.
  const [nvidiaControllers, registryControllers, windowsControllers, electronGpu] = await Promise.all([
    nvidiaVideoControllers(),
    windowsRegistryVideoControllers(),
    windowsVideoControllers(),
    Promise.resolve(app?.getGPUInfo?.('complete')).catch(() => ({}))
  ]);
  // AdapterRAM di Win32_VideoController è ancora a 32 bit su diversi driver
  // AMD e tronca schede da 8–24 GB a circa 4 GB. La proprietà QWORD del
  // registro conserva la VRAM reale; NVIDIA SMI resta la fonte più precisa.
  const controllers = nvidiaControllers.length
    ? nvidiaControllers
    : registryControllers.length
      ? registryControllers
      : windowsControllers;
  const primary = [...controllers].sort((left, right) => finiteBytes(right.AdapterRAM) - finiteBytes(left.AdapterRAM))[0];
  const gpuName = primary?.Name || electronGpu?.gpuDevice?.[0]?.deviceString || '';
  const gpuMemoryBytes = finiteBytes(primary?.AdapterRAM);
  const software = /microsoft basic|software|llvmpipe/i.test(gpuName);
  const profile = classifyHardware({
    totalMemoryBytes: os.totalmem(),
    gpuMemoryBytes,
    cpuThreads: os.cpus().length,
    freeDiskBytes,
    accelerated: Boolean(gpuName && !software),
    gpuName,
    platform: process.platform
  });
  if (cachePath) {
    try {
      fs.mkdirSync(require('node:path').dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        schemaVersion: 3,
        detectedAt: Date.now(),
        deviceFingerprint,
        profile
      }), { mode: 0o600 });
    } catch {}
  }
  return profile;
}

module.exports = {
  GIB,
  classifyHardware,
  detectHardware,
  nvidiaVideoControllers,
  parseNvidiaSmi,
  runtimeTuning,
  windowsRegistryVideoControllers,
  windowsVideoControllers
};

// #endregion
