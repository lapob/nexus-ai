const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DeviceNotificationHub, MAX_WAIT_MS } = require('../src/remote/device-notification-hub');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { ActionRuntime } = require('../src/agents/action-runtime');

function manualClock(start = 1_000_000) {
  let now = start;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
      }
    },
    pending: () => timers.size
  };
}

function hub(clock, options = {}) {
  return new DeviceNotificationHub({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, longGenerationMs: 20_000, consentGraceMs: 20_000, ...options });
}

// #region Hub

test('risposta pronta solo per generazioni lunghe e senza contenuto', () => {
  const clock = manualClock();
  const notifications = hub(clock);
  assert.equal(notifications.publish('response-ready', { reference: 'conversation:a', durationMs: 4_000 }), null, 'una risposta breve non notifica');
  const event = notifications.publish('response-ready', { reference: 'conversation:a', durationMs: 25_000 });
  assert.equal(event.kind, 'response-ready');
  assert.equal(event.link, 'nexusnxs-control://open/response');
  assert.deepEqual(Object.keys(event).sort(), ['createdAt', 'cursor', 'expiresAt', 'id', 'kind', 'link']);
  assert.ok(!JSON.stringify(event).includes('conversation:a'), 'il riferimento interno non esce dal server');
  assert.equal(notifications.publish('unknown-kind', { durationMs: 99_999 }), null);
});

test('il primo ascolto riceve solo la base corrente, poi gli eventi successivi', () => {
  const clock = manualClock();
  const notifications = hub(clock);
  notifications.publish('response-ready', { reference: 'old', durationMs: 30_000 });
  const baseline = notifications.list({});
  assert.equal(baseline.events.length, 0, 'nessuno storico al primo ascolto');
  assert.equal(baseline.cursor, 1);
  notifications.publish('response-ready', { reference: 'new', durationMs: 30_000 });
  const next = notifications.list({ since: baseline.cursor, instance: baseline.instance });
  assert.equal(next.events.length, 1);
  assert.equal(next.cursor, 2);
  assert.equal(notifications.list({ since: next.cursor, instance: next.instance }).events.length, 0);
});

test('dopo un riavvio del server il vecchio cursore non nasconde eventi nuovi', () => {
  const clock = manualClock();
  const notifications = hub(clock);
  notifications.publish('response-ready', { reference: 'x', durationMs: 30_000 });
  const result = notifications.list({ since: 57, instance: 'istanza-precedente' });
  assert.equal(result.events.length, 1);
  assert.notEqual(result.instance, 'istanza-precedente');
});

test('consenso richiesto attende la tolleranza e si ritira se deciso al computer', () => {
  const clock = manualClock();
  const notifications = hub(clock);
  const base = notifications.list({});
  assert.deepEqual(notifications.publish('consent-required', { reference: 'proposal:1', expiresAt: clock.now() + 600_000 }), { scheduled: true });
  assert.equal(notifications.list({ since: base.cursor, instance: base.instance }).events.length, 0, 'nessun evento durante la tolleranza');
  notifications.resolve('proposal:1');
  clock.advance(25_000);
  assert.equal(notifications.list({ since: base.cursor, instance: base.instance }).events.length, 0, 'conferma rapida: telefono silenzioso');

  notifications.publish('consent-required', { reference: 'proposal:2', expiresAt: clock.now() + 600_000 });
  clock.advance(20_000);
  const pending = notifications.list({ since: base.cursor, instance: base.instance });
  assert.equal(pending.events.length, 1);
  assert.equal(pending.events[0].link, 'nexusnxs-control://open/consent');
  notifications.resolve('proposal:2');
  assert.equal(notifications.list({ since: base.cursor, instance: base.instance }).events.length, 0, 'deciso: evento ritirato');
});

test('consenso e risposta scadono e i duplicati vengono accorpati', () => {
  const clock = manualClock();
  const notifications = hub(clock, { consentGraceMs: 0 });
  const base = notifications.list({});
  notifications.publish('consent-required', { reference: 'proposal:3', expiresAt: clock.now() + 5_000 });
  notifications.publish('response-ready', { reference: 'conversation:z', durationMs: 30_000 });
  notifications.publish('response-ready', { reference: 'conversation:z', durationMs: 30_000 });
  assert.equal(notifications.list({ since: base.cursor, instance: base.instance }).events.length, 2, 'stessa conversazione: un solo evento');
  clock.advance(6_000);
  const afterConsentExpiry = notifications.list({ since: base.cursor, instance: base.instance });
  assert.deepEqual(afterConsentExpiry.events.map((event) => event.kind), ['response-ready']);
  clock.advance(31 * 60 * 1000);
  assert.equal(notifications.list({ since: base.cursor, instance: base.instance }).events.length, 0);
});

test('il long-poll si sblocca alla pubblicazione, al timeout o all’annullamento', async () => {
  const clock = manualClock();
  const notifications = hub(clock, { consentGraceMs: 0 });
  const base = notifications.list({});
  const waiting = notifications.wait({ since: base.cursor, instance: base.instance, timeoutMs: 50_000 });
  assert.equal(notifications.status().waiters, 1);
  notifications.publish('consent-required', { reference: 'proposal:4' });
  const woke = await waiting;
  assert.equal(woke.events.length, 1);
  assert.equal(notifications.status().waiters, 0);

  const timed = notifications.wait({ since: woke.cursor, instance: woke.instance, timeoutMs: 10_000 });
  clock.advance(10_000);
  assert.equal((await timed).events.length, 0);

  const controller = new AbortController();
  const aborted = notifications.wait({ since: woke.cursor, instance: woke.instance, timeoutMs: 10_000, signal: controller.signal });
  controller.abort();
  assert.equal((await aborted).events.length, 0);
  assert.equal(clock.pending(), 0, 'nessun timer residuo');

  const capped = notifications.wait({ since: woke.cursor, instance: woke.instance, timeoutMs: 10 * MAX_WAIT_MS });
  clock.advance(MAX_WAIT_MS);
  await capped;
});

test('un consenso già notificato e poi ritirato sblocca il long-poll con consentActive falso', async () => {
  const clock = manualClock();
  const notifications = hub(clock);
  const base = notifications.list({});
  assert.equal(base.consentActive, false);
  notifications.publish('consent-required', { reference: 'proposal:5', expiresAt: clock.now() + 600_000 });
  clock.advance(20_000);
  const delivered = notifications.list({ since: base.cursor, instance: base.instance });
  assert.equal(delivered.events.length, 1);
  assert.equal(delivered.consentActive, true, 'il telefono sa che il consenso attende ancora');

  const waiting = notifications.wait({ since: delivered.cursor, instance: delivered.instance, timeoutMs: 50_000 });
  assert.equal(notifications.status().waiters, 1);
  notifications.resolve('proposal:5');
  const woke = await waiting;
  assert.equal(woke.events.length, 0, 'nessun nuovo evento da mostrare');
  assert.equal(woke.consentActive, false, 'ritirato: il telefono toglie la notifica');
  assert.equal(notifications.status().waiters, 0, 'attesa chiusa subito, non al timeout');

  // Ritirare un consenso ancora in tolleranza non risveglia nessuno.
  const quiet = notifications.wait({ since: woke.cursor, instance: woke.instance, timeoutMs: 10_000 });
  notifications.publish('consent-required', { reference: 'proposal:6', expiresAt: clock.now() + 600_000 });
  notifications.resolve('proposal:6');
  assert.equal(notifications.status().waiters, 1);
  clock.advance(10_000);
  assert.equal((await quiet).events.length, 0);
});

test('troppi ascoltatori ricevono un invito a ritentare più tardi', async () => {
  const clock = manualClock();
  const notifications = hub(clock, { maxWaiters: 1 });
  const base = notifications.list({});
  const first = notifications.wait({ since: base.cursor, instance: base.instance, timeoutMs: 5_000 });
  const second = await notifications.wait({ since: base.cursor, instance: base.instance, timeoutMs: 5_000 });
  assert.equal(second.retryAfterMs, 15_000);
  notifications.close();
  await first;
  assert.equal(notifications.publish('response-ready', { durationMs: 99_000 }), null, 'chiuso: nessun nuovo evento');
});

// #endregion

// #region Relay UI → Core

const { createRelayPublisher, drainRelay, RELAY_SCHEMA } = require('../src/remote/device-notification-relay');

test('relay: la UI inoltra al Core eventi opachi, il Core li applica e li elimina', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-relay-'));
  try {
    const coreHub = new DeviceNotificationHub({ consentGraceMs: 0, longGenerationMs: 20_000 });
    const uiHub = new DeviceNotificationHub({ consentGraceMs: 0, longGenerationMs: 20_000 });
    const base = coreHub.list({});
    const publisher = createRelayPublisher({ directory, localHub: uiHub, shouldRelay: () => true });
    assert.deepEqual(publisher.publish('response-ready', { reference: 'desktop:richiesta-privata', durationMs: 30_000 }), { relayed: true });
    publisher.publish('consent-required', { reference: 'proposal:abc', expiresAt: Date.now() + 60_000 });
    const onDisk = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
    assert.ok(!onDisk.includes('richiesta-privata') && !onDisk.includes('abc'), 'sul disco solo impronte opache');
    assert.equal(drainRelay({ directory, hub: coreHub }), 2);
    assert.equal(fs.readdirSync(directory).length, 0, 'file consumati');
    assert.equal(uiHub.list({ since: 0, instance: uiHub.instance }).events.length, 0, 'l hub della UI non riceve nulla');
    const delivered = coreHub.list({ since: base.cursor, instance: base.instance });
    assert.deepEqual(delivered.events.map((event) => event.kind).sort(), ['consent-required', 'response-ready']);

    publisher.resolve('proposal:abc');
    drainRelay({ directory, hub: coreHub });
    assert.deepEqual(coreHub.list({ since: base.cursor, instance: base.instance }).events.map((event) => event.kind), ['response-ready'], 'consenso ritirato tramite relay');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('relay: senza Core indipendente resta locale; file non validi vengono scartati', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-relay-'));
  try {
    const localHub = new DeviceNotificationHub({ consentGraceMs: 0, longGenerationMs: 0 });
    const publisher = createRelayPublisher({ directory, localHub, shouldRelay: () => false });
    assert.equal(publisher.publish('response-ready', { reference: 'x', durationMs: 1 }).kind, 'response-ready');
    assert.equal(fs.readdirSync(directory).length, 0);

    const coreHub = new DeviceNotificationHub({ consentGraceMs: 0, longGenerationMs: 0 });
    const base = coreHub.list({});
    const now = Date.now();
    const bad = [
      { schema: 'altro', op: 'publish', kind: 'response-ready', reference: 'a', createdAt: now },
      { schema: RELAY_SCHEMA, op: 'publish', kind: 'run-command', reference: 'a', createdAt: now },
      { schema: RELAY_SCHEMA, op: 'publish', kind: 'response-ready', reference: 'spazi non ammessi', createdAt: now },
      { schema: RELAY_SCHEMA, op: 'publish', kind: 'response-ready', reference: 'vecchio', createdAt: now - 60 * 60 * 1000 }
    ];
    bad.forEach((record, index) => fs.writeFileSync(path.join(directory, `${now + index}-${crypto.randomUUID()}.json`), JSON.stringify(record)));
    fs.writeFileSync(path.join(directory, `${now + 9}-${crypto.randomUUID()}.json`), '{non json');
    assert.equal(drainRelay({ directory, hub: coreHub, now }), 0);
    assert.equal(fs.readdirSync(directory).length, 0, 'anche i file non validi vengono rimossi');
    assert.equal(coreHub.list({ since: base.cursor, instance: base.instance }).events.length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

// #endregion

// #region ActionRuntime

test('ActionRuntime segnala proposte e decisioni senza strumento né argomenti', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proposal-observer-'));
  try {
    const runtime = new ActionRuntime({
      vaultPath: root, userPath: root, auditPath: path.join(root, 'data', 'audit.jsonl'),
      shell: { openPath: async () => '', openExternal: async () => {}, trashItem: async () => {} },
      logger: { warn: () => {} }, platform: 'win32', applicationProbe: () => true, now: () => 1000
    });
    const seen = [];
    runtime.proposalObserver = (event) => seen.push(event);
    const proposal = runtime.propose({ summary: 'Apri', tool: 'open_application', arguments: { application: 'calculator' } });
    assert.deepEqual(seen, [{ event: 'proposed', id: proposal.id, expiresAt: proposal.expiresAt }]);
    runtime.cancelProposal(proposal.id);
    assert.deepEqual(seen.at(-1), { event: 'settled', id: proposal.id, expiresAt: 0 });
    runtime.proposalObserver = () => { throw new Error('guasto'); };
    assert.ok(runtime.propose({ summary: 'Apri', tool: 'open_application', arguments: { application: 'calculator' } }).id, 'un osservatore guasto non blocca la proposta');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 }); }
});

// #endregion

// #region Gateway

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function pair(baseUrl, code, scope) {
  const response = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: scope === 'console' ? `${baseUrl}/console` : `${baseUrl}/` },
    body: JSON.stringify({ code, deviceName: scope === 'console' ? 'Console mobile' : 'Telefono personale' })
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('gateway: long-poll autenticato, solo Console, e push sullo stream esistente', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-device-notifications-'));
  const deviceNotificationHub = new DeviceNotificationHub({ consentGraceMs: 0, longGenerationMs: 0 });
  const gateway = new RemoteSessionGateway({
    statePath: path.join(root, 'remote-access.json'),
    conversationStore: { list: () => [], save: (record) => record },
    systemSnapshotProvider: async () => ({ memory: { percent: 10 } }),
    logger: { info() {}, warn() {} },
    deviceNotificationHub
  });
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, allowLan: false, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${baseUrl}/api/notifications/events`)).status, 401, 'senza token nessun evento');
    const chat = await pair(baseUrl, gateway.createPairingCode({ scope: 'chat' }).code, 'chat');
    assert.equal((await fetch(`${baseUrl}/api/notifications/events`, { headers: { Authorization: `Bearer ${chat.token}` } })).status, 403, 'una sessione chat non riceve eventi Console');

    const consoleDevice = await pair(baseUrl, gateway.createPairingCode({ scope: 'console' }).code, 'console');
    const headers = { Authorization: `Bearer ${consoleDevice.token}` };
    const base = await (await fetch(`${baseUrl}/api/notifications/events`, { headers })).json();
    assert.equal(base.events.length, 0);
    assert.equal(typeof base.instance, 'string');

    const started = Date.now();
    const pending = fetch(`${baseUrl}/api/notifications/events?since=${base.cursor}&instance=${base.instance}&wait=5000`, { headers });
    setTimeout(() => gateway.deviceNotifications.publish('consent-required', { reference: 'proposal:segreto-azione' }), 150);
    const woke = await (await pending).json();
    assert.ok(Date.now() - started < 4_000, 'il long-poll si sblocca all’evento');
    assert.equal(woke.events.length, 1);
    assert.equal(woke.events[0].kind, 'consent-required');
    assert.ok(!JSON.stringify(woke).includes('segreto-azione'), 'nessun riferimento interno nella risposta');

    const stream = await fetch(`${baseUrl}/api/system/telemetry/stream`, { headers });
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    gateway.deviceNotifications.publish('response-ready', { reference: 'conversation:privata', durationMs: 1 });
    const deadline = Date.now() + 4_000;
    while (!buffered.includes('"type":"notification"') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    const frame = buffered.split('\n').find((line) => line.includes('"type":"notification"'));
    assert.ok(frame, 'lo stream Console già aperto porta la notifica');
    const pushed = JSON.parse(frame.slice(5));
    assert.equal(pushed.notification.kind, 'response-ready');
    assert.equal(pushed.instance, base.instance);
    assert.ok(!frame.includes('privata'));

    // Ritiro: il long-poll in corso si chiude con consentActive=false.
    const current = gateway.deviceNotifications.list({});
    assert.equal(current.consentActive, true);
    const waitingWithdrawal = fetch(`${baseUrl}/api/notifications/events?since=${current.cursor}&instance=${current.instance}&wait=5000`, { headers });
    setTimeout(() => gateway.deviceNotifications.resolve('proposal:segreto-azione'), 150);
    const withdrawn = await (await waitingWithdrawal).json();
    assert.equal(withdrawn.events.length, 0);
    assert.equal(withdrawn.consentActive, false, 'il telefono riceve il ritiro');

    gateway.revokeDevice(consoleDevice.deviceId || gateway.state.devices.find((device) => device.scope === 'console').id);
    assert.equal((await fetch(`${baseUrl}/api/notifications/events`, { headers })).status, 401, 'revocato: nessun evento');
  } finally { await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('gateway: una risposta remota lunga pubblica "risposta pronta"', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-response-ready-'));
  let record = { id: 'chat-1', title: 'Prova', createdAt: 1, updatedAt: 2, incomplete: false, turns: [] };
  const deviceNotificationHub = new DeviceNotificationHub({ longGenerationMs: 0 });
  const gateway = new RemoteSessionGateway({
    statePath: path.join(root, 'remote-access.json'),
    conversationStore: { list: () => [record], save: (value) => { record = value; return record; } },
    logger: { info() {}, warn() {} },
    onMessage: async ({ conversation, text }) => ({ ...conversation, updatedAt: Date.now(), turns: [...conversation.turns, { role: 'user', content: text }, { role: 'assistant', content: 'Contenuto riservato' }] }),
    deviceNotificationHub
  });
  try {
    const port = await freePort();
    await gateway.configure({ enabled: true, allowLan: false, port });
    const baseUrl = `http://127.0.0.1:${port}`;
    const before = deviceNotificationHub.list({});
    const chat = await pair(baseUrl, gateway.createPairingCode({ scope: 'chat' }).code, 'chat');
    const sent = await fetch(`${baseUrl}/api/conversations/chat-1/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${chat.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Domanda lunga' })
    });
    assert.equal(sent.status, 200);
    const after = deviceNotificationHub.list({ since: before.cursor, instance: before.instance });
    assert.equal(after.events.length, 1);
    assert.equal(after.events[0].kind, 'response-ready');
    assert.ok(!JSON.stringify(after).includes('riservato'));
  } finally { await gateway.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

// #endregion
