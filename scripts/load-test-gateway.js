/**
 * @module scripts/load-test-gateway
 * @description Prova HTTP locale di concorrenza, accodamento e pulizia sessioni guest.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');

// #region Scenario locale isolato

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function run() {
  const clients = Math.max(5, Math.min(28, Number(process.argv.find((value) => value.startsWith('--clients='))?.slice(10) || 20)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-gateway-load-'));
  let active = 0; let peak = 0; let observedQueue = 0;
  const gateway = new RemoteSessionGateway({
    statePath: path.join(root, 'remote-access.json'),
    conversationStore: { list: () => [], save: (value) => value },
    logger: { info() {}, warn() {} },
    onMessage: async ({ conversation, text }) => {
      active += 1; peak = Math.max(peak, active);
      observedQueue = Math.max(observedQueue, gateway.guestCapacity().queued);
      await new Promise((resolve) => setTimeout(resolve, 35));
      active -= 1;
      return { ...conversation, updatedAt: Date.now(), turns: [...conversation.turns, { role: 'user', content: text }, { role: 'assistant', content: 'ok' }] };
    }
  });
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, allowLan: false, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const tokens = await Promise.all(Array.from({ length: clients }, async (_, index) => {
      const response = await fetch(`${baseUrl}/api/guest/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installationId: `a11ce000-0000-4000-8000-${String(index).padStart(12, '0')}` }) });
      if (response.status !== 201) throw new Error(`Bootstrap ${index}: HTTP ${response.status}`);
      return (await response.json()).token;
    }));
    const startedAt = performance.now();
    const outcomes = await Promise.all(tokens.map(async (token, index) => {
      const requestStartedAt = performance.now();
      const response = await fetch(`${baseUrl}/api/guest/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `richiesta ${index}`, history: [] })
      });
      return { status: response.status, latencyMs: Math.round(performance.now() - requestStartedAt) };
    }));
    // #region Misure e gate di back-pressure

    const statuses = outcomes.map(({ status }) => status);
    const latencies = outcomes.map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
    const percentile = (ratio) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * ratio) - 1)] || 0;
    const finalCapacity = gateway.guestCapacity();
    const expectedAccepted = Math.min(clients, finalCapacity.concurrency + finalCapacity.queueLimit);
    const statusCounts = Object.fromEntries([...new Set(statuses)].sort().map((status) => [status, statuses.filter((value) => value === status).length]));
    const report = {
      evaluatedAt: new Date().toISOString(), clients, completed: statuses.filter((status) => status === 200).length,
      rejected: statuses.filter((status) => status !== 200).length, peakConcurrency: peak, observedQueue,
      durationMs: Math.round(performance.now() - startedAt), medianLatencyMs: percentile(0.5), p95LatencyMs: percentile(0.95),
      expectedAccepted, statusCounts, finalCapacity
    };
    report.passed = report.completed === expectedAccepted
      && statuses.every((status) => status === 200 || status === 429)
      && report.rejected === clients - expectedAccepted
      && peak <= finalCapacity.concurrency && report.p95LatencyMs <= 5_000
      && report.finalCapacity.active === 0 && report.finalCapacity.queued === 0;
    const target = path.join(__dirname, '..', 'qa-artifacts', 'gateway-load-test.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`Gateway: ${report.completed}/${clients} servite · ${report.rejected} in back-pressure · picco ${peak} · coda ${observedQueue} · p95 ${report.p95LatencyMs} ms\n`);
    if (!report.passed) process.exitCode = 2;

    // #endregion
  } finally { await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
}

// #endregion

run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
