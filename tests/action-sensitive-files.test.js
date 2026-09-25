const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ActionRuntime } = require('../src/agents/action-runtime');

const SECRET = '{"token":"synthetic-protected-value"}\n';
const protectedError = /materiale riservato|cartelle interne/;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sensitive-actions-'));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const runtime = new ActionRuntime({
    vaultPath: workspace,
    userPath: workspace,
    auditPath: path.join(root, 'data', 'audit.jsonl'),
    shell: {}, logger: { warn() {} }
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 }));
  return { root, workspace, runtime };
}

function fileAlias(t, source, target) {
  try { fs.symlinkSync(source, target, 'file'); return true; }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('File symlinks are unavailable for this test account.');
      return false;
    }
    throw error;
  }
}

for (const tool of ['write_file', 'write_files', 'copy_path', 'move_path']) {
  test(`${tool} cannot disclose a protected file through a sibling operation`, (t) => {
    const { workspace, runtime } = fixture(t);
    for (const name of ['credentials.json', 'secrets.txt', 'id_ed25519', 'service.pem']) {
      const source = path.join(workspace, name);
      fs.writeFileSync(source, SECRET);
      const args = tool === 'write_files' ? { files: [{ path: name, content: '{}' }] }
        : tool === 'write_file' ? { path: name, content: '{}' }
          : { source: name, destination: 'ordinary.txt' };
      assert.throws(() => runtime.propose({ summary: 'Protected content boundary', tool, arguments: args }), protectedError);
      assert.equal(fs.readFileSync(source, 'utf8'), SECRET);
    }
    assert.equal(runtime.tickets.size, 0);
    assert.equal(fs.existsSync(path.join(workspace, 'ordinary.txt')), false);
    assert.equal(fs.existsSync(runtime.checkpointDirectory), false);
  });
}

for (const tool of ['copy_path', 'move_path']) {
  test(`${tool} rejects protected descendants before copying a directory`, (t) => {
    const { workspace, runtime } = fixture(t);
    for (const name of ['credentials.json', '.env']) {
      const directory = path.join(workspace, 'project');
      fs.mkdirSync(path.join(directory, 'config'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'config', name), SECRET);
      assert.throws(() => runtime.propose({ summary: 'Copy project', tool, arguments: { source: 'project', destination: 'output' } }), protectedError);
      fs.rmSync(directory, { recursive: true, force: true });
    }
    assert.equal(fs.existsSync(path.join(workspace, 'output')), false);
  });

  test(`${tool} rechecks descendants added after the proposal`, async (t) => {
    const { workspace, runtime } = fixture(t);
    const directory = path.join(workspace, 'project');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'README.md'), 'ordinary');
    const proposal = runtime.propose({ summary: 'Copy project', tool, arguments: { source: 'project', destination: 'output' } });
    fs.writeFileSync(path.join(directory, 'credentials.json'), SECRET);
    await assert.rejects(runtime.execute(proposal.id, { approved: true }), protectedError);
    assert.equal(fs.readFileSync(path.join(directory, 'credentials.json'), 'utf8'), SECRET);
    assert.equal(fs.existsSync(path.join(workspace, 'output')), false);
    assert.equal(runtime.tickets.has(proposal.id), false);
  });
}

test('a file symlink cannot disguise a protected target from previews or copies', (t) => {
  const { workspace, runtime } = fixture(t);
  const secret = path.join(workspace, 'credentials.json');
  fs.writeFileSync(secret, SECRET);
  if (!fileAlias(t, secret, path.join(workspace, 'ordinary.txt'))) return;
  for (const [tool, args] of [
    ['write_file', { path: 'ordinary.txt', content: '{}' }],
    ['write_files', { files: [{ path: 'ordinary.txt', content: '{}' }] }],
    ['copy_path', { source: 'ordinary.txt', destination: 'copy.txt' }],
    ['move_path', { source: 'ordinary.txt', destination: 'copy.txt' }]
  ]) assert.throws(() => runtime.propose({ summary: 'Alias boundary', tool, arguments: args }), protectedError);
  assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
});

test('new files under a junction into a protected directory are rejected', (t) => {
  const { workspace, runtime } = fixture(t);
  const secretDirectory = path.join(workspace, 'secrets');
  fs.mkdirSync(secretDirectory);
  fs.symlinkSync(secretDirectory, path.join(workspace, 'ordinary'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => runtime.propose({ summary: 'Write alias', tool: 'write_file', arguments: { path: 'ordinary/new.txt', content: 'ordinary' } }), protectedError);
  assert.equal(fs.existsSync(path.join(secretDirectory, 'new.txt')), false);
});

for (const tool of ['write_file', 'write_files']) {
  test(`${tool} rechecks a parent replaced by a protected junction`, async (t) => {
    const { workspace, runtime } = fixture(t);
    const secretDirectory = path.join(workspace, 'secrets');
    const ordinaryDirectory = path.join(workspace, 'ordinary');
    fs.mkdirSync(secretDirectory);
    fs.mkdirSync(ordinaryDirectory);
    const secret = path.join(secretDirectory, 'data.txt');
    const ordinary = path.join(ordinaryDirectory, 'data.txt');
    fs.writeFileSync(secret, SECRET);
    fs.writeFileSync(ordinary, 'ordinary');
    const args = tool === 'write_file' ? { path: 'ordinary/data.txt', content: '{}' }
      : { files: [{ path: 'ordinary/data.txt', content: '{}' }] };
    const proposal = runtime.propose({ summary: 'Update ordinary file', tool, arguments: args });
    fs.rmSync(ordinaryDirectory, { recursive: true, force: true });
    fs.symlinkSync(secretDirectory, ordinaryDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(runtime.execute(proposal.id, { approved: true }), protectedError);
    assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
    assert.equal(fs.existsSync(runtime.checkpointDirectory), false);
  });
}

test('directory copies validate canonical descendants reached through junctions', (t) => {
  const { workspace, runtime } = fixture(t);
  fs.mkdirSync(path.join(workspace, 'project'));
  fs.mkdirSync(path.join(workspace, 'elsewhere'));
  fs.writeFileSync(path.join(workspace, 'elsewhere', 'credentials.json'), SECRET);
  fs.symlinkSync(path.join(workspace, 'elsewhere'), path.join(workspace, 'project', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const tool of ['copy_path', 'move_path']) {
    assert.throws(() => runtime.propose({ summary: 'Copy alias project', tool, arguments: { source: 'project', destination: 'output' } }), protectedError);
  }
});

test('directory verification accepts a cycle of ordinary internal junctions', (t) => {
  const { workspace, runtime } = fixture(t);
  const source = path.join(workspace, 'project');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), 'ordinary');
  fs.symlinkSync(source, path.join(source, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
  const proposal = runtime.propose({ summary: 'Copy ordinary aliases', tool: 'copy_path', arguments: { source: 'project', destination: 'output' } });
  assert.equal(proposal.phase, 'dry-run');
});

test('directory verification fails closed on an excessively deep tree', (t) => {
  const { workspace, runtime } = fixture(t);
  const source = path.join(workspace, 'deep');
  fs.mkdirSync(path.join(source, ...Array(65).fill('a')), { recursive: true });
  assert.throws(() => runtime.propose({ summary: 'Copy deep tree', tool: 'copy_path', arguments: { source: 'deep', destination: 'output' } }), { code: 'ACTION_TREE_LIMIT' });
  assert.equal(fs.existsSync(path.join(workspace, 'output')), false);
});

test('Windows stream syntax cannot disguise a protected basename', { skip: process.platform !== 'win32' }, (t) => {
  const { workspace, runtime } = fixture(t);
  fs.writeFileSync(path.join(workspace, 'credentials.json'), SECRET);
  assert.throws(() => runtime.propose({ summary: 'Read alias', tool: 'read_file', arguments: { path: 'credentials.json::$DATA' } }), protectedError);
});

test('Windows content guards use native canonical paths for targets and ancestors', { skip: process.platform !== 'win32' }, (t) => {
  const { workspace, runtime } = fixture(t);
  const secret = path.join(workspace, 'credentials.json');
  const alias = path.join(workspace, 'ordinary.txt');
  const secretDirectory = path.join(workspace, 'credentials');
  const aliasDirectory = path.join(workspace, 'ordinary');
  fs.writeFileSync(secret, SECRET);
  fs.writeFileSync(alias, 'ordinary');
  fs.mkdirSync(secretDirectory);
  fs.mkdirSync(aliasDirectory);
  const native = fs.realpathSync.native;
  const calls = [];
  // Model Windows 8.3 aliases even when creation of short names is disabled.
  // The JS resolver retains the innocuous spelling; only native reveals it.
  t.mock.method(fs.realpathSync, 'native', (value, options) => {
    calls.push(String(value));
    return native(value === alias ? secret : value === aliasDirectory ? secretDirectory : value, options);
  });
  for (const [tool, args] of [
    ['read_file', { path: 'ordinary.txt' }],
    ['write_file', { path: 'ordinary.txt', content: '{}' }],
    ['write_files', { files: [{ path: 'ordinary.txt', content: '{}' }] }],
    ['copy_path', { source: 'ordinary.txt', destination: 'copy.txt' }],
    ['move_path', { source: 'ordinary.txt', destination: 'copy.txt' }],
    ['write_file', { path: 'ordinary/new.txt', content: '{}' }],
    ['write_files', { files: [{ path: 'ordinary/new.txt', content: '{}' }] }],
    ['copy_path', { source: 'ordinary.txt', destination: 'ordinary/new.txt' }]
  ]) assert.throws(() => runtime.propose({ summary: 'Native canonical boundary', tool, arguments: args }), protectedError);
  assert.ok(calls.includes(workspace), 'the workspace root must use the same native representation');
  assert.ok(calls.includes(alias));
  assert.ok(calls.includes(aliasDirectory), 'nonexistent destinations must validate the existing ancestor');
  assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
  assert.equal(runtime.tickets.size, 0);
});

test('Windows execution repeats native target validation after proposal', { skip: process.platform !== 'win32' }, async (t) => {
  const { workspace, runtime } = fixture(t);
  const alias = path.join(workspace, 'ordinary.txt');
  const secret = path.join(workspace, 'credentials.json');
  fs.writeFileSync(alias, 'ordinary');
  fs.writeFileSync(secret, SECRET);
  const proposal = runtime.propose({ summary: 'Write ordinary file', tool: 'write_file', arguments: { path: 'ordinary.txt', content: '{}' } });
  const native = fs.realpathSync.native;
  t.mock.method(fs.realpathSync, 'native', (value, options) => native(value === alias ? secret : value, options));
  await assert.rejects(runtime.execute(proposal.id, { approved: true }), protectedError);
  assert.equal(fs.readFileSync(alias, 'utf8'), 'ordinary');
  assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
  assert.equal(fs.existsSync(runtime.checkpointDirectory), false);
});

test('native authorization preserves a legacy alias root across execution and rollback', { skip: process.platform !== 'win32' }, async (t) => {
  const { root, workspace, runtime } = fixture(t);
  const aliasRoot = path.join(root, 'workspace-alias');
  fs.symlinkSync(workspace, aliasRoot, 'junction');
  const legacy = fs.realpathSync;
  // A real junction provides filesystem access; this shim models JS realpath
  // retaining a Windows short root while native expands its long spelling.
  const legacyAlias = (value, options) => String(value) === aliasRoot || String(value).startsWith(`${aliasRoot}${path.sep}`)
    ? String(value) : legacy(value, options);
  legacyAlias.native = legacy.native;
  t.mock.method(fs, 'realpathSync', legacyAlias);
  runtime.setWorkspaceRoot(aliasRoot);
  assert.equal(runtime.vaultPath, aliasRoot);
  const target = path.join(aliasRoot, 'notes.txt');
  fs.writeFileSync(target, 'before');
  const checkpoint = runtime.createWriteCheckpoint(target, 'legacy-alias-root', 'after');
  fs.writeFileSync(target, 'after');
  runtime.commitWriteCheckpoint(checkpoint, target);
  const proposal = runtime.propose({ summary: 'Read ordinary alias file', tool: 'read_file', arguments: { path: 'notes.txt' } });
  const result = await runtime.execute(proposal.id, { approved: true });
  assert.equal(result.stdout, 'after');
  assert.equal(runtime.undoLastWrite().status, 'restored');
  assert.equal(fs.readFileSync(target, 'utf8'), 'before');
});

function windowsShortPath(target) {
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/c', 'for %I in ("%NEXUS_SHORT_PATH_QUERY%") do @echo %~sI'], {
    encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true,
    env: { ...process.env, NEXUS_SHORT_PATH_QUERY: target }
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('real Windows 8.3 file and directory aliases cannot disclose protected content', { skip: process.platform !== 'win32' }, (t) => {
  const { workspace, runtime } = fixture(t);
  const secret = path.join(workspace, 'credentials.json');
  const directory = path.join(workspace, 'credentials');
  fs.writeFileSync(secret, SECRET);
  fs.mkdirSync(directory);
  const fileAliasName = path.basename(windowsShortPath(secret));
  const directoryAliasName = path.basename(windowsShortPath(directory));
  if (fileAliasName.toLowerCase() === 'credentials.json' || directoryAliasName.toLowerCase() === 'credentials') {
    t.skip('The temporary volume does not create the required 8.3 aliases; native guard behavior is covered separately.');
    return;
  }
  assert.equal(fs.realpathSync.native(path.join(workspace, fileAliasName)), fs.realpathSync.native(secret));
  for (const [tool, args] of [
    ['read_file', { path: fileAliasName }],
    ['write_file', { path: fileAliasName, content: '{}' }],
    ['write_files', { files: [{ path: fileAliasName, content: '{}' }] }],
    ['copy_path', { source: fileAliasName, destination: 'ordinary.txt' }],
    ['move_path', { source: fileAliasName, destination: 'ordinary.txt' }],
    ['write_file', { path: `${directoryAliasName}/new.txt`, content: '{}' }]
  ]) assert.throws(() => runtime.propose({ summary: 'Real 8.3 boundary', tool, arguments: args }), protectedError);
  assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
});

test('Windows native realpath expands an existing system short name without reading its contents', { skip: process.platform !== 'win32' }, (t) => {
  const alias = path.join(process.env.SystemDrive || 'C:', 'PROGRA~1');
  if (!fs.existsSync(alias)) { t.skip('No preexisting Program Files short alias on this system.'); return; }
  assert.notEqual(fs.realpathSync.native(alias).toLowerCase(), fs.realpathSync(alias).toLowerCase());
  assert.equal(path.basename(fs.realpathSync.native(alias)).toLowerCase(), 'program files');
});

test('an ordinary project can still be written, copied, moved and read', async (t) => {
  const { workspace, runtime } = fixture(t);
  const perform = async (tool, args) => {
    const proposal = runtime.propose({ summary: 'Ordinary project', tool, arguments: args });
    return runtime.execute(proposal.id, { approved: true });
  };
  await perform('write_files', { files: [{ path: 'project/README.md', content: '# Ordinary' }, { path: 'project/src/main.js', content: '42' }] });
  await perform('copy_path', { source: 'project', destination: 'copy' });
  await perform('move_path', { source: 'copy', destination: 'moved' });
  const read = await perform('read_file', { path: 'moved/src/main.js' });
  assert.equal(read.stdout, '42');
  assert.equal(fs.existsSync(path.join(workspace, 'project/README.md')), true);
});

test('legacy protected-file checkpoints remain restorable without returning their contents', (t) => {
  const { workspace, runtime } = fixture(t);
  const secret = path.join(workspace, 'credentials.json');
  fs.writeFileSync(secret, SECRET);
  // Simulate a checkpoint written by the previous runtime, before enforcement.
  const checkpoint = runtime.createWriteCheckpoint(secret, 'legacy-action', '{}');
  fs.writeFileSync(secret, '{}');
  runtime.commitWriteCheckpoint(checkpoint, secret);
  const result = runtime.undoLastWrite();
  assert.equal(result.status, 'restored');
  assert.equal(fs.readFileSync(secret, 'utf8'), SECRET);
  assert.equal(JSON.stringify(result).includes('synthetic-protected-value'), false);
});
