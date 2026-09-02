/**
 * @module ai/providers/ollama-provider
 * @description Adapter di un provider AI conforme al contratto runtime locale.
 */
const { assertOllamaUrl } = require('../../core/security');
const { AIError, AI_ERROR_CODES, normalizeAIError } = require('../ai-errors');
const { validateChatRequest } = require('../ai-provider');

// #region 01 — Capability e specifiche modello

// I nomi distribuiti da Ollama non espongono sempre le capability in /api/tags.
// La classificazione conservativa evita di selezionare come chat un modello
// dedicato esclusivamente agli embedding.
const EMBEDDING_MODEL_PATTERN = /embeddinggemma|(^|[-_.:/])(embed|embedding|bge|e5|gte)([-_.:/]|$)|nomic-embed|all-minilm/i;
function inferModelCapabilities(modelName) {
  const embeddingOnly = EMBEDDING_MODEL_PATTERN.test(String(modelName || ''));
  return {
    chat: !embeddingOnly,
    streaming: !embeddingOnly,
    embeddings: embeddingOnly,
    tools: false,
    vision: false,
    thinking: /^qwen3(?::|$)/i.test(String(modelName || ''))
  };
}

function normalizeQwenContent(model, mode, content, finishReason = '') {
  const raw = String(content || '');
  if (mode !== 'quick' || !/^qwen3(?::|$)/i.test(String(model || ''))) return raw;
  const boundary = raw.lastIndexOf('</think>');
  if (boundary >= 0) return raw.slice(boundary + 8).trimStart();
  // Con `think:false` le versioni recenti restituiscono direttamente il testo
  // visibile. Il solo done_reason=length non dimostra che sia ragionamento: lo
  // scarto precedente faceva fallire risposte valide che raggiungevano il tetto
  // di token. Tratteniamo soltanto un blocco legacy esplicitamente marcato.
  if (/^\s*<think>/i.test(raw) && finishReason === 'length') return '';
  return raw;
}

function normalizeCreateSpecification(value = {}) {
  const name = String(value.name || '').trim();
  const from = String(value.from || '').trim();
  const system = String(value.system || '').trim();
  const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
  const numCtx = Number(value.numCtx ?? 8192);
  const temperature = Number(value.temperature ?? 0.3);
  if (!modelPattern.test(name) || !modelPattern.test(from) || name === from) {
    throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Nome o modello base della personalizzazione non valido.', { provider: 'ollama' });
  }
  if (!system || system.length > 12000) {
    throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'System prompt del modello non valido.', { provider: 'ollama' });
  }
  if (!Number.isInteger(numCtx) || numCtx < 512 || numCtx > 262144 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Parametri del modello personalizzato non validi.', { provider: 'ollama' });
  }
  return { name, from, system, numCtx, temperature };
}

// #endregion

function quickMessages(model, mode, messages) {
  if (mode !== 'quick' || !/^qwen3(?::|$)/i.test(model)) return messages;
  let prefixed = false;
  return messages.map((message, index) => {
    if (prefixed || message.role !== 'user' || messages.slice(index + 1).some((item) => item.role === 'user')) return message;
    prefixed = true;
    return { ...message, content: `/no_think\n${message.content.replace(/^\/no_think\s*/i, '')}` };
  });
}

function thinkingPreference(request) {
  return request.think !== undefined ? request.think : request.mode === 'deep';
}

function messagesForThinking(model, request) {
  return thinkingPreference(request) === false ? quickMessages(model, 'quick', request.messages) : request.messages;
}
function canonicalModelId(value) {
  return String(value || '').trim().toLowerCase().replace(/:latest$/u, '');
}
// #region 02 — Trasporto e catalogo Ollama

class OllamaProvider {
  constructor(config = {}, dependencies = {}) { this.name = 'ollama'; this.fetch = dependencies.fetch || globalThis.fetch; this.initialized = false; this.currentModel = null; this.embeddingModel = null; this.lifecycleController = new AbortController(); this.configure(config); }
  configure(config = {}) { const ai = config.ai || config; const ollama = ai.ollama || ai; this.allowLan = ai.allowLan === true || ollama.allowLan === true; try { this.baseUrl = assertOllamaUrl(String(ollama.baseUrl || 'http://127.0.0.1:11434'), { allowLan: this.allowLan }); } catch (cause) { throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, cause.message, { provider: this.name, cause }); } this.timeoutMs = Number(ollama.timeoutMs || 3000); if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 250 || this.timeoutMs > 300000) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Timeout Ollama non valido.', { provider: this.name }); this.currentModel = ai.chatModel || null; this.embeddingModel = ai.embeddingModel || null; }
  async initialize(config = {}) { this.configure(config); if (typeof this.fetch !== 'function') throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Fetch non disponibile nel runtime Node.', { provider: this.name }); if (this.lifecycleController.signal.aborted) this.lifecycleController = new AbortController(); this.initialized = true; return this; }
  createSignal(signal, timeoutMs = this.timeoutMs) { return AbortSignal.any([this.lifecycleController.signal, ...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]); }
  async request(path, { method = 'GET', body, signal, timeoutMs } = {}) {
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: this.createSignal(signal, timeoutMs) });
      if (response.status === 404 && body?.model) throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, `Modello Ollama non trovato: ${body.model}.`, { provider: this.name });
      if (response.status === 429) throw new AIError(AI_ERROR_CODES.RATE_LIMITED, 'Ollama ha limitato la richiesta.', { provider: this.name, retryable: true });
      if (!response.ok) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, `Ollama ha risposto con HTTP ${response.status}.`, { provider: this.name, retryable: response.status >= 500 });
      return response;
    } catch (error) { throw normalizeAIError(error, this.name); }
  }
  descriptor(item) { const id = String(item?.model || item?.name || '').trim(); if (!id) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Descrittore modello Ollama privo di nome.', { provider: this.name }); return { id, name: String(item.name || id), provider: this.name, ...(Number.isFinite(item.size) ? { size: item.size } : {}), ...(item.modified_at ? { modifiedAt: item.modified_at } : {}), ...(item.details && typeof item.details === 'object' ? { details: { family: item.details.family, parameterSize: item.details.parameter_size, quantization: item.details.quantization_level } } : {}), capabilities: inferModelCapabilities(id) }; }
  async listModels() { const response = await this.request('/api/tags'); let data; try { data = await response.json(); } catch (cause) { throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Elenco modelli Ollama non valido.', { provider: this.name, cause }); } if (!Array.isArray(data?.models)) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Elenco modelli Ollama non valido.', { provider: this.name }); return data.models.slice(0, 100).map((item) => this.descriptor(item)); }
  async health() { const started = performance.now(); try { const [versionResponse, models] = await Promise.all([this.request('/api/version', { timeoutMs: Math.min(this.timeoutMs, 3000) }), this.listModels()]); const versionData = await versionResponse.json(); if (typeof versionData?.version !== 'string') throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Versione Ollama non valida.', { provider: this.name }); const selected = this.currentModel && models.some((model) => model.id === this.currentModel); const ready = Boolean(selected); const reason = !models.length ? 'Nessun modello Ollama installato.' : !this.currentModel ? 'Nessun modello chat selezionato.' : !selected ? `Modello selezionato non disponibile: ${this.currentModel}.` : null; const errorCode = !models.length || !this.currentModel ? AI_ERROR_CODES.MODEL_NOT_SELECTED : AI_ERROR_CODES.MODEL_NOT_FOUND; return { ok: ready, status: ready ? 'ready' : 'degraded', provider: this.name, endpoint: this.baseUrl, version: versionData.version, latencyMs: Math.round(performance.now() - started), ...(reason ? { error: { code: errorCode, message: reason, retryable: false } } : {}) }; } catch (error) { const normalized = normalizeAIError(error, this.name); return { ok: false, status: normalized.code === AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE || normalized.code === AI_ERROR_CODES.CONFIGURATION_INVALID ? 'error' : 'offline', provider: this.name, endpoint: this.baseUrl, latencyMs: Math.round(performance.now() - started), error: normalized.toPublic() }; } }
  getCurrentModel() { return this.currentModel; }
  async setModel(modelName) { const name = String(modelName || '').trim(); if (!name) throw new AIError(AI_ERROR_CODES.MODEL_NOT_SELECTED, 'Seleziona un modello chat.', { provider: this.name }); const models = await this.listModels(); if (!models.some((model) => model.id === name)) throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, `Modello Ollama non trovato: ${name}.`, { provider: this.name }); this.currentModel = name; return models.find((model) => model.id === name); }
  async createModel(specification) {
    const valid = normalizeCreateSpecification(specification);
    const before = await this.listModels();
    if (before.some((model) => model.id === valid.name)) {
      throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, `Esiste già un modello chiamato ${valid.name}.`, { provider: this.name });
    }
    const base = before.find((model) => model.id === valid.from);
    if (!base || base.capabilities?.chat === false) {
      throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, `Modello base Ollama non disponibile: ${valid.from}.`, { provider: this.name });
    }
    const response = await this.request('/api/create', {
      method: 'POST',
      body: {
        model: valid.name,
        from: valid.from,
        system: valid.system,
        parameters: { num_ctx: valid.numCtx, temperature: valid.temperature },
        stream: false
      },
      timeoutMs: 300000
    });
    let data;
    try { data = await response.json(); }
    catch (cause) { throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Risposta creazione modello Ollama non valida.', { provider: this.name, cause }); }
    if (data?.status !== 'success') {
      throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Ollama non ha confermato la creazione del modello.', { provider: this.name });
    }
    const created = (await this.listModels()).find((model) => model.id === valid.name);
    if (!created) throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, `Il modello ${valid.name} non compare nel catalogo Ollama.`, { provider: this.name });
    this.currentModel = created.id;
    return created;
  }
  async pullModel(modelName, { signal, onProgress } = {}) {
    const model = String(modelName || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
      throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Modello da preparare non valido.', { provider: this.name });
    }
    const response = await this.request('/api/pull', {
      method: 'POST',
      body: { model, stream: true },
      signal,
      timeoutMs: 6 * 60 * 60 * 1000
    });
    const reader = response.body?.getReader();
    if (!reader) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Preparazione del modello non leggibile.', { provider: this.name });
    const decoder = new TextDecoder();
    let buffer = '';
    let final = null;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop();
      for (const raw of lines.concat(done && buffer.trim() ? [buffer] : [])) {
        if (!raw.trim()) continue;
        let event;
        try { event = JSON.parse(raw); }
        catch (cause) { throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Avanzamento preparazione non valido.', { provider: this.name, cause }); }
        if (event.error) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, String(event.error), { provider: this.name, retryable: true });
        const total = Number(event.total) || 0;
        const completed = Number(event.completed) || 0;
        const progress = { status: String(event.status || 'preparing'), model, total, completed, percent: total > 0 ? Math.min(100, Math.round(completed / total * 100)) : 0 };
        onProgress?.(progress);
        final = progress;
      }
      if (done) break;
    }
    if (!final || final.status !== 'success') throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Preparazione del modello incompleta.', { provider: this.name, retryable: true });
    return final;
  }
  async preloadModel(requested, { keepAlive = '15m', numCtx, signal, preserveLoadedModel = false } = {}) {
    const model = this.requireModel(requested);
    if (preserveLoadedModel) {
      try {
        const activeResponse = await this.request('/api/ps', {
          signal,
          timeoutMs: Math.min(this.timeoutMs, 3000)
        });
        const active = (await activeResponse.json())?.models;
        const loaded = Array.isArray(active)
          ? active.map((entry) => String(entry?.model || entry?.name || '')).filter(Boolean)
          : [];
        if (loaded.length && !loaded.includes(model)) {
          return { status: 'ready', model: loaded[0], requestedModel: model, preserved: true, loadDurationNs: 0 };
        }
      } catch {
        // Runtime Ollama precedenti possono non esporre /api/ps: in quel caso
        // il preload tradizionale resta il fallback compatibile.
      }
    }
    const response = await this.request('/api/generate', {
      method: 'POST',
      body: { model, prompt: '', stream: false, keep_alive: keepAlive, ...(numCtx ? { options: { num_ctx: numCtx } } : {}) },
      signal,
      timeoutMs: Math.max(this.timeoutMs, 1000)
    });
    const data = await response.json();
    if (data?.done !== true) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Preparazione rapida del modello non riuscita.', { provider: this.name, retryable: true });
    return { status: 'ready', model, loadDurationNs: data.load_duration };
  }
  async resolveRequestModel(requested, { mode = 'quick', reuseLoadedModel = false, reusableModels = [], signal } = {}) {
    const model = this.requireModel(requested);
    // Il modello principale non viene mai declassato solo perché il rapido è
    // residente: la policy qualità/deep ha priorità sulla residency.
    if (mode === 'deep' || !reuseLoadedModel || model === this.currentModel) return model;
    const allowed = new Set([model, ...(Array.isArray(reusableModels) ? reusableModels : [])]
      .map((value) => String(value || '').trim())
      .filter((value) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value))
      .map(canonicalModelId));
    if (allowed.size < 2) return model;
    try {
      const activeResponse = await this.request('/api/ps', { signal, timeoutMs: Math.min(this.timeoutMs, 1000) });
      const active = (await activeResponse.json())?.models;
      const loaded = Array.isArray(active)
        ? active.map((entry) => String(entry?.model || entry?.name || '')).filter((value) => allowed.has(canonicalModelId(value)))
        : [];
      const requestedResident = loaded.find((value) => canonicalModelId(value) === canonicalModelId(model));
      if (requestedResident) return requestedResident;
      const primaryResident = loaded.find((value) => canonicalModelId(value) === canonicalModelId(this.currentModel));
      if (primaryResident) return primaryResident;
      return loaded[0] || model;
    } catch {
      // La residenza è solo un'ottimizzazione: il routing originale resta il fallback.
      return model;
    }
  }
  getCapabilities() { return { chat: true, streaming: true, embeddings: true, tools: false, vision: false, thinking: true }; }

  // #endregion

  // #region 03 — Chat, streaming ed embedding

  requireModel(requested) { const model = requested || this.currentModel; if (!model) throw new AIError(AI_ERROR_CODES.MODEL_NOT_SELECTED, 'Nessun modello chat selezionato.', { provider: this.name }); return model; }
  normalizeResult(data, requestId, model, content) { if (!data || typeof data !== 'object') throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Risposta chat Ollama non valida.', { provider: this.name }); return { requestId, provider: this.name, model: String(data.model || model), message: { role: 'assistant', content: String(content ?? data.message?.content ?? '') }, finishReason: String(data.done_reason || (data.done ? 'stop' : 'unknown')), usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count, totalTokens: Number.isFinite(data.prompt_eval_count) && Number.isFinite(data.eval_count) ? data.prompt_eval_count + data.eval_count : undefined }, timings: { totalDurationNs: data.total_duration, loadDurationNs: data.load_duration, promptEvalDurationNs: data.prompt_eval_duration, evalDurationNs: data.eval_duration } }; }
  async chat(request) {
    const valid = validateChatRequest(request);
    const model = await this.resolveRequestModel(valid.model, valid);
    const response = await this.request('/api/chat', {
      method: 'POST',
      body: {
        model,
        messages: messagesForThinking(model, valid),
        stream: false,
        think: thinkingPreference(valid),
        keep_alive: valid.keepAlive || '15m',
        ...(valid.format ? { format: valid.format } : {}),
        options: {
          ...(valid.temperature !== undefined ? { temperature: valid.temperature } : {}),
          ...(valid.maxTokens ? { num_predict: valid.maxTokens } : {}),
          ...(valid.numCtx ? { num_ctx: valid.numCtx } : {})
        }
      },
      signal: valid.signal,
      timeoutMs: Math.max(this.timeoutMs, Number(valid.timeoutMs) || 1000)
    });
    let data;
    try { data = await response.json(); }
    catch (cause) { throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'JSON chat Ollama non valido.', { provider: this.name, cause }); }
    if (!data?.message || typeof data.message.content !== 'string') {
      throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Messaggio chat Ollama non valido.', { provider: this.name });
    }
    const normalizationMode = thinkingPreference(valid) === false ? 'quick' : valid.mode;
    const content = normalizeQwenContent(model, normalizationMode, data.message.content, data.done_reason);
    if (!content.trim()) {
      throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Il modello ha esaurito la risposta prima del testo finale.', { provider: this.name, retryable: true });
    }
    return this.normalizeResult(data, valid.requestId, model, content);
  }
  async streamChat(request, handlers = {}) { const valid = validateChatRequest(request); const model = await this.resolveRequestModel(valid.model, valid); let terminal = false; let content = ''; let finalData = null; const emitError = (error) => { if (!terminal) { terminal = true; handlers.onError?.(error.toPublic ? error.toPublic() : error); } }; try { const response = await this.request('/api/chat', { method: 'POST', body: { model, messages: messagesForThinking(model, valid), stream: true, think: thinkingPreference(valid), keep_alive: valid.keepAlive || '15m', options: { ...(valid.temperature !== undefined ? { temperature: valid.temperature } : {}), ...(valid.maxTokens ? { num_predict: valid.maxTokens } : {}), ...(valid.numCtx ? { num_ctx: valid.numCtx } : {}) } }, signal: valid.signal, timeoutMs: Math.max(this.timeoutMs, Number(valid.timeoutMs) || 1000) }); handlers.onStart?.({ requestId: valid.requestId, provider: this.name, model }); const reader = response.body?.getReader(); if (!reader) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Stream Ollama non leggibile.', { provider: this.name }); const decoder = new TextDecoder(); let buffer = ''; while (true) { const { done, value } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const lines = buffer.split('\n'); buffer = done ? '' : lines.pop(); for (const raw of lines.concat(done && buffer.trim() ? [buffer] : [])) { if (!raw.trim()) continue; let chunk; try { chunk = JSON.parse(raw); } catch (cause) { throw new AIError(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Chunk streaming Ollama non valido.', { provider: this.name, cause }); } if (chunk.error) throw new AIError(AI_ERROR_CODES.STREAM_INTERRUPTED, String(chunk.error), { provider: this.name }); const token = String(chunk.message?.content || ''); const thinking = String(chunk.message?.thinking || ''); if (token) { content += token; handlers.onToken?.(token); } if (thinking) handlers.onThinking?.(thinking); if (chunk.done) finalData = chunk; } if (done) break; } if (!finalData) throw new AIError(AI_ERROR_CODES.STREAM_INTERRUPTED, 'Stream Ollama terminato senza evento finale.', { provider: this.name, retryable: true }); const result = this.normalizeResult(finalData, valid.requestId, model, content); terminal = true; handlers.onComplete?.(result); return result; } catch (error) { const normalized = normalizeAIError(error, this.name); if (normalized.code === AI_ERROR_CODES.REQUEST_CANCELLED) { if (!terminal) { terminal = true; handlers.onCancel?.(); } } else emitError(normalized); throw normalized; } }
  // L'AbortController appartiene ad AIRuntime; il provider riceve già il suo
  // signal e non duplica una seconda mappa di richieste.
  cancel() { return false; }
  async embed(input, options = {}) { const values = Array.isArray(input) ? input : [input]; if (!values.length || values.length > 128 || values.some((value) => !String(value).trim() || String(value).length > 12000)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Input embedding non valido.', { provider: this.name }); const model = options.model || this.embeddingModel; if (!model) throw new AIError(AI_ERROR_CODES.EMBEDDING_UNSUPPORTED, 'Nessun modello embedding configurato.', { provider: this.name }); const response = await this.request('/api/embed', { method: 'POST', body: { model, input: values.map(String), ...(options.dimensions ? { dimensions: options.dimensions } : {}) }, signal: options.signal, timeoutMs: Math.max(this.timeoutMs, 1000) }); const data = await response.json(); if (!Array.isArray(data?.embeddings) || data.embeddings.length !== values.length || data.embeddings.some((vector) => !Array.isArray(vector) || vector.some((number) => !Number.isFinite(number)))) throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Embedding Ollama non valido.', { provider: this.name }); return { provider: this.name, model: String(data.model || model), vectors: data.embeddings, dimensions: data.embeddings[0]?.length || 0, usage: { promptTokens: data.prompt_eval_count, totalDurationNs: data.total_duration, loadDurationNs: data.load_duration } }; }
  async shutdown() { this.initialized = false; this.lifecycleController.abort(); }
}

// Alcune release Qwen3 meno recenti ignorano `think:false` e riversano il
// ragionamento nel content fino a `</think>`. Il wrapper trattiene quei token
// soltanto in modalità rapida e conserva lo streaming della risposta finale.
const streamChatTransport = OllamaProvider.prototype.streamChat;
OllamaProvider.prototype.streamChat = async function normalizedStreamChat(request, handlers = {}) {
  const valid = validateChatRequest(request);
  const requestedModel = this.requireModel(valid.model);
  const model = await this.resolveRequestModel(requestedModel, valid);
  const routedRequest = model === requestedModel
    ? { ...request, reuseLoadedModel: false }
    : { ...request, model, reuseLoadedModel: false };
  const guarded = thinkingPreference(valid) === false && /^qwen3(?::|$)/i.test(model);
  if (!guarded) return streamChatTransport.call(this, routedRequest, handlers);

  let completedResult = null;
  let legacyThinking = false;
  let streamModeDecided = false;
  let emittedToken = false;
  let quarantine = '';
  const emitVisibleToken = (token) => {
    if (!token) return;
    emittedToken = true;
    handlers.onToken?.(token);
  };
  const raw = await streamChatTransport.call(this, routedRequest, {
    ...handlers,
    // Mantiene in quarantena solo un piccolo prefisso: abbastanza per filtrare
    // i vecchi stream Qwen senza tag iniziale, senza aspettare tutta la risposta.
    onToken: (token) => {
      if (streamModeDecided && !legacyThinking) {
        emitVisibleToken(token);
        return;
      }
      quarantine += token;
      const boundary = quarantine.lastIndexOf('</think>');
      if (boundary >= 0) {
        const answer = quarantine.slice(boundary + 8).trimStart();
        quarantine = '';
        legacyThinking = false;
        streamModeDecided = true;
        emitVisibleToken(answer);
        return;
      }
      if (/^\s*<think>/i.test(quarantine)) {
        legacyThinking = true;
        return;
      }
      if (quarantine.length >= 48 || /[.!?](?:\s|$)|[\r\n]/.test(quarantine)) {
        streamModeDecided = true;
        const answer = quarantine;
        quarantine = '';
        emitVisibleToken(answer);
      }
    },
    onComplete: (result) => { completedResult = result; }
  });
  const normalizationMode = thinkingPreference(valid) === false ? 'quick' : valid.mode;
  const content = normalizeQwenContent(raw.model || model, normalizationMode, raw.message.content, raw.finishReason);
  if (!content.trim()) {
    throw new AIError(AI_ERROR_CODES.PROVIDER_INVALID_RESPONSE, 'Il modello ha esaurito la risposta prima del testo finale.', { provider: this.name, retryable: true });
  }
  if (!emittedToken) emitVisibleToken(content);
  const normalized = {
    ...(completedResult || raw),
    message: { ...(completedResult || raw).message, content }
  };
  handlers.onComplete?.(normalized);
  return normalized;
};
module.exports = { OllamaProvider, inferModelCapabilities, normalizeCreateSpecification, normalizeQwenContent, quickMessages };

// #endregion
