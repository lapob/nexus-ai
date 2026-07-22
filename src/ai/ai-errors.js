const AI_ERROR_CODES = Object.freeze({
  PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE', PROVIDER_TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  PROVIDER_INVALID_RESPONSE: 'AI_PROVIDER_INVALID_RESPONSE', MODEL_NOT_FOUND: 'AI_MODEL_NOT_FOUND',
  MODEL_NOT_SELECTED: 'AI_MODEL_NOT_SELECTED', REQUEST_CANCELLED: 'AI_REQUEST_CANCELLED',
  RATE_LIMITED: 'AI_RATE_LIMITED', EMBEDDING_UNSUPPORTED: 'AI_EMBEDDING_UNSUPPORTED',
  STREAM_INTERRUPTED: 'AI_STREAM_INTERRUPTED', CONFIGURATION_INVALID: 'AI_CONFIGURATION_INVALID'
});

class AIError extends Error {
  constructor(code, message, { provider = 'unknown', retryable = false, cause, details } = {}) {
    super(message, { cause }); this.name = 'AIError'; this.code = code; this.provider = provider;
    this.retryable = retryable; if (details !== undefined) this.details = details;
  }
  toPublic() { return { code: this.code, message: this.message, provider: this.provider, retryable: this.retryable, ...(this.details === undefined ? {} : { details: this.details }) }; }
}

function normalizeAIError(error, provider = 'unknown') {
  if (error instanceof AIError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return new AIError(AI_ERROR_CODES.REQUEST_CANCELLED, 'Richiesta AI annullata.', { provider, retryable: true, cause: error });
  if (error?.name === 'TimeoutError') return new AIError(AI_ERROR_CODES.PROVIDER_TIMEOUT, 'Il provider AI non ha risposto entro il timeout.', { provider, retryable: true, cause: error });
  if (error instanceof TypeError && /fetch|network|connect/i.test(error.message)) return new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Il runtime AI locale non è raggiungibile.', { provider, retryable: true, cause: error });
  return new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Il provider AI ha restituito una risposta non valida.', { provider, cause: error });
}

module.exports = { AIError, AI_ERROR_CODES, normalizeAIError };
