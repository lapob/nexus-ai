const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityManifest, negotiateCapabilities } = require('../src/core/capability-registry');

test('il manifesto pubblico espone solo capacita client-safe', () => {
  const manifest = createCapabilityManifest({
    audience: 'public',
    now: Date.UTC(2026, 7, 31),
    features: { chat: true, 'voice-input': 'degraded', 'device-actions': true, plugins: true }
  });
  assert.equal(manifest.product, 'NexusNXS AI');
  assert.equal(manifest.capabilities.some(({ id }) => id === 'device-actions'), false);
  assert.equal(manifest.capabilities.some(({ id }) => id === 'plugins'), false);
  assert.match(manifest.digest, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(JSON.stringify(manifest), /endpoint|workstation|127\.0\.0\.1|modelPath/i);
});

test('la negoziazione distingue disponibile degradato e rifiutato', () => {
  const manifest = createCapabilityManifest({ features: { chat: true, 'voice-input': 'degraded' } });
  const result = negotiateCapabilities(manifest, ['chat', 'voice-input', 'plugins']);
  assert.deepEqual(result.accepted, ['chat']);
  assert.deepEqual(result.degraded, ['voice-input']);
  assert.deepEqual(result.rejected, ['plugins']);
});
