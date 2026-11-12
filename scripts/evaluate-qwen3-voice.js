/**
 * @module scripts/evaluate-qwen3-voice
 * @description Benchmark A/B ripetibile Kokoro vs Qwen3-TTS (latenza, primo audio,
 * RTF, VRAM, barge-in). Uso: node scripts/evaluate-qwen3-voice.js [--size 0.6b|1.7b] [--label nome]
 * Non scarica modelli: richiede i runtime già presenti in vendor/.
 */
const fs = require('node:fs');
const path = require('node:path');
const { NeuralSpeechService } = require('../src/voice/neural-speech');
const { spawnSync } = require('node:child_process');
const { createQwen3SpeechService } = require('../src/voice/qwen3-speech');
const pythonRuntimeManifest = require('../config/python-runtime.json');

/**
 * Dedicated VRAM of a process tree from the Windows counters (HIP/Vulkan/DML
 * agnostic). The tree matters: a venv python.exe is a launcher that runs the
 * real interpreter as a child process.
 */
function gpuProcessMb(pid) {
  if (process.platform !== 'win32' || !pid) return null;
  const script = `$all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId; $ids=@(${Number(pid)}); $n=0; while($n -ne $ids.Count){ $n=$ids.Count; $ids=@($ids + ($all | ? { $ids -contains $_.ParentProcessId } | % ProcessId) | Sort-Object -Unique) }; `
    + `$s=(Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | ? { $ids -contains [int]([regex]::Match($_.InstanceName,'pid_(\\d+)').Groups[1].Value) }; [math]::Round((($s | Measure-Object CookedValue -Sum).Sum)/1MB)`;
  const out = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  const value = Number.parseInt(String(out.stdout || '').trim(), 10);
  return Number.isFinite(value) ? value : null;
}

function qwen3Service(root, size, runtime) {
  const gguf = runtime === 'gguf';
  return createQwen3SpeechService({ runtime, enabled: true, size, vulkanDevices: argument('vulkan-devices', '0'),
    runtimeDirectory: path.join(root, 'vendor', gguf ? 'qwen3-tts-gguf' : 'qwen3-tts'),
    voicesDirectory: path.join(root, 'vendor', 'qwen3-tts', 'voices'),
    workerPath: path.join(root, 'src', 'voice', gguf ? 'qwen3-gguf-worker.py' : 'qwen3-worker.py') });
}

// #region 01 — Casi

const cases = [
  { id: 'prosodia', gender: 'male', text: 'Ciao. Sono NexusNXS: ascolto, ragiono e rispondo con un ritmo naturale.' },
  { id: 'tecnico', gender: 'female', text: 'La CPU usa il quaranta per cento; API, HTTPS, SSH e JSON sono operativi.' },
  { id: 'accenti', gender: 'male', text: 'Perché la qualità è importante? Perché rende il dialogo più chiaro.' },
  { id: 'energia', gender: 'female', text: 'Perfetto! Ho completato il controllo e possiamo continuare.' },
  { id: 'dialogo', gender: 'male', text: 'Va bene, ho capito. Prima preparo il progetto, poi controllo insieme a te che funzioni davvero.' },
  { id: 'pause', gender: 'female', text: 'Un momento. Sto verificando i dettagli più importanti; appena ho finito, ti mostro il risultato.' }
];
const bargeText = 'Ti racconto con calma come ho organizzato la giornata: prima le email urgenti, poi la riunione con il team, quindi la revisione del progetto e infine un riepilogo scritto.';

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function seconds(audio) {
  const byteRate = audio.readUInt32LE(28);
  return byteRate ? (audio.length - 44) / byteRate : 0;
}

const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

// #endregion

// #region 02 — Misure

async function measure(service, backend, outDir) {
  const results = [];
  for (const item of cases) {
    const startedAt = performance.now();
    let firstAudioMs = null;
    const result = await service.synthesize({ text: item.text, gender: item.gender, language: 'it', delivery: 'warm',
      onChunk: () => { if (firstAudioMs === null) firstAudioMs = Math.round(performance.now() - startedAt); } });
    const latencyMs = Math.round(performance.now() - startedAt);
    const duration = seconds(result.audio);
    if (outDir) fs.writeFileSync(path.join(outDir, `${backend}-${item.id}.wav`), result.audio);
    results.push({ id: item.id, gender: item.gender, phase: results.length ? 'warm' : 'first', latencyMs,
      firstAudioMs: firstAudioMs ?? latencyMs, audioSeconds: Number(duration.toFixed(2)),
      realTimeFactor: Number((latencyMs / 1000 / duration).toFixed(2)), ...(result.metrics || {}) });
  }
  return results;
}

async function bargeIn(service) {
  const startedAt = performance.now();
  let firstAt = null;
  let stopAt = null;
  const outcome = service.synthesize({ text: bargeText, gender: 'male', language: 'it',
    onChunk: () => {
      if (firstAt !== null) return;
      firstAt = performance.now();
      setTimeout(() => { stopAt = performance.now(); service.stop(); }, 400);
    } });
  try { await outcome; return { cancelled: false }; }
  catch (error) {
    return { cancelled: error?.code === 'VOICE_CANCELLED', firstAudioMs: firstAt && Math.round(firstAt - startedAt),
      stopToSettledMs: stopAt && Math.round(performance.now() - stopAt), workerStillWarm: Boolean(service.child && service.ready) };
  }
}

// #endregion

// #region 03 — Esecuzione

(async () => {
  const root = path.resolve(__dirname, '..');
  const size = argument('size', '0.6b');
  const runtime = argument('runtime', 'torch');
  const label = argument('label', runtime === 'gguf' ? `qwen3-gguf-${size}` : `qwen3-${size}`);
  const outDir = path.join(root, 'qa-artifacts', 'qwen3-voice', label);
  fs.mkdirSync(outDir, { recursive: true });
  const report = { evaluatedAt: new Date().toISOString(), label, size, runtime, engines: {} };

  if (!process.argv.includes('--skip-kokoro')) {
    const kokoro = new NeuralSpeechService({ workerPath: path.join(root, 'src', 'voice', 'neural-worker.py'),
      runtimeDirectory: path.join(root, 'vendor', 'kokoro'),
      pythonRuntimeDirectory: path.join(root, ...pythonRuntimeManifest.runtimeDirectory.split('/')) });
    if (kokoro.capabilities().available) {
      const coldAt = performance.now();
      await kokoro.synthesize({ text: 'Pronto.', language: 'it' });
      const coldStartMs = Math.round(performance.now() - coldAt);
      try { report.engines.kokoro = { coldStartMs, results: await measure(kokoro, 'kokoro', outDir) }; }
      finally { kokoro.shutdown(); }
    }
  }

  const qwen3 = qwen3Service(root, size, runtime);
  if (!qwen3.capabilities().available) throw new Error('Runtime Qwen3-TTS non disponibile.');
  try {
    const coldAt = performance.now();
    qwen3.warmUp();
    await qwen3.waitUntilReady(qwen3.child);
    const coldStartMs = Math.round(performance.now() - coldAt);
    const gpuReadyMb = gpuProcessMb(qwen3.child?.pid);
    const results = await measure(qwen3, label, outDir);
    const gpuAfterMb = gpuProcessMb(qwen3.child?.pid);
    report.engines.qwen3 = { coldStartMs, ready: qwen3.readyInfo, gpuProcessMb: { ready: gpuReadyMb, afterRun: gpuAfterMb },
      results, bargeIn: await bargeIn(qwen3) };
  } finally {
    qwen3.shutdown();
  }

  for (const engine of Object.values(report.engines)) {
    const warm = engine.results.filter((item) => item.phase === 'warm');
    engine.summary = { medianLatencyMs: median(warm.map((item) => item.latencyMs)), medianFirstAudioMs: median(warm.map((item) => item.firstAudioMs)),
      maxFirstAudioMs: Math.max(...warm.map((item) => item.firstAudioMs)), medianRtf: median(warm.map((item) => item.realTimeFactor)),
      peakVramMb: Math.max(0, ...engine.results.map((item) => item.vramPeakMb || 0)) || null, gpuProcessMb: engine.gpuProcessMb || null };
  }
  const target = path.join(outDir, 'report.json');
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ target: path.relative(root, target), ...Object.fromEntries(Object.entries(report.engines).map(([k, v]) => [k, { coldStartMs: v.coldStartMs, ...v.summary, bargeIn: v.bargeIn }])) }, null, 2)}\n`);
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

// #endregion
