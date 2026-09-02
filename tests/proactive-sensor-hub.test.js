const test = require('node:test');
const assert = require('node:assert/strict');
const { ProactiveEventBus } = require('../src/application/proactive-event-bus');
const { ProactiveSensorHub } = require('../src/application/proactive-sensor-hub');

test('i sensori pubblicano variazioni reali una sola volta per rete, sicurezza, update e salute', async () => {
  let now = 1_000;
  let online = true;
  let security = [];
  let update = { status: 'current', version: '1.0.0' };
  let health = { state: 'healthy' };
  const bus = new ProactiveEventBus({ now: () => now, dedupeMs: 1_000 });
  const observed = [];
  bus.subscribe((event) => observed.push(event));
  const hub = new ProactiveSensorHub({
    eventBus: bus,
    now: () => now,
    networkProvider: () => online,
    securityProvider: () => ({ events: security }),
    updateProvider: () => update,
    healthProvider: () => health
  });

  await hub.poll();
  assert.deepEqual(observed.map((event) => event.type), ['network.status']);
  now += 2_000;
  online = false;
  security = [{ id: 'alert-1', at: now, severity: 'critical', type: 'authentication.denied', detail: 'Accesso rifiutato' }];
  update = { status: 'ready', version: '2.0.0' };
  health = { state: 'degraded', category: 'ai-runtime', code: 'AI_FAILED', summary: 'Runtime non pronto' };
  await hub.poll();
  assert.deepEqual(observed.map((event) => event.type), [
    'network.status', 'network.status', 'security.alert', 'update.available', 'device.health'
  ]);
  await hub.poll();
  assert.equal(observed.length, 5, 'lo stesso snapshot non deve produrre duplicati');
  hub.stop();
  assert.equal(await hub.poll(), false);
});
