const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const {
  PRESENCE_ACTIONS,
  normalizeDesktopPresenceStatus,
  normalizePresenceAction,
  presenceActionChangesState
} = require('../src/remote/desktop-presence-contract');
const { verifyReceiptDigest } = require('../src/security/action-receipt');

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function deviceKey() {
  const keys = crypto.generateKeyPairSync('ed25519');
  return {
    keys,
    enrollment: {
      algorithm: 'ed25519',
      publicKey: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')
    }
  };
}

async function pairConsole(baseUrl, gateway, identity = null, name = 'Telefono privato') {
  const pairing = gateway.createPairingCode({ scope: 'console' });
  const response = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: `${baseUrl}/console` },
    body: JSON.stringify({
      code: pairing.code,
      scope: 'console',
      deviceName: name,
      ...(identity ? { deviceIdentity: identity.enrollment } : {})
    })
  });
  assert.equal(response.status, 201);
  return { ...(await response.json()), key: identity?.keys || null };
}

async function signedProof(baseUrl, paired, purpose) {
  const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}/api/device/challenge`, {
    method: 'POST', headers, body: JSON.stringify({ purpose })
  });
  assert.equal(response.status, 201);
  const challenge = await response.json();
  return {
    challengeId: challenge.challengeId,
    signature: crypto.sign(null, Buffer.from(challenge.payload, 'base64url'), paired.key.privateKey).toString('base64url')
  };
}

function fixture({ publicPort = 0 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-presence-'));
  const state = {
    available: true,
    nucleusVisible: false,
    fullAppOpen: false,
    chatGptOpen: false,
    applications: [{ id: 'notepad', label: 'Note', icon: 'note', available: true, open: false, canClose: true }],
    foregroundApplicationId: '',
    selectedDisplayId: 'display-primary',
    logicalDisplays: [
      { id: 'display-primary', name: 'Monitor principale privato', bounds: { x: 0, y: 0, width: 3840, height: 2160 }, handle: 'secret-handle-1' },
      { id: 'display-secondary', name: 'Monitor secondario privato', resolution: '2560x1440', handle: 'secret-handle-2' }
    ],
    allowedActions: [...PRESENCE_ACTIONS],
    monitorTopology: 'non deve uscire'
  };
  const commands = [];
  const gateway = new RemoteSessionGateway({
    statePath: path.join(root, 'remote-access.json'),
    conversationStore: { list: () => [], save: (record) => record },
    publicPort,
    logger: { info() {}, warn() {} },
    presenceStatusProvider: async () => state,
    presenceActionExecutor: async (command, context) => {
      commands.push({ command, context });
      if (command.action === 'show-nucleus') state.nucleusVisible = true;
      if (command.action === 'hide-nucleus') state.nucleusVisible = false;
      if (command.action === 'open-full-app') state.fullAppOpen = true;
      if (command.action === 'close-full-app') state.fullAppOpen = false;
      if (command.action === 'open-chatgpt') state.chatGptOpen = true;
      if (command.action === 'close-chatgpt') state.chatGptOpen = false;
      if (command.action === 'open-application') state.applications[0].open = true;
      if (command.action === 'close-application') { state.applications[0].open = false; state.foregroundApplicationId = ''; }
      if (command.action === 'select-display') state.selectedDisplayId = command.displayId;
    }
  });
  return { root, gateway, state, commands };
}

test('il contratto normalizza display logici e rifiuta comandi o parametri fuori allowlist', () => {
  const status = normalizeDesktopPresenceStatus({
    available: true,
    nucleusVisible: true,
    fullAppOpen: false,
    selectedDisplayId: 'primary',
    logicalDisplays: [
      { id: 'primary', name: 'dato privato', bounds: { x: -1920 } },
      { id: '../raw-monitor-handle' },
      { id: 'primary' }
    ],
    allowedActions: ['show-nucleus', 'shell', 'select-display']
  });
  assert.deepEqual(status.logicalDisplays, [{ id: 'primary', selected: true }]);
  assert.deepEqual(status.allowedActions, ['show-nucleus', 'select-display']);
  assert.equal(JSON.stringify(status).includes('dato privato'), false);
  assert.equal(presenceActionChangesState(status, normalizePresenceAction({ action: 'show-nucleus' })), false);
  assert.throws(() => normalizePresenceAction({ action: 'shell', command: 'whoami' }), (error) => error.code === 'PRESENCE_ACTION_NOT_ALLOWED');
  assert.throws(() => normalizePresenceAction({ action: 'show-nucleus', displayId: 'primary' }), (error) => error.code === 'PRESENCE_DISPLAY_UNEXPECTED');
  assert.throws(() => normalizePresenceAction({ action: 'select-display', displayId: '../monitor' }), (error) => error.code === 'PRESENCE_DISPLAY_INVALID');
  assert.throws(() => normalizePresenceAction({ action: 'open-application', applicationId: 'arbitrary' }), (error) => error.code === 'PRESENCE_APPLICATION_INVALID');
  const foreground = normalizeDesktopPresenceStatus({
    available: true,
    applications: [{ id: 'notepad', available: true, open: true, canClose: true }],
    foregroundApplicationId: 'notepad',
    allowedActions: ['close-application']
  });
  assert.equal(foreground.foregroundApplicationId, 'notepad');
  assert.equal(normalizeDesktopPresenceStatus({ ...foreground, foregroundApplicationId: 'explorer' }).foregroundApplicationId, '');
});

test('stato e capability non espongono dettagli monitor e ogni mutazione usa plan approval execute receipt', async () => {
  const { root, gateway, commands } = fixture();
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const paired = await pairConsole(baseUrl, gateway);
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };

    const capabilities = await (await fetch(`${baseUrl}/api/capabilities`, { headers })).json();
    assert.deepEqual(capabilities.desktopPresence.actions, PRESENCE_ACTIONS);
    assert.equal(capabilities.desktopPresence.workflow, 'plan-approval-execute-receipt-v1');
    const initial = await (await fetch(`${baseUrl}/api/presence/status`, { headers })).json();
    assert.equal(initial.available, true);
    assert.deepEqual(initial.logicalDisplays, [
      { id: 'display-primary', selected: true },
      { id: 'display-secondary', selected: false }
    ]);
    const serialized = JSON.stringify(initial);
    for (const secret of ['Monitor principale', '3840', 'secret-handle', 'monitorTopology']) {
      assert.equal(serialized.includes(secret), false);
    }

    const mutations = [
      { action: 'show-nucleus' },
      { action: 'hide-nucleus' },
      { action: 'open-full-app' },
      { action: 'close-full-app' },
      { action: 'open-chatgpt' },
      { action: 'close-chatgpt' },
      { action: 'open-application', applicationId: 'notepad' },
      { action: 'close-application', applicationId: 'notepad' },
      { action: 'select-display', displayId: 'display-secondary' }
    ];
    for (const mutation of mutations) {
      const plannedResponse = await fetch(`${baseUrl}/api/presence/plan`, {
        method: 'POST', headers, body: JSON.stringify(mutation)
      });
      assert.equal(plannedResponse.status, 200);
      const planned = await plannedResponse.json();
      assert.equal(planned.changed, true);
      assert.equal(planned.proposal.requiresApproval, true);

      const denied = await fetch(`${baseUrl}/api/presence/execute`, {
        method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: false })
      });
      assert.equal(denied.status, 400);

      const executed = await fetch(`${baseUrl}/api/presence/execute`, {
        method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: true })
      });
      assert.equal(executed.status, 200);
      const result = await executed.json();
      assert.equal(result.changed, true);
      assert.equal(verifyReceiptDigest(result.receipt), true);
      assert.equal(result.receipt.tool, 'desktop_presence');
      assert.equal(JSON.stringify(result.receipt).includes('display-secondary'), false);
    }
    assert.equal(commands.length, mutations.length);
    for (const { command } of commands) {
      assert.deepEqual(Object.keys(command).sort(), command.action === 'select-display'
        ? ['action', 'displayId', 'requestId', 'version']
        : ['open-application', 'close-application'].includes(command.action)
          ? ['action', 'applicationId', 'requestId', 'version']
          : ['action', 'requestId', 'version']);
      assert.equal('command' in command, false);
      assert.equal(Object.isFrozen(command), true);
    }

    const noChange = await (await fetch(`${baseUrl}/api/presence/plan`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'select-display', displayId: 'display-secondary' })
    })).json();
    assert.equal(noChange.changed, false);
    assert.equal(noChange.proposal, null);

    const chatGptNoChange = await (await fetch(`${baseUrl}/api/presence/plan`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'close-chatgpt' })
    })).json();
    assert.equal(chatGptNoChange.changed, false);
    assert.equal(chatGptNoChange.proposal, null);

    const unknownDisplay = await fetch(`${baseUrl}/api/presence/plan`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'select-display', displayId: 'display-missing' })
    });
    assert.equal(unknownDisplay.status, 409);
    assert.equal((await unknownDisplay.json()).code, 'PRESENCE_DISPLAY_UNAVAILABLE');
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('un device enrolled firma challenge presence e il ticket resta legato alla stessa identita', async () => {
  const { root, gateway, commands } = fixture();
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const paired = await pairConsole(baseUrl, gateway, deviceKey());
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };

    const unsigned = await fetch(`${baseUrl}/api/presence/plan`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'show-nucleus' })
    });
    assert.equal(unsigned.status, 401);
    assert.equal((await unsigned.json()).code, 'DEVICE_IDENTITY_PROOF_REQUIRED');

    const planProof = await signedProof(baseUrl, paired, 'presence-plan');
    const planned = await (await fetch(`${baseUrl}/api/presence/plan`, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'show-nucleus', deviceProof: planProof })
    })).json();
    assert.ok(planned.proposal.id);

    const unsignedExecute = await fetch(`${baseUrl}/api/presence/execute`, {
      method: 'POST', headers,
      body: JSON.stringify({ ticketId: planned.proposal.id, approved: true })
    });
    assert.equal(unsignedExecute.status, 401);
    assert.equal(commands.length, 0);

    const executeProof = await signedProof(baseUrl, paired, 'presence-execute');
    const executed = await fetch(`${baseUrl}/api/presence/execute`, {
      method: 'POST', headers,
      body: JSON.stringify({ ticketId: planned.proposal.id, approved: true, deviceProof: executeProof })
    });
    assert.equal(executed.status, 200);
    const result = await executed.json();
    assert.equal(result.receipt.subject.kind, 'verified-device');
    assert.equal(commands.length, 1);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('il public ingress restituisce 404 per stato, piano ed esecuzione presence', async () => {
  const publicPort = await freePort();
  const { root, gateway } = fixture({ publicPort });
  try {
    const privatePort = await freePort();
    await gateway.configure({ enabled: true, port: privatePort });
    const publicUrl = `http://127.0.0.1:${publicPort}`;
    assert.equal((await fetch(`${publicUrl}/api/presence/status`)).status, 404);
    assert.equal((await fetch(`${publicUrl}/api/presence/plan`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${publicUrl}/api/presence/execute`, { method: 'POST' })).status, 404);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
