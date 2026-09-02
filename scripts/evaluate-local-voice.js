/**
 * @module scripts/evaluate-local-voice
 * @description Smoke benchmark ripetibile della voce neurale italiana locale.
 */
const fs = require('node:fs');
const path = require('node:path');
const { NeuralSpeechService } = require('../src/voice/neural-speech');
const pythonRuntimeManifest = require('../config/python-runtime.json');

// #region 01 — Casi e validazione WAV

const cases = [
  { id: 'prosodia', gender: 'male', delivery: 'warm', text: 'Ciao. Sono NexusNXS: ascolto, ragiono e rispondo con un ritmo naturale.' },
  { id: 'tecnico', gender: 'female', delivery: 'serious', text: 'La CPU usa il quaranta per cento; API, HTTPS, SSH e JSON sono operativi.' },
  { id: 'accenti', gender: 'male', delivery: 'calm', text: 'Perché la qualità è importante? Perché rende il dialogo più chiaro.' },
  { id: 'energia', gender: 'female', delivery: 'energetic', text: 'Perfetto! Ho completato il controllo e possiamo continuare.' },
  { id: 'dialogo', gender: 'male', delivery: 'warm', text: 'Va bene, ho capito. Prima preparo il progetto, poi controllo insieme a te che funzioni davvero.' },
  { id: 'pause', gender: 'female', delivery: 'calm', text: 'Un momento. Sto verificando i dettagli più importanti; appena ho finito, ti mostro il risultato.' }
];

function inspectWave(audio) {
  if (!Buffer.isBuffer(audio) || audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Il backend non ha prodotto un WAV valido.');
  }
  const sampleRate = audio.readUInt32LE(24);
  const byteRate = audio.readUInt32LE(28);
  const durationSeconds = byteRate ? (audio.length - 44) / byteRate : 0;
  return { bytes: audio.length, sampleRate, durationSeconds: Number(durationSeconds.toFixed(2)) };
}

// #endregion

// #region 02 — Benchmark locale

(async () => {
  const root = path.resolve(__dirname, '..');
  const service = new NeuralSpeechService({
    runtimeDirectory: path.join(root, 'vendor', 'kokoro'),
    pythonRuntimeDirectory: path.join(root, ...pythonRuntimeManifest.runtimeDirectory.split('/'))
  });
  if (!service.capabilities().available) throw new Error('Runtime Kokoro non disponibile.');
  const results = [];
  try {
    for (const item of cases) {
      const startedAt = performance.now();
      const result = await service.synthesize({ text: item.text, gender: item.gender, language: 'it', delivery: item.delivery });
      const wave = inspectWave(result.audio);
      const latencyMs = Math.round(performance.now() - startedAt);
      results.push({ id: item.id, phase: results.length ? 'warm' : 'cold-start', gender: item.gender, delivery: item.delivery, latencyMs, realTimeFactor: Number((latencyMs / 1000 / wave.durationSeconds).toFixed(2)), ...wave });
    }
  } finally {
    service.shutdown();
  }
  const warm = results.filter((item) => item.phase === 'warm');
  const report = {
    evaluatedAt: new Date().toISOString(),
    backend: 'kokoro-onnx',
    coldStartMs: results[0]?.latencyMs || 0,
    warmMedianMs: warm.map((item) => item.latencyMs).sort((a, b) => a - b)[Math.floor(warm.length / 2)] || 0,
    results
  };
  const target = path.join(root, 'qa-artifacts', 'local-voice-evaluation.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

// #endregion
