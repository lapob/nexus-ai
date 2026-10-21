/**
 * @module ai/providers/llama-cpp-provider
 * @description Trasporto candidato locale: non registrato nel bootstrap di produzione.
 */
const { boundedResponseText } = require('../../security/bounded-response');
const { validateChatRequest } = require('../ai-provider');
const { AIError, AI_ERROR_CODES, normalizeAIError } = require('../ai-errors');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_BYTES = 64 * 1024;
const CAPABILITIES = Object.freeze({ chat: true, streaming: true, thinking: true, thinkingEffort: false,
  embeddings: false, tools: false, vision: false });

// #region 01 — Configurazione e contratto locale

class LlamaCppProvider {
  #apiKey;
  constructor(config = {}, dependencies = {}) {
    this.name = 'llama-cpp';
    this.fetch = dependencies.fetch || globalThis.fetch;
    this.lifecycleController = new AbortController();
    this.configure(config);
  }
  error(code, message, retryable = false) {
    return new AIError(code, message, { provider: this.name, retryable });
  }
  configure(config) {
    const ai = config.ai || config;
    const native = ai.llamaCpp || {};
    // Nessun hostname, alias numerico, proxy remoto, path, credenziale o redirect.
    // Questo adattatore non costituisce ammissione del binario che lo serve.
    const endpoint = String(native.baseUrl || '');
    const endpointMatch = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/?$/u.exec(endpoint);
    if (!endpointMatch || Number(endpointMatch[1]) < 1024 || Number(endpointMatch[1]) > 65535) {
      throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Endpoint nativo locale non valido.');
    }
    if (typeof native.apiKey !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/u.test(native.apiKey)) {
      throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Token del runtime locale non valido.');
    }
    if (typeof ai.chatModel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(ai.chatModel)) {
      throw this.error(AI_ERROR_CODES.MODEL_NOT_SELECTED, 'Seleziona il modello locale caricato.');
    }
    const timeout = native.timeoutMs ?? 120000;
    this.validateNumber(timeout, 250, 300000, true);
    this.baseUrl = endpoint.replace(/\/$/u, '');
    this.#apiKey = native.apiKey;
    this.currentModel = ai.chatModel;
    this.timeoutMs = timeout;
  }
  validateNumber(value, min, max, integer = false) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Parametro del runtime locale non valido.');
    }
  }
  async initialize(config) {
    if (config) this.configure(config);
    if (this.lifecycleController.signal.aborted) this.lifecycleController = new AbortController();
    return this;
  }
  getCapabilities() { return { ...CAPABILITIES }; }
  getCurrentModel() { return this.currentModel; }
  async setModel(model) {
    if (model !== this.currentModel) throw this.error(AI_ERROR_CODES.MODEL_NOT_FOUND, 'Modello non caricato nel runtime locale.');
    const models = await this.listModels();
    return models[0];
  }
  async listModels() {
    const signal = this.signal(null, Math.min(this.timeoutMs, 3000));
    const response = await this.request('/v1/models', { signal });
    const data = await this.json(response, signal);
    if (!Array.isArray(data?.data) || !data.data.some(item => item?.id === this.currentModel)) {
      throw this.error(AI_ERROR_CODES.MODEL_NOT_FOUND, 'Il runtime locale non conferma il modello selezionato.');
    }
    return [{ id: this.currentModel, name: this.currentModel, provider: this.name, capabilities: this.getCapabilities() }];
  }
  async health() {
    const started = performance.now();
    try {
      await this.listModels();
      return { ok: true, status: 'ready', provider: this.name, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return { ok: false, status: 'offline', provider: this.name, error: normalizeAIError(error, this.name).toPublic() };
    }
  }
  async preloadModel(model = this.currentModel) {
    await this.setModel(model);
    return { status: 'ready', model, preserved: true, loadDurationNs: 0 };
  }
  async createModel() { throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Creazione modelli non supportata dal runtime candidato.'); }
  async pullModel() { throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Download modelli non supportato dal runtime candidato.'); }
  async embed() { throw this.error(AI_ERROR_CODES.EMBEDDING_UNSUPPORTED, 'Embedding non disponibile sul runtime candidato.'); }
  cancel() { return false; } // Il controller per richiesta appartiene ad AIRuntime.
  async shutdown() { this.lifecycleController.abort(); }

  // #endregion

  // #region 02 — Richieste bounded e risposta finale

  signal(external, timeoutMs) {
    // I profili Deep esistenti arrivano a dieci minuti per singola richiesta.
    this.validateNumber(timeoutMs, 250, 600000, true);
    return AbortSignal.any([this.lifecycleController.signal, ...(external ? [external] : []), AbortSignal.timeout(timeoutMs)]);
  }
  async request(path, { body, signal } = {}) {
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.#apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const code = response.status === 429 ? AI_ERROR_CODES.RATE_LIMITED
          : response.status === 503 || response.status === 401 ? AI_ERROR_CODES.PROVIDER_UNAVAILABLE
            : AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE;
        throw this.error(code, `Il runtime locale ha risposto con HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
      }
      return response;
    } catch (error) { throw normalizeAIError(error, this.name); }
  }
  async json(response, signal) {
    try { return JSON.parse(await boundedResponseText(response, MAX_RESPONSE_BYTES, 'Risposta AI', signal)); }
    catch (error) {
      signal.throwIfAborted();
      throw this.error(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Risposta JSON del runtime locale non valida o troppo grande.');
    }
  }
  payload(request, stream) {
    const valid = validateChatRequest(request);
    if (valid.model && valid.model !== this.currentModel) throw this.error(AI_ERROR_CODES.MODEL_NOT_FOUND, 'Modello non caricato nel runtime locale.');
    if (valid.messages.some(message => message.images?.length || message.role === 'tool') || valid.tools || valid.tool_choice) {
      throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Immagini e strumenti nativi non supportati dal runtime candidato.');
    }
    if (typeof valid.think === 'string') {
      throw this.error(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Il candidato supporta ragionamento attivo o disattivo, senza livelli di intensita.');
    }
    const maxTokens = valid.maxTokens ?? (valid.mode === 'deep' ? 2048 : 512);
    this.validateNumber(maxTokens, 1, 8192, true);
    const temperature = valid.temperature ?? 0.3;
    this.validateNumber(temperature, 0, 2);
    const sampling = { seed: valid.seed ?? 42, top_p: valid.topP ?? 0.8,
      top_k: valid.topK ?? 20, repeat_penalty: valid.repeatPenalty ?? 1.05,
      min_p: valid.minP ?? 0, presence_penalty: valid.presencePenalty ?? 0 };
    this.validateNumber(sampling.seed, -2147483648, 2147483647, true);
    this.validateNumber(sampling.top_p, 0.01, 1);
    this.validateNumber(sampling.top_k, 0, 1000, true);
    this.validateNumber(sampling.repeat_penalty, 0, 2);
    this.validateNumber(sampling.min_p, 0, 1);
    this.validateNumber(sampling.presence_penalty, -2, 2);
    const thinking = valid.think !== undefined ? valid.think !== false : valid.mode === 'deep';
    const signal = this.signal(valid.signal, valid.timeoutMs ?? this.timeoutMs);
    // I template recenti richiedono un solo system iniziale. Riuniamo solo
    // messaggi gia privilegiati, in ordine; user/assistant restano separati e
    // invariati. Una revisione interna tardiva non diventa un messaggio utente.
    const systems = valid.messages.filter(message => message.role === 'system');
    const messages = systems.length ? [{ role: 'system', content: systems.map(message => message.content).join('\n\n') },
      ...valid.messages.filter(message => message.role !== 'system')] : valid.messages;
    const body = { model: this.currentModel, messages, stream,
      max_tokens: maxTokens, temperature, ...sampling,
      reasoning_effort: thinking ? 'medium' : 'none', chat_template_kwargs: { enable_thinking: thinking },
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(valid.format ? { response_format: valid.format === 'json' ? { type: 'json_object' }
        : { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: valid.format } } } : {}) };
    return { valid, body, signal };
  }
  result(requestId, content, finishReason, usage) {
    if (!content.trim() || !['stop', 'length'].includes(finishReason)) {
      throw this.error(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Il modello locale non ha completato una risposta finale valida.', true);
    }
    const tokens = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    return { requestId, provider: this.name, model: this.currentModel,
      message: { role: 'assistant', content }, finishReason,
      usage: { promptTokens: tokens(usage?.prompt_tokens), completionTokens: tokens(usage?.completion_tokens), totalTokens: tokens(usage?.total_tokens) }, timings: {} };
  }
  async chat(request) {
    try {
      const { valid, body, signal } = this.payload(request, false);
      const response = await this.request('/v1/chat/completions', { body, signal });
      const data = await this.json(response, signal);
      const choice = data?.choices?.[0];
      if (data?.error || !Array.isArray(data?.choices) || data.choices.length !== 1
        || choice?.message?.role !== 'assistant' || typeof choice.message.content !== 'string'
        || choice.message.tool_calls?.length || (data.model && data.model !== this.currentModel)) {
        throw this.error(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Risposta chat locale non valida.');
      }
      return this.result(valid.requestId, choice.message.content, choice.finish_reason, data.usage);
    } catch (error) { throw normalizeAIError(error, this.name); }
  }

  // #endregion

  // #region 03 — Streaming SSE, annullamento e rilascio risorse

  async streamChat(request, handlers = {}) {
    let reader; let signal; let cancel; let terminal = false;
    try {
      const prepared = this.payload(request, true);
      signal = prepared.signal;
      const response = await this.request('/v1/chat/completions', prepared);
      if (!/^text\/event-stream(?:;|$)/iu.test(response.headers.get('content-type') || '')) {
        void response.body?.cancel().catch(() => {});
        throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Tipo di stream locale non valido.');
      }
      reader = response.body?.getReader();
      if (!reader) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Stream locale non leggibile.');
      cancel = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      handlers.onStart?.({ requestId: prepared.valid.requestId, provider: this.name, model: this.currentModel });
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let buffer = ''; let event = []; let eventBytes = 0; let bytes = 0;
      let content = ''; let finishReason; let usage; let doneEvent = false;
      const dispatch = () => {
        signal.throwIfAborted();
        if (!event.length) return;
        const raw = event.join('\n'); event = []; eventBytes = 0;
        if (raw === '[DONE]') { doneEvent = true; return; }
        let data;
        try { data = JSON.parse(raw); } catch { throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Evento locale non valido.'); }
        if (data.error || !Array.isArray(data.choices) || data.choices.length > 1 || (data.model && data.model !== this.currentModel)) {
          throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Evento chat locale non valido.');
        }
        if (data.usage) usage = data.usage;
        if (!data.choices.length) return;
        const choice = data.choices[0]; const delta = choice.delta;
        if (choice.index !== 0 || !delta || typeof delta !== 'object' || delta.tool_calls?.length
          || (delta.role !== undefined && delta.role !== 'assistant')
          || (delta.content !== undefined && delta.content !== null && typeof delta.content !== 'string')) {
          throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Delta chat locale non valido.');
        }
        if (finishReason !== undefined) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Evento successivo alla risposta finale.');
        if (delta.content) { content += delta.content; handlers.onToken?.(delta.content); }
        signal.throwIfAborted();
        // Il ragionamento resta separato dal testo finale e non viene conservato.
        if (delta.reasoning_content || delta.reasoning) handlers.onThinking?.('');
        if (choice.finish_reason !== null && choice.finish_reason !== undefined) finishReason = choice.finish_reason;
      };
      while (!doneEvent) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        bytes += value?.byteLength || 0;
        if (bytes > MAX_RESPONSE_BYTES) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Stream locale troppo grande.');
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let boundary;
        while ((boundary = buffer.indexOf('\n')) >= 0 && !doneEvent) {
          const line = buffer.slice(0, boundary).replace(/\r$/u, ''); buffer = buffer.slice(boundary + 1);
          if (!line) dispatch();
          else if (line.startsWith('data:')) {
            const data = line.slice(5).replace(/^ /u, '');
            eventBytes += Buffer.byteLength(data) + 1;
            if (eventBytes > MAX_EVENT_BYTES) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Evento locale troppo grande.');
            event.push(data);
          }
        }
        if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Riga locale troppo grande.');
        if (done && !doneEvent) throw this.error(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Stream locale terminato senza conferma finale.', true);
      }
      signal.throwIfAborted();
      const result = this.result(prepared.valid.requestId, content, finishReason, usage);
      terminal = true; handlers.onComplete?.(result);
      return result;
    } catch (error) {
      const normalized = normalizeAIError(signal?.aborted ? signal.reason : error, this.name);
      if (!terminal) {
        terminal = true;
        if (normalized.code === AI_ERROR_CODES.REQUEST_CANCELLED) handlers.onCancel?.();
        else handlers.onError?.(normalized.toPublic());
      }
      throw normalized;
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }

  // #endregion
}

module.exports = { LlamaCppProvider };
