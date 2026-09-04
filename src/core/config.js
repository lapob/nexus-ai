/**
 * @module core/config
 * @description Primitiva condivisa del dominio, priva di dipendenze grafiche.
 */
const { assertOllamaUrl } = require('./security');

// #region 01 — Default e primitive di normalizzazione

const DEFAULTS = Object.freeze({
  ai: Object.freeze({
    provider: 'ollama',
    ollama: Object.freeze({ baseUrl: 'http://127.0.0.1:11434', timeoutMs: 120000, allowLan: false }),
    service: Object.freeze({ baseUrl: '', fallbackUrls: Object.freeze([]), timeoutMs: 120000 }),
    allowLan: false,
    chatModel: null,
    fastModel: null,
    embeddingModel: null,
    autoSelectModel: true,
    actionApprovalMode: 'dangerous-only',
    temperature: 0.3,
    requestTimeoutMs: 120000,
    personalization: Object.freeze({
      userName: '',
      assistantName: 'NEXUSNXS',
      occupation: '',
      interests: '',
      responseStyle: 'natural',
      customInstructions: '',
      attentiveFollowUp: true
    })
  }),
  logging: Object.freeze({ level: 'info' }),
  retrieval: Object.freeze({ quickLimit: 6, deepInitialLimit: 5, deepQueryLimit: 5, deepMergedLimit: 8 }),
  research: Object.freeze({ enabled: true, provider: 'auto', searxngEndpoint: '', braveApiKey: '', openAiApiKey: '', openAiModel: '', openAiEndpoint: 'https://api.openai.com/v1/responses', timeoutMs: 6000, cacheTtlMs: 300000 }),
  conversation: Object.freeze({ historyLimit: 8, contentLimit: 12000 })
});
const LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug']);
function finiteNumber(value, fallback, { min, max, name }) { if (value === undefined || value === null || value === '') return fallback; const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} deve essere un numero tra ${min} e ${max}.`); return number; }
function personalText(value, fallback = '', max = 1000) {
  const text = String(value === undefined || value === null ? fallback : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}
function modelName(value, fallback = null) { const name = value === undefined ? fallback : value; if (name === null || name === '') return null; const text = String(name).trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(text)) throw new Error('Nome modello locale non valido.'); return text; }

// #endregion

// #region 02 — Validazione, merge e configurazione runtime

function validateSettings(input = {}, fallback = DEFAULTS.ai) {
  const source = input.ai || input; const ollamaInput = source.ollama || source; const fallbackOllama = fallback.ollama || fallback;
  const provider = String(source.provider || fallback.provider || 'ollama').toLowerCase(); if (!['ollama', 'nexus-service'].includes(provider)) throw new Error('Provider AI non consentito.');
  const allowLan = source.allowLan === undefined
    ? (ollamaInput.allowLan === undefined ? fallback.allowLan === true || fallbackOllama.allowLan === true : ollamaInput.allowLan === true)
    : source.allowLan === true;
  const baseUrl = assertOllamaUrl(String(ollamaInput.baseUrl || fallbackOllama.baseUrl), { allowLan });
  const timeoutMs = finiteNumber(ollamaInput.timeoutMs, fallbackOllama.timeoutMs || 120000, { min: 250, max: 300000, name: 'Il timeout Ollama' });
  const serviceInput = source.service || {};
  const fallbackService = fallback.service || DEFAULTS.ai.service;
  const serviceBaseUrl = String(serviceInput.baseUrl ?? fallbackService.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (serviceBaseUrl) {
    const serviceUrl = new URL(serviceBaseUrl);
    if (serviceUrl.protocol !== 'https:' || serviceUrl.username || serviceUrl.password || serviceUrl.hash || serviceUrl.pathname !== '/') throw new Error('Il servizio NexusNXS deve usare un’origine HTTPS sicura.');
  }
  const serviceTimeoutMs = finiteNumber(serviceInput.timeoutMs, fallbackService.timeoutMs || 120000, { min: 1000, max: 300000, name: 'Il timeout del servizio NexusNXS' });
  const serviceFallbackUrls = (Array.isArray(serviceInput.fallbackUrls) ? serviceInput.fallbackUrls : fallbackService.fallbackUrls || []).slice(0, 3).map((value) => {
    const candidate = String(value || '').trim().replace(/\/+$/, '');
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname !== '/') throw new Error('Ogni fallback NexusNXS deve usare un’origine HTTPS sicura.');
    return url.origin;
  }).filter((value, index, list) => value !== serviceBaseUrl && list.indexOf(value) === index);
  const requestedChatModel = modelName(source.chatModel !== undefined ? source.chatModel : source.model, fallback.chatModel ?? fallback.model ?? null);
  // Migrazione dell'artefatto Qwen Thinking-only precedentemente proposto
  // come modello generale: Prime è più accurato nei benchmark e non espone
  // il ragionamento interno in inglese.
  const chatModel = requestedChatModel === 'qwen3:30b' ? 'qwen3:14b' : requestedChatModel;
  const fastModel = modelName(source.fastModel, fallback.fastModel || null);
  const embeddingModel = modelName(source.embeddingModel, fallback.embeddingModel || null);
  const autoSelectModel = source.autoSelectModel === undefined ? fallback.autoSelectModel !== false : source.autoSelectModel !== false;
  const actionApprovalMode = ['always', 'dangerous-only', 'full-access'].includes(source.actionApprovalMode)
    ? source.actionApprovalMode
    : fallback.actionApprovalMode || 'dangerous-only';
  const temperature = finiteNumber(source.temperature, fallback.temperature ?? 0.3, { min: 0, max: 1, name: 'La temperatura' });
  const personalInput = source.personalization || {};
  const personalFallback = fallback.personalization || DEFAULTS.ai.personalization;
  const responseStyle = ['concise', 'natural', 'detailed'].includes(personalInput.responseStyle)
    ? personalInput.responseStyle
    : personalFallback.responseStyle || 'natural';
  const personalization = {
    userName: personalText(personalInput.userName, personalFallback.userName, 80),
    assistantName: personalText(personalInput.assistantName, personalFallback.assistantName || 'NEXUSNXS', 80) || 'NEXUSNXS',
    occupation: personalText(personalInput.occupation, personalFallback.occupation, 160),
    interests: personalText(personalInput.interests, personalFallback.interests, 500),
    responseStyle,
    customInstructions: personalText(personalInput.customInstructions, personalFallback.customInstructions, 2000),
    attentiveFollowUp: personalInput.attentiveFollowUp === undefined
      ? personalFallback.attentiveFollowUp !== false
      : personalInput.attentiveFollowUp !== false
  };
  const ai = { provider, ollama: { baseUrl, timeoutMs, allowLan }, service: { baseUrl: serviceBaseUrl, fallbackUrls: serviceFallbackUrls, timeoutMs: serviceTimeoutMs }, allowLan, chatModel, fastModel, embeddingModel, autoSelectModel, actionApprovalMode, temperature, requestTimeoutMs: fallback.requestTimeoutMs || 120000, personalization };
  return { ai, provider, baseUrl, allowLan, model: chatModel || '', chatModel, fastModel, embeddingModel, autoSelectModel, actionApprovalMode, timeoutMs, temperature, personalization };
}
function mergeSettings(current = {}, patch = {}) {
  const currentSource = current.ai || current;
  const patchSource = patch.ai || patch;
  return validateSettings({
    ...currentSource,
    ...patchSource,
    ollama: {
      ...(currentSource.ollama || {}),
      ...(patchSource.ollama || {})
    },
    service: {
      ...(currentSource.service || {}),
      ...(patchSource.service || {})
    },
    personalization: {
      ...(currentSource.personalization || {}),
      ...(patchSource.personalization || {})
    }
  }, currentSource);
}
function loadRuntimeConfig(env = process.env) {
  const level = String(env.NEXUS_LOG_LEVEL || DEFAULTS.logging.level).toLowerCase(); if (!LOG_LEVELS.has(level)) throw new Error('NEXUS_LOG_LEVEL deve essere error, warn, info o debug.');
  const settings = validateSettings({ provider: env.NEXUS_AI_PROVIDER, baseUrl: env.NEXUS_OLLAMA_BASE_URL || env.NEXUS_LLM_BASE_URL, allowLan: env.NEXUS_OLLAMA_ALLOW_LAN === '1', timeoutMs: env.NEXUS_OLLAMA_TIMEOUT_MS, service: { baseUrl: env.NEXUS_SERVICE_URL || '', fallbackUrls: String(env.NEXUS_SERVICE_FALLBACK_URLS || '').split(',').map((value) => value.trim()).filter(Boolean), timeoutMs: env.NEXUS_SERVICE_TIMEOUT_MS }, chatModel: env.NEXUS_AI_CHAT_MODEL || env.NEXUS_LLM_MODEL, fastModel: env.NEXUS_AI_FAST_MODEL, embeddingModel: env.NEXUS_AI_EMBEDDING_MODEL, autoSelectModel: env.NEXUS_AI_AUTO_SELECT !== '0', temperature: env.NEXUS_LLM_TEMPERATURE }, DEFAULTS.ai);
  const researchProvider = String(env.NEXUS_WEB_SEARCH_PROVIDER || DEFAULTS.research.provider).toLowerCase();
  if (!['auto', 'searxng', 'brave', 'openai', 'wikipedia'].includes(researchProvider)) throw new Error('NEXUS_WEB_SEARCH_PROVIDER deve essere auto, searxng, brave, openai o wikipedia.');
  const research = Object.freeze({
    enabled: env.NEXUS_WEB_SEARCH_MODE !== 'off',
    provider: researchProvider,
    searxngEndpoint: String(env.NEXUS_SEARXNG_URL || ''),
    braveApiKey: String(env.NEXUS_BRAVE_SEARCH_API_KEY || ''),
    openAiApiKey: String(env.NEXUS_OPENAI_API_KEY || env.OPENAI_API_KEY || ''),
    openAiModel: String(env.NEXUS_OPENAI_SEARCH_MODEL || ''),
    openAiEndpoint: String(env.NEXUS_OPENAI_RESPONSES_URL || DEFAULTS.research.openAiEndpoint),
    timeoutMs: finiteNumber(env.NEXUS_WEB_SEARCH_TIMEOUT_MS, DEFAULTS.research.timeoutMs, { min: 800, max: 15000, name: 'Il timeout della ricerca web' }),
    cacheTtlMs: DEFAULTS.research.cacheTtlMs
  });
  return Object.freeze({ ai: Object.freeze(settings.ai), llm: Object.freeze(settings), logging: Object.freeze({ level }), retrieval: DEFAULTS.retrieval, research, conversation: DEFAULTS.conversation });
}

// #endregion

module.exports = { DEFAULTS, loadRuntimeConfig, mergeSettings, validateSettings };
