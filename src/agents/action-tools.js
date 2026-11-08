/**
 * @module agents/action-tools
 * @description Espone le azioni del PC e le integrazioni MCP/n8n come strumenti tipizzati, eseguiti solo tramite ActionRuntime (proposta, ticket, consenso, ricevuta).
 */

// #region 01 — Schemi degli strumenti

const PATH = { type: 'string', minLength: 1, maxLength: 1024, description: 'Percorso relativo allo spazio di lavoro attivo.' };
const ARGS = { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 1024 } };

// Gli schemi descrivono la forma; i confini veri (percorsi reali, allowlist,
// dimensioni) restano nella validate() di ActionRuntime, rieseguita all'esecuzione.
const ACTION_SCHEMAS = Object.freeze({
  list_directory: { properties: { path: { ...PATH, description: 'Cartella relativa; "." per la radice.' } } },
  read_file: { required: ['path'], properties: { path: PATH } },
  write_file: { required: ['path', 'content'], properties: { path: PATH, content: { type: 'string', maxLength: 500_000 } } },
  write_files: { required: ['files'], properties: { files: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', required: ['path', 'content'], properties: { path: PATH, content: { type: 'string', maxLength: 500_000 } } } } } },
  create_directory: { required: ['path'], properties: { path: PATH } },
  copy_path: { required: ['source', 'destination'], properties: { source: PATH, destination: PATH } },
  move_path: { required: ['source', 'destination'], properties: { source: PATH, destination: PATH } },
  trash_path: { required: ['path'], properties: { path: PATH } },
  open_path: { required: ['path'], properties: { path: PATH } },
  open_user_path: { required: ['path'], properties: { path: { ...PATH, description: 'Percorso relativo alla cartella personale.' } } },
  open_application: { required: ['application'], properties: { application: { type: 'string', maxLength: 64 } } },
  run_script: { required: ['path'], properties: { path: PATH, args: ARGS, cwd: PATH } },
  run_command: { required: ['command', 'args'], properties: { command: { type: 'string', enum: ['npm'] }, args: { ...ARGS, description: 'Solo ["run", "nome-script"].' }, cwd: PATH } }
});

const toolName = (action) => `pc-${action.replace(/_/g, '-')}`;
const OUTPUT_LIMIT = 6_000;

// #endregion

// #region 02 — Esecuzione tramite ActionRuntime

/** Stessa regola di ActionRuntime.execute: il motore la ricontrolla comunque. */
function approvalRequired(risk, approvalMode) {
  const policy = ['always', 'dangerous-only', 'full-access'].includes(approvalMode) ? approvalMode : 'always';
  return risk === 'critical' || policy === 'always' || (policy === 'dangerous-only' && risk === 'high');
}

/** Osservazione per il modello: esito, verifica e output limitato; mai percorsi assoluti. */
function observation(result) {
  const output = String(result?.stdout || '').slice(0, OUTPUT_LIMIT);
  return {
    status: result?.status || 'unknown',
    message: String(result?.message || '').slice(0, 400),
    verification: result?.verification || null,
    ...(Number.isInteger(result?.code) ? { exitCode: result.code } : {}),
    ...(output ? { output, truncated: String(result.stdout).length > OUTPUT_LIMIT } : {}),
    ...(result?.canUndo ? { canUndo: true } : {}),
    ...(Array.isArray(result?.artifacts) && result.artifacts.length ? { artifacts: result.artifacts.length } : {})
  };
}

// Misurato in nexusnxs-agent-v1 (pc-edit-05): il modello riscriveva un file
// esistente senza leggerlo, rischiando di perdere righe che non conosceva.
// Una sovrascrittura richiede quindi una lettura dello stesso file nel turno.
function assertReadBeforeWrite(actionRuntime, action, args, readPaths) {
  if (action !== 'write_file' && action !== 'write_files') return;
  const targets = action === 'write_file' ? [args.path] : (args.files || []).map((file) => file?.path);
  for (const target of targets) {
    let resolved;
    try { resolved = actionRuntime.validate('read_file', { path: target }).path; } catch { continue; } // file nuovo o non leggibile: nessun vincolo
    if (!readPaths.has(resolved)) {
      throw Object.assign(new Error(`Il file ${target} esiste già e non è stato letto. Procedi subito, senza chiedere conferma all’utente: chiama pc-read-file su ${target}, poi ripeti la scrittura con il contenuto completo aggiornato.`), { code: 'READ_BEFORE_WRITE' });
    }
  }
}

async function executeAction({ actionRuntime, action, args, getApprovalMode, requestApproval, signal, artifacts, receipts, readPaths }) {
  assertReadBeforeWrite(actionRuntime, action, args, readPaths);
  const ticket = actionRuntime.propose({ tool: action, arguments: args, summary: `Azione richiesta dall’agente: ${action}`, reason: 'agent-tool' });
  const approvalMode = getApprovalMode();
  let approved = false;
  if (approvalRequired(ticket.risk, approvalMode)) {
    try { approved = typeof requestApproval === 'function' && await requestApproval({ ticket, signal }) === true; }
    catch { approved = false; }
    if (!approved || signal?.aborted) {
      const cancelled = actionRuntime.cancelProposal(ticket.id);
      if (cancelled?.receipt) receipts.push(cancelled.receipt);
      return { status: 'denied', message: 'L’utente non ha autorizzato questa azione: non è stata eseguita.' };
    }
  }
  const result = await actionRuntime.execute(ticket.id, { approved, approvalMode, signal });
  if (result?.receipt) receipts.push(result.receipt);
  if (action === 'read_file' && result?.status === 'completed') readPaths.add(ticket.args.path);
  for (const artifact of result?.artifacts || []) if (artifacts.length < 12) artifacts.push(artifact);
  return observation(result);
}

/**
 * Registra gli strumenti pc-* disponibili nel catalogo attuale di ActionRuntime,
 * più uno strumento per ogni integrazione MCP/n8n pronta. Restituisce le
 * raccolte di artefatti e ricevute prodotte nel turno.
 */
function registerActionTools(registry, { actionRuntime, getApprovalMode = () => 'always', requestApproval = null } = {}) {
  const artifacts = [];
  const receipts = [];
  const readPaths = new Set();
  if (!actionRuntime || typeof actionRuntime.capabilities !== 'function') return { artifacts, receipts };
  const catalog = actionRuntime.capabilities();
  const applications = (catalog.applications || []).map((app) => app.id);
  for (const definition of catalog.tools || []) {
    const action = definition.name;
    if (action === 'run_integration' || !ACTION_SCHEMAS[action]) continue;
    if (action === 'open_application' && !applications.length) continue;
    const schema = ACTION_SCHEMAS[action];
    const properties = action === 'open_application'
      ? { application: { type: 'string', enum: applications } }
      : schema.properties;
    registry.register({
      name: toolName(action),
      description: `${definition.label}: ${definition.description} Rischio ${definition.risk}; effetto ${definition.effect}, ripristino ${definition.rollback}.`,
      audience: 'private', risk: definition.risk, timeoutMs: action.startsWith('run_') ? 180_000 : 30_000,
      // Il consenso è gestito qui con l'anteprima reale del ticket, non dal
      // consenso generico del ciclo agentico: il dialogo mostra diff e percorsi.
      requiresConsent: false,
      parameters: { type: 'object', ...(schema.required ? { required: schema.required } : {}), properties },
      invoke: (args, { signal } = {}) => executeAction({ actionRuntime, action, args, getApprovalMode, requestApproval, signal, artifacts, receipts, readPaths })
    });
  }
  for (const integration of (catalog.integrations || []).filter((item) => item.ready)) {
    for (const name of integration.tools) {
      const id = `mcp-${integration.id}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 64).replace(/-+$/, '');
      if (!/^[a-z][a-z0-9-]{1,63}$/.test(id) || registry.get(id)) continue;
      registry.register({
        name: id,
        description: `Integrazione ${integration.type.toUpperCase()} «${integration.id}», strumento «${name}». Effetti esterni senza ripristino automatico: richiede sempre il consenso.`,
        audience: 'private', risk: 'critical', timeoutMs: 40_000, requiresConsent: false,
        parameters: { type: 'object', required: ['input'], properties: { input: { type: 'object', additionalProperties: true, description: 'Argomenti dello strumento.' } } },
        invoke: ({ input }, { signal } = {}) => executeAction({ actionRuntime, action: 'run_integration', args: { connection: integration.id, tool: name, input }, getApprovalMode, requestApproval, signal, artifacts, receipts, readPaths })
      });
    }
  }
  return { artifacts, receipts };
}

/** Dialogo nativo con l'anteprima del ticket: un solo uso, rifiuto predefinito. */
function createNativeActionApproval({ dialog, getWindow }) {
  return async ({ ticket, signal }) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || signal?.aborted) return false;
    const decision = await dialog.showMessageBox(window, {
      type: ticket.risk === 'critical' || ticket.risk === 'high' ? 'warning' : 'question',
      title: 'Autorizzazione azione',
      message: `NexusNXS vuole eseguire: ${ticket.tool.replace(/_/g, ' ')}`,
      detail: `${String(ticket.preview || '').slice(0, 1800)}\n\nRischio: ${ticket.risk} · Ripristino: ${ticket.capability?.rollback || 'non garantito'}\nAutorizzazione valida una sola volta.`,
      buttons: ['Rifiuta', 'Autorizza una volta'], defaultId: 0, cancelId: 0, noLink: true
    });
    return decision.response === 1 && !signal?.aborted && !window.isDestroyed();
  };
}

// #endregion

module.exports = { ACTION_SCHEMAS, approvalRequired, createNativeActionApproval, observation, registerActionTools, toolName };
