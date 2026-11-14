const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createServerRescueGateway, launchManagedStart, START_PURPOSE } = require('../src/remote/server-rescue-gateway');

function enrolledDevice({ scope = 'console', identity = true } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const keyId = crypto.createHash('sha256').update('nexusnxs-device-public-key-v1\0').update(der).digest('hex');
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token, privateKey,
    record: {
      id: crypto.randomUUID(), name: 'Telefono', scope,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      ...(identity ? { identity: { version: 1, algorithm: 'ed25519', publicKey: der.toString('base64url'), keyId } } : {})
    }
  };
}

async function rescue(t, { devices = [], core = false, stopped = false, manager = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-rescue-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'remote-access.json'), JSON.stringify({ devices: devices.map((entry) => entry.record) }));
  if (stopped) fs.writeFileSync(path.join(root, 'server-stopped.flag'), 'x');
  const launches = [];
  const state = { core };
  const gateway = createServerRescueGateway({
    sharedDataRoot: root, projectRoot: root, port: 0,
    logger: { info() {}, warn() {} },
    probeCore: async () => state.core,
    launchStart: manager ? () => { const child = new EventEmitter(); launches.push(child); return child; } : null,
    managerPath: path.join(root, 'missing.ps1')
  });
  await gateway.start();
  t.after(() => gateway.stop());
  const call = async (method, route, { token, body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${gateway.port}${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: await response.json() };
  };
  return { root, gateway, launches, state, call };
}

async function signedStart(call, device) {
  const challenge = await call('POST', '/rescue/challenge', { token: device.token, body: { purpose: START_PURPOSE } });
  assert.equal(challenge.status, 201);
  const signature = crypto.sign(null, Buffer.from(challenge.body.payload, 'base64url'), device.privateKey).toString('base64url');
  return call('POST', '/rescue/start', { token: device.token, body: { deviceProof: { challengeId: challenge.body.challengeId, signature } } });
}

test('stato: senza token valido nessuna informazione, con token Console lo stato del Core', async (t) => {
  const phone = enrolledDevice();
  const { call } = await rescue(t, { devices: [phone], stopped: true });
  assert.equal((await call('GET', '/rescue/status')).status, 401);
  assert.equal((await call('GET', '/rescue/status', { token: 'x'.repeat(43) })).status, 401);
  const status = await call('GET', '/rescue/status', { token: phone.token });
  assert.equal(status.status, 200);
  assert.deepEqual([status.body.core, status.body.ownerStopped, status.body.canStart], ['offline', true, true]);
});

test('riaccensione: token e firma del dispositivo avviano il gestore coordinato una sola volta', async (t) => {
  const phone = enrolledDevice();
  const { call, launches, state } = await rescue(t, { devices: [phone], stopped: true });
  const started = await signedStart(call, phone);
  assert.equal(started.status, 202);
  assert.equal(started.body.accepted, true);
  assert.equal(started.body.ownerStopped, true);
  assert.equal(launches.length, 1);
  // Durante l'avvio un secondo tocco non lancia un altro gestore.
  assert.equal((await call('GET', '/rescue/status', { token: phone.token })).body.core, 'starting');
  assert.equal((await signedStart(call, phone)).body.reason, 'already-starting');
  assert.equal(launches.length, 1);
  state.core = true;
  assert.equal((await call('GET', '/rescue/status', { token: phone.token })).body.core, 'online');
  assert.equal((await signedStart(call, phone)).body.reason, 'already-online');
  assert.equal(launches.length, 1);
});

test('il lanciatore che si chiude subito con 0 non interrompe lo stato «in avvio»', async (t) => {
  const phone = enrolledDevice();
  const { call, launches } = await rescue(t, { devices: [phone] });
  assert.equal((await signedStart(call, phone)).status, 202);
  launches[0].emit('exit', 0);
  assert.equal((await call('GET', '/rescue/status', { token: phone.token })).body.core, 'starting');
});

test('dopo un avvio fallito resta la pausa di sicurezza prima di un nuovo tentativo', async (t) => {
  const phone = enrolledDevice();
  const { call, launches } = await rescue(t, { devices: [phone] });
  assert.equal((await signedStart(call, phone)).status, 202);
  launches[0].emit('exit', 1);
  const status = await call('GET', '/rescue/status', { token: phone.token });
  assert.equal(status.body.core, 'offline');
  assert.equal(status.body.canStart, false);
  assert.equal((await signedStart(call, phone)).status, 429);
  assert.equal(launches.length, 1);
});

test('firma errata, challenge riusata o di un altro dispositivo: nessuna riaccensione', async (t) => {
  const phone = enrolledDevice();
  const other = enrolledDevice();
  const { call, launches } = await rescue(t, { devices: [phone, other] });
  const challenge = await call('POST', '/rescue/challenge', { token: phone.token, body: { purpose: START_PURPOSE } });
  const forged = crypto.sign(null, Buffer.from(challenge.body.payload, 'base64url'), other.privateKey).toString('base64url');
  assert.equal((await call('POST', '/rescue/start', { token: phone.token, body: { deviceProof: { challengeId: challenge.body.challengeId, signature: forged } } })).status, 401);
  const valid = crypto.sign(null, Buffer.from(challenge.body.payload, 'base64url'), phone.privateKey).toString('base64url');
  // La challenge è stata consumata dal tentativo fallito.
  assert.equal((await call('POST', '/rescue/start', { token: phone.token, body: { deviceProof: { challengeId: challenge.body.challengeId, signature: valid } } })).status, 401);
  // La challenge di un dispositivo non vale con il token di un altro.
  const foreign = await call('POST', '/rescue/challenge', { token: other.token, body: { purpose: START_PURPOSE } });
  const signedByPhone = crypto.sign(null, Buffer.from(foreign.body.payload, 'base64url'), phone.privateKey).toString('base64url');
  assert.equal((await call('POST', '/rescue/start', { token: phone.token, body: { deviceProof: { challengeId: foreign.body.challengeId, signature: signedByPhone } } })).status, 401);
  assert.equal((await call('POST', '/rescue/start', { token: phone.token, body: {} })).status, 401);
  assert.equal((await call('POST', '/rescue/challenge', { token: phone.token, body: { purpose: 'power-execute' } })).status, 400);
  assert.equal(launches.length, 0);
});

test('fallisce chiuso: scope chat, dispositivo senza chiave iscritta o revocato', async (t) => {
  const chat = enrolledDevice({ scope: 'chat' });
  const legacy = enrolledDevice({ identity: false });
  const revoked = enrolledDevice();
  const { root, call, launches } = await rescue(t, { devices: [chat, legacy, revoked] });
  assert.equal((await call('GET', '/rescue/status', { token: chat.token })).status, 403);
  assert.equal((await call('GET', '/rescue/status', { token: legacy.token })).status, 428);
  const challenge = await call('POST', '/rescue/challenge', { token: revoked.token, body: { purpose: START_PURPOSE } });
  fs.writeFileSync(path.join(root, 'data', 'remote-access.json'), JSON.stringify({ devices: [] }));
  const signature = crypto.sign(null, Buffer.from(challenge.body.payload, 'base64url'), revoked.privateKey).toString('base64url');
  assert.equal((await call('POST', '/rescue/start', { token: revoked.token, body: { deviceProof: { challengeId: challenge.body.challengeId, signature } } })).status, 401);
  assert.equal(launches.length, 0);
  assert.equal((await call('GET', '/other', { token: revoked.token })).status, 404);
});

test('gestore assente: lo stato dice che la riaccensione non è disponibile', async (t) => {
  const phone = enrolledDevice();
  const { call } = await rescue(t, { devices: [phone], manager: false });
  assert.equal((await call('GET', '/rescue/status', { token: phone.token })).body.canStart, false);
});

test('il gestore parte nascosto con -Action start, senza finestra', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-rescue-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let seen;
  const child = launchManagedStart({
    managerPath: path.join(root, 'scripts', 'manage-headless-server-task.ps1'),
    logPath: path.join(root, 'logs', 'server-rescue.log'),
    env: { SystemRoot: 'C:\\Windows' },
    spawnImpl: (file, args, options) => { seen = { file, args, options }; return { unref() {} }; }
  });
  assert.ok(child);
  assert.match(seen.file, /conhost\.exe$/i);
  assert.equal(seen.args[0], '--headless');
  assert.deepEqual(seen.args.slice(-2), ['-Action', 'start']);
  assert.equal(seen.options.windowsHide, true);
  assert.equal(seen.options.detached, true);
});
