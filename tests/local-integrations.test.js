const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalIntegrations, connectionsFromFile, disableConnectionInFile } = require('../src/plugins/local-integrations');
const { ActionRuntime } = require('../src/agents/action-runtime');
const token = 'a-local-test-secret-that-is-at-least-32-characters';
const env = { NEXUS_INTEGRATION_QA: token };
function configuration(type = 'n8n') { return [{ id: 'local-qa', type, enabled: true, url: 'http://127.0.0.1:44800/webhook', authEnv: 'NEXUS_INTEGRATION_QA', tools: [type === 'n8n' ? 'trigger' : 'lookup'] }]; }
function input(tool = 'trigger') { return { connection: 'local-qa', tool, input: { value: 42 } }; }

test('only explicit loopback connections and allowlisted tools are admitted', () => {
  for (const url of ['https://example.com/mcp', 'http://localhost:44/mcp', 'http://127.0.0.1:44/mcp?secret=x', 'http://user:pass@127.0.0.1:44/mcp']) {
    const values = configuration(); values[0].url = url;
    assert.throws(() => new LocalIntegrations({ load: () => values, env }).validate(input()), { code: 'INTEGRATION_CONFIG_INVALID' });
  }
  assert.throws(() => new LocalIntegrations().validate(input()), { code: 'INTEGRATION_UNAVAILABLE' });
  const runtime = new LocalIntegrations({ load: () => configuration(), env });
  assert.throws(() => runtime.validate(input('other')), { code: 'INTEGRATION_UNAVAILABLE' });
  assert.doesNotMatch(JSON.stringify(runtime.capabilities()), /webhook|secret|Bearer/);
});

test('config or token changes invalidate approval and no webhook retry is attempted', async () => {
  let values = configuration(), calls = 0;
  const runtime = new LocalIntegrations({ load: () => values, env, request: async () => { ++calls; throw new Error('network'); } });
  const ticket = runtime.validate(input()); values = configuration(); values[0].url = 'http://127.0.0.1:44801/webhook';
  await assert.rejects(runtime.invoke(ticket), { code: 'INTEGRATION_AUTH_CHANGED' }); assert.equal(calls, 0);
  await assert.rejects(runtime.invoke(input()), { code: 'INTEGRATION_FAILED' }); assert.equal(calls, 1);
});

test('n8n receives exactly approved input with private auth and reports acceptance without claiming effects', async () => {
  const runtime = new LocalIntegrations({ load: () => configuration(), env, request: async (url, options) => {
    assert.equal(url, configuration()[0].url); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.get('Authorization'), `Bearer ${token}`);
    assert.deepEqual(JSON.parse(options.body), { value: 42 }); return Response.json({ message: 'Workflow was started' });
  } });
  const result = await runtime.invoke(input()); assert.equal(result.verification, 'accepted-unverified');
  assert.equal(result.canUndo, false); assert.doesNotMatch(JSON.stringify(result), /a-local-test-secret/);
});

test('revocation aborts in-flight work and prevents subsequent invocation', async () => {
  let entered; const ready = new Promise(resolve => { entered = resolve; });
  const runtime = new LocalIntegrations({ load: () => configuration(), env, request: async (url, options) => {
    entered(); return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const pending = runtime.invoke(input()); await ready; runtime.revoke('local-qa');
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(runtime.invoke(input()), { code: 'INTEGRATION_UNAVAILABLE' });
});

test('revocation persists across a new runtime and oversized output is rejected', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-integration-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'integrations.json'); fs.writeFileSync(file, JSON.stringify({ connections: configuration() }));
  const runtime = new LocalIntegrations({ load: () => connectionsFromFile(file), persistRevocation: id => disableConnectionInFile(file, id), env });
  runtime.revoke('local-qa');
  assert.deepEqual(new LocalIntegrations({ load: () => connectionsFromFile(file), env }).capabilities(), []);
  assert.equal(fs.readdirSync(directory).length, 1);
  const oversized = new LocalIntegrations({ load: () => configuration(), env, request: async () => new Response('x'.repeat(300000)) });
  await assert.rejects(oversized.invoke(input()), { code: 'INTEGRATION_OUTPUT_LIMIT' });
});

test('official MCP SDK negotiates and calls only the configured tool with bounded responses', async () => {
  const methods = [];
  const runtime = new LocalIntegrations({ load: () => configuration('mcp'), env, request: async (url, options) => {
    const request = JSON.parse(options.body); methods.push(request.method);
    const result = request.method === 'server/discover' ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } }
      : request.method === 'initialize' ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'qa', version: '1' } }
      : request.method === 'tools/list' ? { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: 'Verified local fixture' }] };
    if (request.method === 'tools/call') assert.deepEqual(request.params.arguments, { value: 42 });
    if (!request.id && request.id !== 0) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: request.id, result }, { headers: { 'MCP-Protocol-Version': '2026-07-28' } });
  } });
  const result = await runtime.invoke(input('lookup'));
  assert.equal(result.verification, 'tool-returned-unverified'); assert.ok(methods.includes('tools/call'));
  assert.equal(result.artifacts[0].content, 'Verified local fixture');
});

test('integration actions use existing one-use approval, receipts and remote restrictions', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-integration-actions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); let calls = 0;
  const integrations = new LocalIntegrations({ load: () => configuration(), env, request: async () => { ++calls; return Response.json({ ok: true }); } });
  const runtime = new ActionRuntime({ vaultPath: directory, userPath: directory, auditPath: path.join(directory, 'audit.jsonl'), shell: {}, integrations });
  const plan = { tool: 'run_integration', summary: 'Local fixture', arguments: input() };
  assert.throws(() => runtime.propose(plan, { subjectId: 'remote-device' }), { code: 'REMOTE_TOOL_FORBIDDEN' });
  const denied = runtime.propose(plan); assert.equal((await runtime.execute(denied.id, { approvalMode: 'full-access' })).status, 'denied'); assert.equal(calls, 0);
  const approved = runtime.propose(plan); const result = await runtime.execute(approved.id, { approved: true });
  assert.equal(result.status, 'completed'); assert.equal(calls, 1); assert.equal(result.verification, 'accepted-unverified');
  await assert.rejects(runtime.execute(approved.id, { approved: true })); assert.equal(calls, 1);
  const revoked = runtime.propose(plan); integrations.revoke('local-qa');
  await assert.rejects(runtime.execute(revoked.id, { approved: true }), { code: 'INTEGRATION_UNAVAILABLE' });
  await runtime.shutdown();
});
