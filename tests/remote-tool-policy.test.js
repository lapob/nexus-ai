const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActionRuntime } = require('../src/agents/action-runtime');
const { WorkflowRuntime } = require('../src/agents/workflow-runtime');
const forbidden = { code: 'REMOTE_TOOL_FORBIDDEN' };

test('remote policy rejects forbidden creation, legacy checkpoints and live tickets, preserving denial and local use', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'task.js'), 'console.log("ok")');
  const actions = new ActionRuntime({ vaultPath: root, userPath: root, auditPath: path.join(root, 'audit.jsonl'), shell: {}, logger: { warn() {} } });
  const workflow = new WorkflowRuntime({ actionRuntime: actions, checkpointDirectory: path.join(root, 'workflows') });
  const remote = { subjectId: 'phone', requireSubject: true };
  for (const tool of ['run_script', 'run_command', 'open_path', 'open_user_path']) {
    assert.throws(() => workflow.create({ summary: 'Remote', steps: [{ tool }] }, remote), forbidden);
    assert.throws(() => actions.propose({ tool, summary: 'Remote', arguments: {} }, remote), forbidden);
  }
  const local = workflow.create({ summary: 'Local', steps: [{ tool: 'run_script', arguments: { path: 'task.js' } }] });
  assert.equal(workflow.next(local.id).step.tool, 'run_script');
  const legacy = workflow.load(local.id);
  legacy.ownerSubjectId = 'phone'; workflow.save(legacy);
  assert.throws(() => workflow.next(legacy.id, remote), forbidden);
  await assert.rejects(workflow.decide(legacy.id, true, remote), forbidden);

  const permitted = actions.propose({ summary: 'Read', tool: 'read_file', arguments: { path: 'task.js' } }, remote);
  assert.equal((await actions.execute(permitted.id, { ...remote, approved: true })).status, 'completed');
  // Represents a ticket issued before policy installation, independent of checkpoint metadata.
  for (const deny of [false, true]) {
    const proposal = actions.propose({ summary: 'Read', tool: 'read_file', arguments: { path: 'task.js' } }, remote);
    const ticket = actions.tickets.get(proposal.id);
    ticket.tool = 'run_script'; ticket.args = { path: 'task.js', args: [], cwd: '.' }; ticket.risk = 'high';
    if (deny) assert.equal((await actions.execute(proposal.id, { ...remote, approved: false, approvalMode: 'always' })).status, 'denied');
    else await assert.rejects(actions.execute(proposal.id, { ...remote, approved: false, approvalMode: 'full-access' }), forbidden);
    assert.equal(actions.tickets.has(proposal.id), false);
  }
});
