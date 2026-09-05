/**
 * @module ai/providers/nexus-service-provider
 * @description Client HTTPS dell'edizione pubblica: l'inferenza resta sulla workstation NexusNXS.
 */
const crypto = require('node:crypto');
const { AIError, AI_ERROR_CODES, normalizeAIError } = require('../ai-errors');
const { validateChatRequest } = require('../ai-provider');
const { CircuitBreaker } = require('../circuit-breaker');

// #region Configurazione e trasporto HTTPS pubblico

function publicServiceUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Indirizzo del servizio NexusNXS non valido.', { provider: 'nexus-service' }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname !== '/') {
    throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Il servizio NexusNXS deve usare un’origine HTTPS sicura.', { provider: 'nexus-service' });
  }
  return url.origin;
}

function publicActivityText(event) {
  return String(event?.activity?.text || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

class NexusServiceProvider {
  constructor(config = {}) {
    this.name = 'nexus-service';
    this.baseUrl = publicServiceUrl(config.service?.baseUrl);
    this.fallbackUrls = (config.service?.fallbackUrls || []).map(publicServiceUrl).filter(Boolean).filter((url) => url !== this.baseUrl);
    this.activeBaseUrl = this.baseUrl;
    this.timeoutMs = Number(config.service?.timeoutMs || 120_000);
    this.currentModel = config.chatModel || 'automatic';
    this.installationId = config.service?.installationId || crypto.randomUUID();
    this.token = '';
    this.tokenExpiresAt = 0;
    this.tokenBootstrap = null;
    this.breakers = new Map();
    this.lifecycleController = new AbortController();
  }

  async initialize(config = {}) {
    if (this.lifecycleController.signal.aborted) this.lifecycleController = new AbortController();
    this.baseUrl = publicServiceUrl(config.service?.baseUrl ?? this.baseUrl);
    this.fallbackUrls = (config.service?.fallbackUrls || this.fallbackUrls || []).map(publicServiceUrl).filter(Boolean).filter((url) => url !== this.baseUrl);
    if (![this.baseUrl, ...this.fallbackUrls].includes(this.activeBaseUrl)) this.activeBaseUrl = this.baseUrl;
    this.timeoutMs = Number(config.service?.timeoutMs || this.timeoutMs);
    this.currentModel = config.chatModel || this.currentModel || 'automatic';
    return this.getCapabilities();
  }

  getCapabilities() { return { chat: true, streaming: true, voiceTranscription: true, embeddings: false, modelManagement: false, remoteInference: true }; }
  getCurrentModel() { return this.currentModel; }
  breaker(endpoint) {
    if (!this.breakers.has(endpoint)) this.breakers.set(endpoint, new CircuitBreaker());
    return this.breakers.get(endpoint);
  }
  endpointCandidates(excluded = new Set()) {
    return [this.activeBaseUrl, this.baseUrl, ...this.fallbackUrls]
      .filter((value, index, list) => value && list.indexOf(value) === index && !excluded.has(value));
  }

  async request(path, options = {}) {
    if (!this.baseUrl) throw new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Il servizio NexusNXS non è ancora configurato.', { provider: this.name, retryable: true });
    const mayFailOver = options.health === true || options.failover === true || path === '/api/guest/bootstrap';
    const excluded = options.excludeEndpoints instanceof Set ? options.excludeEndpoints : new Set(options.excludeEndpoints || []);
    const endpoints = mayFailOver ? this.endpointCandidates(excluded) : [this.activeBaseUrl || this.baseUrl].filter((endpoint) => !excluded.has(endpoint));
    let lastError;
    for (const endpoint of endpoints) {
      const breaker = this.breaker(endpoint);
      if (!breaker.permit()) { lastError = Object.assign(new Error('Endpoint temporaneamente sospeso.'), { code: 'CIRCUIT_OPEN' }); continue; }
      try {
        const { health: _health, failover: _failover, excludeEndpoints: _excludeEndpoints, ...fetchOptions } = options;
        const response = await fetch(`${endpoint}${path}`, {
          ...fetchOptions,
          headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
          signal: AbortSignal.any([
            this.lifecycleController.signal,
            ...(options.signal ? [options.signal] : []),
            AbortSignal.timeout(Math.min(this.timeoutMs, options.health ? 5_000 : this.timeoutMs))
          ])
        });
        if (response.status >= 500) {
          breaker.failure();
          if (mayFailOver) { lastError = new Error(`HTTP ${response.status}`); continue; }
        } else breaker.success();
        this.activeBaseUrl = endpoint;
        Object.defineProperty(response, 'nexusEndpoint', { value: endpoint, configurable: true });
        return response;
      } catch (error) { breaker.failure(); lastError = error; if (!mayFailOver) throw error; }
    }
    throw lastError || new Error('Servizio NexusNXS non raggiungibile.');
  }

  // #endregion

  // #region Contratto provider e sessione guest

  async health() {
    const started = performance.now();
    try {
      let response = await this.request('/readyz', { health: true });
      // Compatibilita con gateway installati prima dell'introduzione della
      // readiness separata: alcune versioni non esponevano /readyz (404),
      // altre lo proteggevano per errore (401). Ogni altro stato resta un
      // errore reale e non viene mascherato dal controllo di liveness.
      if (response.status === 401 || response.status === 404) {
        response = await this.request('/healthz', { health: true });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { ok: true, status: 'ready', provider: this.name, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return { ok: false, status: 'offline', provider: this.name, latencyMs: Math.round(performance.now() - started), error: normalizeAIError(error, this.name).toPublic() };
    }
  }

  async listModels() {
    const response = await this.request('/api/models', { health: true });
    if (!response.ok) throw new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Modelli NexusNXS non disponibili.', { provider: this.name, retryable: true });
    const body = await response.json();
    return (Array.isArray(body.models) ? body.models : []).slice(0, 32).map((model) => ({
      id: String(model.id || model.name), name: String(model.name || model.id), provider: this.name,
      capabilities: { chat: true, streaming: true, embeddings: false }, remote: true, available: model.available !== false
    }));
  }

  async setModel(value) { this.currentModel = String(value || 'automatic').slice(0, 128); return { id: this.currentModel, name: this.currentModel, provider: this.name }; }
  async createModel() { throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'La creazione dei modelli è riservata all’ambiente sviluppatore.', { provider: this.name }); }
  async pullModel() { throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'I modelli vengono gestiti dal servizio NexusNXS.', { provider: this.name }); }
  async preloadModel() {
    await this.ensureToken();
    return { status: 'ready', remote: true, warmed: true, endpoint: this.activeBaseUrl || this.baseUrl };
  }
  async embed() { throw new AIError(AI_ERROR_CODES.EMBEDDING_UNSUPPORTED, 'La ricerca locale usa l’indice lessicale protetto.', { provider: this.name }); }

  async transcribeAudio(audio, { language = 'auto', signal } = {}, retried = false) {
    const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
    if (bytes.byteLength < 44 || bytes.byteLength > 2_000_000 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF') {
      throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Registrazione vocale non valida.', { provider: this.name });
    }
    const token = await this.ensureToken(retried);
    const response = await this.request('/api/guest/voice/transcribe', {
      method: 'POST', body: bytes, signal, failover: true,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav', 'X-Nexus-Language': String(language || 'auto').slice(0, 16) }
    });
    if (response.status === 401 && !retried) {
      this.token = ''; this.tokenExpiresAt = 0;
      return this.transcribeAudio(bytes, { language, signal }, true);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = response.status === 429 ? AI_ERROR_CODES.RATE_LIMITED : AI_ERROR_CODES.PROVIDER_UNAVAILABLE;
      throw new AIError(code, result.error || 'Trascrizione NexusNXS non disponibile.', { provider: this.name, retryable: response.status >= 429 });
    }
    return { ...result, text: String(result.text || '').trim(), language: String(result.language || language || 'auto'), backend: 'nexus-service', available: true, local: false };
  }

  async ensureToken(force = false) {
    if (this.token && !force && this.tokenExpiresAt > Date.now() + 5 * 60_000) return this.token;
    if (this.tokenBootstrap) return this.tokenBootstrap;
    this.tokenBootstrap = (async () => {
      const response = await this.request('/api/guest/bootstrap', { method: 'POST', body: JSON.stringify({ installationId: this.installationId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) throw new AIError(response.status === 429 ? AI_ERROR_CODES.RATE_LIMITED : AI_ERROR_CODES.PROVIDER_UNAVAILABLE, body.error || 'Sessione NexusNXS non disponibile.', { provider: this.name, retryable: true });
      this.token = String(body.token);
      this.tokenExpiresAt = Number(body.expiresAt || 0);
      return this.token;
    })();
    try { return await this.tokenBootstrap; }
    finally { this.tokenBootstrap = null; }
  }

  payload(request) {
    const messages = request.messages.filter((message) => message.role === 'user' || message.role === 'assistant');
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    return {
      text: lastUser?.content || request.messages.at(-1)?.content || '',
      history: messages.slice(0, -1).slice(-24),
      mode: request.mode === 'deep' ? 'deep' : 'fast',
      model: String(request.model || this.currentModel || 'automatic').slice(0, 128),
      clientMessageId: crypto.createHash('sha256').update(request.requestId).digest('hex').slice(0, 40)
    };
  }

  async authorized(path, request, retried = false, transport = {}) {
    const token = await this.ensureToken(retried);
    const response = await this.request(path, {
      method: 'POST', body: JSON.stringify({ ...this.payload(request), ...(transport.cursor ? { cursor: transport.cursor } : {}) }),
      headers: { Authorization: `Bearer ${token}` }, signal: request.signal,
      failover: transport.failover === true, excludeEndpoints: transport.excludeEndpoints
    });
    if (response.status === 401 && !retried) {
      this.token = ''; this.tokenExpiresAt = 0;
      return this.authorized(path, request, true, transport);
    }
    return response;
  }

  async chat(request) {
    // Il contratto resta non-stream per il chiamante, ma il trasporto usa lo
    // stesso NDJSON resiliente del rendering progressivo. I heartbeat evitano
    // che proxy e client chiudano una risposta lunga mentre il modello sta
    // ancora ragionando; streamChat ricompone poi il messaggio finale senza
    // esporre frame intermedi al chiamante.
    return this.streamChat(request);
  }

  async streamChat(request, handlers = {}) {
    const valid = validateChatRequest(request);
    handlers.onStart?.({ requestId: valid.requestId, provider: this.name, model: this.currentModel });
    let content = '';
    let delivered = false;
    let lastActivity = '';
    const excludedEndpoints = new Set();
    while (excludedEndpoints.size < Math.max(1, this.endpointCandidates().length)) {
      let response;
      try {
        response = await this.authorized('/api/guest/messages/stream', valid, false, { failover: true, excludeEndpoints: excludedEndpoints, cursor: 0 });
        if (!response.ok || !response.body) throw new AIError(response.status === 429 ? AI_ERROR_CODES.RATE_LIMITED : AI_ERROR_CODES.STREAM_INTERRUPTED, 'Connessione al servizio NexusNXS interrotta.', { provider: this.name, retryable: true });
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split('\n');
          if (!done) buffer = lines.pop();
          else buffer = '';
          for (const raw of lines) {
            if (!raw.trim()) continue;
            const event = JSON.parse(raw);
            if (event.type === 'phase') {
              const activity = publicActivityText(event);
              if (activity && activity !== lastActivity) {
                lastActivity = activity;
                handlers.onThinking?.(activity);
              }
            }
            if (event.type === 'token') {
              const token = String(event.token || '');
              if (token) { delivered = true; content += token; handlers.onToken?.(token); }
            }
            if (event.type === 'error') throw new AIError(AI_ERROR_CODES.STREAM_INTERRUPTED, String(event.error || 'Risposta non completata.'), { provider: this.name, retryable: !delivered });
            if (event.type === 'complete' && event.message) content = String(event.message);
          }
          if (done) break;
        }
        const result = { message: { role: 'assistant', content }, model: this.currentModel, provider: this.name, requestId: valid.requestId };
        handlers.onComplete?.(result); return result;
      } catch (error) {
        const endpoint = response?.nexusEndpoint;
        if (endpoint) { excludedEndpoints.add(endpoint); this.breaker(endpoint).failure(); }
        // request() ha già attraversato tutti gli endpoint quando non esiste
        // una Response associata all'errore: un altro giro sarebbe identico.
        if (!endpoint) throw normalizeAIError(error, this.name);
        const alternativesRemain = this.endpointCandidates(excludedEndpoints).length > 0;
        // Una volta emesso il primo token il cambio endpoint sarebbe visibile e
        // potrebbe duplicare testo. L'errore resta riprendibile usando lo stesso
        // clientMessageId, ma non viene mai ritentato automaticamente qui.
        if (delivered || !alternativesRemain || error?.code === AI_ERROR_CODES.RATE_LIMITED || error?.code === AI_ERROR_CODES.REQUEST_CANCELLED) throw normalizeAIError(error, this.name);
      }
    }
    throw new AIError(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Connessione al servizio NexusNXS interrotta.', { provider: this.name, retryable: true });
  }

  async submitFeedback(example, retried = false) {
    const token = await this.ensureToken(retried);
    const body = {
      requestId: String(example.requestId || '').slice(0, 128), prompt: String(example.prompt || '').slice(0, 12_000),
      response: String(example.response || '').slice(0, 20_000), originalResponse: String(example.originalResponse || '').slice(0, 20_000),
      model: String(example.model || 'automatic').slice(0, 128), mode: example.mode === 'deep' ? 'deep' : 'fast', consent: true
    };
    const response = await this.request('/api/guest/feedback', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 && !retried) { this.token = ''; this.tokenExpiresAt = 0; return this.submitFeedback(example, true); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'received') throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, result.error || 'Contributo non ricevuto.', { provider: this.name, retryable: response.status >= 500 });
    return result;
  }

  cancel() { return true; }
  async shutdown() { this.token = ''; this.tokenExpiresAt = 0; this.tokenBootstrap = null; this.lifecycleController.abort(); }

  // #endregion
}

module.exports = { NexusServiceProvider, publicActivityText, publicServiceUrl };
