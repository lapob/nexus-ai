const CHANNELS = Object.freeze({
  bootstrap: 'nexus:bootstrap',
  settings: 'nexus:settings',
  reindex: 'nexus:reindex',
  listModels: 'nexus:list-models',
  cancel: 'nexus:cancel',
  copy: 'nexus:copy',
  openNote: 'nexus:open-note',
  chat: 'nexus:chat'
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

module.exports = { CHANNELS, parseChatRequest, parseRelativeNotePath, parseClipboardText };
const { NexusError } = require('../core/errors');
