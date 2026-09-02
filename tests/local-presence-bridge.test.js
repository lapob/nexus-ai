const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {
  bridgePaths,
  createLocalPresenceBridgeClient,
  createLocalPresenceBridgeServer,
  normalizePresenceSync
} = require('../src/remote/local-presence-bridge');

function fixture({ protectedToken = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-presence-bridge-'));
  const state = {
    available: true,
    nucleusVisible: true,
    fullAppOpen: false,
    applications: [{ id: 'notepad', label: 'Note', icon: 'note', available: true, open: false, canClose: false }],
    selectedDisplayId: 'primary',
    logicalDisplays: [
      { id: 'primary', name: 'Monitor privato', bounds: { x: -1920, y: 0, width: 3840, height: 2160 } },
      { id: 'display-2', handle: 'private-handle' }
    ],
    allowedActions: ['show-nucleus', 'hide-nucleus', 'open-full-app', 'select-display'],
    privateTopology: 'non esporre'
  };
  const actions = [];
  const snapshots = [];
  let unprotectCalls = 0;
  const protection = {
    protectSecret: (value) => Buffer.from(`test:${value}`, 'utf8').toString('base64'),
    unprotectSecret: (value) => {
      unprotectCalls += 1;
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (!decoded.startsWith('test:')) throw new Error('invalid test protection');
      return decoded.slice(5);
    }
  };
  const server = createLocalPresenceBridgeServer({
    sharedDataRoot: root,
    logger: { warn() {} },
    statusProvider: async () => state,
    actionExecutor: async (command) => {
      actions.push(command);
      if (command.action === 'show-nucleus') state.nucleusVisible = true;
      if (command.action === 'hide-nucleus') state.nucleusVisible = false;
      if (command.action === 'open-full-app') state.fullAppOpen = true;
      if (command.action === 'select-display') state.selectedDisplayId = command.displayId;
    },
    stateSynchronizer: async (snapshot) => snapshots.push(snapshot),
    ...(protectedToken ? { protectSecret: protection.protectSecret } : {})
  });
  const client = createLocalPresenceBridgeClient({
    sharedDataRoot: root,
    logger: { debug() {} },
    ...(protectedToken ? { unprotectSecret: protection.unprotectSecret } : {})
  });
  return { root, state, actions, snapshots, server, client, getUnprotectCalls: () => unprotectCalls };
}

test('il bridge usa solo IPC locale e percorsi distinti per profilo', () => {
  assert.throws(() => bridgePaths(''), { code: 'PRESENCE_BRIDGE_ROOT_MISSING' });
  const first = bridgePaths(path.join(os.tmpdir(), 'nexus-a'));
  const second = bridgePaths(path.join(os.tmpdir(), 'nexus-b'));
  assert.notEqual(first.endpoint, second.endpoint);
  assert.doesNotMatch(first.endpoint, /^https?:|:\d+$/);
  if (process.platform === 'win32') assert.match(first.endpoint, /^\\\\\.\\pipe\\nexusnxs-presence-/);
  else assert.match(first.endpoint, /\.sock$/);
});

test('Core e shell Presence sono collegati dal bridge senza condividere BrowserWindow', () => {
  const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'bootstrap.js'), 'utf8');
  const presence = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'presence-bootstrap.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'remote', 'local-presence-bridge.js'), 'utf8');
  assert.match(bootstrap, /createLocalPresenceBridgeClient\(\{[\s\S]*unprotectSecret:/);
  assert.match(bootstrap, /createHeadlessDesktopControl\(\{[\s\S]*bridgeClient:\s*presenceBridgeClient/);
  assert.match(bootstrap, /presenceStatusProvider:\s*\(\) => headlessDesktopControl\.status\(\)/);
  assert.match(bootstrap, /presenceActionExecutor:\s*\(command\) => headlessDesktopControl\.execute\(command\)/);
  assert.match(presence, /createLocalPresenceBridgeServer\(\{/);
  assert.match(presence, /await presenceBridge\.start\(\)/);
  assert.doesNotMatch(bridge, /require\(['"]electron['"]\)|BrowserWindow/);
});

test('su Windows il descrittore puo persistere soltanto il segreto protetto per utente', async () => {
  const { root, server, client, getUnprotectCalls } = fixture({ protectedToken: true });
  try {
    await server.start();
    const descriptor = JSON.parse(fs.readFileSync(bridgePaths(root).tokenPath, 'utf8'));
    assert.equal(typeof descriptor.protectedSecret, 'string');
    assert.equal('secret' in descriptor, false);
    assert.equal(JSON.stringify(descriptor).includes('test:'), false);
    assert.equal((await client.status()).available, true);
    assert.equal((await client.status()).available, true);
    assert.equal(getUnprotectCalls(), 1);

    const unauthorized = createLocalPresenceBridgeClient({ sharedDataRoot: root, logger: { debug() {} } });
    await assert.rejects(unauthorized.status(), { code: 'PRESENCE_BRIDGE_TOKEN_INVALID' });
    unauthorized.close();
  } finally {
    client.close();
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Core legge stato metadata-only ed esegue soltanto azioni allowlist', async () => {
  const { root, actions, server, client } = fixture();
  try {
    const started = await server.start();
    assert.equal(started.running, true);
    assert.equal(['named-pipe', 'unix-socket'].includes(started.transport), true);

    const initial = await client.status();
    assert.deepEqual(initial.logicalDisplays, [{ id: 'primary' }, { id: 'display-2' }]);
    assert.equal(initial.nucleusVisible, true);
    for (const privateValue of ['Monitor privato', 'private-handle', '3840', 'non esporre']) {
      assert.equal(JSON.stringify(initial).includes(privateValue), false);
    }

    const requestId = crypto.randomUUID();
    const hidden = await client.execute({ action: 'hide-nucleus', requestId });
    assert.equal(hidden.nucleusVisible, false);
    assert.equal(actions.length, 1);
    assert.equal(Object.isFrozen(actions[0]), true);
    assert.deepEqual(Object.keys(actions[0]).sort(), ['action', 'requestId', 'version']);

    // Una retry con lo stesso requestId restituisce la risposta memorizzata e
    // non riesegue l'effetto.
    const repeated = await client.execute({ action: 'hide-nucleus', requestId });
    assert.equal(repeated.nucleusVisible, false);
    assert.equal(actions.length, 1);

    await assert.rejects(
      client.execute({ action: 'show-nucleus', requestId }),
      { code: 'PRESENCE_BRIDGE_IDEMPOTENCY_CONFLICT' }
    );
    await assert.rejects(
      client.execute({ action: 'shell', command: 'whoami' }),
      { code: 'PRESENCE_ACTION_NOT_ALLOWED' }
    );
    assert.equal(actions.length, 1);
  } finally {
    client.close();
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la UI sincronizza soltanto stato visuale e preferenze Presence allowlist', async () => {
  const { root, snapshots, server, client } = fixture();
  try {
    await server.start();
    const snapshot = {
      state: 'thinking', appearance: 'neural', motion: 'full', quality: 'balanced',
      wakeWordEnabled: true, wakeWordConfidence: 0.9, wakeWordCooldownMs: 10000, wakeWordSuspended: false
    };
    assert.deepEqual(normalizePresenceSync(snapshot), snapshot);
    assert.deepEqual(await client.sync(snapshot), { synced: true });
    assert.equal(snapshots.length, 1);
    assert.deepEqual(snapshots[0], snapshot);
    assert.equal(Object.isFrozen(snapshots[0]), true);
    assert.throws(
      () => client.sync({ ...snapshot, path: 'C:\\private' }),
      { code: 'PRESENCE_SYNC_INVALID' }
    );
    assert.equal(snapshots.length, 1);
  } finally {
    client.close();
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('il ticket wake word è firmato, breve e consumabile una sola volta', async () => {
  const { root, server, client } = fixture({ protectedToken: true });
  try {
    await server.start();
    const ticket = server.createActivationTicket('voice');
    assert.match(ticket, /^[A-Za-z0-9_-]+$/);
    assert.equal(client.verifyActivationTicket(ticket, 'voice'), true);
    assert.equal(client.verifyActivationTicket(ticket, 'voice'), false);
    assert.equal(client.verifyActivationTicket(`${ticket.slice(0, -1)}A`, 'voice'), false);
  } finally {
    client.close();
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('frame non autenticati vengono chiusi senza eseguire azioni e lo shutdown fallisce chiuso', async () => {
  const { root, actions, server, client } = fixture();
  try {
    await server.start();
    const paths = bridgePaths(root);
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(paths.endpoint);
      const timeout = setTimeout(() => reject(new Error('timeout test bridge')), 2_000);
      socket.once('connect', () => socket.write(`${JSON.stringify({
        version: 1,
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        nonce: crypto.randomBytes(32).toString('base64url'),
        operation: 'action',
        payload: { action: 'hide-nucleus' },
        mac: 'invalid'
      })}\n`));
      socket.once('close', () => { clearTimeout(timeout); resolve(); });
      socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
    assert.equal(actions.length, 0);
    await server.stop();
    assert.equal(fs.existsSync(paths.tokenPath), false);
    await assert.rejects(client.status(), { code: 'PRESENCE_BRIDGE_OFFLINE' });
  } finally {
    client.close();
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
