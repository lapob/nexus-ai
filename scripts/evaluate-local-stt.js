/**
 * @module scripts/evaluate-local-stt
 * @description Valuta Whisper su WAV reali con Word Error Rate ripetibile.
 */
const fs = require('node:fs');
const path = require('node:path');
const { NativeSpeechService } = require('../src/voice/native-speech');

// #region 01 — WER e dataset
function words(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean); }
function wordErrorRate(expected, actual) {
  const left = words(expected); const right = words(actual);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = left[i - 1] === right[j - 1] ? diagonal : 1 + Math.min(diagonal, row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return left.length ? row[right.length] / left.length : Number(right.length > 0);
}

function option(name, fallback = '') {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function safeLabel(value, fallback, maximum = 80) {
  const text = String(value || fallback).replace(/[^\p{L}\p{N} ._()-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maximum);
}

function validatedAudioPath(manifestPath, item, index) {
  if (!item || typeof item !== 'object') throw new Error(`Caso STT ${index + 1} non valido.`);
  const kind = item.kind === 'noise' ? 'noise' : 'speech';
  const expected = String(item.text || '').trim();
  const language = String(item.language || 'auto').trim().toLowerCase();
  if ((kind === 'speech' && (expected.length < 2 || expected.length > 2000))
    || (kind === 'noise' && expected.length > 0)) throw new Error(`Testo atteso non valido nel caso STT ${index + 1}.`);
  // Whisper accetta codici ISO 639; il gate non deve limitare artificialmente
  // la valutazione alle sole lingue europee iniziali.
  if (!/^(?:auto|[a-z]{2,3}(?:-[a-z]{2})?)$/i.test(language)) throw new Error(`Lingua non supportata nel caso STT ${index + 1}.`);
  const root = path.dirname(manifestPath);
  const audioPath = path.resolve(root, String(item.file || ''));
  const relative = path.relative(root, audioPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Audio fuori dal dataset nel caso STT ${index + 1}.`);
  if (path.extname(audioPath).toLowerCase() !== '.wav') throw new Error(`Il caso STT ${index + 1} deve usare un file WAV.`);
  const stat = fs.statSync(audioPath);
  if (!stat.isFile() || stat.size < 44 || stat.size > 100 * 1024 * 1024) throw new Error(`WAV non valido nel caso STT ${index + 1}.`);
  return {
    audioPath,
    expected,
    language,
    kind,
    speaker: safeLabel(item.speaker, 'anonymous'),
    device: safeLabel(item.device, 'unknown-device'),
    environment: safeLabel(item.environment, 'unspecified')
  };
}

function aggregateResults(results) {
  const speech = results.filter((item) => item.kind === 'speech');
  const noise = results.filter((item) => item.kind === 'noise');
  const averageWer = speech.length ? speech.reduce((sum, item) => sum + item.wer, 0) / speech.length : 1;
  const by = (field) => Object.fromEntries([...new Set(results.map((item) => item[field]))].sort().map((key) => {
    const group = results.filter((item) => item[field] === key);
    const spoken = group.filter((item) => item.kind === 'speech');
    const wer = spoken.length ? spoken.reduce((sum, item) => sum + item.wer, 0) / spoken.length : null;
    return [key, {
      cases: group.length,
      speechCases: spoken.length,
      accuracy: wer === null ? null : Number((1 - wer).toFixed(4)),
      falseActivations: group.filter((item) => item.kind === 'noise' && item.falseActivation).length
    }];
  }));
  return {
    accuracy: Number((1 - averageWer).toFixed(4)),
    averageWer: Number(averageWer.toFixed(4)),
    falseActivations: noise.filter((item) => item.falseActivation).length,
    falseActivationRate: noise.length
      ? Number((noise.filter((item) => item.falseActivation).length / noise.length).toFixed(4))
      : 0,
    latencyP50Ms: percentile(results.map((item) => item.latencyMs), 0.5),
    latencyP95Ms: percentile(results.map((item) => item.latencyMs), 0.95),
    languages: by('language'),
    devices: by('device'),
    environments: by('environment')
  };
}

// #endregion

// #region 02 — Esecuzione e report per lingua

async function run() {
  const dataset = option('dataset');
  if (!dataset) throw new Error('Uso: npm run voice:evaluate:stt -- --dataset=percorso/dataset.json');
  const manifestPath = path.resolve(dataset);
  const cases = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('Il dataset STT deve contenere almeno un caso.');
  const minimumAccuracy = Math.max(0, Math.min(100, Number(option('min-accuracy', '85'))));
  const maximumFalsePositive = Math.max(0, Math.min(100, Number(option('max-false-positive', '5'))));
  const minimumLanguageCases = Math.max(1, Math.min(100, Number(option('min-language-cases', '3')) || 3));
  if (!Number.isFinite(minimumAccuracy)) throw new Error('Soglia STT non valida.');
  const validatedCases = cases.map((item, index) => validatedAudioPath(manifestPath, item, index));
  const speechLanguages = [...new Set(validatedCases.filter((item) => item.kind === 'speech').map((item) => item.language))];
  const insufficient = speechLanguages.filter((language) => validatedCases.filter((item) => item.kind === 'speech' && item.language === language).length < minimumLanguageCases);
  if (insufficient.length) throw new Error(`Dataset STT insufficiente per: ${insufficient.join(', ')}. Servono almeno ${minimumLanguageCases} casi vocali per lingua.`);
  if (process.argv.includes('--validate-only')) {
    process.stdout.write(`Dataset STT valido: ${validatedCases.length} casi · ${speechLanguages.length} lingue · audio confinato.\n`);
    return;
  }
  const service = new NativeSpeechService({ whisperDirectory: path.join(__dirname, '..', 'vendor', 'whisper', 'windows-x64') });
  const results = [];
  try {
    for (let index = 0; index < cases.length; index += 1) {
      const { audioPath, expected, language, kind, speaker, device, environment } = validatedCases[index];
      const startedAt = performance.now();
      let result = { text: '', confidence: null, language };
      try {
        result = await service.transcribeAudio({ audio: fs.readFileSync(audioPath), language, timeoutSeconds: 45 });
      } catch (error) {
        if (kind !== 'noise' || error?.code !== 'VOICE_NO_SPEECH') throw error;
      }
      const actual = String(result.text || '').trim();
      results.push({
        file: path.basename(audioPath), kind, speaker, device, environment,
        language: result.language || language, expected, actual, confidence: result.confidence,
        wer: kind === 'speech' ? Number(wordErrorRate(expected, actual).toFixed(4)) : 0,
        falseActivation: kind === 'noise' && words(actual).length > 0,
        latencyMs: Math.round(performance.now() - startedAt)
      });
    }
  } finally { service.shutdown(); }
  const aggregate = aggregateResults(results);
  const report = { evaluatedAt: new Date().toISOString(), minimumAccuracy, maximumFalsePositive, minimumLanguageCases, cases: results.length, ...aggregate, results };
  const target = path.join(__dirname, '..', 'qa-artifacts', 'local-stt-evaluation.json');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`STT: ${results.length} casi · accuratezza ${(report.accuracy * 100).toFixed(1)}% · falsi richiami ${(report.falseActivationRate * 100).toFixed(1)}% · p95 ${report.latencyP95Ms} ms\n`);
  if (report.accuracy * 100 < minimumAccuracy || report.falseActivationRate * 100 > maximumFalsePositive) process.exitCode = 2;
}

if (require.main === module) run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { aggregateResults, percentile, validatedAudioPath, wordErrorRate, words };
// #endregion
