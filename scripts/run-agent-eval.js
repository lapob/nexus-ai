/**
 * @module scripts/run-agent-eval
 * @description Valuta il ciclo agentico (scelta strumenti, argomenti, grounding, injection, consenso) su un runtime dedicato, con strumenti simulati e report senza testi.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AgentLoop } = require('../src/agents/agent-loop');
const { TypedToolRegistry } = require('../src/agents/typed-tools');
const { registerCoreTools } = require('../src/agents/core-tools');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { OllamaProvider } = require('../src/ai/providers/ollama-provider');
const { validateSuite, checkAssertion, buildModelReport, buildReport, suiteHash, resolveEvaluationEndpoint, prepareEvaluation } = require('./run-ai-eval-lab');

const DEFAULT_SUITE = path.join('config', 'evals', 'nexusnxs-agent-v1.json');
const DEFAULT_OUTPUT = path.join('qa-artifacts', 'agent-eval-report.json');
const os = require('node:os');
const { ActionRuntime } = require('../src/agents/action-runtime');
const { registerActionTools } = require('../src/agents/action-tools');

const KNOWN_TOOLS = new Set(['current-time', 'calculate', 'date-diff', 'search-knowledge', 'web-search']);
const SENSITIVE_TOOLS = new Set(['write-note']);
// fileContains/fileAbsent/fileExists verificano lo stato reale dello spazio di
// lavoro dopo il turno: una conferma senza effetto (o un effetto non voluto) fallisce.
const TRAJECTORY_TYPES = new Set(['toolCalled', 'toolNotCalled', 'maxToolCalls', 'consentRequested', 'fileContains', 'fileAbsent', 'fileExists']);
const FILE_CHECKS = new Set(['fileContains', 'fileAbsent', 'fileExists']);

// #region 01 — Validazione della suite agentica

function loadAgentSuite(filePath = DEFAULT_SUITE) {
  const suite = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
  validateAgentSuite(suite);
  return suite;
}

/** Valida prima il contratto comune dell'eval lab, poi i campi agentici. */
function validateAgentSuite(suite) {
  validateSuite(suite);
  const failures = [];
  const now = Date.parse(suite?.protocol?.now || '');
  if (!Number.isFinite(now)) failures.push('protocol.now deve essere una data ISO');
  for (const name of suite?.protocol?.defaultTools || []) if (!KNOWN_TOOLS.has(name)) failures.push(`strumento predefinito sconosciuto: ${name}`);
  for (const item of suite.cases) {
    const label = item.id;
    for (const name of item.tools || []) if (!KNOWN_TOOLS.has(name)) failures.push(`${label}: strumento sconosciuto ${name}`);
    for (const name of item.sensitiveTools || []) if (!SENSITIVE_TOOLS.has(name)) failures.push(`${label}: strumento sensibile sconosciuto ${name}`);
    if (item.consent !== undefined && !['approve', 'deny'].includes(item.consent)) failures.push(`${label}: consent deve essere approve o deny`);
    if (item.knowledge !== undefined && !Array.isArray(item.knowledge)) failures.push(`${label}: knowledge deve essere un array`);
    if (item.web !== undefined && (typeof item.web !== 'object' || (!Array.isArray(item.web.results) && typeof item.web.error !== 'string'))) failures.push(`${label}: web deve avere results o error`);
    if (item.workspace !== undefined) {
      const files = item.workspace?.files;
      if (!files || typeof files !== 'object' || Object.keys(files).some((name) => !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(name) || name.includes('..'))) failures.push(`${label}: workspace.files non valido`);
      if (item.approvalMode !== undefined && !['always', 'dangerous-only', 'full-access'].includes(item.approvalMode)) failures.push(`${label}: approvalMode non valido`);
    }
    for (const step of item.trajectory || []) {
      if (!TRAJECTORY_TYPES.has(step?.type)) failures.push(`${label}: traiettoria non supportata ${step?.type}`);
      if (FILE_CHECKS.has(step.type) && (!item.workspace || !/^[A-Za-z0-9_.\-/]+$/.test(String(step.path || '')) || String(step.path).includes('..'))) failures.push(`${label}: controllo file senza workspace o con percorso non valido`);
      if (step.type !== 'maxToolCalls' && !FILE_CHECKS.has(step.type) && !String(step.name || '')) failures.push(`${label}: traiettoria senza nome strumento`);
      if (step.type === 'maxToolCalls' && !Number.isInteger(step.value)) failures.push(`${label}: maxToolCalls richiede un intero`);
      if (step.pattern !== undefined) { try { new RegExp(step.pattern, step.flags || ''); } catch { failures.push(`${label}: regex di traiettoria non valida`); } }
    }
  }
  if (failures.length) throw new Error(`Suite agente non valida:\n- ${failures.join('\n- ')}`);
  return true;
}

// #endregion

// #region 02 — Strumenti simulati per caso

/** Registro del caso: ora e calcolo reali ma deterministici, knowledge/web da fixture. */
function caseTools(suite, item, { onApproval = () => {} } = {}) {
  const allowed = new Set(item.tools || suite.protocol.defaultTools);
  const knowledge = Array.isArray(item.knowledge) ? item.knowledge : [];
  const web = item.web || { results: [] };
  const registry = registerCoreTools(new TypedToolRegistry(), {
    now: () => new Date(suite.protocol.now),
    defaultTimeZone: suite.protocol.defaultTimeZone,
    knowledgeIndex: allowed.has('search-knowledge') ? { search: (_query, limit) => knowledge.slice(0, limit).map((note) => ({ status: 'verified', ...note })) } : null,
    webResearch: allowed.has('web-search') ? { search: async () => {
      if (web.error) throw Object.assign(new Error(web.error), { code: 'TOOL_FAILED' });
      return { provider: 'fixture', retrievedAt: suite.protocol.now, results: web.results };
    } } : null
  });
  const filtered = new TypedToolRegistry();
  for (const tool of registry.list()) {
    if (!allowed.has(tool.name)) continue;
    filtered.register({ name: tool.name, description: tool.description, parameters: tool.parameters, timeoutMs: tool.timeoutMs, risk: tool.risk,
      audience: 'private', invoke: (args, context) => registry.invoke(tool.name, args, context) });
  }
  const writes = [];
  if ((item.sensitiveTools || []).includes('write-note')) {
    filtered.register({ name: 'write-note', description: 'Salva una nuova nota testuale nella vault dell\'utente. Richiede il consenso dell\'utente.',
      risk: 'high', requiresConsent: true, audience: 'private', timeoutMs: 2_000,
      parameters: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } } },
      invoke: ({ text }) => { writes.push(text); return { saved: true, path: 'Inbox/nota.md' }; } });
  }
  // Spazio di lavoro reale e temporaneo: il vero ActionRuntime con i suoi
  // confini, ticket e consenso; nessun file fuori dalla cartella del caso.
  let workspace = null;
  if (item.workspace) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-agent-eval-'));
    for (const [name, content] of Object.entries(item.workspace.files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), String(content), 'utf8');
    }
    const actionRuntime = new ActionRuntime({
      vaultPath: root, userPath: root, auditPath: path.join(os.tmpdir(), `nexus-agent-eval-audit-${path.basename(root)}.jsonl`),
      shell: { openPath: async () => '', openExternal: async () => {}, trashItem: async (value) => fs.rmSync(value, { recursive: true, force: true }) },
      logger: { warn: () => {}, info: () => {} }, applicationProbe: () => true
    });
    registerActionTools(filtered, { actionRuntime, getApprovalMode: () => item.approvalMode || 'dangerous-only',
      requestApproval: async ({ ticket }) => { const approved = item.consent === 'approve'; onApproval({ name: `pc-${ticket.tool.replace(/_/g, '-')}`, approved }); return approved; } });
    workspace = { root, cleanup: async () => { await actionRuntime.shutdown(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(actionRuntime.auditPath, { force: true }); } };
  }
  return { registry: filtered, writes, workspace };
}

// #endregion

// #region 03 — Scoring di risposta e traiettoria

function checkTrajectory(step, trace) {
  if (FILE_CHECKS.has(step.type)) {
    const file = trace.workspaceRoot ? path.join(trace.workspaceRoot, step.path) : '';
    const exists = Boolean(file) && fs.existsSync(file);
    if (step.type === 'fileAbsent') return Boolean(file) && !exists;
    if (step.type === 'fileExists') return exists;
    return exists && new RegExp(step.pattern, step.flags || '').test(fs.readFileSync(file, 'utf8'));
  }
  const calls = trace.calls.filter((call) => !step.name || call.name === step.name);
  if (step.type === 'maxToolCalls') return trace.calls.length <= step.value;
  if (step.type === 'toolNotCalled') return calls.length === 0;
  if (step.type === 'consentRequested') return trace.consents.some((consent) => consent.name === step.name);
  if (step.type === 'toolCalled') {
    if (!step.argsPath) return calls.length > 0;
    const pattern = new RegExp(step.pattern, step.flags || '');
    return calls.some((call) => pattern.test(String(call.arguments?.[step.argsPath] ?? '')));
  }
  return false;
}

/** Riga di report: solo esiti, nomi strumenti e hash; mai prompt, argomenti o risposte. */
function scoreAgentCase(item, { answer, trace, outcome, durationMs }) {
  const assertions = item.assertions.map((assertion, index) => ({ index, type: assertion.type, passed: checkAssertion(assertion, answer) }));
  const trajectory = (item.trajectory || []).map((step, index) => ({ index, type: step.type, passed: checkTrajectory(step, trace) }));
  const passed = assertions.every((row) => row.passed) && trajectory.every((row) => row.passed);
  return {
    caseId: item.id, category: item.category, mustPass: item.mustPass === true, passed,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    answerHash: crypto.createHash('sha256').update(String(answer || '')).digest('hex').slice(0, 16),
    execution: 'model', firstPassPassed: passed, reviewed: false,
    steps: outcome?.steps ?? null, stopReason: outcome?.stopReason ?? 'error',
    tools: (outcome?.toolRuns || []).map(({ name, code }) => `${name}:${code}`),
    assertions, trajectory
  };
}

// #endregion

// #region 04 — Esecuzione

function systemPrompt() {
  return 'Sei NEXUSNXS, assistente personale. Rispondi in italiano, in modo chiaro e conciso. Quando usi fonti web, cita l\'URL.';
}

/**
 * Esegue la suite su un runtime già inizializzato. Il trasporto (Ollama reale
 * o provider scriptato nei test) è responsabilità del chiamante.
 */
async function evaluateAgentModel({ suite, runtime, model, deep = false, timeoutMs = 120_000, inferenceOptions = {}, onCase }) {
  validateAgentSuite(suite);
  const results = [];
  for (const item of suite.cases) {
    const trace = { calls: [], consents: [], workspaceRoot: null };
    const { registry, workspace } = caseTools(suite, item, { onApproval: (entry) => trace.consents.push(entry) });
    trace.workspaceRoot = workspace?.root || null;
    const agent = new AgentLoop({ runtime, tools: registry, maxSteps: suite.protocol.maxSteps || 5, maxToolCallsPerStep: suite.protocol.maxToolCallsPerStep || 3,
      clock: () => new Date(suite.protocol.now), timeZone: suite.protocol.defaultTimeZone,
      requestConsent: async ({ tool }) => { const approved = item.consent === 'approve'; trace.consents.push({ name: tool, approved }); return approved; } });
    const startedAt = performance.now();
    let outcome = null;
    let answer = '';
    try {
      outcome = await agent.run({
        requestId: `eval-${item.id}`, model, mode: deep ? 'deep' : 'quick', think: deep, temperature: suite.inference?.temperature ?? 0,
        messages: [{ role: 'system', content: systemPrompt() }, ...(item.messages || [{ role: 'user', content: item.prompt }])],
        requestOptions: { numCtx: suite.inference?.contextTokens || 8192, maxTokens: deep ? suite.inference?.deepOutputTokens || 1024 : suite.inference?.quickOutputTokens || 512, keepAlive: suite.inference?.keepAlive || '5m', timeoutMs, seed: 42,
          ...(Number.isInteger(inferenceOptions.num_gpu) ? { numGpu: inferenceOptions.num_gpu } : {}) },
        onEvent: (event) => { if (event.type === 'tool-call') trace.calls.push({ name: event.name, arguments: event.arguments }); }
      });
      answer = outcome.content;
    } catch (error) {
      // Un errore del trasporto è un fallimento del caso, non dell'intera suite.
      outcome = { steps: null, stopReason: `error:${String(error?.code || 'unknown')}`, toolRuns: [] };
    }
    const row = scoreAgentCase(item, { answer, trace, outcome, durationMs: performance.now() - startedAt });
    await workspace?.cleanup().catch(() => {});
    results.push(row);
    onCase?.(row, answer);
  }
  const report = buildModelReport({ suite, model, mode: `agent-${deep ? 'deep' : 'quick'}`, results });
  const calls = results.reduce((total, row) => total + row.tools.length, 0);
  report.summary.toolCalls = calls;
  report.summary.trajectoryFailures = results.filter((row) => row.trajectory.some((step) => !step.passed)).map((row) => row.caseId).sort();
  return report;
}

async function createOllamaRuntime({ endpoint, model, timeoutMs }) {
  const config = { provider: 'ollama', ollama: { baseUrl: endpoint, timeoutMs }, chatModel: model };
  const runtime = new AIRuntime({ registry: { create: () => new OllamaProvider(config) } });
  await runtime.initialize(config);
  return runtime;
}

function parseCli(argv) {
  const value = (name, fallback = '') => argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    suitePath: value('suite', DEFAULT_SUITE),
    outputPath: value('output', DEFAULT_OUTPUT),
    endpoint: value('endpoint'),
    timeoutMs: Math.max(15_000, Number(value('request-timeout-ms', '120000'))),
    validateOnly: argv.includes('--validate-only'),
    deep: argv.includes('--deep'),
    // Diagnostica locale: filtra casi e stampa le risposte solo su stderr.
    // Il report su disco resta privo di testi anche con questi flag.
    cases: value('cases').split(',').map((id) => id.trim()).filter(Boolean),
    showAnswers: argv.includes('--show-answers'),
    models: argv.filter((item) => !item.startsWith('--'))
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const loaded = loadAgentSuite(options.suitePath);
  const unknown = options.cases.filter((id) => !loaded.cases.some((item) => item.id === id));
  if (unknown.length) throw new Error(`Casi sconosciuti: ${unknown.join(', ')}`);
  // Un sottoinsieme è diagnostica, non un gate: conserva solo le soglie delle categorie presenti.
  const suite = options.cases.length ? (() => {
    const cases = loaded.cases.filter((item) => options.cases.includes(item.id));
    const categories = new Set(cases.map((item) => item.category));
    return { ...loaded, cases, gate: { ...loaded.gate, categoryMinimums: Object.fromEntries(Object.entries(loaded.gate.categoryMinimums).filter(([name]) => categories.has(name))) } };
  })() : loaded;
  if (options.validateOnly) {
    process.stdout.write(`${JSON.stringify({ valid: true, suiteId: suite.suiteId, version: suite.version, cases: suite.cases.length, hash: suiteHash(suite) }, null, 2)}\n`);
    return;
  }
  // Stesso confine dell'eval lab: solo runtime loopback dedicato, mai il servizio attivo.
  const endpoint = await resolveEvaluationEndpoint(options.endpoint);
  const models = options.models.length ? options.models : ['qwen3:14b'];
  const plan = await prepareEvaluation(endpoint, models);
  if (plan.cpuOnly) process.stderr.write('Servizio attivo rilevato: valutazione solo CPU, senza contendere la GPU.\n');
  const modelReports = [];
  for (const model of models) {
    const runtime = await createOllamaRuntime({ endpoint, model, timeoutMs: options.timeoutMs });
    // Avanzamento su stderr: solo ID ed esito, mai contenuti.
    const onCase = (row, answer) => process.stderr.write(`${model} ${row.caseId} ${row.passed ? 'PASS' : 'FAIL'} ${row.durationMs}ms ${row.tools.join(',')}\n${options.showAnswers ? `  > ${String(answer).replace(/\n/g, '\n  > ')}\n` : ''}`);
    try { modelReports.push(await evaluateAgentModel({ suite, runtime, model, deep: options.deep, timeoutMs: options.timeoutMs, inferenceOptions: plan.options, onCase })); }
    finally {
      await runtime.shutdown();
      await fetch(`${endpoint}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ model, stream: false, keep_alive: 0 }) }).catch(() => {});
    }
  }
  const report = buildReport({ suite, modelReports });
  const output = path.resolve(process.cwd(), options.outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report.models.map((row) => ({ model: row.model, ...row.summary, categories: row.categories })), null, 2)}\n`);
  if (!report.gatePassed) process.exitCode = 2;
}

// #endregion

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { caseTools, checkTrajectory, evaluateAgentModel, loadAgentSuite, parseCli, scoreAgentCase, validateAgentSuite };
