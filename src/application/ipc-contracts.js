const CHANNELS = Object.freeze({
  bootstrap: 'nexus:bootstrap',
  settings: 'nexus:settings',
  reindex: 'nexus:reindex',
  listModels: 'nexus:list-models',
  cancel: 'nexus:cancel',
  copy: 'nexus:copy',
  openNote: 'nexus:open-note',
  chat: 'nexus:chat'
  , health: 'nexus:ai-health'
  , setModel: 'nexus:set-model'
  , streamChat: 'nexus:stream-chat'
  , streamEvent: 'nexus:stream-event'
  , embed: 'nexus:embed'
});

function asText(value, { name, max, required = false, requiredMessage }) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new NexusError(requiredMessage || `${name} è obbligatorio.`, { code: 'IPC_INPUT_REQUIRED' });
  if (text.length > max) throw new NexusError(`${name} supera il limite di ${max} caratteri.`, { code: 'IPC_INPUT_TOO_LARGE' });
  return text;
}

function parseChatRequest(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new NexusError('Richiesta chat non valida.', { code: 'IPC_INPUT_INVALID' });
  const question = asText(payload.question, { name: 'La domanda', max: 12000, required: true, requiredMessage: 'La domanda è obbligatoria.' });
  const mode = payload.mode === 'deep' ? 'deep' : 'fast';
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-8).filter((item) => item && ['user', 'assistant'].includes(item.role)).map((item) => ({
      role: item.role,
      content: asText(item.content, { name: 'Il messaggio', max: 12000 })
    }))
    : [];
  return { question, mode, history };
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

module.exports = { CHANNELS, parseChatRequest, parseRelativeNotePath, parseClipboardText, parseEmbeddingRequest, parseModelName, parseRequestId };
const { NexusError } = require('../core/errors');
