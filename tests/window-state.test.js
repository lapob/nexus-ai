const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeWindowState } = require('../src/infrastructure/electron/window-state');

const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }];

test('conserva dimensione, posizione e stato finestra validi', () => {
  assert.deepEqual(sanitizeWindowState({ x: 100, y: 80, width: 1400, height: 900, isMaximized: true, isFullScreen: false }, displays), { x: 100, y: 80, width: 1400, height: 900, isMaximized: true, isFullScreen: false });
});

test('recupera configurazioni corrotte o fuori schermo', () => {
  const state = sanitizeWindowState({ x: 9000, y: 9000, width: 10, height: 'x', isFullScreen: 'yes' }, displays);
  assert.equal(state.width, 900);
  assert.equal(state.height, 820);
  assert.equal(state.isFullScreen, false);
  assert.equal('x' in state, false);
  assert.equal('y' in state, false);
});
