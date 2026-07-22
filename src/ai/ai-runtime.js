const { AIError, AI_ERROR_CODES, normalizeAIError } = require('./ai-errors');
const { validateChatRequest } = require('./ai-provider');

class AIRuntime {
  constructor({ registry, logger = null } = {}) { this.registry = registry; this.logger = logger; this.provider = null; this.providerName = null; this.requests = new Map(); }
  async initialize(config) { if (this.provider) await this.shutdown(); this.providerName = config.provider; this.provider = this.registry.create(config.provider, config); await this.provider.initialize(config); return { provider: this.providerName, capabilities: this.provider.getCapabilities() }; }
  requireProvider() { if (!this.provider) throw new AIError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'Runtime AI non inizializzato.', { retryable: true }); return this.provider; }
  async health() { try { return await this.requireProvider().health(); } catch (error) { const normalized = normalizeAIError(error, this.providerName); return { ok: false, status: normalized.code === AI_ERROR_CODES.CONFIGURATION_INVALID ? 'error' : 'offline', provider: this.providerName || 'unknown', error: normalized.toPublic() }; } }
  listModels() { return this.requireProvider().listModels(); }
  getCurrentModel() { return this.requireProvider().getCurrentModel(); }
  setModel(model) { return this.requireProvider().setModel(model); }
  getCapabilities() { return this.requireProvider().getCapabilities(); }
  begin(requestId, externalSignal) { if (this.requests.has(requestId)) throw new AIError(AI_ERROR_CODES.CONFIGURATION_INVALID, 'requestId AI già attivo.', { provider: this.providerName }); if (this.requests.size >= 32) throw new AIError(AI_ERROR_CODES.RATE_LIMITED, 'Troppe richieste AI attive.', { provider: this.providerName, retryable: true }); const controller = new AbortController(); if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort(), { once: true }); this.requests.set(requestId, controller); return controller; }
  async chat(request) { const valid = validateChatRequest(request); const controller = this.begin(valid.requestId, valid.signal); try { return await this.requireProvider().chat({ ...valid, signal: controller.signal }); } catch (error) { throw normalizeAIError(error, this.providerName); } finally { this.requests.delete(valid.requestId); } }
  async streamChat(request, handlers) { const valid = validateChatRequest(request); const controller = this.begin(valid.requestId, valid.signal); try { return await this.requireProvider().streamChat({ ...valid, signal: controller.signal }, handlers); } catch (error) { throw normalizeAIError(error, this.providerName); } finally { this.requests.delete(valid.requestId); } }
  async embed(input, options) { try { return await this.requireProvider().embed(input, options); } catch (error) { throw normalizeAIError(error, this.providerName); } }
  cancel(requestId) { const controller = this.requests.get(requestId); if (!controller) return false; controller.abort(); this.requests.delete(requestId); this.provider?.cancel(requestId); return true; }
  async shutdown() { for (const controller of this.requests.values()) controller.abort(); this.requests.clear(); if (this.provider) await this.provider.shutdown(); this.provider = null; this.providerName = null; }
}
module.exports = { AIRuntime };
