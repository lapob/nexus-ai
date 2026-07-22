const { AIError, AI_ERROR_CODES } = require('./ai-errors');

const PROVIDER_METHODS = Object.freeze(['initialize', 'health', 'listModels', 'getCurrentModel', 'setModel', 'getCapabilities', 'chat', 'streamChat', 'cancel', 'embed', 'shutdown']);

function assertAIProvider(provider) {
  const missing = PROVIDER_METHODS.filter((method) => typeof provider?.[method] !== 'function');
  if (missing.length) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, `Provider AI incompleto: ${missing.join(', ')}.`, { provider: provider?.name || 'unknown' });
  return provider;
}

function validateChatRequest(request) {
  if (!request || typeof request !== 'object' || !/^[A-Za-z0-9:_-]{1,128}$/.test(String(request.requestId || ''))) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI non valido.');
  if (!Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > 32) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La chat deve contenere da 1 a 32 messaggi.');
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const messages = request.messages.map((message) => {
    const content = String(message?.content ?? '');
    if (!roles.has(message?.role) || !content.trim() || content.length > 12000) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Messaggio AI non valido.');
    return { role: message.role, content };
  });
  const mode = request.mode === 'deep' ? 'deep' : 'quick';
  return { ...request, requestId: String(request.requestId), messages, mode };
}

module.exports = { PROVIDER_METHODS, assertAIProvider, validateChatRequest };
