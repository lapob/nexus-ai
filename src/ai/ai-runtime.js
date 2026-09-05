/**
 * @module ai/ai-runtime
 * @description Contratto o servizio del runtime AI indipendente dal provider.
 */
const { AIError, AI_ERROR_CODES, normalizeAIError } = require('./ai-errors');
const { validateChatRequest } = require('./ai-provider');
const { CircuitBreaker } = require('./circuit-breaker');

const BREAKER_OPERATIONS = Object.freeze(['chat', 'stream', 'embed']);

function breakerFailure(error) {
  return error?.code !== AI_ERROR_CODES.REQUEST_CANCELLED
    && error?.code !== AI_ERROR_CODES.CONFIGURATION_INVALID
    && error?.code !== AI_ERROR_CODES.MODEL_NOT_FOUND
    && error?.code !== AI_ERROR_CODES.MODEL_NOT_SELECTED;
}

// #region 01 — Lifecycle e catalogo

class AIRuntime {
  constructor({ registry, logger = null, breakerOptions = {} } = {}) {
    this.registry = registry; this.logger = logger; this.provider = null; this.providerName = null; this.requests = new Map();
    this.breakerOptions = breakerOptions;
    this.breakers = this.createBreakers();
  }
  createBreakers() { return new Map(BREAKER_OPERATIONS.map((operation) => [operation, new CircuitBreaker(this.breakerOptions)])); }
  async initialize(config) { if (this.provider) await this.shutdown(); this.breakers = this.createBreakers(); this.providerName = config.provider; this.provider = this.registry.create(config.provider, config); await this.provider.initialize(config); return { provider: this.providerName, capabilities: this.provider.getCapabilities() }; }
  requireProvider() { if (!this.provider) throw new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Runtime AI non inizializzato.', { retryable: true }); return this.provider; }
  breaker(operation) { return this.breakers.get(operation); }
  permit(operation) {
    const breaker = this.breaker(operation);
    if (breaker?.permit()) return breaker;
    const retryAt = breaker?.status().retryAt || 0;
    throw new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Il servizio AI si sta ripristinando. Riprova tra poco.', {
      provider: this.providerName || 'unknown', retryable: true, details: { retryAt }
    });
  }
  record(operation, error = null) {
    const breaker = this.breaker(operation);
    if (!breaker) return;
    if (!error) breaker.success();
    else if (breakerFailure(error)) breaker.failure();
  }
  circuitStatus() { return Object.fromEntries([...this.breakers].map(([operation, breaker]) => [operation, breaker.status()])); }
  async health() { try { return await this.requireProvider().health(); } catch (error) { const normalized = normalizeAIError(error, this.providerName); return { ok: false, status: normalized.code === AI_ERROR_CODES.CONFIGURATION_INVALID ? 'error' : 'offline', provider: this.providerName || 'unknown', error: normalized.toPublic() }; } }
  listModels() { return this.requireProvider().listModels(); }
  getCurrentModel() { return this.requireProvider().getCurrentModel(); }
  setModel(model) { return this.requireProvider().setModel(model); }
  createModel(specification) { return this.requireProvider().createModel(specification); }
  pullModel(model, options) { return this.requireProvider().pullModel(model, options); }
  preloadModel(model, options) { return this.requireProvider().preloadModel(model, options); }
  getCapabilities() { return this.requireProvider().getCapabilities(); }

  // #endregion

  // #region 02 — Richieste, cancellazione e shutdown

  begin(requestId, externalSignal) {
    if (this.requests.has(requestId)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI già attivo.', { provider: this.providerName });
    if (this.requests.size >= 32) throw new AIError(AI_ERROR_CODES.RATE_LIMITED, 'Troppe richieste AI attive.', { provider: this.providerName, retryable: true });
    const controller = new AbortController();
    // AbortSignal non notifica i listener aggiunti dopo che è già stato
    // annullato. Propagare subito questo stato impedisce a una preparazione
    // sostituita di raggiungere comunque il provider e generare una seconda
    // risposta tardiva.
    if (externalSignal?.aborted) controller.abort(externalSignal.reason);
    else externalSignal?.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    this.requests.set(requestId, controller);
    return controller;
  }
  async chat(request) { const valid = validateChatRequest(request); this.permit('chat'); const controller = this.begin(valid.requestId, valid.signal); try { const result = await this.requireProvider().chat({ ...valid, signal: controller.signal }); this.record('chat'); return result; } catch (error) { const normalized = normalizeAIError(error, this.providerName); this.record('chat', normalized); throw normalized; } finally { this.requests.delete(valid.requestId); } }
  async streamChat(request, handlers) { const valid = validateChatRequest(request); this.permit('stream'); const controller = this.begin(valid.requestId, valid.signal); try { const result = await this.requireProvider().streamChat({ ...valid, signal: controller.signal }, handlers); this.record('stream'); return result; } catch (error) { const normalized = normalizeAIError(error, this.providerName); this.record('stream', normalized); throw normalized; } finally { this.requests.delete(valid.requestId); } }
  async embed(input, options) { this.permit('embed'); try { const result = await this.requireProvider().embed(input, options); this.record('embed'); return result; } catch (error) { const normalized = normalizeAIError(error, this.providerName); this.record('embed', normalized); throw normalized; } }
  async transcribeVoiceAudio(audio, options = {}) {
    const provider = this.requireProvider();
    if (typeof provider.transcribeAudio !== 'function') throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La trascrizione vocale non è disponibile.', { provider: this.providerName });
    try { return await provider.transcribeAudio(audio, options); } catch (error) { throw normalizeAIError(error, this.providerName); }
  }
  async submitFeedback(example) {
    const provider = this.requireProvider();
    if (typeof provider.submitFeedback !== 'function') throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La raccolta dei contributi non è disponibile.', { provider: this.providerName });
    try { return await provider.submitFeedback(example); } catch (error) { throw normalizeAIError(error, this.providerName); }
  }
  cancel(requestId) {
    const controller = this.requests.get(requestId);
    if (!controller) return false;
    controller.abort();
    // La entry resta occupata fino al finally di chat/streamChat. Liberarla
    // qui consentiva di riusare lo stesso requestId mentre il trasporto
    // precedente stava ancora terminando, con token duplicati o fuori ordine.
    this.provider?.cancel(requestId);
    return true;
  }
  async shutdown() { for (const controller of this.requests.values()) controller.abort(); this.requests.clear(); if (this.provider) await this.provider.shutdown(); this.provider = null; this.providerName = null; }
}
module.exports = { AIRuntime };

// #endregion
