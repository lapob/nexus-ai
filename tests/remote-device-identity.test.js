const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  RemoteSessionGateway,
  parseDeviceIdentityEnrollment,
  verifyDevicePublicKeySignature
} = require('../src/remote/remote-session-gateway');
const { isVerifiedDeviceIdentity } = require('../src/security/device-identity');
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

async function pairConsole(baseUrl, gateway, identity = null, name = 'Console verificata') {
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

async function proof(baseUrl, paired, purpose, key = paired.key) {
  const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}/api/device/challenge`, {
    method: 'POST', headers, body: JSON.stringify({ purpose })
  });
  assert.equal(response.status, 201);
  const challenge = await response.json();
  return {
    challenge,
    deviceProof: {
      challengeId: challenge.challengeId,
      signature: crypto.sign(null, Buffer.from(challenge.payload, 'base64url'), key.privateKey).toString('base64url')
    }
  };
}

function gatewayFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-remote-device-'));
  let planIdentity = null;
  let executeIdentity = null;
  let sequence = 0;
  const gateway = new RemoteSessionGateway({
    statePath: path.join(root, 'remote-access.json'),
    conversationStore: { list: () => [], save: (record) => record },
    logger: { info() {}, warn() {} },
    onActionPlan: async ({ instruction, deviceIdentity }) => {
      planIdentity = deviceIdentity;
      sequence += 1;
      return {
        message: instruction,
        proposal: { id: `ticket-${sequence}`, summary: 'Verifica', preview: 'operazione', expiresAt: Date.now() + 60_000 }
      };
    },
    onActionExecute: async ({ deviceIdentity }) => {
      executeIdentity = deviceIdentity;
      return { message: 'Operazione completata.' };
    },
    powerExecutor: async () => ({ message: 'Operazione pianificata.' })
  });
  return {
    root,
    gateway,
    identities: () => ({ planIdentity, executeIdentity })
  };
}

test('l enrollment accetta SPKI Ed25519/P-256 e rifiuta algoritmi non previsti', () => {
  const elliptic = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const enrollment = parseDeviceIdentityEnrollment({
    algorithm: 'ecdsa-p256-sha256',
    publicKey: elliptic.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')
  }, 1234);
  const payload = Buffer.from('test-only-device-proof');
  const derSignature = crypto.sign('sha256', payload, elliptic.privateKey).toString('base64url');
  const p1363Signature = crypto.sign('sha256', payload, { key: elliptic.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  assert.equal(enrollment.algorithm, 'ecdsa-p256-sha256');
  assert.equal(enrollment.enrolledAt, 1234);
  assert.equal(verifyDevicePublicKeySignature(enrollment, payload, derSignature), true);
  assert.equal(verifyDevicePublicKeySignature(enrollment, payload, p1363Signature), true);

  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => parseDeviceIdentityEnrollment({
    publicKey: rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')
  }), (error) => error.code === 'DEVICE_IDENTITY_ALGORITHM_UNSUPPORTED');
});

test('il call path applicativo inoltra l identita opaca e richiede il livello forte solo quando enrolled', () => {
  const source = fs.readFileSync(require.resolve('../src/application/register-ipc'), 'utf8');
  assert.match(source, /actionRuntime\.propose\(directPlan, \{ subjectId: device\?\.id, deviceIdentity \}\)/);
  assert.match(source, /actionRuntime\.propose\(plan, \{ subjectId: device\?\.id, deviceIdentity \}\)/);
  assert.match(source, /requireVerifiedIdentity: Boolean\(deviceIdentity\)/);
});

test('un device enrolled usa challenge monouso e ticket legato alla stessa chiave', async () => {
  const fixture = gatewayFixture();
  const { root, gateway } = fixture;
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const paired = await pairConsole(baseUrl, gateway, deviceKey());
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };

    assert.equal(paired.identity.enrolled, true);
    assert.match(paired.identity.keyId, /^[a-f0-9]{64}$/);
    const capabilities = await (await fetch(`${baseUrl}/api/capabilities`, { headers })).json();
    assert.equal(capabilities.deviceIdentity.mode, 'signed-challenge-v1');
    assert.equal(capabilities.deviceIdentity.requiredForSensitiveActions, true);
    assert.equal(capabilities.actionReceipts.contents, 'metadata-only');

    const invalid = await proof(baseUrl, paired, 'action-plan');
    invalid.deviceProof.signature = crypto.randomBytes(64).toString('base64url');
    const rejected = await fetch(`${baseUrl}/api/actions/plan`, {
      method: 'POST', headers,
      body: JSON.stringify({ instruction: 'Non eseguire', deviceProof: invalid.deviceProof })
    });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).code, 'DEVICE_SIGNATURE_INVALID');
    assert.equal(fixture.identities().planIdentity, null);

    const signedPlan = await proof(baseUrl, paired, 'action-plan');
    const plannedResponse = await fetch(`${baseUrl}/api/actions/plan`, {
      method: 'POST', headers,
      body: JSON.stringify({ instruction: 'Esegui i controlli', deviceProof: signedPlan.deviceProof })
    });
    assert.equal(plannedResponse.status, 200);
    const planned = await plannedResponse.json();
    assert.equal(isVerifiedDeviceIdentity(fixture.identities().planIdentity), true);

    const replay = await fetch(`${baseUrl}/api/actions/plan`, {
      method: 'POST', headers,
      body: JSON.stringify({ instruction: 'Replay', deviceProof: signedPlan.deviceProof })
    });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).code, 'DEVICE_CHALLENGE_INVALID');

    const signedExecute = await proof(baseUrl, paired, 'action-execute');
    const executed = await fetch(`${baseUrl}/api/actions/execute`, {
      method: 'POST', headers,
      body: JSON.stringify({ ticketId: planned.proposal.id, approved: true, deviceProof: signedExecute.deviceProof })
    });
    assert.equal(executed.status, 200);
    assert.equal(isVerifiedDeviceIdentity(fixture.identities().executeIdentity), true);
    assert.equal(fixture.identities().executeIdentity.subjectId, fixture.identities().planIdentity.subjectId);

    const persisted = fs.readFileSync(path.join(root, 'remote-access.json'), 'utf8');
    assert.match(persisted, /"algorithm": "ed25519"/);
    assert.doesNotMatch(persisted, /privateKey|BEGIN PRIVATE KEY/);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la chiave di un altro device non puo consumare il ticket firmato', async () => {
  const fixture = gatewayFixture();
  const { root, gateway } = fixture;
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const owner = await pairConsole(baseUrl, gateway, deviceKey(), 'Owner');
    const intruder = await pairConsole(baseUrl, gateway, deviceKey(), 'Altro device');
    const ownerHeaders = { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' };
    const intruderHeaders = { Authorization: `Bearer ${intruder.token}`, 'Content-Type': 'application/json' };
    const planProof = await proof(baseUrl, owner, 'action-plan');
    const planned = await (await fetch(`${baseUrl}/api/actions/plan`, {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ instruction: 'Operazione owner', deviceProof: planProof.deviceProof })
    })).json();
    const executeProof = await proof(baseUrl, intruder, 'action-execute');
    const response = await fetch(`${baseUrl}/api/actions/execute`, {
      method: 'POST', headers: intruderHeaders,
      body: JSON.stringify({ ticketId: planned.proposal.id, approved: true, deviceProof: executeProof.deviceProof })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'ACTION_TICKET_IDENTITY_MISMATCH');
    assert.equal(fixture.identities().executeIdentity, null);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('power restituisce una ricevuta metadata-only verificabile', async () => {
  const fixture = gatewayFixture();
  const { root, gateway } = fixture;
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const paired = await pairConsole(baseUrl, gateway, deviceKey());
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
    const planProof = await proof(baseUrl, paired, 'power-plan');
    const planned = await (await fetch(`${baseUrl}/api/system/power/plan`, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'restart', deviceProof: planProof.deviceProof })
    })).json();
    const executeProof = await proof(baseUrl, paired, 'power-execute');
    const response = await fetch(`${baseUrl}/api/system/power/execute`, {
      method: 'POST', headers,
      body: JSON.stringify({ ticketId: planned.proposal.id, approved: true, deviceProof: executeProof.deviceProof })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(verifyReceiptDigest(result.receipt), true);
    assert.equal(result.receipt.subject.kind, 'verified-device');
    const serialized = JSON.stringify(result.receipt);
    assert.equal(serialized.includes(paired.device.id), false);
    assert.equal(serialized.includes(paired.identity.keyId), false);
    assert.equal(serialized.includes('restart'), false);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la migrazione legacy conserva i controlli precedenti senza fingere una identita verificata', async () => {
  const fixture = gatewayFixture();
  const { root, gateway } = fixture;
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const paired = await pairConsole(baseUrl, gateway);
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
    const capabilities = await (await fetch(`${baseUrl}/api/capabilities`, { headers })).json();
    assert.equal(capabilities.deviceIdentity.mode, 'legacy-token-bound');
    assert.equal(capabilities.deviceIdentity.upgradeRecommended, true);
    assert.equal((await fetch(`${baseUrl}/api/device/challenge`, {
      method: 'POST', headers, body: JSON.stringify({ purpose: 'action-plan' })
    })).status, 428);
    const planned = await (await fetch(`${baseUrl}/api/actions/plan`, {
      method: 'POST', headers, body: JSON.stringify({ instruction: 'Compatibilita legacy' })
    })).json();
    assert.equal(isVerifiedDeviceIdentity(fixture.identities().planIdentity), false);
    assert.equal((await fetch(`${baseUrl}/api/actions/execute`, {
      method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: false })
    })).status, 400);
    const executed = await fetch(`${baseUrl}/api/actions/execute`, {
      method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: true })
    });
    assert.equal(executed.status, 200);
    assert.equal(fixture.identities().executeIdentity, null);
  } finally {
    await gateway.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function pausedUpload(url, token, payload, headers = {}) {
  let request;
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const result = new Promise((resolve) => {
    request = http.request(url, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', 'Content-Length': bytes.length, ...headers }
    }, (response) => {
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode }));
    });
    request.once('error', () => resolve({ disconnected: true }));
    request.setTimeout(5000, () => request.destroy());
    request.write(bytes.subarray(0, 1));
  });
  return { result, finish: () => request.end(bytes.subarray(1)), destroy: () => request.destroy() };
}

for (const operation of ['action', 'power']) {
  test(`la revoca blocca una richiesta legacy ${operation} ancora in ricezione`, async () => {
    const { root, gateway } = gatewayFixture();
    let executions = 0;
    let upload;
    try {
      gateway.onActionExecute = async () => { executions += 1; return {}; };
      gateway.powerExecutor = async () => { executions += 1; return {}; };
      await gateway.configure({ enabled: true, port: await freePort() });
      const base = `http://127.0.0.1:${gateway.state.port}`;
      const paired = await pairConsole(base, gateway);
      const route = operation === 'action' ? '/api/actions' : '/api/system/power';
      const planned = await (await fetch(`${base}${route}/plan`, {
        method: 'POST', headers: { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(operation === 'action' ? { instruction: 'Controllo simulato' } : { action: 'restart' })
      })).json();
      const originalBody = gateway.body.bind(gateway);
      let entered;
      const receiving = new Promise(resolve => { entered = resolve; });
      gateway.body = (request) => {
        if (request.url === `${route}/execute`) entered();
        return originalBody(request);
      };
      upload = pausedUpload(`${base}${route}/execute`, paired.token, { ticketId: planned.proposal.id, approved: true });
      await receiving;
      gateway.revokeDevice(paired.device.id);
      upload.finish();
      const outcome = await upload.result;
      assert.ok(outcome.disconnected || outcome.status === 401, JSON.stringify(outcome));
      assert.equal(executions, 0);
    } finally { upload?.destroy(); await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('la revoca durante upload vocale firmato impedisce la trascrizione', async () => {
  const { root, gateway } = gatewayFixture();
  let upload;
  let transcriptions = 0;
  try {
    gateway.voiceTranscriber = async () => { transcriptions += 1; return { text: 'simulato' }; };
    await gateway.configure({ enabled: true, port: await freePort() });
    const base = `http://127.0.0.1:${gateway.state.port}`;
    const paired = await pairConsole(base, gateway, deviceKey());
    const signed = await proof(base, paired, 'voice-transcribe');
    const audio = Buffer.alloc(8044);
    audio.write('RIFF'); audio.writeUInt32LE(8036, 4); audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
    audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write('data', 36); audio.writeUInt32LE(8000, 40);
    let entered;
    const receiving = new Promise(resolve => { entered = resolve; });
    const original = gateway.rawBody.bind(gateway);
    gateway.rawBody = (request, limit) => { entered(); return original(request, limit); };
    upload = pausedUpload(`${base}/api/voice/transcribe`, paired.token, audio, {
      'Content-Type': 'audio/wav', 'X-Nexus-Device-Challenge': signed.deviceProof.challengeId,
      'X-Nexus-Device-Signature': signed.deviceProof.signature
    });
    await receiving;
    gateway.revokeDevice(paired.device.id);
    upload.finish();
    const outcome = await upload.result;
    assert.ok(outcome.disconnected || outcome.status === 401);
    assert.equal(transcriptions, 0);
  } finally { upload?.destroy(); await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

for (const boundary of ['proof', 'presence', 'planning']) {
  test(`la revoca durante attesa ${boundary} non avvia operazioni o ricrea ticket`, async () => {
    const { root, gateway } = gatewayFixture();
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    let entered;
    const arrived = new Promise(resolve => { entered = resolve; });
    let executions = 0;
    try {
      gateway.onActionExecute = async () => { executions += 1; return {}; };
      gateway.presenceStatusProvider = async () => ({ available: true, nucleusVisible: false, allowedActions: ['show-nucleus'] });
      gateway.presenceActionExecutor = async () => { executions += 1; };
      await gateway.configure({ enabled: true, port: await freePort() });
      const base = `http://127.0.0.1:${gateway.state.port}`;
      const paired = await pairConsole(base, gateway, boundary === 'proof' ? deviceKey() : null);
      const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
      const route = boundary === 'presence' ? '/api/presence' : '/api/actions';
      let payload = { instruction: 'Piano simulato' };
      let purpose = 'action-plan';
      if (boundary === 'presence') {
        const plan = await (await fetch(`${base}${route}/plan`, { method: 'POST', headers,
          body: JSON.stringify({ action: 'show-nucleus' }) })).json();
        payload = { ticketId: plan.proposal.id, approved: true };
        gateway.presenceStatusProvider = async () => { entered(); await waiting;
          return { available: true, nucleusVisible: false, allowedActions: ['show-nucleus'] }; };
      } else if (boundary === 'proof') {
        payload.deviceProof = (await proof(base, paired, purpose)).deviceProof;
        const original = gateway.deviceChallenges.verify.bind(gateway.deviceChallenges);
        gateway.deviceChallenges.verify = async input => { const identity = await original(input);
          entered(); await waiting; return identity; };
      } else {
        gateway.onActionPlan = async () => { entered(); await waiting;
          return { proposal: { id: 'late-ticket', expiresAt: Date.now() + 60000 } }; };
      }
      const pending = fetch(`${base}${route}/${boundary === 'presence' ? 'execute' : 'plan'}`, {
        method: 'POST', headers, body: JSON.stringify(payload)
      }).then(response => ({ status: response.status }), () => ({ disconnected: true }));
      await arrived;
      gateway.revokeDevice(paired.device.id);
      release();
      const outcome = await pending;
      await new Promise(setImmediate);
      assert.ok(outcome.disconnected || outcome.status === 401, JSON.stringify(outcome));
      assert.equal(executions, 0);
      assert.equal(gateway.privateActionTickets.size, 0);
      assert.equal(gateway.presenceTickets.size, 0);
    } finally { release(); await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('una rotazione valida conserva la richiesta in ricezione e il device non revocato', async () => {
  const { root, gateway } = gatewayFixture();
  let upload;
  try {
    await gateway.configure({ enabled: true, port: await freePort() });
    const base = `http://127.0.0.1:${gateway.state.port}`;
    const paired = await pairConsole(base, gateway);
    let entered;
    const receiving = new Promise(resolve => { entered = resolve; });
    const original = gateway.body.bind(gateway);
    gateway.body = (request) => { entered(); return original(request); };
    upload = pausedUpload(`${base}/api/actions/plan`, paired.token, { instruction: 'Rotazione valida' });
    await receiving;
    gateway.rotateDeviceToken(gateway.state.devices.find(device => device.id === paired.device.id));
    upload.finish();
    assert.equal((await upload.result).status, 200);
    assert.equal(gateway.privateActionTickets.size, 1);
    await new Promise(setImmediate);
    assert.equal(gateway.activeDeviceRequests.size, 0);
  } finally { upload?.destroy(); await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('una revoca dopo effetto presenza conserva la ricevuta finale locale', async () => {
  const { root, gateway } = gatewayFixture();
  let applied = false;
  let paired;
  try {
    gateway.presenceStatusProvider = async () => {
      if (applied) gateway.revokeDevice(paired.device.id);
      return { available: true, nucleusVisible: applied, allowedActions: ['show-nucleus'] };
    };
    gateway.presenceActionExecutor = async () => { applied = true; };
    await gateway.configure({ enabled: true, port: await freePort() });
    const base = `http://127.0.0.1:${gateway.state.port}`;
    paired = await pairConsole(base, gateway);
    const headers = { Authorization: `Bearer ${paired.token}`, 'Content-Type': 'application/json' };
    const plan = await (await fetch(`${base}/api/presence/plan`, { method: 'POST', headers,
      body: JSON.stringify({ action: 'show-nucleus' }) })).json();
    await fetch(`${base}/api/presence/execute`, { method: 'POST', headers,
      body: JSON.stringify({ ticketId: plan.proposal.id, approved: true }) }).catch(() => null);
    await new Promise(setImmediate);
    assert.equal(applied, true);
    const lines = fs.readFileSync(gateway.remoteReceiptPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].outcome, 'completed');
    assert.equal(lines[0].tool, 'desktop_presence');
  } finally { await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
