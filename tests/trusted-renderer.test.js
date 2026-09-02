const test = require('node:test');
const assert = require('node:assert/strict');
const { alignRuntimeEndpoint, directApplicationPlan, isTrustedRendererUrl, normalizeLocalFileUrl } = require('../src/application/register-ipc');

test('riconosce applicazioni comuni senza attendere il planner AI', () => {
  const capabilities = {
    applications: [
      { id: 'calculator', label: 'Calcolatrice' },
      { id: 'brave', label: 'Brave' },
      { id: 'paint', label: 'Paint' }
    ]
  };
  assert.deepEqual(directApplicationPlan('puoi aprire la calcolatrice', capabilities), {
    summary: 'Aprire Calcolatrice',
    reason: 'Hai chiesto a NEXUSNXS di avviare questa applicazione locale.',
    tool: 'open_application',
    arguments: { application: 'calculator' }
  });
  assert.equal(directApplicationPlan('come funziona una calcolatrice?', capabilities), null);
  assert.deepEqual(directApplicationPlan('Apri Brave!', capabilities), {
    summary: 'Aprire Brave',
    reason: 'Hai chiesto a NEXUSNXS di avviare questa applicazione locale.',
    tool: 'open_application',
    arguments: { application: 'brave' }
  });
  assert.deepEqual(directApplicationPlan('apri breiva', capabilities)?.arguments, { application: 'brave' });
  assert.deepEqual(directApplicationPlan('avvia breva', capabilities)?.arguments, { application: 'brave' });
});

const encoded = 'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer/index.html';

test('normalizza rappresentazioni Chromium e Node dello stesso renderer Windows', () => {
  assert.equal(isTrustedRendererUrl('file:///D:/[AI]/NexusNXS/.AI/src/renderer/index.html', encoded), true);
  assert.equal(isTrustedRendererUrl('file:///d:/%5bai%5d/NexusNXS/.AI/src/renderer/index.html', encoded), true);
  assert.equal(isTrustedRendererUrl('file:///D:\\[AI]\\NexusNXS\\.AI\\src\\renderer\\index.html', encoded), true);
  assert.equal(normalizeLocalFileUrl('file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer/../renderer/index.html'), normalizeLocalFileUrl(encoded));
});

test('autorizza il file esatto e rifiuta file, prefissi e schemi differenti', () => {
  const rejected = [
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer/app.js',
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer/index.html.evil',
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer-evil/index.html',
    'https://example.test/index.html', 'http://127.0.0.1/index.html',
    'not a url', '', undefined,
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer/%2e%2e/index.html',
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer%2Findex.html',
    'file:///D:/%5BAI%5D/NexusNXS/.AI/src/renderer%5Cindex.html'
  ];
  for (const candidate of rejected) assert.equal(isTrustedRendererUrl(candidate, encoded), false, String(candidate));
});

test('fallisce in modo chiuso anche con un URL trusted non valido', () => {
  assert.equal(isTrustedRendererUrl(encoded, 'https://example.test/index.html'), false);
  assert.equal(isTrustedRendererUrl(encoded, ''), false);
});

test('il runtime privato prevale sulle impostazioni persistite obsolete', () => {
  const runtimeConfig = {
    ai: {
      provider: 'ollama',
      ollama: { baseUrl: 'http://127.0.0.1:11435', timeoutMs: 120000, allowLan: false },
      allowLan: false,
      chatModel: null,
      fastModel: null,
      embeddingModel: null,
      autoSelectModel: true,
      temperature: 0.3
    }
  };
  const stale = {
    ...runtimeConfig.ai,
    ollama: { ...runtimeConfig.ai.ollama, baseUrl: 'http://127.0.0.1:11434' },
    chatModel: 'llama3.2:3b'
  };
  assert.equal(alignRuntimeEndpoint(stale, runtimeConfig, true).baseUrl, 'http://127.0.0.1:11435');
  assert.equal(alignRuntimeEndpoint(stale, runtimeConfig, true).chatModel, 'llama3.2:3b');
  assert.equal(alignRuntimeEndpoint(stale, runtimeConfig, false).ollama.baseUrl, 'http://127.0.0.1:11434');
});

test('autorizza soltanto la entry del protocollo interno NEXUSNXS', () => {
  const trusted = 'nexus://app/index.html';
  assert.equal(isTrustedRendererUrl(trusted, trusted), true);
  assert.equal(isTrustedRendererUrl('nexus://app/index.html?surface=companion', trusted), false);
  assert.equal(isTrustedRendererUrl('nexus://app/app.js', trusted), false);
  assert.equal(isTrustedRendererUrl('nexus://evil/index.html', trusted), false);
  assert.equal(isTrustedRendererUrl('nexus://app/index.html?debug=1', trusted), false);
});
