const { AIError, AI_ERROR_CODES } = require('./ai-errors');
const { assertAIProvider } = require('./ai-provider');

class AIProviderRegistry {
  constructor() { this.factories = new Map(); }
  register(name, factory) { const key = String(name || '').trim().toLowerCase(); if (!key || typeof factory !== 'function') throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'Registrazione provider AI non valida.'); if (this.factories.has(key)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, `Provider AI già registrato: ${key}.`); this.factories.set(key, factory); return this; }
  has(name) { return this.factories.has(String(name).toLowerCase()); }
  create(name, config) { const key = String(name).toLowerCase(); const factory = this.factories.get(key); if (!factory) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, `Provider AI sconosciuto: ${key}.`, { provider: key }); return assertAIProvider(factory(config)); }
  listProviders() { return [...this.factories.keys()]; }
}
module.exports = { AIProviderRegistry };
