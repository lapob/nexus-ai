/**
 * @module application/agent-chat
 * @description Collega il ciclo agentico alla chat desktop: idoneità opt-in, strumenti con servizi reali, fonti e consenso.
 */
const { AgentLoop } = require('../agents/agent-loop');
const { TypedToolRegistry } = require('../agents/typed-tools');
const { registerCoreTools } = require('../agents/core-tools');
const { inferModelCapabilities } = require('../ai/providers/ollama-provider');
const { safePublicUrl } = require('../research/web-research-service');
const { memoryQueryText } = require('../infrastructure/storage/personal-memory-store');
const { registerActionTools } = require('../agents/action-tools');

// #region 01 — Idoneità del turno

/**
 * Restituisce il modello da usare in modalità agente, oppure null se il turno
 * deve restare sul percorso ordinario. Il percorso pubblico, gli allegati e i
 * modelli senza function calling non entrano mai nel ciclo.
 */
function agentModelFor({ settings, selectedModel, distributionMode, attachmentCount = 0, providerTools = false }) {
  if (settings?.agentMode !== true || distributionMode === 'public' || attachmentCount > 0 || providerTools !== true) return null;
  const candidates = [selectedModel, settings.chatModel].filter(Boolean);
  return candidates.find((model) => inferModelCapabilities(model).tools === true) || null;
}

// #endregion

// #region 02 — Strumenti e fonti del turno

const TOOL_PHASES = Object.freeze({
  'current-time': 'Controllo data e ora',
  calculate: 'Eseguo il calcolo esatto',
  'date-diff': 'Calcolo le date',
  'recall-memory': 'Ripercorro i tuoi ricordi',
  'remember-fact': 'Salvo il ricordo',
  'search-knowledge': 'Cerco nelle tue note',
  'update-plan': 'Aggiorno il piano di lavoro',
  'web-search': 'Cerco fonti aggiornate sul web'
});

function toolPhaseLabel(name) {
  if (TOOL_PHASES[name]) return TOOL_PHASES[name];
  if (/^pc-(?:read|list)/.test(name)) return 'Leggo i file dello spazio di lavoro';
  if (/^pc-/.test(name)) return 'Preparo un’azione sul PC';
  if (/^mcp-/.test(name)) return 'Preparo un’integrazione';
  return 'Uso uno strumento autorizzato';
}

/**
 * Crea un registro per un singolo turno. Le fonti web restituite agli
 * strumenti vengono raccolte per consentire le citazioni nella risposta.
 */
function createTurnTools({ getIndex, aiRuntime, embeddingModel = null, webResearchService = null, memoryStore = null, actionRuntime = null, getApprovalMode = () => 'always', requestActionApproval = null, onMemory = null, onPlan = null, now } = {}) {
  const sources = [];
  const seen = new Set();
  const webResearch = webResearchService && typeof webResearchService.search === 'function' ? {
    search: async (query, options) => {
      const response = await webResearchService.search(query, options);
      for (const item of response?.results || []) {
        const url = safePublicUrl(item.url);
        if (!url || seen.has(url) || sources.length >= 12) continue;
        seen.add(url);
        sources.push({ title: item.title, url, snippet: item.snippet, sourceKind: 'web', status: 'external', provider: response.provider,
          ...(response.retrievedAt ? { retrievedAt: response.retrievedAt } : {}) });
      }
      return response;
    }
  } : null;
  let knowledgeIndex = null;
  try { knowledgeIndex = typeof getIndex === 'function' ? getIndex() : null; } catch { knowledgeIndex = null; }
  const embed = embeddingModel && aiRuntime ? (input, { signal } = {}) => aiRuntime.embed(input, { model: embeddingModel, signal }) : null;
  const registry = registerCoreTools(new TypedToolRegistry({ audience: 'private' }), { knowledgeIndex, embed, webResearch, ...(now ? { now } : {}) });
  if (memoryStore) registerMemoryTools(registry, { memoryStore, embed, embeddingModel, onMemory });
  registerPlanTool(registry, { onPlan });
  // Azioni del PC e integrazioni: solo tramite ActionRuntime, con ticket e ricevute.
  const actions = actionRuntime ? registerActionTools(registry, { actionRuntime, getApprovalMode, requestApproval: requestActionApproval }) : { artifacts: [], receipts: [] };
  return { registry, sources, artifacts: actions.artifacts, receipts: actions.receipts };
}

const PROVENANCE = Object.freeze({
  'explicit-user-statement': 'confermato dall’utente',
  'conversation-summary': 'riassunto di una conversazione passata',
  'conversation-extraction': 'dedotto da una conversazione, da verificare'
});

/** Memoria per l'agente: ricerca libera, scrittura solo con consenso. */
function registerMemoryTools(registry, { memoryStore, embed, embeddingModel, onMemory = null }) {
  registry.register({
    name: 'recall-memory',
    description: 'Cerca nei ricordi personali dell’utente e nei riassunti delle conversazioni passate (preferenze, progetti, cosa avete già discusso). Usalo quando l’utente fa riferimento a qualcosa detto in precedenza.',
    audience: 'private', risk: 'low', timeoutMs: 10_000,
    parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 2, maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 8 } } },
    invoke: async ({ query, limit = 5 }, { signal } = {}) => {
      let queryVector = null;
      if (typeof embed === 'function' && embeddingModel) {
        try { queryVector = (await embed(memoryQueryText(query), { signal }))?.vectors?.[0] || null; } catch { queryVector = null; }
      }
      return memoryStore.findRelevant(query, { limit, queryVector, embeddingModel }).map((memory) => ({
        id: memory.id, type: memory.type, content: memory.content,
        provenance: PROVENANCE[memory.sourceKind] || 'ricordo locale', updatedAt: new Date(memory.updatedAt).toISOString().slice(0, 10)
      }));
    }
  });
  registry.register({
    name: 'remember-fact',
    description: 'Salva un fatto durevole sull’utente nella sua memoria personale, solo se l’utente chiede di ricordarlo. Richiede il consenso dell’utente.',
    audience: 'private', risk: 'medium', requiresConsent: true, timeoutMs: 5_000,
    parameters: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 3, maxLength: 500 } } },
    invoke: ({ content }) => {
      const memory = memoryStore.remember({ content, sourceId: 'agent-tool' });
      try { onMemory?.({ action: 'remember', id: memory.id, content: memory.content }); } catch { /* l'avviso non blocca il salvataggio */ }
      return { saved: true, id: memory.id, type: memory.type };
    }
  });
}

const PLAN_STATUSES = Object.freeze(['pending', 'in_progress', 'done', 'skipped']);
const MAX_PLAN_STEPS = 8;

/** Piano normalizzato e sicuro da mostrare: testo breve, stati noti, al più un passo in corso. */
function normalizePlan(steps) {
  if (!Array.isArray(steps)) return [];
  let running = false;
  return steps.slice(0, MAX_PLAN_STEPS).map((step) => {
    const title = String(step?.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    let status = PLAN_STATUSES.includes(step?.status) ? step.status : 'pending';
    if (status === 'in_progress') { if (running) status = 'pending'; running = true; }
    return { title, status };
  }).filter((step) => step.title);
}

/**
 * Piano visibile per i compiti in più passaggi (come le liste di lavoro degli agenti moderni): il modello lo
 * dichiara e lo aggiorna; l'interfaccia lo mostra dal vivo. Nessun effetto esterno, quindi nessun consenso.
 */
function registerPlanTool(registry, { onPlan = null } = {}) {
  let revision = 0;
  registry.register({
    name: 'update-plan',
    description: 'Mostra all’utente il piano di lavoro per un compito con 3 o più passaggi e aggiornalo man mano: passa ogni volta la lista completa con lo stato di ogni passo (pending, in_progress, done, skipped). Un solo passo in_progress alla volta. Non usarlo per domande semplici.',
    audience: 'private', risk: 'low', timeoutMs: 2_000,
    parameters: {
      type: 'object', required: ['steps'],
      properties: {
        steps: {
          type: 'array', minItems: 1, maxItems: MAX_PLAN_STEPS,
          items: { type: 'object', required: ['title', 'status'], properties: { title: { type: 'string', minLength: 2, maxLength: 120 }, status: { type: 'string', enum: [...PLAN_STATUSES] } } }
        }
      }
    },
    invoke: ({ steps }) => {
      const plan = normalizePlan(steps);
      revision += 1;
      try { onPlan?.(plan); } catch { /* l'interfaccia non blocca l'agente */ }
      const done = plan.filter((step) => step.status === 'done' || step.status === 'skipped').length;
      return { shown: true, revision, done, total: plan.length };
    }
  });
}

// #endregion

// #region 03 — Esecuzione del turno

/**
 * Esegue il turno agentico e restituisce il testo grezzo, le fonti raccolte e
 * il registro metadata-only. Sicurezza dell'output e citazioni restano a carico
 * del chiamante, che applica gli stessi confini del percorso ordinario.
 */
async function runAgentTurn({ aiRuntime, logger, requestId, messages, model, mode, think, temperature, signal, requestOptions, tools, requestConsent, onPhase }) {
  // Compiti lunghi: più passi in modalità approfondita, sempre con budget, annullamento e consenso.
  const agent = new AgentLoop({ runtime: aiRuntime, tools: tools.registry, logger, requestConsent, maxSteps: mode === 'deep' ? 12 : 6 });
  const outcome = await agent.run({
    requestId, messages, model, mode, think, temperature, signal, requestOptions,
    onEvent: (event) => {
      if (event.type === 'tool-call') onPhase?.(toolPhaseLabel(event.name));
      if (event.type === 'budget-exhausted') onPhase?.('Concludo con i risultati raccolti');
    }
  });
  logger?.info?.('Turno agentico completato.', {
    requestId, stopReason: outcome.stopReason, steps: outcome.steps,
    tools: outcome.toolRuns.map(({ name, ok, code, durationMs }) => ({ name, ok, code, durationMs }))
  });
  return { ...outcome, sources: [...tools.sources], artifacts: [...(tools.artifacts || [])], receipts: [...(tools.receipts || [])] };
}

/** Consenso nativo per strumenti sensibili: mai implicito, annullabile. */
function createNativeToolConsent({ dialog, getWindow }) {
  return async ({ tool, risk, signal }) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || signal?.aborted) return false;
    const decision = await dialog.showMessageBox(window, {
      type: 'question', title: 'Autorizzazione strumento',
      message: `NexusNXS vuole usare lo strumento «${tool}».`,
      detail: `Livello di rischio: ${risk}. Lo strumento verrà eseguito una sola volta per questa risposta. Rifiutando, NexusNXS risponderà senza usarlo.`,
      buttons: ['Rifiuta', 'Consenti una volta'], defaultId: 0, cancelId: 0, noLink: true
    });
    return decision.response === 1 && !signal?.aborted && !window.isDestroyed();
  };
}

// #endregion

module.exports = { agentModelFor, createTurnTools, runAgentTurn, createNativeToolConsent, normalizePlan, toolPhaseLabel };
