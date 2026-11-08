const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActionRuntime } = require('../src/agents/action-runtime');
const { TypedToolRegistry } = require('../src/agents/typed-tools');
const { registerActionTools, approvalRequired, createNativeActionApproval } = require('../src/agents/action-tools');
const { AgentLoop } = require('../src/agents/agent-loop');
const { AIRuntime } = require('../src/ai/ai-runtime');
const { validateChatRequest } = require('../src/ai/ai-provider');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-action-tools-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'note.md'), '# Spesa\n- latte\n- pane\n');
  const runtime = new ActionRuntime({
    vaultPath: root, userPath: root, auditPath: path.join(root, 'data', 'audit.jsonl'),
    shell: { openPath: async () => '', openExternal: async () => {}, trashItem: async (value) => fs.rmSync(value, { recursive: true, force: true }) },
    logger: { warn: () => {}, info: () => {} }, platform: 'win32', applicationProbe: () => true
  });
  t.after(() => runtime.shutdown());
  return { root, runtime };
}

function tools(runtime, { mode = 'dangerous-only', approve = false } = {}) {
  const asked = [];
  const registry = new TypedToolRegistry();
  const collected = registerActionTools(registry, { actionRuntime: runtime, getApprovalMode: () => mode,
    requestApproval: async ({ ticket }) => { asked.push({ tool: ticket.tool, preview: ticket.preview }); return approve; } });
  return { registry, asked, ...collected };
}

test('catalogo: ogni azione del motore diventa uno strumento pc-* tipizzato', (t) => {
  const { runtime } = workspace(t);
  const { registry } = tools(runtime);
  const names = registry.list().map((tool) => tool.name);
  for (const name of ['pc-list-directory', 'pc-read-file', 'pc-write-file', 'pc-write-files', 'pc-trash-path', 'pc-open-application', 'pc-run-command']) assert.ok(names.includes(name), name);
  assert.equal(names.some((name) => name.includes('integration')), false);
  const openApp = registry.get('pc-open-application');
  assert.ok(openApp.parameters.properties.application.enum.includes('notepad'));
});

test('lettura a basso rischio: eseguita senza dialogo in modalità Automatico, con ricevuta', async (t) => {
  const { runtime } = workspace(t);
  const { registry, asked, receipts } = tools(runtime);
  const result = await registry.invoke('pc-read-file', { path: 'note.md' });
  assert.equal(result.status, 'completed');
  assert.match(result.output, /latte/);
  assert.equal(asked.length, 0);
  assert.equal(receipts.length, 1);
  const listing = await registry.invoke('pc-list-directory', {});
  assert.match(listing.output, /\[file\] note\.md/);
});

test('scrittura: dialogo con diff reale; rifiuto = nessun file, consenso = file verificato e annullabile', async (t) => {
  const { root, runtime } = workspace(t);
  const denied = tools(runtime, { approve: false });
  const refused = await denied.registry.invoke('pc-write-file', { path: 'todo.md', content: 'chiamare Luca\n' });
  assert.equal(refused.status, 'denied');
  assert.equal(fs.existsSync(path.join(root, 'todo.md')), false);
  assert.match(denied.asked[0].preview, /Crea file: todo\.md/);
  assert.equal(denied.receipts.length, 1);
  const allowed = tools(runtime, { approve: true });
  const written = await allowed.registry.invoke('pc-write-file', { path: 'todo.md', content: 'chiamare Luca\n' });
  assert.equal(written.status, 'completed');
  assert.equal(written.canUndo, true);
  assert.equal(fs.readFileSync(path.join(root, 'todo.md'), 'utf8'), 'chiamare Luca\n');
  assert.equal(allowed.artifacts[0].kind, 'file-change');
});

test('un file esistente non si sovrascrive senza averlo letto nello stesso turno', async (t) => {
  const { root, runtime } = workspace(t);
  const { registry, asked } = tools(runtime, { approve: true });
  await assert.rejects(registry.invoke('pc-write-file', { path: 'note.md', content: 'solo uova\n' }), { code: 'READ_BEFORE_WRITE' });
  await assert.rejects(registry.invoke('pc-write-files', { files: [{ path: 'note.md', content: 'x' }] }), { code: 'READ_BEFORE_WRITE' });
  assert.equal(asked.length, 0);
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /latte/);
  await registry.invoke('pc-read-file', { path: 'note.md' });
  assert.equal((await registry.invoke('pc-write-file', { path: 'note.md', content: '# Spesa\n- latte\n- pane\n- uova\n' })).status, 'completed');
});

test('i confini del motore valgono anche per l’agente: uscita dallo spazio di lavoro rifiutata', async (t) => {
  const { runtime } = workspace(t);
  const { registry } = tools(runtime, { approve: true });
  await assert.rejects(registry.invoke('pc-read-file', { path: '../../Windows/win.ini' }));
  await assert.rejects(registry.invoke('pc-run-command', { command: 'npm', args: ['install', 'evil'] }));
  // Lo schema blocca comandi diversi da npm prima ancora del motore.
  assert.equal(registry.validate('pc-run-command', { command: 'powershell', args: [] }).ok, false);
});

test('policy: «Chiedi sempre» chiede anche le letture; il motore rifiuta un consenso mancante', async (t) => {
  const { runtime } = workspace(t);
  const always = tools(runtime, { mode: 'always', approve: false });
  assert.equal((await always.registry.invoke('pc-read-file', { path: 'note.md' })).status, 'denied');
  assert.equal(always.asked.length, 1);
  assert.equal(approvalRequired('critical', 'full-access'), true);
  assert.equal(approvalRequired('high', 'dangerous-only'), true);
  assert.equal(approvalRequired('low', 'dangerous-only'), false);
  // Anche saltando il ponte, il motore non esegue un'azione ad alto rischio senza consenso.
  const ticket = runtime.propose({ tool: 'trash_path', arguments: { path: 'note.md' }, summary: 'test' });
  assert.equal((await runtime.execute(ticket.id, { approved: false, approvalMode: 'dangerous-only' })).status, 'denied');
});

test('integrazioni MCP pronte diventano strumenti critici con consenso obbligatorio', async (t) => {
  const { runtime } = workspace(t);
  const calls = [];
  runtime.integrations = {
    capabilities: () => [{ id: 'calendar', type: 'mcp', tools: ['create_event'], ready: true }, { id: 'off', type: 'mcp', tools: ['x'], ready: false }],
    validate: (input) => ({ connection: input.connection, tool: input.tool, input: input.input, revision: 'r' }),
    invoke: async (args) => { calls.push(args); return { message: 'ok', verification: 'tool-returned-unverified' }; },
    shutdown: () => {}
  };
  const denied = tools(runtime, { mode: 'full-access', approve: false });
  assert.deepEqual(denied.registry.list().filter((tool) => tool.name.startsWith('mcp-')).map((tool) => tool.name), ['mcp-calendar-create-event']);
  assert.equal((await denied.registry.invoke('mcp-calendar-create-event', { input: { title: 'Dentista' } })).status, 'denied');
  assert.equal(calls.length, 0);
  const allowed = tools(runtime, { mode: 'full-access', approve: true });
  assert.equal((await allowed.registry.invoke('mcp-calendar-create-event', { input: { title: 'Dentista' } })).status, 'completed');
  assert.deepEqual(calls[0].input, { title: 'Dentista' });
});

test('ciclo agentico end-to-end: legge, poi scrive con consenso e riporta l’esito reale', async (t) => {
  const { root, runtime } = workspace(t);
  const script = [
    { content: '', toolCalls: [{ name: 'pc-read-file', arguments: { path: 'note.md' } }] },
    { content: '', toolCalls: [{ name: 'pc-write-file', arguments: { path: 'note.md', content: '# Spesa\n- latte\n- pane\n- uova\n' } }] },
    { content: 'Ho aggiunto le uova alla lista.' }
  ];
  const provider = {
    name: 's', async initialize() { return this; }, async health() { return {}; }, async listModels() { return []; }, getCurrentModel() { return 's'; },
    async setModel() {}, async createModel() {}, async pullModel() {}, async preloadModel() {}, getCapabilities() { return { tools: true }; },
    async chat(request) { validateChatRequest(request); return { model: 's', message: { role: 'assistant', ...script.shift() }, usage: {} }; },
    async streamChat() {}, cancel() {}, async embed() {}, async shutdown() {}
  };
  const ai = new AIRuntime({ registry: { create: () => provider } });
  await ai.initialize({ provider: 's' });
  const { registry, asked } = tools(runtime, { approve: true });
  const outcome = await new AgentLoop({ runtime: ai, tools: registry }).run({ requestId: 'e2e', messages: [{ role: 'user', content: 'aggiungi le uova alla lista' }] });
  assert.equal(outcome.stopReason, 'answer');
  assert.deepEqual(outcome.toolRuns.map(({ name, ok }) => [name, ok]), [['pc-read-file', true], ['pc-write-file', true]]);
  assert.match(fs.readFileSync(path.join(root, 'note.md'), 'utf8'), /uova/);
  assert.deepEqual(asked.map((entry) => entry.tool), ['write_file']);
});

test('dialogo nativo: rifiuto predefinito, anteprima mostrata, finestra chiusa = rifiuto', async () => {
  let options;
  const dialog = { showMessageBox: async (_window, value) => { options = value; return { response: 1 }; } };
  const window = { isDestroyed: () => false };
  const ticket = { tool: 'write_file', risk: 'high', preview: 'Crea file: todo.md\n1 righe aggiunte', capability: { rollback: 'automatic' } };
  assert.equal(await createNativeActionApproval({ dialog, getWindow: () => window })({ ticket }), true);
  assert.equal(options.defaultId, 0);
  assert.match(options.detail, /Crea file: todo\.md/);
  assert.equal(await createNativeActionApproval({ dialog, getWindow: () => null })({ ticket }), false);
});
