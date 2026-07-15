const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeConfig, validateSettings } = require('../src/core/config');

test('carica default locali e valida la temperatura', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.llm.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(config.llm.temperature, 0.3);
  assert.throws(() => validateSettings({ baseUrl: config.llm.baseUrl, model: 'x', temperature: 2 }), /tra 0 e 1/);
});

test('rifiuta configurazione remota e log level sconosciuto', () => {
  assert.throws(() => loadRuntimeConfig({ NEXUS_LLM_BASE_URL: 'https://example.com/v1' }), /endpoint locali/);
  assert.throws(() => loadRuntimeConfig({ NEXUS_LOG_LEVEL: 'trace' }), /error, warn, info o debug/);
});

