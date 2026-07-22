const { assertLocalUrl } = require('../security');

const DEFAULTS = Object.freeze({
  ai: Object.freeze({ provider: 'ollama', ollama: Object.freeze({ baseUrl: 'http://127.0.0.1:11434', timeoutMs: 120000 }), chatModel: null, embeddingModel: null, temperature: 0.3, requestTimeoutMs: 120000 }),
  logging: Object.freeze({ level: 'info' }), retrieval: Object.freeze({ quickLimit: 6, deepInitialLimit: 5, deepQueryLimit: 5, deepMergedLimit: 8 }), conversation: Object.freeze({ historyLimit: 8, contentLimit: 12000 })
});
const LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug']);
function finiteNumber(value, fallback, { min, max, name }) { if (value === undefined || value === null || value === '') return fallback; const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} deve essere un numero tra ${min} e ${max}.`); return number; }
function modelName(value, fallback = null) { const name = value === undefined ? fallback : value; if (name === null || name === '') return null; const text = String(name).trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(text)) throw new Error('Nome modello locale non valido.'); return text; }
function validateSettings(input = {}, fallback = DEFAULTS.ai) {
  const source = input.ai || input; const ollamaInput = source.ollama || source; const fallbackOllama = fallback.ollama || fallback;
  const provider = String(source.provider || fallback.provider || 'ollama').toLowerCase(); if (provider !== 'ollama') throw new Error('Il solo provider consentito in produzione è ollama.');
  const baseUrl = assertLocalUrl(String(ollamaInput.baseUrl || fallbackOllama.baseUrl));
  const timeoutMs = finiteNumber(ollamaInput.timeoutMs, fallbackOllama.timeoutMs || 120000, { min: 250, max: 300000, name: 'Il timeout Ollama' });
  const chatModel = modelName(source.chatModel !== undefined ? source.chatModel : source.model, fallback.chatModel ?? fallback.model ?? null);
  const embeddingModel = modelName(source.embeddingModel, fallback.embeddingModel || null);
  const temperature = finiteNumber(source.temperature, fallback.temperature ?? 0.3, { min: 0, max: 1, name: 'La temperatura' });
  const ai = { provider, ollama: { baseUrl, timeoutMs }, chatModel, embeddingModel, temperature, requestTimeoutMs: fallback.requestTimeoutMs || 120000 };
  return { ai, provider, baseUrl, model: chatModel || '', chatModel, embeddingModel, timeoutMs, temperature };
}
function loadRuntimeConfig(env = process.env) {
  const level = String(env.NEXUS_LOG_LEVEL || DEFAULTS.logging.level).toLowerCase(); if (!LOG_LEVELS.has(level)) throw new Error('NEXUS_LOG_LEVEL deve essere error, warn, info o debug.');
  const settings = validateSettings({ provider: env.NEXUS_AI_PROVIDER, baseUrl: env.NEXUS_OLLAMA_BASE_URL || env.NEXUS_LLM_BASE_URL, timeoutMs: env.NEXUS_OLLAMA_TIMEOUT_MS, chatModel: env.NEXUS_AI_CHAT_MODEL || env.NEXUS_LLM_MODEL, embeddingModel: env.NEXUS_AI_EMBEDDING_MODEL, temperature: env.NEXUS_LLM_TEMPERATURE }, DEFAULTS.ai);
  return Object.freeze({ ai: Object.freeze(settings.ai), llm: Object.freeze(settings), logging: Object.freeze({ level }), retrieval: DEFAULTS.retrieval, conversation: DEFAULTS.conversation });
}
module.exports = { DEFAULTS, loadRuntimeConfig, validateSettings };
