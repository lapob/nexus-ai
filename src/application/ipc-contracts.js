/**
 * @module application/ipc-contracts
 * @description Definisce canali IPC autoritativi e validatori dei payload.
 */
const { NexusError } = require('../core/errors');

// #region 01 — Canali autorizzati

const CHANNELS = Object.freeze({
  bootstrap: 'nexus:bootstrap',
  settings: 'nexus:settings',
  reindex: 'nexus:reindex',
  listModels: 'nexus:list-models',
  cancel: 'nexus:cancel',
  copy: 'nexus:copy',
  openExternal: 'nexus:open-external',
  openNote: 'nexus:open-note',
  chat: 'nexus:chat',
  health: 'nexus:ai-health',
  diagnostics: 'nexus:diagnostics',
  modelBenchmark: 'nexus:model-benchmark',
  setModel: 'nexus:set-model',
  streamChat: 'nexus:stream-chat',
  streamEvent: 'nexus:stream-event',
  embed: 'nexus:embed',
  agentCapabilities: 'nexus:agent-capabilities',
  agentPlan: 'nexus:agent-plan',
  agentExecute: 'nexus:agent-execute',
  workflowCreate: 'nexus:workflow-create',
  workflowNext: 'nexus:workflow-next',
  workflowDecide: 'nexus:workflow-decide',
  workflowCancel: 'nexus:workflow-cancel',
  workflowStatus: 'nexus:workflow-status',
  voiceCapabilities: 'nexus:voice-capabilities',
  voiceDevices: 'nexus:voice-devices',
  voiceTranscribe: 'nexus:voice-transcribe',
  voiceTranscribeAudio: 'nexus:voice-transcribe-audio',
  voiceActivity: 'nexus:voice-activity',
  voicePartial: 'nexus:voice-partial',
  voiceStop: 'nexus:voice-stop',
  voiceFinish: 'nexus:voice-finish',
  neuralVoiceCapabilities: 'nexus:neural-voice-capabilities',
  neuralVoiceSpeak: 'nexus:neural-voice-speak',
  neuralVoiceStop: 'nexus:neural-voice-stop',
  knowledgeList: 'nexus:knowledge-list',
  knowledgeRead: 'nexus:knowledge-read',
  trainingExample: 'nexus:training-example',
  trainingStats: 'nexus:training-stats',
  trainingEvaluation: 'nexus:training-evaluation',
  trainingClear: 'nexus:training-clear',
  memoryList: 'nexus:memory-list',
  memoryForget: 'nexus:memory-forget',
  responseCacheStats: 'nexus:response-cache-stats',
  responseCacheClear: 'nexus:response-cache-clear',
  backupExport: 'nexus:backup-export',
  backupImport: 'nexus:backup-import',
  actionHistory: 'nexus:action-history',
  actionUndo: 'nexus:action-undo',
  windowCompact: 'nexus:window-compact',
  companionOverlay: 'nexus:companion-overlay',
  companionShowMain: 'nexus:companion-show-main',
  presenceSync: 'nexus:presence-sync',
  provisioningStatus: 'nexus:provisioning-status',
  provisioningStart: 'nexus:provisioning-start',
  provisioningCancel: 'nexus:provisioning-cancel',
  provisioningEvent: 'nexus:provisioning-event',
  provisioningEngine: 'nexus:provisioning-engine',
  voiceSettings: 'nexus:voice-settings',
  selectAttachments: 'nexus:select-attachments',
  workspaceGet: 'nexus:workspace-get',
  workspaceSelect: 'nexus:workspace-select',
  workspaceClear: 'nexus:workspace-clear',
  historyList: 'nexus:history-list',
  historySave: 'nexus:history-save',
  historyRemove: 'nexus:history-remove',
  historyImport: 'nexus:history-import',
  remoteStatus: 'nexus:remote-status',
  remoteConfigure: 'nexus:remote-configure',
  remotePair: 'nexus:remote-pair',
  remoteRevoke: 'nexus:remote-revoke',
  remoteSetup: 'nexus:remote-setup',
  startupStatus: 'nexus:startup-status',
  startupConfigure: 'nexus:startup-configure',
  updateStatus: 'nexus:update-status',
  updateCheck: 'nexus:update-check',
  updateInstall: 'nexus:update-install',
  updateEvent: 'nexus:update-event',
  proactiveEvent: 'nexus:proactive-event',
  wakeWordActivation: 'nexus:wake-word-activation'
});

// #endregion

// #region 02 — Primitive e payload AI

function asText(value, { name, max, required = false, requiredMessage }) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new NexusError(requiredMessage || `${name} è obbligatorio.`, { code: 'IPC_INPUT_REQUIRED' });
  if (text.length > max) throw new NexusError(`${name} supera il limite di ${max} caratteri.`, { code: 'IPC_INPUT_TOO_LARGE' });
  return text;
}

function selectReasoningMode(question, requestedMode = 'fast') {
  // La modalità scelta dal chiamante è autoritativa. Promuovere in base a
  // singole parole caricava il 14B durante normali conversazioni vocali,
  // causando attese imprevedibili. L'approfondimento resta sempre disponibile
  // come scelta esplicita, mentre voce e chat ordinaria restano sul modello 8B.
  void question;
  return requestedMode === 'deep' ? 'deep' : 'fast';
}

function parseExternalUrl(value) {
  const text = asText(value, { name: 'Il collegamento', max: 2048, required: true });
  let url;
  try { url = new URL(text); }
  catch { throw new NexusError('Collegamento non valido.', { code: 'IPC_INPUT_INVALID' }); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new NexusError('Sono consentiti soltanto collegamenti HTTPS pubblici.', { code: 'IPC_INPUT_INVALID' });
  }
  return url.toString();
}

function parseChatRequest(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new NexusError('Richiesta chat non valida.', { code: 'IPC_INPUT_INVALID' });
  const question = asText(payload.question, { name: 'La domanda', max: 12000, required: true, requiredMessage: 'La domanda è obbligatoria.' });
  const mode = selectReasoningMode(question, payload.mode === 'deep' ? 'deep' : 'fast');
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-16).filter((item) => item && ['user', 'assistant'].includes(item.role)).map((item) => ({
      role: item.role,
      content: asText(item.content, { name: 'Il messaggio', max: 12000 })
    }))
    : [];
  const attachmentIds = Array.isArray(payload.attachmentIds)
    ? payload.attachmentIds.slice(0, 8).map((value) => asText(value, { name: 'ID allegato', max: 128, required: true }))
    : [];
  return { question, mode, history, attachmentIds };
}

function parseRelativeNotePath(value) {
  return asText(value, { name: 'Il percorso della nota', max: 4096, required: true });
}

function parseClipboardText(value) {
  return String(value ?? '').slice(0, 100000);
}

function parseRequestId(value) { return asText(value, { name: 'requestId', max: 128, required: true }); }
function parseModelName(value) { const model = asText(value, { name: 'Il modello', max: 128, required: true }); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new NexusError('Nome modello non valido.', { code: 'IPC_INPUT_INVALID' }); return model; }
function parseEmbeddingRequest(value = {}) { if (!value || typeof value !== 'object') throw new NexusError('Richiesta embedding non valida.', { code: 'IPC_INPUT_INVALID' }); const items = Array.isArray(value.input) ? value.input : [value.input]; if (!items.length || items.length > 128) throw new NexusError('Numero input embedding non valido.', { code: 'IPC_INPUT_INVALID' }); return { input: items.map((item) => asText(item, { name: 'Input embedding', max: 12000, required: true })), model: value.model ? parseModelName(value.model) : undefined }; }
function parseTrainingExample(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NexusError('Esempio di apprendimento non valido.', { code: 'IPC_INPUT_INVALID' });
  return {
    requestId: parseRequestId(value.requestId),
    prompt: asText(value.prompt, { name: 'Prompt approvato', max: 12000, required: true }),
    response: asText(value.response, { name: 'Risposta approvata', max: 30000, required: true }),
    ...(value.originalResponse ? {
      originalResponse: asText(value.originalResponse, { name: 'Risposta originale', max: 30000, required: true })
    } : {}),
    model: parseModelName(value.model),
    mode: value.mode === 'deep' ? 'deep' : 'fast'
  };
}

// #endregion

// #region 03 — Payload knowledge e azioni

// Le azioni multi-pass reinseriscono una porzione verificata dei file letti nel
// planner. Il limite resta rigido per evitare payload IPC e contesti illimitati.
function parseAgentInstruction(value) { return asText(value, { name: 'La richiesta operativa', max: 24000, required: true }); }
function parseAgentPlanningRequest(value) {
  if (typeof value === 'string') return { instruction: parseAgentInstruction(value), observations: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NexusError('Richiesta operativa non valida.', { code: 'IPC_INPUT_INVALID' });
  }
  const instruction = asText(value.instruction, { name: 'La richiesta operativa originale', max: 12000, required: true, requiredMessage: 'La richiesta operativa originale è obbligatoria.' });
  const observations = Array.isArray(value.observations)
    ? value.observations.slice(0, 8).map((item) => asText(item, { name: 'L’osservazione dello strumento', max: 18000, required: true }))
    : [];
  if (observations.reduce((total, item) => total + item.length, 0) > 24000) {
    throw new NexusError('Le osservazioni operative superano il limite consentito.', { code: 'IPC_INPUT_TOO_LARGE' });
  }
  return { instruction, observations };
}
function parseActionTicket(value) { return asText(value, { name: 'Il ticket azione', max: 128, required: true }); }
function parseWorkflowId(value) {
  const id = asText(value, { name: 'Il workflow', max: 64, required: true });
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NexusError('ID workflow non valido.', { code: 'IPC_INPUT_INVALID' });
  return id;
}
function parseWorkflowCreate(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NexusError('Workflow non valido.', { code: 'IPC_INPUT_INVALID' });
  const summary = asText(value.summary, { name: 'La sintesi workflow', max: 1000, required: true });
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 8) throw new NexusError('Il workflow deve contenere da 1 a 8 passaggi.', { code: 'IPC_INPUT_INVALID' });
  let totalBytes = 0;
  const steps = value.steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new NexusError(`Passaggio ${index + 1} non valido.`, { code: 'IPC_INPUT_INVALID' });
    const tool = asText(step.tool, { name: `Lo strumento del passaggio ${index + 1}`, max: 64, required: true });
    if (!/^[a-z][a-z0-9_]*$/.test(tool)) throw new NexusError(`Strumento del passaggio ${index + 1} non valido.`, { code: 'IPC_INPUT_INVALID' });
    const argumentsValue = step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments) ? step.arguments : {};
    try { totalBytes += Buffer.byteLength(JSON.stringify(argumentsValue), 'utf8'); }
    catch { throw new NexusError(`Argomenti del passaggio ${index + 1} non validi.`, { code: 'IPC_INPUT_INVALID' }); }
    return {
      id: step.id ? asText(step.id, { name: `L’ID del passaggio ${index + 1}`, max: 80, required: true }) : undefined,
      tool,
      arguments: argumentsValue
    };
  });
  if (totalBytes > 1_000_000) throw new NexusError('Il workflow supera il limite consentito.', { code: 'IPC_INPUT_TOO_LARGE' });
  return { summary, steps };
}
function parseWorkflowDecision(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.approved !== 'boolean') {
    throw new NexusError('Decisione workflow non valida.', { code: 'IPC_INPUT_INVALID' });
  }
  return {
    workflowId: parseWorkflowId(value.workflowId),
    ticketId: parseActionTicket(value.ticketId),
    approved: value.approved
  };
}
function parseProvisioningProfile(value) { const profile = asText(value, { name: 'Il profilo AI', max: 32, required: true }); if (!['lite', 'essential', 'complete', 'ultra'].includes(profile)) throw new NexusError('Profilo AI non valido.', { code: 'IPC_INPUT_INVALID' }); return profile; }

module.exports = { CHANNELS, parseChatRequest, parseRelativeNotePath, parseClipboardText, parseExternalUrl, parseEmbeddingRequest, parseModelName, parseRequestId, parseAgentInstruction, parseAgentPlanningRequest, parseActionTicket, parseWorkflowId, parseWorkflowCreate, parseWorkflowDecision, parseTrainingExample, parseProvisioningProfile, selectReasoningMode };

// #endregion
