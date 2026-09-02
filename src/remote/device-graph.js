/**
 * @module remote/device-graph
 * @description Proietta dispositivi associati in un grafo opaco e privacy-safe.
 */
function deviceGraph(devices, { currentDeviceId = '', capabilityResolver = null } = {}) {
  const now = Date.now();
  const nodes = (Array.isArray(devices) ? devices : []).map((device) => Object.freeze({
    id: String(device.id || ''),
    label: String(device.name || 'Dispositivo').slice(0, 80),
    role: String(device.scope || 'chat'),
    current: device.id === currentDeviceId,
    state: now - Number(device.lastSeenAt || device.createdAt || 0) < 5 * 60 * 1000 ? 'online' : 'idle',
    lastSeenAt: Number(device.lastSeenAt || 0),
    capabilities: typeof capabilityResolver === 'function' ? capabilityResolver(device) : undefined
  }));
  return Object.freeze({ schema: 'nexusnxs.device-graph.v1', nodes });
}

module.exports = { deviceGraph };
