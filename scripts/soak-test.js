/**
 * @module scripts/soak-test
 * @description Stress test deterministico di runtime, streaming e pulizia richieste.
 */
const fs = require('node:fs');
const path = require('node:path');
const { AIProviderRegistry } = require('../src/ai/ai-provider-registry');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { MockProvider } = require('../src/ai/providers/mock-provider');

// #region 01 — Cicli e report
(async () => {
  const cycles = Math.max(25, Math.min(2000, Number(process.argv.find((value) => value.startsWith('--cycles='))?.slice(9) || 250)));
  const registry = new AIProviderRegistry().register('mock', () => new MockProvider());
  const runtime = new AIRuntime({ registry }); await runtime.initialize({ provider: 'mock', chatModel: 'mock-chat' });
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  let streamedTokens = 0;
  for (let index = 0; index < cycles; index += 1) {
    await runtime.streamChat({ requestId: `soak-${index}`, mode: index % 5 ? 'quick' : 'deep', messages: [{ role: 'user', content: `turno ${index}` }] }, { onToken: () => { streamedTokens += 1; } });
    if (runtime.requests.size) throw new Error(`Richiesta orfana al ciclo ${index}.`);
  }
  await runtime.shutdown();
  if (global.gc) global.gc();
  const growthMb = Number(((process.memoryUsage().heapUsed - before) / 1024 / 1024).toFixed(2));
  const report = { evaluatedAt: new Date().toISOString(), cycles, streamedTokens, orphanRequests: runtime.requests.size, heapGrowthMb: growthMb, passed: runtime.requests.size === 0 && growthMb < 32 };
  const target = path.join(__dirname, '..', 'qa-artifacts', 'soak-test.json'); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Soak: ${cycles} cicli · richieste orfane 0 · crescita heap ${growthMb} MB\n`);
  if (!report.passed) process.exitCode = 2;
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
// #endregion
