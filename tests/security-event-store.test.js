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
