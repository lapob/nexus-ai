const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateKeyPairSync, sign, verify } = require('node:crypto');
const { ActionRuntime, outputDiagnostics, parseAgentPlan, sanitizedChildEnvironment, textDiffPreview } = require('../src/agents/action-runtime');
const { DeviceIdentityChallengeStore, canonicalChallengePayload } = require('../src/security/device-identity');
const { verifyReceiptDigest } = require('../src/security/action-receipt');

function fixture(confirm = async () => false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-actions-'));
  const script = path.join(root, 'task.js');
  fs.writeFileSync(script, 'console.log("ok");');
  const opened = [];
  const runtime = new ActionRuntime({
    vaultPath: root,
    userPath: root,
    auditPath: path.join(root, 'data', 'audit.jsonl'),
    shell: {
      openPath: async (value) => { opened.push(value); return ''; },
      openExternal: async () => {},
      trashItem: async (value) => { fs.rmSync(value, { recursive: true, force: true }); }
    },
    confirm,
    logger: { warn: () => {} },
    platform: 'win32',
    applicationProbe: () => true,
    now: () => 1000
  });
  return {
    root,
    script,
    opened,
    runtime,
    // Windows puo rilasciare l'ultimo handle del processo appena terminato
    // qualche millisecondo dopo taskkill. Il retry evita un falso negativo
    // senza nascondere directory davvero occupate.
    cleanup: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 })
  };
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function terminateTestProcess(pid) {
  if (!processIsAlive(pid)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

async function verifiedDevice(deviceId, keyId = `${deviceId}-key`) {
  const keys = generateKeyPairSync('ed25519');
  const store = new DeviceIdentityChallengeStore({
    verifySignature: ({ payload, signature }) => verify(null, payload, keys.publicKey, signature)
  });
  const challenge = store.issue({ deviceId, keyId });
  return store.verify({
    challengeId: challenge.challengeId,
    deviceId,
    keyId,
    signature: sign(null, canonicalChallengePayload(challenge), keys.privateKey)
  });
}

test('i processi autorizzati non ereditano segreti applicativi', () => {
  const env = sanitizedChildEnvironment({ PATH: 'C:\\bin', TEMP: 'C:\\tmp', OLLAMA_API_KEY: 'secret', GITHUB_TOKEN: 'secret' });
  assert.equal(env.PATH, 'C:\\bin');
  assert.equal(env.NEXUS_ACTION_CONTEXT, 'approved-local-action');
  assert.equal(env.OLLAMA_API_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
});

test('collega la diagnostica solo a file contenuti nello spazio di lavoro', () => {
  const root = path.join('C:', 'NexusNXS');
  assert.deepEqual(outputDiagnostics('src\\app.ts:12:4 - tipo non valido', root), [{
    file: path.join('src', 'app.ts'), line: 12, column: 4, message: 'tipo non valido'
  }]);
  assert.deepEqual(outputDiagnostics('C:\\Windows\\secret.ts:2:1 - non mostrare', root), []);
});

test('estrae un piano operativo JSON e gestisce una risposta senza strumenti', () => {
  assert.deepEqual(parseAgentPlan('```json\n{"summary":"Apri la calcolatrice","tool":"open_application","arguments":{"application":"calculator"}}\n```'), {
    summary: 'Apri la calcolatrice',
    reason: '',
    tool: 'open_application',
    arguments: { application: 'calculator' }
  });
  assert.equal(parseAgentPlan('{"summary":"Serve un chiarimento","tool":null,"arguments":{}}').tool, null);
});

test('valida strumenti, applicazioni e confini della vault prima del ticket', () => {
  const item = fixture();
  try {
    const privateDirectory = path.join(item.root, '.AI');
    fs.mkdirSync(privateDirectory);
    fs.writeFileSync(path.join(privateDirectory, 'internal.js'), 'private');
    const proposal = item.runtime.propose({ summary: 'Apri', tool: 'open_application', arguments: { application: 'calculator' } });
    assert.equal(proposal.tool, 'open_application');
    assert.match(proposal.preview, /calculator/);
    assert.throws(() => item.runtime.propose({ summary: 'Esci', tool: 'open_path', arguments: { path: '..' } }), /vault NexusNXS/);
    assert.throws(() => item.runtime.propose({ summary: 'Interno', tool: 'open_path', arguments: { path: '.AI/internal.js' } }), /interne dell’app/);
    assert.throws(() => item.runtime.propose({ summary: 'Shell', tool: 'run_command', arguments: { command: 'cmd', args: ['/c', 'dir'] } }), /non consentito/);
    const personal = item.runtime.propose({ summary: 'Apri file personale', tool: 'open_user_path', arguments: { path: 'task.js' } });
    assert.match(personal.preview, /percorso personale/i);
    assert.match(item.runtime.propose({ summary: 'Apri Notion', tool: 'open_application', arguments: { application: 'notion' } }).preview, /notion/i);
  } finally { item.cleanup(); }
});

test('nega senza eseguire e consuma il ticket monouso', async () => {
  const item = fixture(async () => false);
  try {
    const proposal = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
    const result = await item.runtime.execute(proposal.id, { approved: false, approvalMode: 'always' });
    assert.equal(result.status, 'denied');
    assert.deepEqual(item.opened, []);
    await assert.rejects(() => item.runtime.execute(proposal.id), /scaduta|non è valida/);
  } finally { item.cleanup(); }
});

test('consuma il ticket usando la chiave canonica anche con input non canonico', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const proposal = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
  const result = await item.runtime.execute(`  ${proposal.id}  `, { approved: true, approvalMode: 'always' });
  assert.equal(result.status, 'completed');
  assert.equal(item.opened.length, 1);
  await assert.rejects(
    item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' }),
    /scaduta|non è valida/
  );
  assert.equal(item.opened.length, 1);
});

test('la proposta è un dry-run con capability monouso legata a workspace e dispositivo', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const proposal = item.runtime.propose(
    { summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } },
    { subjectId: 'device-owner' }
  );
  assert.equal(proposal.phase, 'dry-run');
  assert.deepEqual({
    scope: proposal.capability.scope,
    tool: proposal.capability.tool,
    effect: proposal.capability.effect,
    rollback: proposal.capability.rollback,
    subjectBound: proposal.capability.subjectBound,
    singleUse: proposal.capability.singleUse
  }, {
    scope: 'active-workspace', tool: 'open_path', effect: 'read', rollback: 'not-required',
    subjectBound: true, singleUse: true
  });
  await assert.rejects(
    item.runtime.execute(proposal.id, { approved: true, subjectId: 'device-other' }),
    (error) => error?.code === 'CAPABILITY_SUBJECT_MISMATCH'
  );
  assert.deepEqual(item.opened, []);
});

test('una esecuzione remota rifiuta capability locali non legate a un dispositivo', async (t) => {
  const item = fixture(t);
  const localProposal = item.runtime.propose({
    summary: 'Leggi il progetto',
    tool: 'list_directory',
    arguments: { path: '.' }
  });
  await assert.rejects(
    item.runtime.execute(localProposal.id, {
      approvalMode: 'always', approved: true,
      subjectId: 'remote-device', requireSubject: true
    }),
    (error) => error.code === 'CAPABILITY_SUBJECT_REQUIRED'
  );
  await assert.rejects(
    item.runtime.execute(localProposal.id, { approved: true }),
    /scaduta|non è valida/
  );
});

test('una capability firmata resta legata alla stessa chiave dispositivo', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const owner = await verifiedDevice('phone-owner');
  const other = await verifiedDevice('phone-other');
  const proposal = item.runtime.propose({
    summary: 'Leggi il progetto', tool: 'list_directory', arguments: { path: '.' }
  }, { deviceIdentity: owner });
  assert.equal(proposal.capability.identityBound, true);
  assert.equal(proposal.subjectId, owner.subjectId);
  await assert.rejects(
    item.runtime.execute(proposal.id, {
      approved: true,
      requireSubject: true,
      requireVerifiedIdentity: true,
      deviceIdentity: other
    }),
    (error) => error.code === 'CAPABILITY_SUBJECT_MISMATCH'
  );
  assert.equal(item.runtime.history()[0].event, 'capability-denied');
});

test('un identificatore testuale non puo sostituire una prova dispositivo firmata', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const owner = await verifiedDevice('phone-owner');
  const proposal = item.runtime.propose({
    summary: 'Leggi il progetto', tool: 'list_directory', arguments: { path: '.' }
  }, { deviceIdentity: owner });
  await assert.rejects(
    item.runtime.execute(proposal.id, {
      approved: true,
      requireSubject: true,
      requireVerifiedIdentity: true,
      subjectId: 'phone-owner'
    }),
    (error) => error.code === 'CAPABILITY_DEVICE_IDENTITY_REQUIRED'
  );
});

test('la ricevuta completata e persistita non contiene percorsi, contenuti o id dispositivo grezzi', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const owner = await verifiedDevice('private-phone-name');
  const proposal = item.runtime.propose({
    summary: 'Leggi il progetto', tool: 'list_directory', arguments: { path: '.' }
  }, { deviceIdentity: owner });
  const result = await item.runtime.execute(proposal.id, {
    approvalMode: 'dangerous-only',
    requireSubject: true,
    requireVerifiedIdentity: true,
    deviceIdentity: owner
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.receiptPersisted, true);
  assert.equal(verifyReceiptDigest(result.receipt), true);
  assert.equal(result.receipt.subject.id, owner.subjectId);
  const stored = fs.readFileSync(path.join(item.root, 'data', 'action-receipts.jsonl'), 'utf8');
  assert.equal(stored.includes(item.root), false);
  assert.equal(stored.includes('private-phone-name'), false);
  assert.equal(stored.includes('console.log'), false);
});

test('esegue soltanto dopo consenso e registra audit senza output', async () => {
  const item = fixture(async () => true);
  try {
    const proposal = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
    const result = await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' });
    assert.equal(result.status, 'completed');
    assert.deepEqual(item.opened, [item.script]);
    const audit = fs.readFileSync(path.join(item.root, 'data', 'audit.jsonl'), 'utf8');
    assert.match(audit, /"event":"approved"/);
    assert.match(audit, /"event":"completed"/);
    assert.doesNotMatch(audit, /stdout/);
  } finally { item.cleanup(); }
});

test('l audit conserva metadati ma non diff, token o argomenti sensibili', (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const githubCredential = `github_${'pat'}_abcdefghijklmnopqrstuvwxyz123456`;
  item.runtime.audit({
    event: 'approved',
    tool: 'write_file',
    preview: `Modifica file: config.json\n+ token=${githubCredential}\n+ password=hunter2`
  });
  const audit = fs.readFileSync(path.join(item.root, 'data', 'audit.jsonl'), 'utf8');
  assert.match(audit, /Modifica file: config\.json/);
  assert.equal(audit.includes(githubCredential), false);
  assert.doesNotMatch(audit, /hunter2|password=/);
});

test('inoltra progressivamente l output dei processi autorizzati', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const proposal = item.runtime.propose({ summary: 'Esegui lo script', tool: 'run_script', arguments: { path: 'task.js', args: [] } });
  const chunks = [];
  const result = await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always', onOutput: (event) => chunks.push(event) });
  assert.equal(result.code, 0);
  assert.match(chunks.map((event) => event.text).join(''), /ok/);
  assert.ok(chunks.every((event) => ['stdout', 'stderr'].includes(event.stream)));
});

test('shutdown interrompe i comandi posseduti e rifiuta nuove azioni', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  fs.writeFileSync(item.script, 'console.log("ready"); setInterval(() => {}, 1000);');
  const proposal = item.runtime.propose({ summary: 'Esegui a lungo', tool: 'run_script', arguments: { path: 'task.js', args: [] } });
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const execution = item.runtime.execute(proposal.id, {
    approved: true,
    approvalMode: 'always',
    onOutput: (event) => { if (event.text.includes('ready')) ready(); }
  });
  await started;
  assert.equal(item.runtime.activeProcesses.size, 1);
  const interrupted = assert.rejects(execution, /NexusNXS è stato chiuso/);
  const stopped = await item.runtime.shutdown();
  assert.deepEqual(stopped, { terminated: 1, timedOut: false });
  await interrupted;
  assert.equal(item.runtime.activeProcesses.size, 0);
  assert.throws(() => item.runtime.propose({ summary: 'Non partire', tool: 'run_script', arguments: { path: 'task.js', args: [] } }), /fase di chiusura/);
});

test('shutdown termina realmente anche i processi figli di un comando autorizzato', { skip: process.platform !== 'win32' }, async (t) => {
  const item = fixture();
  const pidFile = path.join(item.root, 'owned-pids.json');
  let owned = {};
  t.after(() => {
    terminateTestProcess(owned.child);
    terminateTestProcess(owned.parent);
    item.cleanup();
  });
  fs.writeFileSync(item.script, [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "fs.writeFileSync(process.argv[2], JSON.stringify({ parent: process.pid, child: child.pid }));",
    "console.log('tree-ready');",
    "setInterval(() => {}, 1000);"
  ].join('\n'));
  const proposal = item.runtime.propose({ summary: 'Esegui albero di prova', tool: 'run_script', arguments: { path: 'task.js', args: [pidFile] } });
  let signalReady;
  const ready = new Promise((resolve) => { signalReady = resolve; });
  const execution = item.runtime.execute(proposal.id, {
    approved: true,
    approvalMode: 'always',
    onOutput: (event) => { if (event.text.includes('tree-ready')) signalReady(); }
  });
  await ready;
  owned = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  assert.equal(processIsAlive(owned.parent), true);
  assert.equal(processIsAlive(owned.child), true);
  const interrupted = assert.rejects(execution, /NexusNXS è stato chiuso/);
  const stopped = await item.runtime.shutdown();
  await interrupted;
  assert.deepEqual(stopped, { terminated: 1, timedOut: false });
  assert.equal(processIsAlive(owned.parent), false);
  assert.equal(processIsAlive(owned.child), false);
});

test('AbortSignal interrompe il processo posseduto e registra la cancellazione', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  fs.writeFileSync(item.script, 'console.log("remote-ready"); setInterval(() => {}, 1000);');
  const proposal = item.runtime.propose({ summary: 'Esegui a lungo', tool: 'run_script', arguments: { path: 'task.js', args: [] } });
  const controller = new AbortController();
  let signalReady;
  const ready = new Promise((resolve) => { signalReady = resolve; });
  const execution = item.runtime.execute(proposal.id, {
    approved: true,
    approvalMode: 'always',
    signal: controller.signal,
    onOutput: (event) => { if (event.text.includes('remote-ready')) signalReady(); }
  });
  await ready;
  controller.abort();
  await assert.rejects(execution, (error) => error?.name === 'AbortError' && error?.code === 'ACTION_CANCELLED');
  for (let attempt = 0; attempt < 40 && item.runtime.activeProcesses.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(item.runtime.activeProcesses.size, 0);
  assert.match(fs.readFileSync(path.join(item.root, 'data', 'audit.jsonl'), 'utf8'), /"event":"cancelled"/);
});

test('un segnale già annullato consuma il ticket senza committare la scrittura', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const target = path.join(item.root, 'document.txt');
  fs.writeFileSync(target, 'originale');
  const proposal = item.runtime.propose({ summary: 'Modifica documento', tool: 'write_file', arguments: { path: 'document.txt', content: 'nuovo' } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always', signal: controller.signal }),
    (error) => error?.code === 'ACTION_CANCELLED'
  );
  assert.equal(fs.readFileSync(target, 'utf8'), 'originale');
  await assert.rejects(item.runtime.execute(proposal.id, { approved: true }), /scaduta|non è valida/);
});

test('espone una cronologia azioni locale limitata e senza output dei processi', (t) => {
  const item = fixture();
  t.after(item.cleanup);
  item.runtime.audit({ event: 'completed', tool: 'open_application', preview: 'Apri Calcolatrice', code: 0, stdout: 'segreto' });
  const history = item.runtime.history();
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], {
    timestamp: history[0].timestamp,
    event: 'completed',
    tool: 'open_application',
    preview: 'Apri Calcolatrice',
    code: 0
  });
  assert.equal(history[0].stdout, undefined);
});

test('applica i profili chiedi sempre, automatico e accesso completo', async () => {
  const item = fixture();
  try {
    const safe = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
    assert.equal((await item.runtime.execute(safe.id, { approvalMode: 'dangerous-only' })).status, 'completed');
    const always = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
    assert.equal((await item.runtime.execute(always.id, { approvalMode: 'always' })).status, 'denied');
    const full = item.runtime.propose({ summary: 'Apri file', tool: 'open_path', arguments: { path: 'task.js' } });
    assert.equal((await item.runtime.execute(full.id, { approvalMode: 'full-access' })).status, 'completed');
  } finally { item.cleanup(); }
});

test('lavora soltanto nella cartella attiva e modifica file dopo consenso', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project');
  fs.mkdirSync(workspace);
  item.runtime.setWorkspaceRoot(workspace);
  const write = item.runtime.propose({ summary: 'Crea README', tool: 'write_file', arguments: { path: 'README.md', content: '# Progetto\n' } });
  const written = await item.runtime.execute(write.id, { approved: true, approvalMode: 'always' });
  assert.equal(written.verification, 'write-complete');
  assert.deepEqual(written.artifacts.map(({ kind, title, language, added, removed }) => ({ kind, title, language, added, removed })), [
    { kind: 'file-change', title: 'README.md', language: 'markdown', added: 1, removed: 0 }
  ]);
  assert.equal(fs.readFileSync(path.join(workspace, 'README.md'), 'utf8'), '# Progetto\n');
  const read = item.runtime.propose({ summary: 'Leggi README', tool: 'read_file', arguments: { path: 'README.md' } });
  const readResult = await item.runtime.execute(read.id, { approvalMode: 'dangerous-only' });
  assert.equal(readResult.stdout, '# Progetto\n');
  assert.equal(readResult.artifacts[0].content, '# Progetto\n');
  assert.throws(() => item.runtime.propose({ summary: 'Esci', tool: 'write_file', arguments: { path: '..\\outside.txt', content: 'no' } }), /spazio di lavoro/);
});

test('non inserisce credenziali o nomi riservati nel contesto del modello', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-sensitive');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Pubblico\n');
  fs.writeFileSync(path.join(workspace, 'credentials.json'), '{"token":"segreto"}\n');
  fs.writeFileSync(path.join(workspace, '.env'), 'TOKEN=segreto\n');
  item.runtime.setWorkspaceRoot(workspace);
  assert.throws(
    () => item.runtime.propose({ summary: 'Leggi credenziali', tool: 'read_file', arguments: { path: 'credentials.json' } }),
    /materiale riservato/
  );
  const list = item.runtime.propose({ summary: 'Elenca', tool: 'list_directory', arguments: { path: '.' } });
  const result = await item.runtime.execute(list.id, { approvalMode: 'dangerous-only' });
  assert.match(result.stdout, /README\.md/);
  assert.doesNotMatch(result.stdout, /credentials|\.env|segreto/i);
});

test('rivalida i symlink al consenso e blocca una destinazione sostituita dopo la proposta', async (t) => {
  const item = fixture();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-actions-external-'));
  t.after(() => { item.cleanup(); fs.rmSync(external, { recursive: true, force: true }); });
  const workspace = path.join(item.root, 'project-symlink');
  const mutableDirectory = path.join(workspace, 'mutable');
  fs.mkdirSync(mutableDirectory, { recursive: true });
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Crea file', tool: 'write_file', arguments: { path: 'mutable/escape.txt', content: 'no' } });

  fs.rmSync(mutableDirectory, { recursive: true, force: true });
  fs.symlinkSync(external, mutableDirectory, process.platform === 'win32' ? 'junction' : 'dir');

  await assert.rejects(
    () => item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' }),
    /esce dallo spazio di lavoro/
  );
  assert.equal(fs.existsSync(path.join(external, 'escape.txt')), false);
});

test('mostra il diff, crea un checkpoint e annulla l ultima scrittura', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-undo');
  fs.mkdirSync(workspace);
  const target = path.join(workspace, 'README.md');
  fs.writeFileSync(target, '# Prima\n');
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Aggiorna README', tool: 'write_file', arguments: { path: 'README.md', content: '# Dopo\nNuova riga\n' } });
  assert.match(proposal.preview, /righe aggiunte/);
  assert.match(proposal.preview, /− # Prima/);
  const result = await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' });
  assert.equal(result.artifacts[0].previousContent, '# Prima\n');
  assert.match(result.artifacts[0].diff, /− # Prima/);
  assert.equal(fs.readFileSync(target, 'utf8'), '# Dopo\nNuova riga\n');
  assert.equal(item.runtime.undoLastWrite().status, 'restored');
  assert.equal(fs.readFileSync(target, 'utf8'), '# Prima\n');
  assert.equal(item.runtime.undoLastWrite().status, 'empty');
  assert.deepEqual(textDiffPreview('a\n', 'b\n'), { removed: 1, added: 1, excerpt: '− a\n+ b' });
});

test('una scrittura non valida viene ripristinata automaticamente prima di propagare l errore', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-auto-rollback');
  fs.mkdirSync(workspace);
  const target = path.join(workspace, 'config.json');
  fs.writeFileSync(target, '{"safe":true}\n');
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({
    summary: 'Aggiorna configurazione', tool: 'write_file',
    arguments: { path: 'config.json', content: '{invalid-json' }
  });
  await assert.rejects(
    item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' }),
    (error) => error instanceof SyntaxError && error.rollback?.status === 'restored'
  );
  assert.equal(fs.readFileSync(target, 'utf8'), '{"safe":true}\n');
  assert.match(fs.readFileSync(path.join(item.root, 'data', 'audit.jsonl'), 'utf8'), /"event":"rolled-back"/);
});

test('il rollback rifiuta un backup alterato e non modifica il file corrente', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-tampered-checkpoint');
  fs.mkdirSync(workspace);
  const target = path.join(workspace, 'README.md');
  fs.writeFileSync(target, 'prima');
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Modifica', tool: 'write_file', arguments: { path: 'README.md', content: 'dopo' } });
  await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' });
  const prepared = fs.readFileSync(path.join(item.root, 'data', 'action-checkpoints', 'writes.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse).find((record) => record.phase === 'prepared');
  fs.writeFileSync(path.join(item.root, 'data', 'action-checkpoints', `${prepared.id}.bak`), 'manomesso');
  assert.throws(
    () => item.runtime.undoLastWrite(),
    (error) => error.code === 'ROLLBACK_CHECKPOINT_TAMPERED' && verifyReceiptDigest(error.receipt)
  );
  assert.equal(fs.readFileSync(target, 'utf8'), 'dopo');
});

test('il rollback non sovrascrive modifiche successive non appartenenti all azione', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-diverged');
  fs.mkdirSync(workspace);
  const target = path.join(workspace, 'README.md');
  fs.writeFileSync(target, 'prima');
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Modifica', tool: 'write_file', arguments: { path: 'README.md', content: 'dopo' } });
  await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' });
  fs.writeFileSync(target, 'modifica esterna');
  assert.throws(() => item.runtime.undoLastWrite(), (error) => error.code === 'ROLLBACK_STATE_MISMATCH');
  assert.equal(fs.readFileSync(target, 'utf8'), 'modifica esterna');
});

test('un progetto multi-file fallito ripristina i file gia scritti e ignora checkpoint senza effetti', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'project-partial-write');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'blocked'), 'non e una cartella');
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Crea progetto', tool: 'write_files', arguments: { files: [
    { path: 'first.txt', content: 'temporaneo' },
    { path: 'blocked/second.txt', content: 'non verra scritto' }
  ] } });
  await assert.rejects(
    item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' }),
    (error) => error.rollback?.status === 'restored'
  );
  assert.equal(fs.existsSync(path.join(workspace, 'first.txt')), false);
  assert.equal(fs.readFileSync(path.join(workspace, 'blocked'), 'utf8'), 'non e una cartella');
});

test('crea, copia, rinomina e sposta nel cestino soltanto dentro la cartella autorizzata', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'file-operations');
  fs.mkdirSync(workspace);
  item.runtime.setWorkspaceRoot(workspace);
  const directory = item.runtime.propose({ summary: 'Crea progetto', tool: 'create_directory', arguments: { path: 'progetto' } });
  assert.equal((await item.runtime.execute(directory.id, { approved: true, approvalMode: 'always' })).verification, 'directory-created');
  fs.writeFileSync(path.join(workspace, 'progetto', 'index.txt'), 'NexusNXS');
  const copy = item.runtime.propose({ summary: 'Copia file', tool: 'copy_path', arguments: { source: 'progetto/index.txt', destination: 'progetto/copia.txt' } });
  assert.equal((await item.runtime.execute(copy.id, { approved: true, approvalMode: 'always' })).verification, 'copy-complete');
  const move = item.runtime.propose({ summary: 'Rinomina file', tool: 'move_path', arguments: { source: 'progetto/copia.txt', destination: 'progetto/finale.txt' } });
  assert.equal((await item.runtime.execute(move.id, { approved: true, approvalMode: 'always' })).verification, 'move-complete');
  const trash = item.runtime.propose({ summary: 'Elimina file', tool: 'trash_path', arguments: { path: 'progetto/finale.txt' } });
  const trashed = await item.runtime.execute(trash.id, { approved: true, approvalMode: 'always' });
  assert.equal(trashed.verification, 'trashed');
  assert.equal(fs.existsSync(path.join(workspace, 'progetto', 'finale.txt')), false);
  assert.throws(() => item.runtime.propose({ summary: 'Copia fuori', tool: 'copy_path', arguments: { source: 'progetto/index.txt', destination: '../fuori.txt' } }), /spazio di lavoro/);
});

test('crea un progetto multi-file annidato con una sola autorizzazione e checkpoint comune', async (t) => {
  const item = fixture();
  t.after(item.cleanup);
  const workspace = path.join(item.root, 'multi-file');
  fs.mkdirSync(workspace);
  item.runtime.setWorkspaceRoot(workspace);
  const proposal = item.runtime.propose({ summary: 'Crea sito', tool: 'write_files', arguments: { files: [
    { path: 'sito/index.html', content: '<h1>NexusNXS</h1>' },
    { path: 'sito/assets/style.css', content: 'body { color: white; }' }
  ] } });
  const result = await item.runtime.execute(proposal.id, { approved: true, approvalMode: 'always' });
  assert.equal(result.verification, 'project-written');
  assert.equal(result.artifacts.length, 2);
  assert.equal(fs.readFileSync(path.join(workspace, 'sito', 'index.html'), 'utf8'), '<h1>NexusNXS</h1>');
  assert.equal(item.runtime.undoTransaction(proposal.id).status, 'restored');
  assert.equal(fs.existsSync(path.join(workspace, 'sito', 'index.html')), false);
});
