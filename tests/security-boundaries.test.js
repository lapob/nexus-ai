const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizedRuntimeEnvironment } = require('../src/ai/managed-ollama-runtime');
const { publicSettings } = require('../src/application/register-ipc');
const { sanitizeLogValue } = require('../src/services/logger');
const { CONTENT_SECURITY_POLICY } = require('../src/infrastructure/electron/renderer-protocol');
const { shouldBlockRendererRequest } = require('../src/infrastructure/electron/app-lifecycle');
const packageJson = require('../package.json');

test('il runtime AI non eredita token o credenziali del processo padre', () => {
  const environment = sanitizedRuntimeEnvironment({
    PATH: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    OPENAI_API_KEY: 'secret-value',
    GITHUB_TOKEN: 'token-value',
    DATABASE_PASSWORD: 'password-value'
  });
  assert.equal(environment.PATH, 'C:\\Windows');
  assert.equal(environment.TEMP, 'C:\\Temp');
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.DATABASE_PASSWORD, undefined);
});

test('il renderer non riceve endpoint o configurazione interna del provider', () => {
  const settings = publicSettings({
    ai: {
      provider: 'ollama',
      ollama: { baseUrl: 'http://127.0.0.1:11435', timeoutMs: 120000 },
      chatModel: 'local:chat',
      fastModel: 'local:fast',
      embeddingModel: 'local:embed',
      autoSelectModel: true,
      actionApprovalMode: 'dangerous-only',
      temperature: 0.3,
      personalization: {}
    }
  });
  assert.equal(settings.chatModel, 'local:chat');
  assert.equal(settings.baseUrl, undefined);
  assert.equal(settings.provider, undefined);
  assert.equal(settings.ollama, undefined);
  assert.equal(settings.ai, undefined);
});

test('i log oscurano segreti anche dentro oggetti annidati', () => {
  const sanitized = sanitizeLogValue({
    authorization: 'Bearer abcdefghijklmnop',
    nested: { apiKey: 'sk-abcdefghijklmnop', safe: 'ok' }
  });
  assert.equal(sanitized.authorization, '[REDACTED]');
  assert.equal(sanitized.nested.apiKey, '[REDACTED]');
  assert.equal(sanitized.nested.safe, 'ok');
});

test('la sessione blocca tutti i protocolli di rete e la CSP vieta connessioni', () => {
  for (const url of [
    'https://example.test', 'http://127.0.0.1:11435',
    'ws://127.0.0.1:11435', 'wss://example.test', 'ftp://example.test'
  ]) assert.equal(shouldBlockRendererRequest(url), true, url);
  assert.equal(shouldBlockRendererRequest('nexus://app/index.html'), false);
  assert.equal(shouldBlockRendererRequest('blob:nexus://app/id'), false);
  for (const url of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'nexus://other/index.html', 'blob:https://example.test/id', 'about:blank']) {
    assert.equal(shouldBlockRendererRequest(url), true, url);
  }
  assert.match(CONTENT_SECURITY_POLICY, /connect-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /font-src 'self' data:/);
});

test('il pacchetto desktop usa una allowlist per la configurazione pubblica', () => {
  const files = packageJson.build.files.map((value) => String(value).replaceAll('\\', '/'));
  assert.equal(files.some((value) => /^config\/(?:\*|\*\*)/.test(value)), false);
  assert.equal(files.includes('config/public-client.release.json'), true);
  assert.equal(files.includes('config/nexus-interaction-states.json'), true);
  assert.equal(files.includes('config/access-profiles.json'), true);
  assert.equal(files.includes('config/product-slo.json'), true);
  for (const forbidden of [
    'config/android-endpoints.local.properties',
    'config/private-knowledge-benchmark.json',
    'config/portable.local.json'
  ]) assert.equal(files.includes(forbidden), false, forbidden);
  const resources = packageJson.build.extraResources.map((entry) => String(entry.from || entry));
  assert.equal(resources.some((value) => /ollama|\.gguf|safetensors/i.test(value)), false);
});
