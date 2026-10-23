const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WorkflowRuntime, validateSteps } = require('../src/agents/workflow-runtime');
const { ActionRuntime } = require('../src/agents/action-runtime');
const { documentCopyRecipe } = require('../src/shared/local-workflow-recipes.mjs');

test('incarico reale ripreso dopo riavvio: nuova approvazione, nessuna scrittura duplicata e undo', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-restart-'));
  const actions = [], workflows = [];
  t.after(async () => { for (const workflow of workflows) workflow.shutdown(); for (const action of actions) await action.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  const create = () => {
    const action = new ActionRuntime({ vaultPath: root, auditPath: path.join(root, 'audit.jsonl'),
      checkpointDirectory: path.join(root, 'checkpoints'), shell: { openPath: async () => '', trashItem: async () => {} },
      logger: { warn() {} }, platform: 'linux', applicationProbe: () => false });
    actions.push(action);
    const workflow = new WorkflowRuntime({ actionRuntime: action, checkpointDirectory: path.join(root, 'workflows') });
    workflows.push(workflow); return { action, workflow };
  };
  fs.writeFileSync(path.join(root, 'source.md'), '# Documento sintetico');
  const first = create(), job = first.workflow.create({ summary: 'Prepara e controlla un documento', steps: [
    { id: 'write-document', tool: 'write_file', arguments: { path: 'copy.md', content: '# Documento sintetico' } },
    { id: 'read-document', tool: 'read_file', arguments: { path: 'copy.md' } }
  ] });
  const copy = first.workflow.next(job.id);
  const copied = await first.workflow.decide(job.id, { ticketId: copy.proposal.id, approved: true });
  const receiptId = copied.result.receipt.id, timestamp = fs.statSync(path.join(root, 'copy.md')).mtimeMs;
  const oldRead = first.workflow.next(job.id);
  first.workflow.shutdown(); await first.action.shutdown();
  const second = create();
  await assert.rejects(second.workflow.decide(job.id, { ticketId: oldRead.proposal.id, approved: true }), { code: 'WORKFLOW_PROPOSAL_EXPIRED' });
  const read = second.workflow.next(job.id);
  assert.notEqual(read.proposal.id, oldRead.proposal.id); assert.equal(read.step.tool, 'read_file');
  const completed = await second.workflow.decide(job.id, { ticketId: read.proposal.id, approved: true });
  assert.equal(completed.workflow.status, 'complete'); assert.match(completed.result.stdout, /Documento sintetico/);
  assert.equal(completed.workflow.steps[0].result.receipt.id, receiptId);
  assert.equal(fs.statSync(path.join(root, 'copy.md')).mtimeMs, timestamp);
  assert.equal(second.workflow.undo(job.id).result.status, 'restored');
  assert.equal(fs.existsSync(path.join(root, 'copy.md')), false);
  assert.equal(fs.readFileSync(path.join(root, 'source.md'), 'utf8'), '# Documento sintetico');
});

test('una proposta scaduta si rigenera senza eseguire o fallire definitivamente l’incarico', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-refresh-'));
  let time = 100;
  const action = new ActionRuntime({ vaultPath: root, auditPath: path.join(root, 'audit.jsonl'),
    checkpointDirectory: path.join(root, 'checkpoints'), shell: {}, logger: { warn() {} }, platform: 'linux', now: () => time });
  const workflow = new WorkflowRuntime({ actionRuntime: action, checkpointDirectory: path.join(root, 'workflows'), now: () => time });
  t.after(async () => { workflow.shutdown(); await action.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(root, 'source.md'), 'synthetic');
  const job = workflow.create({ steps: [{ tool: 'read_file', arguments: { path: 'source.md' } }] });
  const old = workflow.next(job.id); time = old.proposal.expiresAt + 1;
  await assert.rejects(workflow.decide(job.id, { approved: true, ticketId: old.proposal.id }), { code: 'WORKFLOW_PROPOSAL_EXPIRED' });
  assert.equal(workflow.status(job.id).status, 'awaiting-approval');
  const next = workflow.next(job.id);
  assert.notEqual(next.proposal.id, old.proposal.id); assert.equal(action.hasPendingProposal(old.proposal.id), false);
  assert.equal((await workflow.decide(job.id, { approved: true, ticketId: next.proposal.id })).workflow.status, 'complete');
});

test('un’azione interrotta con esito sconosciuto non viene ripetuta o dichiarata annullata', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-uncertain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const actionRuntime = { propose: () => ({ id: 'test' }), execute: async () => { calls++; return { status: 'completed' }; } };
  const first = new WorkflowRuntime({ actionRuntime, checkpointDirectory: root });
  const job = first.create({ steps: [{ tool: 'read_file' }] });
  job.status = 'executing'; job.steps[0].status = 'executing'; first.save(job);
  const second = new WorkflowRuntime({ actionRuntime, checkpointDirectory: root });
  assert.equal(second.status(job.id).recoveryRequired, true);
  assert.throws(() => second.next(job.id), { code: 'WORKFLOW_RECOVERY_REQUIRED' });
  await assert.rejects(second.cancel(job.id), { code: 'WORKFLOW_RECOVERY_REQUIRED' });
  assert.throws(() => second.undo(job.id), { code: 'WORKFLOW_RECOVERY_REQUIRED' });
  assert.equal(calls, 0); assert.equal(second.load(job.id).status, 'executing');
});

test('undo non concorre con un passo ancora attivo, né cambia lo spazio di lavoro', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-undo-boundary-'));
  let finish, reverted = 0, workspace = 'first';
  const runtime = new WorkflowRuntime({ checkpointDirectory: root, actionRuntime: {
    propose: () => ({ id: 'ticket' }), workspaceIdentity: () => workspace,
    execute: () => new Promise(resolve => { finish = resolve; }),
    undoTransaction: () => { reverted++; return { status: 'restored' }; }
  } });
  t.after(() => { runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  const workflow = runtime.create({ steps: [{ tool: 'read_file' }] });
  runtime.next(workflow.id);
  const running = runtime.decide(workflow.id, true);
  assert.throws(() => runtime.undo(workflow.id), { code: 'WORKFLOW_RECOVERY_REQUIRED' });
  assert.equal(reverted, 0);
  finish({ status: 'completed' }); await running;
  workspace = 'second';
  assert.throws(() => runtime.undo(workflow.id), { code: 'WORKFLOW_WORKSPACE_CHANGED' });
  assert.equal(reverted, 0);
  workspace = 'first'; assert.equal(runtime.undo(workflow.id).workflow.status, 'reverted');
});

test('document recipe uses the actual executor, preserves the source and requires approval for both steps', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-document-recipe-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-document-other-'));
  const action = new ActionRuntime({ vaultPath: root, auditPath: path.join(root, 'logs/actions.jsonl'),
    shell: {}, logger: { warn() {} }, platform: 'linux', applicationProbe: () => false });
  const runtime = new WorkflowRuntime({ actionRuntime: action, checkpointDirectory: path.join(root, 'workflows') });
  try {
    fs.writeFileSync(path.join(root, 'source.md'), '# Documento originale\nContenuto autorizzato.');
    for (const source of ['../source.md', '/source.md', 'C:\\source.md', 'source.exe', 'dir//source.md']) assert.throws(() => documentCopyRecipe(source, 'copy.md'));
    const flow = runtime.create(documentCopyRecipe('source.md', 'copy.md'));
    const first = runtime.next(flow.id);
    assert.equal(fs.existsSync(path.join(root, 'copy.md')), false);
    const copied = await runtime.decide(flow.id, { ticketId: first.proposal.id, approved: true });
    assert.equal(copied.workflow.status, 'pending'); assert.equal(copied.result.receipt.outcome, 'completed');
    assert.equal(fs.readFileSync(path.join(root, 'copy.md'), 'utf8'), fs.readFileSync(path.join(root, 'source.md'), 'utf8'));
    const second = runtime.next(flow.id);
    const read = await runtime.decide(flow.id, { ticketId: second.proposal.id, approved: true });
    assert.equal(read.workflow.status, 'complete'); assert.match(read.result.stdout, /Contenuto autorizzato/);
    const again = runtime.create(documentCopyRecipe('source.md', 'copy.md'));
    const overwrite = runtime.next(again.id);
    await assert.rejects(runtime.decide(again.id, { ticketId: overwrite.proposal.id, approved: true }));
    assert.equal(fs.readFileSync(path.join(root, 'source.md'), 'utf8'), '# Documento originale\nContenuto autorizzato.');
    const denied = runtime.create(documentCopyRecipe('source.md', 'denied.md'));
    runtime.next(denied.id); await runtime.cancel(denied.id);
    assert.equal(fs.existsSync(path.join(root, 'denied.md')), false);
    fs.writeFileSync(path.join(root, 'large.md'), 'x'.repeat(2 * 1024 * 1024 + 1));
    const large = runtime.create(documentCopyRecipe('large.md', 'large-copy.md'));
    assert.throws(() => runtime.next(large.id), /2 MiB/);
    const bound = runtime.create(documentCopyRecipe('source.md', 'bound.md'));
    action.setWorkspaceRoot(other);
    assert.throws(() => runtime.next(bound.id), { code: 'WORKFLOW_WORKSPACE_CHANGED' });
    action.setWorkspaceRoot(root);
    const boundProposal = runtime.next(bound.id);
    action.setWorkspaceRoot(other);
    await assert.rejects(runtime.decide(bound.id, true), { code: 'WORKFLOW_WORKSPACE_CHANGED' });
    assert.equal(fs.existsSync(path.join(other, 'bound.md')), false);
    const cancelled = await runtime.cancel(bound.id);
    assert.equal(cancelled.workflow.status, 'cancelled'); assert.equal(cancelled.result.receipt.outcome, 'cancelled');
    assert.equal(action.tickets.has(boundProposal.proposal.id), false);
  } finally { runtime.shutdown(); await action.shutdown(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); }
});

test('workflow conserva esiti falliti e annullati senza attribuirli a un rifiuto utente', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-outcomes-'));
  try {
    for (const outcome of ['failed', 'cancelled', 'denied']) {
      const runtime = new WorkflowRuntime({ checkpointDirectory: root, actionRuntime: {
        propose: () => ({ id: 'ticket-outcome' }), execute: async () => ({ status: outcome }), undoTransaction: () => ({ status: 'empty' })
      } });
      const workflow = runtime.create({ summary: 'Controllo', steps: [{ tool: 'read_file' }] });
      runtime.proposeNext(workflow);
      await runtime.decide(workflow, true);
      const persisted = runtime.load(workflow.id);
      assert.equal(persisted.status, outcome);
      assert.equal(persisted.steps[0].status, outcome);
      assert.equal(persisted.cursor, 0);
      assert.equal(runtime.proposeNext(persisted), null);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('workflow richiede approvazione a ogni passo e riprende dal checkpoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-'));
  let sequence = 0;
  const actionRuntime = {
    propose(plan) { return { id: `ticket-${++sequence}`, preview: plan.tool }; },
    async execute(id, options) { assert.ok(options.transactionId); return { status: options.approved ? 'completed' : 'denied', code: 0, id }; },
    undoTransaction(id) { return { status: 'restored', message: '2 file ripristinati.', paths: ['a', 'b'], id }; }
  };
  const runtime = new WorkflowRuntime({ actionRuntime, checkpointDirectory: root, now: () => 100 });
  const workflow = runtime.create({ summary: 'Analizza', steps: [{ tool: 'read_file', arguments: { path: 'a.txt' } }, { tool: 'write_file', arguments: { path: 'b.txt' } }] });
  assert.equal(runtime.proposeNext(workflow).step.tool, 'read_file');
  await runtime.decide(workflow, true);
  assert.equal(runtime.load(workflow.id).cursor, 1);
  runtime.proposeNext(workflow);
  await runtime.decide(workflow, true);
  assert.equal(workflow.status, 'complete');
  assert.equal(runtime.undo(workflow).result.paths.length, 2);
  assert.equal(workflow.status, 'reverted');
});

test('workflow applica un budget rigido', () => {
  assert.throws(() => validateSteps(Array.from({ length: 9 }, () => ({ tool: 'read_file' }))), /1 a 8/);
});

test('workflow espone ticket monouso, verifica il proprietario e persiste la ricevuta di consenso', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-bound-'));
  let executed = 0;
  const actionRuntime = {
    capabilities: () => ({ tools: [{ name: 'read_file' }] }),
    propose(_plan, context) {
      assert.equal(context.subjectId, 'device-a');
      return { id: 'ticket-bound', tool: 'read_file', risk: 'low', preview: 'Leggi file', expiresAt: 10_000 };
    },
    async execute(id, options) {
      executed += 1;
      assert.equal(id, 'ticket-bound');
      assert.equal(options.requireSubject, true);
      return {
        status: options.approved ? 'completed' : 'denied',
        receipt: { id: 'receipt-1', outcome: options.approved ? 'completed' : 'denied' },
        receiptPersisted: true
      };
    },
    undoTransaction: () => ({ status: 'empty' })
  };
  const runtime = new WorkflowRuntime({ actionRuntime, checkpointDirectory: root, now: () => 200 });
  const workflow = runtime.create({ summary: 'Controlla', steps: [{ tool: 'read_file', arguments: { path: 'a.txt' } }] }, { subjectId: 'device-a' });
  const next = runtime.next(workflow.id, { subjectId: 'device-a' });
  assert.equal(next.proposal.id, 'ticket-bound');
  assert.throws(() => runtime.status(workflow.id, { subjectId: 'device-b' }), /sessione/);
  await assert.rejects(() => runtime.decide(workflow.id, { ticketId: 'ticket-wrong', approved: true }, { subjectId: 'device-a' }), /ticket/);
  assert.equal(executed, 0);
  const completed = await runtime.decide(workflow.id, { ticketId: 'ticket-bound', approved: true }, { subjectId: 'device-a', requireSubject: true });
  assert.equal(completed.workflow.status, 'complete');
  assert.equal(completed.workflow.steps[0].result.receipt.id, 'receipt-1');
});

test('annullare un workflow consuma il ticket come rifiuto e restituisce la ricevuta', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-cancel-'));
  const actionRuntime = {
    propose: () => ({ id: 'ticket-cancel', tool: 'read_file', preview: 'Leggi file' }),
    execute: async (_id, options) => ({ status: 'denied', receipt: { id: 'receipt-denied', outcome: options.approved ? 'completed' : 'denied' } }),
    undoTransaction: () => ({ status: 'empty' })
  };
  const runtime = new WorkflowRuntime({ actionRuntime, checkpointDirectory: root });
  const workflow = runtime.create({ summary: 'Controlla', steps: [{ tool: 'read_file' }] });
  runtime.next(workflow.id);
  const cancelled = await runtime.cancel(workflow.id);
  assert.equal(cancelled.workflow.status, 'cancelled');
  assert.equal(cancelled.result.receipt.outcome, 'denied');
  assert.equal(runtime.status(workflow.id).steps[0].result.receipt.id, 'receipt-denied');
});

test('un workflow locale non diventa accessibile a una sessione remota che ne indovina l ID', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-local-'));
  const runtime = new WorkflowRuntime({
    checkpointDirectory: root,
    actionRuntime: {
      propose: () => ({ id: 'ticket' }),
      execute: async () => ({ status: 'completed' }),
      undoTransaction: () => ({ status: 'empty' })
    }
  });
  const workflow = runtime.create({ summary: 'Locale', steps: [{ tool: 'read_file' }] });
  assert.throws(() => runtime.status(workflow.id, { subjectId: 'device-a', requireSubject: true }), /sessione/);
});

test('integrazione reale: il workflow scrive soltanto tramite ActionRuntime e produce una ricevuta', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workflow-integration-'));
  const actionRuntime = new ActionRuntime({
    vaultPath: root,
    auditPath: path.join(root, 'logs', 'actions.jsonl'),
    checkpointDirectory: path.join(root, 'checkpoints'),
    shell: { openPath: async () => '', trashItem: async () => {} },
    logger: { warn() {} },
    platform: 'linux',
    applicationProbe: () => false
  });
  const runtime = new WorkflowRuntime({ actionRuntime, checkpointDirectory: path.join(root, 'workflows') });
  const workflow = runtime.create({
    summary: 'Crea un file verificato',
    steps: [{ tool: 'write_file', arguments: { path: 'result.txt', content: 'verificato' } }]
  });
  const next = runtime.next(workflow.id);
  assert.equal(next.proposal.phase, 'dry-run');
  const completed = await runtime.decide(workflow.id, { ticketId: next.proposal.id, approved: true });
  assert.equal(completed.workflow.status, 'complete');
  assert.equal(fs.readFileSync(path.join(root, 'result.txt'), 'utf8'), 'verificato');
  assert.equal(completed.result.receipt.outcome, 'completed');
  await actionRuntime.shutdown();
});
