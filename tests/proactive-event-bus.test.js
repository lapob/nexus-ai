const test = require('node:test');
const assert = require('node:assert/strict');
const { ProactiveEventBus } = require('../src/application/proactive-event-bus');

test('il bus proattivo accetta soltanto eventi allowlist e dati metadata-only', () => {
  let now = 1000;
  const bus = new ProactiveEventBus({ now: () => now });
  const observed = [];
  bus.subscribe((event) => observed.push(event));
  assert.equal(bus.publish('unknown', { summary: 'no' }), null);
  const event = bus.publish('system.resume', { summary: 'Sistema disponibile', path: 'C:\\secret' });
  assert.equal(event.requiresApproval, false);
  assert.equal(Object.hasOwn(event.metadata, 'path'), false);
  assert.equal(observed.length, 1);
  assert.equal(bus.publish('system.resume', { summary: 'Sistema disponibile' }), null);
  now += 20_000;
  assert.ok(bus.publish('system.resume', { summary: 'Sistema disponibile' }));
});

test('gli eventi che potrebbero causare azioni richiedono sempre approvazione', () => {
  const bus = new ProactiveEventBus();
  assert.equal(bus.publish('security.alert', { code: 'test' }).requiresApproval, true);
  assert.equal(bus.publish('device.health', { category: 'temperature' }).requiresApproval, true);
  bus.close();
  assert.equal(bus.publish('system.resume'), null);
});

test('le quiet hours silenziano soltanto gli eventi informativi', () => {
  const timestamp = new Date(2026, 0, 1, 23, 30).getTime();
  const bus = new ProactiveEventBus({ now: () => timestamp, quietHours: '22:00-07:00' });
  const observed = [];
  bus.subscribe((event) => observed.push(event));
  const quiet = bus.publish('network.status', { state: 'online' });
  const warning = bus.publish('security.alert', { code: 'AUTH_FAILURE' });
  assert.equal(quiet.delivery, 'quiet');
  assert.equal(warning.delivery, 'immediate');
  assert.deepEqual(observed.map((event) => event.type), ['security.alert']);
  assert.equal(bus.history().length, 2);
});
