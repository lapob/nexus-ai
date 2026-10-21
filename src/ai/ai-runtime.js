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

function cancelledRequest(provider) {
  return new AIError(AI_ERROR_CODES.REQUEST_CANCELLED, 'Richiesta AI annullata.', { provider, retryable: true });
}

// #region 01 — Lifecycle e catalogo

class AIRuntime {
  constructor({ registry, logger = null, breakerOptions = {} } = {}) {
    this.registry = registry; this.logger = logger; this.provider = null; this.providerName = null; this.requests = new Map();
    this.externalAbortCleanup = new Map();
    this.activityListeners = new Set(); this.activity = new Map(); this.lastActivity = 'idle';
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
  record(operation, error = null, expectedBreaker) {
    const breaker = this.breaker(operation);
    if (!breaker || (expectedBreaker && breaker !== expectedBreaker)) return;
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

  subscribeActivity(listener) {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }
  publishActivity() {
    const states = [...this.activity.values()];
    const state = states.includes('responding') ? 'responding' : states.length ? 'thinking' : 'idle';
    if (state === this.lastActivity) return;
    this.lastActivity = state;
    for (const listener of this.activityListeners) {
      try { listener(state); } catch { /* Visual observers cannot break AI requests. */ }
    }
  }
  finish(requestId, controller) {
    this.externalAbortCleanup.get(controller)?.();
    this.externalAbortCleanup.delete(controller);
    // Un vecchio finally non può liberare l'ID riusato dopo shutdown/initialize.
    if (this.requests.get(requestId) !== controller) return;
    this.requests.delete(requestId); this.activity.delete(requestId); this.publishActivity();
  }
  begin(requestId, externalSignal) {
    if (this.requests.has(requestId)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI già attivo.', { provider: this.providerName });
    if (this.requests.size >= 32) throw new AIError(AI_ERROR_CODES.RATE_LIMITED, 'Troppe richieste AI attive.', { provider: this.providerName, retryable: true });
    const controller = new AbortController();
    // AbortSignal non notifica i listener aggiunti dopo che è già stato
    // annullato. Propagare subito questo stato impedisce a una preparazione
    // sostituita di raggiungere comunque il provider e generare una seconda
    // risposta tardiva.
    if (externalSignal?.aborted) controller.abort(externalSignal.reason);
    else if (externalSignal) {
      const abort = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', abort, { once: true });
      this.externalAbortCleanup.set(controller, () => externalSignal.removeEventListener('abort', abort));
    }
    this.requests.set(requestId, controller);
    this.activity.set(requestId, 'thinking'); this.publishActivity();
    return controller;
  }
  assertActive(requestId, controller) {
    if (controller.signal.aborted || this.requests.get(requestId) !== controller) {
      throw cancelledRequest(this.providerName);
    }
  }
  async chat(request) {
    const valid = validateChatRequest(request), breaker = this.permit('chat');
    const controller = this.begin(valid.requestId, valid.signal), providerName = this.providerName;
    try {
      this.assertActive(valid.requestId, controller);
      const result = await this.requireProvider().chat({ ...valid, signal: controller.signal });
      this.assertActive(valid.requestId, controller);
      this.record('chat', null, breaker); return result;
    } catch (error) {
      const normalized = controller.signal.aborted ? cancelledRequest(providerName) : normalizeAIError(error, providerName);
      this.record('chat', normalized, breaker); throw normalized;
    } finally { this.finish(valid.requestId, controller); }
  }
  async streamChat(request, handlers = {}) {
    const valid = validateChatRequest(request), breaker = this.permit('stream');
    const controller = this.begin(valid.requestId, valid.signal), providerName = this.providerName;
    let closed = false, terminal = false;
    const current = () => !closed && this.requests.get(valid.requestId) === controller;
    const active = () => current() && !controller.signal.aborted && !terminal;
    const emit = (name, args) => {
      if (!active()) return;
      if (name === 'onComplete' || name === 'onError') terminal = true;
      return handlers[name]?.(...args);
    };
    const cancel = () => {
      if (!current() || terminal) return;
      terminal = true; handlers.onCancel?.();
    };
    try {
      this.assertActive(valid.requestId, controller);
      const result = await this.requireProvider().streamChat({ ...valid, signal: controller.signal }, {
        ...handlers,
        onStart: (...args) => emit('onStart', args),
        onThinking: (...args) => emit('onThinking', args),
        onToken: (...args) => {
          if (!active()) return;
          if (this.activity.get(valid.requestId) !== 'responding') {
            this.activity.set(valid.requestId, 'responding'); this.publishActivity();
          }
          return emit('onToken', args);
        },
        onComplete: (...args) => emit('onComplete', args),
        onError: (...args) => emit('onError', args), onCancel: cancel
      });
      this.assertActive(valid.requestId, controller);
      this.record('stream', null, breaker); return result;
    } catch (error) {
      const normalized = controller.signal.aborted ? cancelledRequest(providerName) : normalizeAIError(error, providerName);
      if (normalized.code === AI_ERROR_CODES.REQUEST_CANCELLED) cancel();
      this.record('stream', normalized, breaker); throw normalized;
    } finally { closed = true; this.finish(valid.requestId, controller); }
  }
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
  async shutdown() { for (const controller of this.requests.values()) controller.abort(); for (const cleanup of this.externalAbortCleanup.values()) cleanup(); this.externalAbortCleanup.clear(); this.requests.clear(); this.activity.clear(); this.publishActivity(); if (this.provider) await this.provider.shutdown(); this.provider = null; this.providerName = null; }
}
module.exports = { AIRuntime };

// #endregion
