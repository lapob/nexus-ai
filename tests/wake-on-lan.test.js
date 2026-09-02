/**
 * @module tests/wake-on-lan
 * @description Verifica il confine sicuro del futuro relay Wake-on-LAN privato.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  PLAN_TTL_MS,
  WakeOnLanController,
  magicPacket,
  normalizeMac,
  normalizeWakeTarget,
  sendMagicPacket
} = require('../src/remote/wake-on-lan');

const target = { id: 'workstation', label: 'Workstation NexusNXS', mac: '02:11:22:33:44:55', address: '192.168.1.255', port: 9 };

test('normalizza soltanto MAC unicast e destinazioni IPv4 esplicite', () => {
  assert.equal(normalizeMac('02-11-22-33-44-55'), target.mac);
  assert.deepEqual(normalizeWakeTarget(target), target);
  assert.throws(() => normalizeMac('ff:ff:ff:ff:ff:ff'), /non utilizzabile/);
  assert.throws(() => normalizeMac('03:11:22:33:44:55'), /unicast/);
  assert.throws(() => normalizeWakeTarget({ ...target, address: 'relay.example.com' }), /IPv4/);
  assert.throws(() => normalizeWakeTarget({ ...target, address: '203.0.113.255' }), /LAN privato/);
  assert.throws(() => normalizeWakeTarget({ ...target, port: 22 }), /porte UDP 7 o 9/);
});

test('costruisce il magic packet standard senza esporre una shell', () => {
  const packet = magicPacket(target.mac);
  assert.equal(packet.length, 102);
  assert.equal(packet.subarray(0, 6).toString('hex'), 'ffffffffffff');
  assert.equal(packet.subarray(6, 12).toString('hex'), '021122334455');
});

test('invia un piccolo burst affidabile allo stesso target configurato', async () => {
  const transmissions = [];
  class FakeSocket extends EventEmitter {
    bind(_port, callback) { callback(); }
    setBroadcast(value) { assert.equal(value, true); }
    send(packet, port, address, callback) {
      transmissions.push({ length: packet.length, port, address });
      callback();
    }
    close() {}
  }
  const result = await sendMagicPacket(target, { socketFactory: () => new FakeSocket(), repetitions: 3, intervalMs: 0 });
  assert.equal(result.packetsSent, 3);
  assert.deepEqual(transmissions, Array.from({ length: 3 }, () => ({ length: 102, port: 9, address: '192.168.1.255' })));
});

test('il controller accetta solo target in allowlist e ticket monouso legati al dispositivo', async () => {
  const sent = [];
  const events = [];
  const controller = new WakeOnLanController({
    targets: [target],
    sender: async (value) => { sent.push(value.id); return { targetId: value.id, sentAt: 1 }; },
    audit: (type, detail) => events.push({ type, detail })
  });
  assert.equal(controller.capabilities().available, true);
  assert.deepEqual(controller.capabilities().targets, [{ id: 'workstation', label: 'Workstation NexusNXS' }]);
  assert.throws(() => controller.plan({ targetId: 'unknown', deviceId: 'phone-1' }), /non autorizzato/);
  const plan = controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  await assert.rejects(controller.execute({ ticketId: plan.id, deviceId: 'phone-2', approved: true }), /non valida/);
  assert.deepEqual(sent, []);
  await assert.rejects(controller.execute({ ticketId: plan.id, deviceId: 'phone-1', approved: true }), /non valida/);
  const valid = controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  const result = await controller.execute({ ticketId: valid.id, deviceId: 'phone-1', approved: true });
  assert.equal(result.targetId, 'workstation');
  assert.deepEqual(sent, ['workstation']);
  assert.deepEqual(events.map((event) => event.type), ['wake.planned', 'wake.planned', 'wake.executed']);
});

test('un ticket scade e viene consumato anche quando non è approvato', async () => {
  let now = 100;
  const controller = new WakeOnLanController({ targets: [target], now: () => now, sender: async () => ({}) });
  const rejected = controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  await assert.rejects(controller.execute({ ticketId: rejected.id, deviceId: 'phone-1', approved: false }), /Conferma/);
  await assert.rejects(controller.execute({ ticketId: rejected.id, deviceId: 'phone-1', approved: true }), /non valida/);
  const expired = controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  now += PLAN_TTL_MS + 1;
  await assert.rejects(controller.execute({ ticketId: expired.id, deviceId: 'phone-1', approved: true }), /scaduta/);
});

test('limita i piani per dispositivo e riparte soltanto dopo la finestra', () => {
  let now = 100;
  const events = [];
  const controller = new WakeOnLanController({ targets: [target], now: () => now, audit: (type) => events.push(type) });
  controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  controller.plan({ targetId: 'workstation', deviceId: 'phone-1' });
  assert.throws(() => controller.plan({ targetId: 'workstation', deviceId: 'phone-1' }), /Troppe richieste/);
  assert.equal(events.at(-1), 'wake.rate_limited');
  now += 60_001;
  assert.ok(controller.plan({ targetId: 'workstation', deviceId: 'phone-1' }).id);
});
