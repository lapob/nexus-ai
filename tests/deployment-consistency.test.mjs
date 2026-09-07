import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDeployment } from '../scripts/wait-for-deployment.mjs';

test('waits for eventual deployment visibility without deploying twice', async () => {
  const versions = ['old', 'old', 'new'];
  let pauses = 0;
  assert.equal(await waitForDeployment(async () => versions.shift(), 'old', { pause: async () => { pauses++; } }), 'new');
  assert.equal(pauses, 2);
});

test('unchanged deployment fails after bounded observation', async () => {
  await assert.rejects(waitForDeployment(async () => 'old', 'old', { attempts: 2, pause: async () => {} }), /not confirmed/);
});
