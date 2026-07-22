const { AIError, AI_ERROR_CODES } = require('../ai-errors');
const { validateChatRequest } = require('../ai-provider');
class MockProvider {
  constructor(config = {}) { this.name = 'mock'; this.model = config.chatModel || 'mock-chat'; this.failure = config.failure || null; this.cancelled = new Set(); this.models = [{ id: 'mock-chat', name: 'Mock Chat', provider: 'mock', size: 1, capabilities: { chat: true, streaming: true, embeddings: true, tools: false, vision: false, thinking: false } }]; }
  async initialize() { return this; } async health() { return { ok: true, status: 'ready', provider: 'mock', latencyMs: 0 }; } async listModels() { return this.models; } getCurrentModel() { return this.model; }
  async setModel(name) { const model = this.models.find((item) => item.id === name); if (!model) throw new AIError(AI_ERROR_CODES.MODEL_NOT_FOUND, 'Mock model not found.', { provider: 'mock' }); this.model = name; return model; }
  getCapabilities() { return this.models[0].capabilities; } fail() { if (this.failure) throw new AIError(this.failure, 'Mock failure.', { provider: 'mock' }); }
  async chat(request) { this.fail(); const valid = validateChatRequest(request); const content = `mock:${valid.messages.at(-1).content}`; return { requestId: valid.requestId, provider: 'mock', model: this.model, message: { role: 'assistant', content }, finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; }
  async streamChat(request, handlers = {}) { this.fail(); const result = await this.chat(request); handlers.onStart?.({ requestId: request.requestId, provider: 'mock', model: this.model }); for (const token of ['mock:', request.messages.at(-1).content]) { if (request.signal?.aborted || this.cancelled.has(request.requestId)) { handlers.onCancel?.(); throw new AIError(AI_ERROR_CODES.REQUEST_CANCELLED, 'Mock cancelled.', { provider: 'mock' }); } handlers.onToken?.(token); await Promise.resolve(); } handlers.onComplete?.(result); return result; }
  cancel(requestId) { this.cancelled.add(requestId); return true; }
  async embed(input, options = {}) { const values = Array.isArray(input) ? input : [input]; const vectors = values.map((value) => { const text = String(value); return [text.length, [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 997, 1]; }); return { provider: 'mock', model: options.model || 'mock-embed', vectors, dimensions: 3, usage: {} }; }
  async shutdown() { this.cancelled.clear(); }
}
module.exports = { MockProvider };
