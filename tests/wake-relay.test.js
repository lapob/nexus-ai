/**
 * @module tests/wake-relay
 * @description Verifica il relay Wake-on-LAN privato dietro Tailscale Serve.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SecurityEventStore } = require('../src/security/security-event-store');
const { WakeRelayServer, normalizeRelayConfig, trustedTailscaleServeRequest } = require('../src/remote/wake-relay');

const owner = 'owner@example.test';
const serveHost = 'wake-relay.example.ts.net';
const target = { id: 'workstation', label: 'Workstation NexusNXS', mac: '02:11:22:33:44:55', address: '192.168.1.255', port: 9 };

function tailnetHeaders(login = owner, extra = {}) {
  return { Host: serveHost, 'Tailscale-User-Login': login, ...extra };
}

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-wake-relay-'));
  const sent = [];
  const port = await freePort();
  const audit = new SecurityEventStore({ filePath: path.join(root, 'wake-audit.jsonl') });
  const relay = new WakeRelayServer({
    config: { listen: { host: '127.0.0.1', port }, trustedTailnetUsers: [owner], targets: [target] },
    statePath: path.join(root, 'wake-state.json'), securityEventStore: audit,
    sender: async (value) => { sent.push(value.id); return { targetId: value.id, sentAt: 1, packetsSent: 3 }; },
    logger: { warn() {} }
  });
  await relay.start();
  return { root, relay, audit, sent, baseUrl: `http://127.0.0.1:${port}` };
}

async function pair(relay, baseUrl, { scope } = {}) {
  const pairing = relay.createPairingCode({ tailnetUser: owner });
  const response = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: tailnetHeaders(owner, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code: pairing.code, deviceName: 'Telefono personale', ...(scope ? { scope } : {}) })
  });
  return { response, body: await response.json() };
}

test('la configurazione rifiuta listener pubblici, utenti mancanti e destinazioni non LAN', () => {
  assert.throws(() => normalizeRelayConfig({ host: '0.0.0.0', trustedTailnetUsers: [owner], targets: [target] }), /loopback/);
  assert.throws(() => normalizeRelayConfig({ trustedTailnetUsers: [], targets: [target] }), /identità Tailscale/);
  assert.throws(() => normalizeRelayConfig({ trustedTailnetUsers: [owner], targets: [{ ...target, address: '203.0.113.255' }] }), /LAN privato/);
  assert.throws(() => normalizeRelayConfig({ trustedTailnetUsers: [owner], targets: [{ ...target, port: 22 }] }), /porte UDP 7 o 9/);
});

test('il comando check valida il file locale senza stampare MAC o broadcast', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-wake-check-'));
  try {
    const configPath = path.join(root, 'wake-relay.local.json');
    fs.writeFileSync(configPath, JSON.stringify({
      listen: { host: '127.0.0.1', port: 32147 }, trustedTailnetUsers: [owner], targets: [target],
      statePath: './state.json', auditPath: './audit.jsonl'
    }));
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'run-wake-relay.js'), '--check', '--config', configPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"valid": true/);
    assert.match(result.stdout, /"id": "workstation"/);
    assert.doesNotMatch(result.stdout, /02:11|192\.168/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('il relay non espone API senza identità Tailscale Serve verificata', async () => {
  const item = await fixture();
  try {
    assert.equal(trustedTailscaleServeRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: serveHost } }), true);
    assert.equal(trustedTailscaleServeRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'ai.nexusnxs.com' } }), false);
    assert.equal((await fetch(`${item.baseUrl}/livez`)).status, 404, 'Funnel non riceve identità e non deve neppure esporre la liveness');
    assert.equal((await fetch(`${item.baseUrl}/livez`, { headers: tailnetHeaders() })).status, 200);
    assert.equal((await fetch(`${item.baseUrl}/livez`, { headers: tailnetHeaders(owner, { 'CF-Ray': 'public-ingress' }) })).status, 404);
    assert.equal((await fetch(`${item.baseUrl}/api/wake/capabilities`)).status, 404);
    assert.equal((await fetch(`${item.baseUrl}/api/wake/capabilities`, { headers: tailnetHeaders('intruder@example.test') })).status, 404);
    assert.ok(item.audit.summary().events.some((event) => event.type === 'wake.ingress_denied'));
  } finally {
    await item.relay.stop();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('pairing e scope sono decisi dal relay e il codice viene consumato su escalation', async () => {
  const item = await fixture();
  try {
    const denied = await pair(item.relay, item.baseUrl, { scope: 'console' });
    assert.equal(denied.response.status, 403);
    const replay = await fetch(`${item.baseUrl}/api/pair`, {
      method: 'POST', headers: tailnetHeaders(owner, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code: '000000', deviceName: 'Telefono' })
    });
    assert.equal(replay.status, 403);

    const paired = await pair(item.relay, item.baseUrl);
    assert.equal(paired.response.status, 201);
    assert.equal(paired.body.device.scope, 'wake');
    assert.ok(paired.body.token.length >= 32);
    assert.doesNotMatch(fs.readFileSync(path.join(item.root, 'wake-state.json'), 'utf8'), new RegExp(paired.body.token));
  } finally {
    await item.relay.stop();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('il flusso plan-approve-execute è allowlist-only, monouso e legato al dispositivo', async () => {
  const item = await fixture();
  try {
    const paired = await pair(item.relay, item.baseUrl);
    const headers = tailnetHeaders(owner, { Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' });
    const capabilities = await (await fetch(`${item.baseUrl}/api/wake/capabilities`, { headers })).json();
    assert.deepEqual(capabilities.targets, [{ id: 'workstation', label: 'Workstation NexusNXS' }]);
    assert.doesNotMatch(JSON.stringify(capabilities), /02:11|192\.168/);

    const unknown = await fetch(`${item.baseUrl}/api/wake/plan`, { method: 'POST', headers, body: JSON.stringify({ targetId: 'other' }) });
    assert.equal(unknown.status, 400);
    const planned = await (await fetch(`${item.baseUrl}/api/wake/plan`, { method: 'POST', headers, body: JSON.stringify({ targetId: 'workstation' }) })).json();
    const denied = await fetch(`${item.baseUrl}/api/wake/execute`, { method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: false }) });
    assert.equal(denied.status, 400);
    assert.deepEqual(item.sent, []);
    const consumed = await fetch(`${item.baseUrl}/api/wake/execute`, { method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: true }) });
    assert.equal(consumed.status, 400);

    const approved = await (await fetch(`${item.baseUrl}/api/wake/plan`, { method: 'POST', headers, body: JSON.stringify({ targetId: 'workstation' }) })).json();
    const executed = await (await fetch(`${item.baseUrl}/api/wake/execute`, { method: 'POST', headers, body: JSON.stringify({ ticketId: approved.proposal.id, approved: true }) })).json();
    assert.equal(executed.targetId, 'workstation');
    assert.equal(executed.packetsSent, 3);
    assert.deepEqual(item.sent, ['workstation']);
    assert.equal((await fetch(`${item.baseUrl}/api/wake/execute`, { method: 'POST', headers, body: JSON.stringify({ ticketId: approved.proposal.id, approved: true }) })).status, 400);
    assert.ok(item.audit.summary().events.some((event) => event.type === 'wake.executed'));
  } finally {
    await item.relay.stop();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('token e ticket restano legati alla stessa identità e la revoca annulla i piani', async () => {
  const item = await fixture();
  try {
    const paired = await pair(item.relay, item.baseUrl);
    const headers = tailnetHeaders(owner, { Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' });
    assert.equal((await fetch(`${item.baseUrl}/api/wake/capabilities`, { headers: { ...headers, 'Tailscale-User-Login': 'other@example.test' } })).status, 404);
    const planned = await (await fetch(`${item.baseUrl}/api/wake/plan`, { method: 'POST', headers, body: JSON.stringify({ targetId: 'workstation' }) })).json();
    assert.equal(item.relay.revokeDevice(paired.body.device.id), true);
    assert.equal((await fetch(`${item.baseUrl}/api/wake/execute`, { method: 'POST', headers, body: JSON.stringify({ ticketId: planned.proposal.id, approved: true }) })).status, 401);
    assert.deepEqual(item.sent, []);
  } finally {
    await item.relay.stop();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test('il dispositivo associato sopravvive al riavvio senza salvare il token in chiaro', async () => {
  const first = await fixture();
  let second;
  try {
    const paired = await pair(first.relay, first.baseUrl);
    const port = first.relay.config.port;
    await first.relay.stop();
    second = new WakeRelayServer({
      config: { listen: { host: '127.0.0.1', port }, trustedTailnetUsers: [owner], targets: [target] },
      statePath: path.join(first.root, 'wake-state.json'),
      securityEventStore: first.audit,
      sender: async () => ({ targetId: 'workstation', sentAt: 1, packetsSent: 3 }),
      logger: { warn() {} }
    });
    await second.start();
    const response = await fetch(`${first.baseUrl}/api/wake/capabilities`, {
      headers: tailnetHeaders(owner, { Authorization: `Bearer ${paired.body.token}` })
    });
    assert.equal(response.status, 200);
    assert.equal(second.status().devices.length, 1);
  } finally {
    await second?.stop();
    await first.relay.stop();
    fs.rmSync(first.root, { recursive: true, force: true });
  }
});

test('l audit pseudonimizza l identita tailnet e non conserva l email in chiaro', async () => {
  const item = await fixture();
  try {
    const paired = await pair(item.relay, item.baseUrl);
    assert.equal(paired.response.status, 201);
    const journal = fs.readFileSync(path.join(item.root, 'wake-audit.jsonl'), 'utf8');
    assert.doesNotMatch(journal, /owner@example\.test/i);
    assert.match(journal, /wake\.device_paired/);
  } finally {
    await item.relay.stop();
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});
