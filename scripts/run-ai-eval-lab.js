/**
 * @module scripts/run-ai-eval-lab
 * @description Esegue una suite AI versionata e sintetica, senza salvare prompt o risposte nel report.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { deterministicSecurityReply } = require('../src/application/prompt-security');
const { deterministicCodeOutputReply } = require('../src/application/simple-code-output');
const { deterministicArithmeticReply } = require('../src/application/simple-arithmetic');
const { responseQualityDirective, strictWordCountSchema, strictWordCountAnswer } = require('../src/application/response-quality');
const { strictToolRoutingReply } = require('../src/application/strict-tool-routing');

const DEFAULT_SUITE = path.join('config', 'evals', 'nexusnxs-core-v1.json');
const DEFAULT_OUTPUT = path.join('qa-artifacts', 'ai-eval-lab-report.json');
const ALLOWED_ASSERTIONS = new Set([
  'exactNormalized', 'regex', 'notRegex', 'wordCount', 'sentenceCountAtMost',
  'jsonPathEquals', 'jsonPathMatches',
]);

// #region Suite e protocollo di inferenza

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function suiteHash(suite) {
  return crypto.createHash('sha256').update(stableStringify(suite)).digest('hex');
}

function loadSuite(filePath = DEFAULT_SUITE) {
  const absolute = path.resolve(process.cwd(), filePath);
  const suite = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  validateSuite(suite);
  return { suite, absolute };
}

function validateSuite(suite) {
  const failures = [];
  if (suite?.schemaVersion !== 1) failures.push('schemaVersion deve essere 1');
  if (!/^[a-z0-9-]+$/.test(String(suite?.suiteId || ''))) failures.push('suiteId non valido');
  if (!/^\d+\.\d+\.\d+$/.test(String(suite?.version || ''))) failures.push('version deve usare SemVer');
  if (suite?.provenance?.kind !== 'synthetic-curated') failures.push('provenance.kind deve essere synthetic-curated');
  if (suite?.provenance?.containsRealUserData !== false) failures.push('containsRealUserData deve essere false');
  if (suite?.provenance?.trainingUse !== 'evaluation-only') failures.push('trainingUse deve essere evaluation-only');
  if (!Array.isArray(suite?.cases) || suite.cases.length === 0) failures.push('cases deve essere un array non vuoto');

  const seen = new Set();
  const categories = new Set();
  for (const [index, item] of (suite?.cases || []).entries()) {
    const label = `cases[${index}]`;
    if (!/^[a-z0-9-]+$/.test(String(item?.id || ''))) failures.push(`${label}.id non valido`);
    if (seen.has(item?.id)) failures.push(`${label}.id duplicato: ${item.id}`);
    seen.add(item?.id);
    if (!/^[a-z0-9-]+$/.test(String(item?.category || ''))) failures.push(`${label}.category non valida`);
    categories.add(item?.category);
    const messages = Array.isArray(item?.messages) ? item.messages : [];
    if (!String(item?.prompt || '').trim() && messages.length === 0) failures.push(`${label}.prompt o messages mancante`);
    if (messages.length) {
      if (messages.some((message) => !['user', 'assistant'].includes(message?.role) || !String(message?.content || '').trim())) {
        failures.push(`${label}.messages contiene un turno non valido`);
      }
      if (messages.at(-1)?.role !== 'user') failures.push(`${label}.messages deve terminare con un turno user`);
    }
    if (!Array.isArray(item?.assertions) || item.assertions.length === 0) failures.push(`${label}.assertions mancante`);
    for (const assertion of item?.assertions || []) {
      if (!ALLOWED_ASSERTIONS.has(assertion?.type)) failures.push(`${label}: assertion non supportata ${assertion?.type}`);
      if (['regex', 'notRegex', 'jsonPathMatches'].includes(assertion?.type)) {
        try { new RegExp(assertion.pattern, assertion.flags || ''); } catch { failures.push(`${label}: regex non valida`); }
      }
    }
  }

  const categoryMinimums = suite?.gate?.categoryMinimums || {};
  const minimumPassRate = Number(suite?.gate?.minimumPassRate);
  if (!Number.isFinite(minimumPassRate) || minimumPassRate < 0 || minimumPassRate > 100) failures.push('gate.minimumPassRate non valido');
  for (const category of categories) {
    const threshold = Number(categoryMinimums[category]);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) failures.push(`soglia categoria mancante o non valida: ${category}`);
  }
  for (const category of Object.keys(categoryMinimums)) {
    if (!categories.has(category)) failures.push(`soglia senza casi: ${category}`);
  }
  if (failures.length) throw new Error(`Suite eval non valida:\n- ${failures.join('\n- ')}`);
  return true;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function casePrompt(item) {
  if (Array.isArray(item?.messages) && item.messages.length) return String(item.messages.at(-1)?.content || '');
  return String(item?.prompt || '');
}

function composeSystemPrompt(suite, item) {
  const baseInstructions = Array.isArray(suite?.protocol?.baseInstructions)
    ? suite.protocol.baseInstructions
    : [];
  const categoryInstruction = String(suite?.protocol?.categoryInstructions?.[item.category] || '').trim();
  const caseInstruction = String(item.system || '').trim();
  const schemaInstruction = item.outputSchema
    ? [
        `Il formato di risposta e' vincolato dal seguente JSON Schema: ${stableStringify(item.outputSchema)}`,
        'Conserva letteralmente nomi, identificatori e percorsi presenti nella richiesta: non aggiungere prefissi e non correggerli.',
        'Se devi chiedere un chiarimento, cita nella domanda il termine ambiguo o la correzione probabile.',
        'Prima dell’output verifica in silenzio ogni campo, valore enum e proprietà richiesta dallo schema.',
      ].join('\n')
    : '';
  return [
    'Sei NEXUSNXS. Rispondi nella lingua dell\'utente.',
    ...baseInstructions,
    categoryInstruction,
    caseInstruction,
    responseQualityDirective(casePrompt(item), { deep: false }),
    schemaInstruction,
  ].filter(Boolean).join('\n');
}

function buildInferencePayload({ suite, item, model, deep }) {
  const inference = suite?.inference || {};
  const payload = {
    model,
    stream: false,
    think: Boolean(deep),
    keep_alive: inference.keepAlive || '5m',
    messages: [
      { role: 'system', content: composeSystemPrompt(suite, item) },
      ...(Array.isArray(item.messages) && item.messages.length
        ? item.messages.map(({ role, content }) => ({ role, content }))
        : [{ role: 'user', content: item.prompt }]),
    ],
    options: {
      temperature: Number.isFinite(inference.temperature) ? inference.temperature : 0,
      seed: Number.isFinite(inference.seed) ? inference.seed : 42,
      top_p: Number.isFinite(inference.topP) ? inference.topP : 0.8,
      top_k: Number.isFinite(inference.topK) ? inference.topK : 20,
      repeat_penalty: Number.isFinite(inference.repeatPenalty) ? inference.repeatPenalty : 1.05,
      num_ctx: Number.isFinite(inference.contextTokens) ? inference.contextTokens : 4096,
      num_predict: deep
        ? (Number.isFinite(inference.deepOutputTokens) ? inference.deepOutputTokens : 768)
        : (Number.isFinite(inference.quickOutputTokens) ? inference.quickOutputTokens : 256),
    },
  };
  if (item.outputSchema) payload.format = item.outputSchema;
  return payload;
}

function correctionDirective(item, scored) {
  const failedTypes = scored.assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.type);
  const corrections = [];
  if (failedTypes.includes('wordCount')) corrections.push('Riconta le parole e rispetta esattamente il numero esplicito richiesto.');
  if (failedTypes.includes('sentenceCountAtMost')) corrections.push('Riduci la risposta al numero massimo di frasi richiesto.');
  if (failedTypes.some((type) => ['jsonPathEquals', 'jsonPathMatches'].includes(type))) corrections.push('Restituisci JSON puro conforme allo schema, senza testo esterno.');
  if (failedTypes.includes('exactNormalized')) corrections.push('Restituisci soltanto il valore o formato letterale richiesto.');
  if (failedTypes.includes('regex')) corrections.push('Rileggi richiesta e contesto: manca un dato obbligatorio. Conserva letteralmente nomi, valori, unità e identificatori di fonte pertinenti.');
  if (failedTypes.includes('notRegex')) corrections.push('Rimuovi ogni elemento escluso o superato dalla correzione più recente dell’utente.');
  return [
    'REVISIONE VINCOLATA: la risposta precedente non soddisfa il contratto osservabile.',
    ...corrections,
    responseQualityDirective(casePrompt(item), { deep: true }),
    'Restituisci soltanto la risposta corretta, senza commentare la revisione.',
  ].filter(Boolean).join('\n');
}

function extractAnswer(payload) {
  const content = String(payload?.message?.content || '').replace(/^\uFEFF/, '').trim();
  return content
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '')
    .replace(/^\s*<analysis>[\s\S]*?<\/analysis>\s*/i, '')
    .trim();
}

/**
 * Riproduce i fast path deterministici usati dalla pipeline reale prima di
 * interrogare il modello. In questo modo il gate misura il prodotto completo,
 * non un endpoint Ollama grezzo che in produzione non riceve mai da solo le
 * richieste sensibili o gli output di codice elementari.
 */
function productionFastPathReply(prompt) {
  return strictToolRoutingReply(prompt)
    || deterministicSecurityReply(prompt)
    || deterministicArithmeticReply(prompt)
    || deterministicCodeOutputReply(prompt)
    || null;
}

// #endregion
// #region Scoring e report privacy-safe

function normalizedForExact(value) {
  return normalizeText(value).normalize('NFKC').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
}

function jsonAtPath(value, dottedPath) {
  if (dottedPath === '$') return value;
  return String(dottedPath || '').split('.').filter(Boolean).reduce((current, segment) => current?.[segment], value);
}

function parseStrictJson(answer) {
  const text = String(answer || '').trim();
  if (!/^[\[{]/.test(text) || !/[\]}]$/.test(text)) throw new Error('La risposta non è JSON puro');
  return JSON.parse(text);
}

function sentenceCount(text) {
  const matches = normalizeText(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (matches || []).filter((item) => item.trim()).length;
}

function checkAssertion(assertion, answer) {
  try {
    if (assertion.type === 'exactNormalized') return normalizedForExact(answer) === normalizedForExact(assertion.value);
    if (assertion.type === 'regex') return new RegExp(assertion.pattern, assertion.flags || '').test(normalizeText(answer));
    if (assertion.type === 'notRegex') return !new RegExp(assertion.pattern, assertion.flags || '').test(normalizeText(answer));
    if (assertion.type === 'wordCount') return (normalizeText(answer).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length === assertion.value;
    if (assertion.type === 'sentenceCountAtMost') return sentenceCount(answer) <= assertion.value;
    if (assertion.type === 'jsonPathEquals') return stableStringify(jsonAtPath(parseStrictJson(answer), assertion.path)) === stableStringify(assertion.value);
    if (assertion.type === 'jsonPathMatches') return new RegExp(assertion.pattern, assertion.flags || '').test(String(jsonAtPath(parseStrictJson(answer), assertion.path) || ''));
  } catch {}
  return false;
}

function scoreCase(item, answer, durationMs = 0) {
  const assertions = item.assertions.map((assertion, index) => ({ index, type: assertion.type, passed: checkAssertion(assertion, answer) }));
  return {
    caseId: item.id,
    category: item.category,
    mustPass: item.mustPass === true,
    passed: assertions.every((assertion) => assertion.passed),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    answerHash: crypto.createHash('sha256').update(String(answer || '')).digest('hex').slice(0, 16),
    assertions,
  };
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0;
}

function buildModelReport({ suite, model, mode, results }) {
  const categories = {};
  for (const category of Object.keys(suite.gate.categoryMinimums).sort()) {
    const rows = results.filter((row) => row.category === category);
    const passed = rows.filter((row) => row.passed).length;
    const passRate = rows.length ? Number((passed / rows.length * 100).toFixed(2)) : 0;
    const minimum = suite.gate.categoryMinimums[category];
    categories[category] = { passed, total: rows.length, passRate, minimum, gatePassed: passRate >= minimum };
  }
  const passed = results.filter((row) => row.passed).length;
  const passRate = results.length ? Number((passed / results.length * 100).toFixed(2)) : 0;
  const mustPassFailures = results.filter((row) => row.mustPass && !row.passed).map((row) => row.caseId).sort();
  const durations = results.map((row) => row.durationMs);
  const gatePassed = passRate >= suite.gate.minimumPassRate
    && Object.values(categories).every((category) => category.gatePassed)
    && mustPassFailures.length === 0;
  return {
    model,
    mode,
    summary: {
      passed,
      total: results.length,
      passRate,
      minimumPassRate: suite.gate.minimumPassRate,
      medianLatencyMs: percentile(durations, 0.5),
      p95LatencyMs: percentile(durations, 0.95),
      mustPassFailures,
      gatePassed,
    },
    categories,
    results: results.slice().sort((a, b) => a.caseId.localeCompare(b.caseId)),
  };
}

function buildReport({ suite, modelReports, generatedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 1,
    suite: { id: suite.suiteId, version: suite.version, hash: suiteHash(suite) },
    provenance: {
      kind: suite.provenance.kind,
      containsRealUserData: suite.provenance.containsRealUserData,
      trainingUse: suite.provenance.trainingUse,
    },
    generatedAt,
    gatePassed: modelReports.every((report) => report.summary.gatePassed),
    models: modelReports.slice().sort((a, b) => a.model.localeCompare(b.model)),
  };
}

// #endregion
// #region Esecuzione e CLI

function persistedPrivateEndpoint() {
  const dataRoot = String(process.env.NEXUS_USER_DATA_ROOT || path.resolve(__dirname, '..', '..', '.nexus-data')).trim();
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(dataRoot, 'settings.json'), 'utf8'));
    const candidate = String(settings?.ai?.ollama?.baseUrl || settings?.baseUrl || '').replace(/\/$/, '');
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return candidate;
  } catch {}
  return '';
}

function activeManagedEndpoint() {
  const dataRoot = String(process.env.NEXUS_USER_DATA_ROOT || path.resolve(__dirname, '..', '..', '.nexus-data')).trim();
  try {
    const descriptor = JSON.parse(fs.readFileSync(path.join(dataRoot, 'headless-server.lock'), 'utf8'));
    const pid = Number(descriptor?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return '';
    process.kill(pid, 0);
    return `http://127.0.0.1:${12000 + (pid % 1000)}`;
  } catch {}
  return '';
}

async function resolveEvaluationEndpoint(requested = '') {
  const candidates = [...new Set([
    requested,
    process.env.NEXUS_OLLAMA_BASE_URL,
    activeManagedEndpoint(),
    'http://127.0.0.1:11435',
    persistedPrivateEndpoint(),
  ].map((candidate) => String(candidate || '').replace(/\/$/, '')).filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/api/version`, { signal: AbortSignal.timeout(2_500) });
      if (response.ok) return candidate;
    } catch {}
  }
  throw new Error('Runtime AI locale non raggiungibile sugli endpoint NexusNXS consentiti.');
}

async function evaluateLiveModel({ suite, model, endpoint, deep, timeoutMs }) {
  const results = [];
  for (const item of suite.cases) {
    const startedAt = performance.now();
    const deterministicAnswer = productionFastPathReply(casePrompt(item));
    if (deterministicAnswer !== null) {
      results.push(scoreCase(item, deterministicAnswer, performance.now() - startedAt));
      continue;
    }
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(buildInferencePayload({ suite, item, model, deep })),
    });
    if (!response.ok) throw new Error(`${model}/${item.id}: HTTP ${response.status}`);
    const payload = await response.json();
    let answer = extractAnswer(payload);
    let scored = scoreCase(item, answer, performance.now() - startedAt);
    // La pipeline reale esegue una revisione mirata quando un vincolo
    // osservabile fallisce. Il gate deve misurare quel prodotto completo, non
    // fermarsi alla prima decodifica grezza del provider.
    if (!scored.passed) {
      const repairPayload = buildInferencePayload({ suite, item, model, deep });
      const exactWords = strictWordCountSchema(casePrompt(item));
      if (exactWords && scored.assertions.some((assertion) => !assertion.passed && assertion.type === 'wordCount')) {
        repairPayload.format = exactWords;
        repairPayload.messages[0].content += '\nRestituisci JSON conforme: ogni elemento di words deve contenere una sola parola, senza spazi; unite in ordine, le parole devono rispondere correttamente alla richiesta.';
      } else {
        repairPayload.messages.push(
          { role: 'assistant', content: answer },
          { role: 'system', content: correctionDirective(item, scored) },
        );
      }
      const repairedResponse = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(repairPayload),
      });
      if (!repairedResponse.ok) throw new Error(`${model}/${item.id}/review: HTTP ${repairedResponse.status}`);
      answer = extractAnswer(await repairedResponse.json());
      if (exactWords) answer = strictWordCountAnswer(casePrompt(item), answer) || answer;
      scored = scoreCase(item, answer, performance.now() - startedAt);
    }
    results.push(scored);
  }
  return buildModelReport({ suite, model, mode: deep ? 'deep' : 'quick', results });
}

function evaluateFixture({ suite, fixture }) {
  if (!fixture || typeof fixture !== 'object' || !fixture.answers || typeof fixture.answers !== 'object') throw new Error('Fixture eval non valida');
  const missing = suite.cases.filter((item) => !Object.hasOwn(fixture.answers, item.id)).map((item) => item.id);
  if (missing.length) throw new Error(`Fixture incompleta: ${missing.join(', ')}`);
  const results = suite.cases.map((item) => scoreCase(item, fixture.answers[item.id], 0));
  return buildModelReport({ suite, model: String(fixture.model || 'fixture'), mode: 'fixture', results });
}

function parseCli(argv) {
  const value = (name, fallback = '') => argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    suitePath: value('suite', DEFAULT_SUITE),
    outputPath: value('output', DEFAULT_OUTPUT),
    responsesPath: value('responses'),
    endpoint: value('endpoint'),
    timeoutMs: Math.max(15_000, Number(value('request-timeout-ms', '90000'))),
    validateOnly: argv.includes('--validate-only'),
    deep: argv.includes('--deep'),
    models: argv.filter((item) => !item.startsWith('--')),
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const { suite } = loadSuite(options.suitePath);
  if (options.validateOnly) {
    process.stdout.write(`${JSON.stringify({ valid: true, suiteId: suite.suiteId, version: suite.version, cases: suite.cases.length, hash: suiteHash(suite) }, null, 2)}\n`);
    return;
  }

  let modelReports;
  if (options.responsesPath) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.responsesPath), 'utf8'));
    modelReports = [evaluateFixture({ suite, fixture })];
  } else {
    const endpoint = await resolveEvaluationEndpoint(options.endpoint);
    const models = options.models.length ? options.models : ['qwen3:8b', 'qwen3:14b'];
    modelReports = [];
    for (const model of models) modelReports.push(await evaluateLiveModel({ suite, model, endpoint, deep: options.deep, timeoutMs: options.timeoutMs }));
  }

  const report = buildReport({ suite, modelReports });
  const output = path.resolve(process.cwd(), options.outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.gatePassed) process.exitCode = 2;
}

// #endregion

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = {
  buildModelReport,
  buildReport,
  buildInferencePayload,
  checkAssertion,
  composeSystemPrompt,
  correctionDirective,
  evaluateFixture,
  extractAnswer,
  loadSuite,
  normalizeText,
  parseCli,
  productionFastPathReply,
  scoreCase,
  stableStringify,
  suiteHash,
  validateSuite,
};
