const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SecurityEventStore } = require('../src/security/security-event-store');

test('registro sicurezza concatena gli eventi e non espone hash nella sintesi', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-events-'));
  try {
    const store = new SecurityEventStore({ filePath: path.join(root, 'security-audit.jsonl') });
    store.append('pairing.failed', { severity: 'warning', address: '203.0.113.5', detail: 'test' });
    store.append('device.paired', { deviceId: 'device-1', deviceName: 'Telefono' });
    const summary = store.summary({ devices: [{ id: 'device-1', name: 'Telefono', scope: 'console' }] });
    assert.equal(summary.status, 'attention');
    assert.equal(summary.integrity, true);
    assert.equal(summary.devices.length, 1);
    assert.equal(summary.events[0].hash, undefined);
    assert.equal(summary.events[1].previousHash, undefined);
    assert.equal(new SecurityEventStore({ filePath: path.join(root, 'security-audit.jsonl') }).verifyIntegrity(), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('registro sicurezza segnala una riga corrotta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-corrupt-'));
  try {
    const filePath = path.join(root, 'security-audit.jsonl');
    fs.writeFileSync(filePath, '{non-json}\n');
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('registro sicurezza non ricostruisce una catena manomessa durante la retention', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-chain-'));
  try {
    const filePath = path.join(root, 'events.jsonl');
    const store = new SecurityEventStore({ filePath });
    store.append('pairing.created', { deviceId: 'device-a' });
    const event = JSON.parse(fs.readFileSync(filePath, 'utf8').trim());
    event.detail = 'altered-after-write';
    fs.writeFileSync(filePath, `${JSON.stringify(event)}\n`);
    const reopened = new SecurityEventStore({ filePath, retentionMs: 1 });
    assert.equal(reopened.verifyIntegrity(), false);
    assert.equal(reopened.summary().integrity, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('due processi sullo stesso registro mantengono una catena unica', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-writers-'));
  try {
    const filePath = path.join(root, 'security-audit.jsonl');
    const server = new SecurityEventStore({ filePath });
    const bridge = new SecurityEventStore({ filePath });
    server.append('guest.session.created', { deviceId: 'a' });
    bridge.append('presence.executed', { deviceId: 'b' });
    server.append('authentication.denied', { severity: 'warning', deviceId: 'c' });
    bridge.append('action.cancelled', { severity: 'warning', deviceId: 'd' });
    assert.equal(server.verifyIntegrity(), true);
    assert.equal(bridge.summary().integrity, true);
    assert.equal(server.summary().counts.last24Hours, 4, 'la sintesi include gli eventi dell altro processo');
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), true);
    assert.equal(fs.existsSync(`${filePath}.lock`), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function forkedJournal(filePath) {
  // Riproduce il vecchio difetto: due istanze che concatenano dal proprio ultimo hash in memoria.
  const first = new SecurityEventStore({ filePath });
  first.append('guest.session.created', { deviceId: 'a' });
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const crypto = require('node:crypto');
  const make = (previousHash, deviceId) => {
    const base = { id: crypto.randomUUID(), at: Date.now(), type: 'presence.executed', severity: 'info', address: '', deviceId, deviceName: '', detail: '', previousHash };
    return { ...base, hash: crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex') };
  };
  const second = make(lines[0].hash, 'b');
  const fork = make(lines[0].hash, 'c');
  fs.appendFileSync(filePath, `${JSON.stringify(second)}\n${JSON.stringify(fork)}\n`);
  return [...lines, second, fork];
}

test('biforcazioni innocue: catena riparata, originale conservato, evento registrato', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-fork-'));
  try {
    const filePath = path.join(root, 'security-audit.jsonl');
    forkedJournal(filePath);
    const store = new SecurityEventStore({ filePath });
    assert.equal(store.verifyIntegrity(), true);
    assert.equal(store.repaired, 1);
    assert.ok(fs.readdirSync(root).some((name) => name.startsWith('security-audit.fork-repaired.')));
    assert.equal(store.summary().events[0].type, 'journal.repaired');
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un processo con codice precedente che biforca non rende il registro "da verificare"', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-legacy-'));
  try {
    const filePath = path.join(root, 'security-audit.jsonl');
    const server = new SecurityEventStore({ filePath });
    server.append('guest.session.created', { deviceId: 'a' });
    // Scrittore vecchio: aggiunge una riga concatenata a un hash precedente, senza blocco.
    const crypto = require('node:crypto');
    const base = { id: crypto.randomUUID(), at: Date.now(), type: 'presence.executed', severity: 'info', address: '', deviceId: 'old', deviceName: '', detail: '', previousHash: '0'.repeat(64) };
    fs.appendFileSync(filePath, `${JSON.stringify({ ...base, hash: crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex') })}\n`);
    assert.equal(server.summary().integrity, true);
    server.append('authentication.denied', { severity: 'warning', deviceId: 'c' });
    assert.equal(server.verifyIntegrity(), true);
    assert.equal(server.summary().counts.last24Hours, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('una riga modificata o rimossa non viene mai riparata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-fork-tamper-'));
  try {
    const filePath = path.join(root, 'security-audit.jsonl');
    const events = forkedJournal(filePath);
    events[1].detail = 'altered';
    fs.writeFileSync(filePath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), false);
    const removed = forkedJournal(path.join(root, 'removed.jsonl'));
    fs.writeFileSync(path.join(root, 'removed.jsonl'), `${[removed[1], removed[2]].map((event) => JSON.stringify(event)).join('\n')}\n`);
    assert.equal(new SecurityEventStore({ filePath: path.join(root, 'removed.jsonl') }).verifyIntegrity(), false);
    assert.equal(fs.readdirSync(root).some((name) => name.includes('fork-repaired')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('la rotazione a 10000 eventi conserva integrita e ripristino del registro', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-rotation-'));
  try {
    const filePath = path.join(root, 'events.jsonl');
    const store = new SecurityEventStore({ filePath });
    for (let index = 0; index < 10002; index += 1) {
      store.append('workflow.created', { deviceId: `synthetic-${index}` });
    }
    assert.equal(store.events.length, 10000);
    assert.equal(store.events[0].deviceId, 'synthetic-2');
    assert.equal(store.verifyIntegrity(), true);
    const reopened = new SecurityEventStore({ filePath });
    assert.equal(reopened.verifyIntegrity(), true);
    reopened.append('workflow.completed', { deviceId: 'synthetic-final' });
    assert.equal(reopened.verifyIntegrity(), true);
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), true);
    reopened.events[0].detail = 'altered-before-compaction';
    reopened.append('workflow.completed', { deviceId: 'synthetic-tampered' });
    assert.equal(reopened.verifyIntegrity(), false);
    assert.equal(new SecurityEventStore({ filePath }).verifyIntegrity(), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
