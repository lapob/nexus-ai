/**
 * @module core/errors
 * @description Primitiva condivisa del dominio, priva di dipendenze grafiche.
 */
class NexusError extends Error {
  constructor(message, { code = 'NEXUS_ERROR', cause, publicMessage = message } = {}) {
    super(message, { cause });
    this.name = 'NexusError';
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

const SENSITIVE_DIAGNOSTIC = /(?:[a-z]:[\\/]|\\\\[^\\\s]+\\|file:\/\/|node:internal|node_modules|vendor[\\/]|\.dll\b|\.exe\b|\bat\s+\S+\s*\()/i;

function publicErrorMessage(error, fallback = 'Operazione non riuscita. Riprova.') {
  const candidate = error instanceof NexusError
    ? error.publicMessage
    : typeof error?.publicMessage === 'string'
      ? error.publicMessage
      : '';
  const message = String(candidate || '').replace(/\s+/g, ' ').trim();
  if (!message || message.length > 240 || SENSITIVE_DIAGNOSTIC.test(message)) return fallback;
  return message;
}

module.exports = { NexusError, publicErrorMessage };
