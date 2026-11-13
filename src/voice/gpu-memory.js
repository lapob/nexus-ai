/**
 * @module voice/gpu-memory
 * @description Sonda della VRAM per decidere se una voce su GPU (Qwen3-TTS) può
 * convivere con l'LLM. Misurato il 12/11/2026 su RX 9070 XT 16 GB: con
 * qwen3:14b a 32K (13,7 GB) la VRAM si esaurisce, l'LLM riversa ~2 GB nella
 * memoria condivisa e il TTS scende da RTF 0,18 a 0,7–1,0. In quel caso la
 * voce resta Kokoro (CPU).
 */
const { execFile } = require('node:child_process');

// #region 01 — Fabbisogno e regola

/** VRAM misurata del worker (docs/QWEN3-TTS-EVALUATION.md), in MB. */
const QWEN3_VRAM_MB = Object.freeze({
  gguf: Object.freeze({ '0.6b': 1_250, '1.7b': 1_700 }),
  torch: Object.freeze({ '0.6b': 2_700, '1.7b': 4_600 })
});
const RESERVE_MB = 512;
const SPILL_LIMIT_MB = 1_024;

function requiredVramMb(runtime = 'torch', size = '0.6b') {
  return QWEN3_VRAM_MB[runtime]?.[size] ?? QWEN3_VRAM_MB.torch['0.6b'];
}

/**
 * Decide on one snapshot. The worker's own memory counts as available (it is
 * ours to give back); memory spilled by other processes into shared system
 * memory means the GPU is already oversubscribed.
 * @returns {{ allowed: boolean, reason: string, freeMb?: number, spillMb?: number }}
 */
function evaluateVram(snapshot, requiredMb, { reserveMb = RESERVE_MB, spillLimitMb = SPILL_LIMIT_MB } = {}) {
  if (!snapshot || !Number.isFinite(snapshot.totalMb) || snapshot.totalMb <= 0 || !Number.isFinite(snapshot.usedMb)) {
    return { allowed: true, reason: 'unknown' };
  }
  const own = Number.isFinite(snapshot.ownDedicatedMb) ? snapshot.ownDedicatedMb : 0;
  const ownShared = Number.isFinite(snapshot.ownSharedMb) ? snapshot.ownSharedMb : 0;
  const freeMb = Math.round(snapshot.totalMb - snapshot.usedMb + own);
  const spillMb = Math.max(0, Math.round((snapshot.sharedMb || 0) - ownShared));
  if (spillMb >= spillLimitMb) return { allowed: false, reason: 'spill', freeMb, spillMb };
  if (freeMb < requiredMb + reserveMb) return { allowed: false, reason: 'full', freeMb, spillMb };
  return { allowed: true, reason: 'ok', freeMb, spillMb };
}

// #endregion

// #region 02 — Lettura dei contatori Windows

/**
 * One PowerShell pass: total VRAM of the largest adapter (registry, 64 bit),
 * its dedicated/shared usage, and the usage of the owned process tree (a venv
 * python.exe is a launcher, so descendants count).
 */
function windowsProbeScript(ownPid) {
  const pid = Number.isInteger(ownPid) && ownPid > 0 ? ownPid : 0;
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    "$root='Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'",
    "$total=(@(Get-ChildItem -LiteralPath $root | ForEach-Object { [uint64](Get-ItemProperty -LiteralPath $_.PSPath).'HardwareInformation.qwMemorySize' }) | Measure-Object -Maximum).Maximum",
    "$c=(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage','\\GPU Adapter Memory(*)\\Shared Usage','\\GPU Process Memory(*)\\Dedicated Usage','\\GPU Process Memory(*)\\Shared Usage').CounterSamples",
    "$luid=$null; $used=0; foreach($s in $c){ if($s.Path -like '*gpu adapter memory*dedicated usage' -and $s.CookedValue -gt $used){ $used=$s.CookedValue; $luid=($s.InstanceName -replace '_phys.*','') } }",
    "$shared=0; foreach($s in $c){ if($luid -and $s.Path -like '*gpu adapter memory*shared usage' -and $s.InstanceName -like \"$luid*\"){ $shared+=$s.CookedValue } }",
    `$ids=@(${pid}); if(${pid}){ $all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId; $n=0; while($n -ne $ids.Count){ $n=$ids.Count; $ids=@($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId) | Sort-Object -Unique) } }`,
    "$od=0; $os=0; foreach($s in $c){ if($s.Path -like '*gpu process memory*' -and $luid -and $s.InstanceName -like \"*$luid*\"){ $p=[int]([regex]::Match($s.InstanceName,'pid_(\\d+)').Groups[1].Value); if($p -and $ids -contains $p){ if($s.Path -like '*dedicated usage'){ $od+=$s.CookedValue } elseif($s.Path -like '*shared usage'){ $os+=$s.CookedValue } } } }",
    "[pscustomobject]@{ totalMb=[math]::Round($total/1MB); usedMb=[math]::Round($used/1MB); sharedMb=[math]::Round($shared/1MB); ownDedicatedMb=[math]::Round($od/1MB); ownSharedMb=[math]::Round($os/1MB) } | ConvertTo-Json -Compress"
  ].join('; ');
}

function parseSnapshot(text) {
  try {
    const value = JSON.parse(String(text || '').trim());
    const numbers = ['totalMb', 'usedMb', 'sharedMb', 'ownDedicatedMb', 'ownSharedMb'].map((key) => [key, Number(value?.[key])]);
    if (!numbers.every(([, number]) => Number.isFinite(number) && number >= 0)) return null;
    const snapshot = Object.fromEntries(numbers);
    return snapshot.totalMb > 0 ? snapshot : null;
  } catch { return null; }
}

function readWindowsSnapshot({ ownPid, runFile = execFile, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve) => {
    try {
      runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProbeScript(ownPid)],
        { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' },
        (error, stdout) => resolve(error ? null : parseSnapshot(stdout)));
    } catch { resolve(null); }
  });
}

// #endregion

// #region 03 — Gate periodico

/**
 * Keeps a recent VRAM verdict without blocking callers: capabilities() reads
 * the last result synchronously, a background refresh updates it.
 */
class VramGate {
  constructor({ requiredMb, platform = process.platform, readSnapshot = readWindowsSnapshot, ownPid = () => null,
    intervalMs = 20_000, onChange = () => {}, now = () => Date.now() } = {}) {
    this.requiredMb = requiredMb;
    this.platform = platform;
    this.readSnapshot = readSnapshot;
    this.ownPid = ownPid;
    this.intervalMs = intervalMs;
    this.onChange = onChange;
    this.now = now;
    this.verdict = { allowed: true, reason: 'unknown' };
    this.checkedAt = 0;
    this.timer = null;
    this.inflight = null;
  }

  get supported() { return this.platform === 'win32'; }

  allowed() { return this.verdict.allowed !== false; }

  async refresh() {
    if (!this.supported) return this.verdict;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const snapshot = await this.readSnapshot({ ownPid: this.ownPid() });
      const next = evaluateVram(snapshot, this.requiredMb);
      const changed = next.allowed !== this.verdict.allowed;
      this.verdict = next;
      this.checkedAt = this.now();
      if (changed) { try { this.onChange(next); } catch {} }
      return next;
    })().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  start() {
    if (!this.supported || this.timer) return false;
    // Until the first reading, do not load a worker into a possibly full GPU:
    // Kokoro speaks, and the switch to allowed warms Qwen3 up.
    if (!this.checkedAt) this.verdict = { allowed: false, reason: 'pending' };
    this.refresh().catch(() => {});
    this.timer = setInterval(() => { this.refresh().catch(() => {}); }, this.intervalMs);
    this.timer.unref?.();
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// #endregion

module.exports = { QWEN3_VRAM_MB, RESERVE_MB, SPILL_LIMIT_MB, VramGate, evaluateVram, parseSnapshot, readWindowsSnapshot, requiredVramMb, windowsProbeScript };
