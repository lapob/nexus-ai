const test = require('node:test');
const assert = require('node:assert/strict');
const { deviceGraph } = require('../src/remote/device-graph');

test('il grafo dispositivi resta opaco e privo di segreti di rete', () => {
  const graph = deviceGraph([{ id: 'opaque-1', name: 'Telefono', scope: 'remote', tokenHash: 'secret', address: '192.168.1.2', lastSeenAt: Date.now() }], { currentDeviceId: 'opaque-1' });
  assert.equal(graph.nodes[0].current, true);
  assert.equal(graph.nodes[0].state, 'online');
  assert.doesNotMatch(JSON.stringify(graph), /tokenHash|192\.168|secret/);
});
