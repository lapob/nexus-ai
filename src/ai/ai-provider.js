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

function validateChatRequest(request) {
  if (!request || typeof request !== 'object' || !/^[A-Za-z0-9:_-]{1,128}$/.test(String(request.requestId || ''))) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI non valido.');
  if (!Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > 32) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La chat deve contenere da 1 a 32 messaggi.');
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const messages = request.messages.map((message) => {
    const content = String(message?.content ?? '');
    if (!roles.has(message?.role) || !content.trim() || content.length > 12000) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Messaggio AI non valido.');
    const images = Array.isArray(message?.images) ? message.images.slice(0, 2).map((image) => {
      const encoded = String(image || '');
      if (!encoded || encoded.length > 2_050_000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Immagine AI non valida.');
      return encoded;
    }) : [];
    return images.length ? { role: message.role, content, images } : { role: message.role, content };
  });
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
  return { ...request, requestId: String(request.requestId), messages, mode, ...(think !== undefined ? { think } : {}), ...(format ? { format } : {}) };
}

module.exports = { PROVIDER_METHODS, assertAIProvider, validateChatRequest };

// #endregion
