const test = require('node:test');
const assert = require('node:assert/strict');
const { cancelTrackedRequest, throwIfRequestAborted } = require('../src/application/register-ipc');

test('annulla insieme preparazione esterna e trasporto AI dello stesso turno', () => {
  const controller = new AbortController();
  const requestSignals = new Map([['turn-1', controller]]);
  const cancelled = [];
  const aiRuntime = { cancel(requestId) { cancelled.push(requestId); return true; } };
  assert.equal(cancelTrackedRequest('turn-1', { requestSignals, aiRuntime }), true);
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(cancelled, ['turn-1']);
  assert.equal(requestSignals.has('turn-1'), false);
});

test('la cancellazione è idempotente anche prima dell avvio del provider', () => {
  const controller = new AbortController();
  const requestSignals = new Map([['preparing', controller]]);
  const aiRuntime = { cancel() { return false; } };
  assert.equal(cancelTrackedRequest('preparing', { requestSignals, aiRuntime }), true);
  assert.equal(cancelTrackedRequest('preparing', { requestSignals, aiRuntime }), false);
});

test('una cache pronta non può riapparire dopo che il turno è stato sostituito', () => {
  const controller = new AbortController();
  assert.doesNotThrow(() => throwIfRequestAborted(controller.signal));
  controller.abort();
  assert.throws(
    () => throwIfRequestAborted(controller.signal),
    (error) => error.name === 'AbortError' && error.code === 'ABORT_ERR'
  );
});
