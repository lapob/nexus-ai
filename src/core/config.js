const { assertLocalUrl } = require('../security');

const DEFAULTS = Object.freeze({
  llm: Object.freeze({
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    temperature: 0.3,
    requestTimeoutMs: 120000,
    modelDiscoveryTimeoutMs: 5000
  }),
  logging: Object.freeze({ level: 'info' }),
  retrieval: Object.freeze({ quickLimit: 6, deepInitialLimit: 5, deepQueryLimit: 5, deepMergedLimit: 8 }),
  conversation: Object.freeze({ historyLimit: 8, contentLimit: 12000 })
});

const LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug']);

function finiteNumber(value, fallback, { min, max, name }) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} deve essere un numero tra ${min} e ${max}.`);
  }
  return number;
}

function validateSettings(input = {}, fallback = DEFAULTS.llm) {
  const baseUrl = assertLocalUrl(String(input.baseUrl || fallback.baseUrl));
  const model = String(input.model || fallback.model).trim();
  if (!model) throw new Error('Inserisci il nome del modello locale.');
  const temperature = finiteNumber(input.temperature, fallback.temperature, {
    min: 0, max: 1, name: 'La temperatura'
  });
  return { baseUrl, model, temperature };
}

function loadRuntimeConfig(env = process.env) {
  const level = String(env.NEXUS_LOG_LEVEL || DEFAULTS.logging.level).toLowerCase();
  if (!LOG_LEVELS.has(level)) throw new Error('NEXUS_LOG_LEVEL deve essere error, warn, info o debug.');
  return Object.freeze({
    llm: Object.freeze(validateSettings({
      baseUrl: env.NEXUS_LLM_BASE_URL,
      model: env.NEXUS_LLM_MODEL,
      temperature: env.NEXUS_LLM_TEMPERATURE
    })),
    logging: Object.freeze({ level }),
    retrieval: DEFAULTS.retrieval,
    conversation: DEFAULTS.conversation
  });
}

module.exports = { DEFAULTS, loadRuntimeConfig, validateSettings };

