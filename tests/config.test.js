const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeConfig, mergeSettings, validateSettings } = require('../src/core/config');

test('carica default locali e valida la temperatura', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.ai.ollama.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.ai.allowLan, false);
  assert.equal(config.ai.chatModel, null);
  assert.equal(config.llm.temperature, 0.3);
  assert.equal(config.research.enabled, true);
  assert.equal(config.research.provider, 'auto');
  assert.throws(() => validateSettings({ baseUrl: config.ai.ollama.baseUrl, model: 'x', temperature: 2 }), /tra 0 e 1/);
});

test('rifiuta configurazione remota e log level sconosciuto', () => {
  assert.throws(() => loadRuntimeConfig({ NEXUS_LLM_BASE_URL: 'https://example.com/v1' }), /endpoint locali/);
  assert.throws(() => loadRuntimeConfig({ NEXUS_LOG_LEVEL: 'trace' }), /error, warn, info o debug/);
});

test('valida settings AI annidate, timeout e nomi modello', () => { const settings = validateSettings({ ai: { provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434', timeoutMs: 2500 }, chatModel: 'qwen3:14b', fastModel: 'qwen3:8b', embeddingModel: 'nomic-embed-text' } }); assert.equal(settings.chatModel, 'qwen3:14b'); assert.equal(settings.fastModel, 'qwen3:8b'); assert.equal(settings.embeddingModel, 'nomic-embed-text'); assert.throws(() => validateSettings({ baseUrl: 'http://localhost:11434', timeoutMs: 10 }), /timeout/i); assert.throws(() => validateSettings({ baseUrl: 'http://localhost:11434', model: '../bad model' }), /modello/i); });

test('valida endpoint pubblici primario e di riserva senza duplicati', () => {
  const settings = validateSettings({ provider: 'nexus-service', service: { baseUrl: 'https://ai.example.com', fallbackUrls: ['https://backup.example.com/', 'https://backup.example.com'] } });
  assert.equal(settings.ai.service.baseUrl, 'https://ai.example.com');
  assert.deepEqual(settings.ai.service.fallbackUrls, ['https://backup.example.com']);
  assert.throws(() => validateSettings({ provider: 'nexus-service', service: { baseUrl: 'https://ai.example.com', fallbackUrls: ['http://backup.example.com'] } }), /HTTPS/i);
});

test('valida il provider e il budget della ricerca server-side', () => {
  const config = loadRuntimeConfig({ NEXUS_WEB_SEARCH_PROVIDER: 'wikipedia', NEXUS_WEB_SEARCH_TIMEOUT_MS: '2500' });
  assert.equal(config.research.provider, 'wikipedia');
  assert.equal(config.research.timeoutMs, 2500);
  const openai = loadRuntimeConfig({ NEXUS_WEB_SEARCH_PROVIDER: 'openai', NEXUS_OPENAI_API_KEY: 'secret', NEXUS_OPENAI_SEARCH_MODEL: 'search-model' });
  assert.equal(openai.research.openAiApiKey, 'secret');
  assert.equal(openai.research.openAiModel, 'search-model');
  assert.equal(loadRuntimeConfig({ NEXUS_WEB_SEARCH_MODE: 'off' }).research.enabled, false);
  assert.throws(() => loadRuntimeConfig({ NEXUS_WEB_SEARCH_PROVIDER: 'custom' }), /auto, brave, openai o wikipedia/);
});

test('migra il modello Thinking-only al modello generalista verificato', () => {
  const settings = validateSettings({ chatModel: 'qwen3:30b', fastModel: 'qwen3:8b' });
  assert.equal(settings.chatModel, 'qwen3:14b');
  assert.equal(settings.fastModel, 'qwen3:8b');
});

test('migra /v1 e richiede opt-in per Ollama su LAN privata', () => {
  assert.equal(validateSettings({ baseUrl: 'http://127.0.0.1:11434/v1' }).baseUrl, 'http://127.0.0.1:11434');
  const lan = validateSettings({ baseUrl: 'http://192.168.1.80:11434', allowLan: true });
  assert.equal(lan.allowLan, true);
  assert.equal(lan.ai.ollama.allowLan, true);
  assert.throws(() => validateSettings({ baseUrl: 'http://192.168.1.80:11434' }), /abilita esplicitamente la LAN/);
});

test('valida e limita il profilo personale dell’assistente', () => {
  const settings = validateSettings({
    personalization: {
      userName: '  Norah  ',
      assistantName: 'Astra',
      occupation: 'Sviluppatrice',
      interests: 'AI locale, grafica e automazione',
      responseStyle: 'detailed',
      customInstructions: 'Chiamami per nome e spiega i passaggi importanti.'
    }
  });
  assert.equal(settings.personalization.userName, 'Norah');
  assert.equal(settings.personalization.assistantName, 'Astra');
  assert.equal(settings.personalization.responseStyle, 'detailed');
  assert.equal(settings.ai.personalization.customInstructions, 'Chiamami per nome e spiega i passaggi importanti.');
});

test('un aggiornamento parziale conserva permessi e preferenze già salvati', () => {
  const current = validateSettings({
    actionApprovalMode: 'full-access',
    chatModel: 'qwen3:14b',
    fastModel: 'qwen3:8b',
    personalization: { userName: 'Norah', responseStyle: 'detailed' }
  });
  const updated = mergeSettings(current, { temperature: 0.45 });
  assert.equal(updated.actionApprovalMode, 'full-access');
  assert.equal(updated.chatModel, 'qwen3:14b');
  assert.equal(updated.fastModel, 'qwen3:8b');
  assert.equal(updated.personalization.userName, 'Norah');
  assert.equal(updated.personalization.responseStyle, 'detailed');
  assert.equal(updated.temperature, 0.45);
});
