/**
 * @module scripts/evaluate-qwen3-coexistence
 * @description Misura la convivenza GPU fra Qwen3-TTS e un LLM Ollama già avviato:
 * VRAM libera, primo audio e token/s con LLM residente inattivo e in generazione.
 * Uso: node scripts/evaluate-qwen3-coexistence.js --ollama http://127.0.0.1:11436 --model qwen3:14b [--size 0.6b]
 * Non avvia né arresta Ollama e non scarica modelli.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Qwen3SpeechService } = require('../src/voice/qwen3-speech');

const argument = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const sentences = [
  'Ciao. Sono NexusNXS: ascolto, ragiono e rispondo con un ritmo naturale.',
  'Va bene, ho capito. Prima preparo il progetto, poi controllo insieme a te che funzioni davvero.',
  'Un momento. Sto verificando i dettagli più importanti; appena ho finito, ti mostro il risultato.'
];
const median = (values) => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function generate(base, model, numPredict = 256) {
  const response = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: 'Spiega in italiano, in modo dettagliato, come organizzare una settimana di lavoro.', stream: false, think: false,
      keep_alive: '10m', options: { num_predict: numPredict, temperature: 0.2 } }) });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const body = await response.json();
  return { tokens: body.eval_count, tokensPerSecond: Number((body.eval_count / (body.eval_duration / 1e9)).toFixed(1)) };
}

async function loaded(base) {
  const body = await (await fetch(`${base}/api/ps`)).json();
  return (body.models || []).map((m) => ({ name: m.name, vramMb: Math.round((m.size_vram || 0) / 2 ** 20), totalMb: Math.round((m.size || 0) / 2 ** 20) }));
}

async function speak(service) {
  const rows = [];
  for (const text of sentences) {
    const started = performance.now();
    let first = null;
    const result = await service.synthesize({ text, language: 'it', onChunk: () => { if (first === null) first = Math.round(performance.now() - started); } });
    const total = Math.round(performance.now() - started);
    rows.push({ firstAudioMs: first ?? total, totalMs: total, audioMs: result.metrics?.audioMs, gpuFreeMb: result.metrics?.gpuFreeMb, vramPeakMb: result.metrics?.vramPeakMb });
  }
  return { medianFirstAudioMs: median(rows.map((r) => r.firstAudioMs)), maxFirstAudioMs: Math.max(...rows.map((r) => r.firstAudioMs)),
    medianRtf: median(rows.map((r) => r.totalMs / r.audioMs)), minGpuFreeMb: Math.min(...rows.map((r) => r.gpuFreeMb)), rows };
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const base = argument('ollama', 'http://127.0.0.1:11436');
  const model = argument('model', 'qwen3:14b');
  const size = argument('size', '0.6b');
  const report = { evaluatedAt: new Date().toISOString(), model, size };
  report.llmAlone = await generate(base, model);
  report.llmLoaded = await loaded(base);
  const service = new Qwen3SpeechService({ enabled: true, size, runtimeDirectory: path.join(root, 'vendor', 'qwen3-tts'),
    workerPath: path.join(root, 'src', 'voice', 'qwen3-worker.py') });
  try {
    const coldAt = performance.now();
    service.warmUp();
    await service.waitUntilReady(service.child);
    report.ttsColdStartMs = Math.round(performance.now() - coldAt);
    report.ttsReady = service.readyInfo;
    report.ttsWithIdleLlm = await speak(service);
    const llm = generate(base, model, 384);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    report.ttsDuringLlm = await speak(service);
    report.llmDuringTts = await llm;
    report.llmLoadedAfter = await loaded(base);
  } finally { service.shutdown(); }
  const dir = path.join(root, 'qa-artifacts', 'qwen3-voice');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `coexistence-${model.replace(/[^a-z0-9.]+/gi, '_')}-${size}.json`);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  const { rows: _a, ...idle } = report.ttsWithIdleLlm; const { rows: _b, ...busy } = report.ttsDuringLlm;
  process.stdout.write(`${JSON.stringify({ target: path.relative(root, target), llmAlone: report.llmAlone, llmLoaded: report.llmLoaded, ttsReady: report.ttsReady,
    ttsColdStartMs: report.ttsColdStartMs, idle, busy, llmDuringTts: report.llmDuringTts, llmLoadedAfter: report.llmLoadedAfter }, null, 2)}\n`);
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
