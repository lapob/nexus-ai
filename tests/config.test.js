const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeConfig, validateSettings } = require('../src/core/config');

test('carica default locali e valida la temperatura', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.ai.ollama.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.ai.chatModel, null);
  assert.equal(config.llm.temperature, 0.3);
  assert.throws(() => validateSettings({ baseUrl: config.ai.ollama.baseUrl, model: 'x', temperature: 2 }), /tra 0 e 1/);
});

test('rifiuta configurazione remota e log level sconosciuto', () => {
  assert.throws(() => loadRuntimeConfig({ NEXUS_LLM_BASE_URL: 'https://example.com/v1' }), /endpoint locali/);
  assert.throws(() => loadRuntimeConfig({ NEXUS_LOG_LEVEL: 'trace' }), /error, warn, info o debug/);
});

test('valida settings AI annidate, timeout e nomi modello', () => { const settings = validateSettings({ ai: { provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434', timeoutMs: 2500 }, chatModel: 'qwen3:8b', embeddingModel: 'nomic-embed-text' } }); assert.equal(settings.chatModel, 'qwen3:8b'); assert.equal(settings.embeddingModel, 'nomic-embed-text'); assert.throws(() => validateSettings({ baseUrl: 'http://localhost:11434', timeoutMs: 10 }), /timeout/i); assert.throws(() => validateSettings({ baseUrl: 'http://localhost:11434', model: '../bad model' }), /modello/i); });
