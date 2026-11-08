/**
 * @module ai/ai-provider
 * @description Contratto o servizio del runtime AI indipendente dal provider.
 */
const { AIError, AI_ERROR_CODES } = require('./ai-errors');

// #region 01 — Contratto provider

const PROVIDER_METHODS = Object.freeze([
  'initialize',
  'health',
  'listModels',
  'getCurrentModel',
  'setModel',
  'createModel',
  'pullModel',
  'preloadModel',
  'getCapabilities',
  'chat',
  'streamChat',
  'cancel',
  'embed',
  'shutdown'
]);

function assertAIProvider(provider) {
  const missing = PROVIDER_METHODS.filter((method) => typeof provider?.[method] !== 'function');
  if (missing.length) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, `Provider AI incompleto: ${missing.join(', ')}.`, { provider: provider?.name || 'unknown' });
  return provider;
}

// #endregion

// #region 02 — Validazione richieste

const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_TOOLS = 32;
const MAX_TOOL_CALLS_PER_MESSAGE = 8;

function invalid(message) { return new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, message); }

// Le definizioni seguono il formato function-calling comune a Ollama e alle API
// compatibili: il provider le inoltra senza reinterpretarle.
function validateToolDefinitions(tools) {
  if (!Array.isArray(tools) || tools.length < 1 || tools.length > MAX_TOOLS) throw invalid(`Gli strumenti AI devono essere da 1 a ${MAX_TOOLS}.`);
  if (JSON.stringify(tools).length > 48_000) throw invalid('Definizioni degli strumenti AI troppo grandi.');
  const names = new Set();
  return tools.map((tool) => {
    const fn = tool?.function;
    const name = String(fn?.name || '');
    if (tool?.type !== 'function' || !TOOL_NAME_PATTERN.test(name) || names.has(name)) throw invalid('Definizione strumento AI non valida.');
    if (!fn.parameters || typeof fn.parameters !== 'object' || Array.isArray(fn.parameters) || fn.parameters.type !== 'object') throw invalid(`Schema parametri non valido per ${name}.`);
    names.add(name);
    return { type: 'function', function: { name, description: String(fn.description || '').slice(0, 1024), parameters: fn.parameters } };
  });
}

function validateToolCalls(calls) {
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > MAX_TOOL_CALLS_PER_MESSAGE) throw invalid('Chiamate strumento AI non valide.');
  return calls.map((call, index) => {
    const name = String(call?.name || '');
    const args = call?.arguments ?? {};
    if (!TOOL_NAME_PATTERN.test(name) || !args || typeof args !== 'object' || Array.isArray(args)) throw invalid('Chiamata strumento AI non valida.');
    return { id: String(call.id || `call_${index}`).slice(0, 64), name, arguments: args };
  });
}

// Tetto di sicurezza per singolo messaggio: lo spazio reale è il contesto del modello,
// gestito a monte (storico compattato, allegati adattati alla domanda).
const MAX_MESSAGE_CHARS = 1_000_000;

function validateChatRequest(request) {
  if (!request || typeof request !== 'object' || !/^[A-Za-z0-9:_-]{1,128}$/.test(String(request.requestId || ''))) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI non valido.');
  if (!Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > 32) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La chat deve contenere da 1 a 32 messaggi.');
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const messages = request.messages.map((message) => {
    const content = String(message?.content ?? '');
    // Un turno assistant che contiene soltanto chiamate strumento può avere
    // testo vuoto; tutti gli altri messaggi restano obbligatoriamente non vuoti.
    const toolCalls = message?.role === 'assistant' && message.toolCalls !== undefined ? validateToolCalls(message.toolCalls) : null;
    if (!roles.has(message?.role) || (!content.trim() && !toolCalls) || content.length > MAX_MESSAGE_CHARS) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Messaggio AI non valido.');
    const images = Array.isArray(message?.images) ? message.images.slice(0, 2).map((image) => {
      const encoded = String(image || '');
      if (!encoded || encoded.length > 2_050_000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Immagine AI non valida.');
      return encoded;
    }) : [];
    const normalized = images.length ? { role: message.role, content, images } : { role: message.role, content };
    if (toolCalls) normalized.toolCalls = toolCalls;
    if (message.role === 'tool' && message.toolName !== undefined) {
      if (!TOOL_NAME_PATTERN.test(String(message.toolName))) throw invalid('Nome strumento del risultato non valido.');
      normalized.toolName = String(message.toolName);
    }
    return normalized;
  });
  const tools = request.tools !== undefined ? validateToolDefinitions(request.tools) : undefined;
  const mode = request.mode === 'deep' ? 'deep' : 'quick';
  let think;
  if (request.think !== undefined) {
    if (typeof request.think === 'boolean' || ['low', 'medium', 'high', 'max'].includes(request.think)) think = request.think;
    else throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Livello di ragionamento AI non valido.');
  }
  let format;
  if (request.format !== undefined) {
    if (request.format === 'json') format = 'json';
    else if (request.format && typeof request.format === 'object' && !Array.isArray(request.format)) {
      if (JSON.stringify(request.format).length > 12000) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Schema di output AI troppo grande.');
      format = request.format;
    } else throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Formato di output AI non valido.');
  }
  return { ...request, requestId: String(request.requestId), messages, mode, ...(think !== undefined ? { think } : {}), ...(format ? { format } : {}), ...(tools ? { tools } : {}) };
}

module.exports = { PROVIDER_METHODS, assertAIProvider, validateChatRequest, validateToolCalls, TOOL_NAME_PATTERN };

// #endregion
