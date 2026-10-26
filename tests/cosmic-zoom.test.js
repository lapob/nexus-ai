const test = require('node:test');
const assert = require('node:assert/strict');
const { createCosmicZoom } = require('../src/shared/cosmic-zoom');

class Surface extends EventTarget {
  clientHeight = 600;
  style = { touchAction: 'manipulation' };
  captures = [];
  setPointerCapture(id) { this.captures.push(id); }
}
function emit(host, type, values = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  host.dispatchEvent(event); return event;
}
test('wheel and keys inspect bounded geometry without intercepting browser zoom or activation', () => {
  const host = new Surface(), changes = [], zoom = createCosmicZoom(host, { onChange: value => changes.push(value) });
  assert.equal(emit(host, 'wheel', { deltaY: 80 }).defaultPrevented, false);
  assert.equal(emit(host, 'wheel', { deltaY: -100, ctrlKey: true }).defaultPrevented, false);
  assert.equal(zoom.value, 1);
  assert.equal(emit(host, 'wheel', { deltaY: -100 }).defaultPrevented, true);
  assert.ok(zoom.value > 1);
  emit(host, 'keydown', { key: '+' }); assert.ok(zoom.value > changes[0]);
  assert.equal(emit(host, 'keydown', { key: 'Enter' }).defaultPrevented, false);
  zoom.set(100); assert.equal(zoom.value, 2.25);
  zoom.set(NaN); assert.equal(zoom.value, 2.25);
  emit(host, 'keydown', { key: '0' }); assert.equal(zoom.value, 1);
  zoom.dispose(); assert.equal(host.style.touchAction, 'manipulation');
  const count = changes.length; emit(host, 'wheel', { deltaY: -100 }); assert.equal(changes.length, count);
});
test('two fingers cancel presentation dragging, zoom directly and never activate the Core on release', () => {
  const host = new Surface(), zoom = createCosmicZoom(host);
  let starts = 0; host.addEventListener('nexuscorezoomstart', () => starts++);
  const point = (pointerId, clientX) => ({ pointerId, pointerType: 'touch', clientX, clientY: 100 });
  emit(host, 'pointerdown', point(1, 80)); emit(host, 'pointerdown', point(2, 120));
  assert.equal(starts, 1); assert.deepEqual(host.captures, [1, 2]);
  assert.equal(emit(host, 'pointermove', point(2, 160)).defaultPrevented, true);
  assert.equal(zoom.value, 2);
  emit(host, 'pointerup', point(2, 160)); emit(host, 'pointerup', point(1, 80));
  assert.equal(emit(host, 'click').defaultPrevented, true);
  assert.equal(zoom.value, 2, 'Release must retain the inspected geometry');
  zoom.dispose();
});
test('cancelled and zero-span gestures stay finite and new gestures start independently', () => {
  const host = new Surface(), zoom = createCosmicZoom(host);
  const point = (pointerId, clientX) => ({ pointerId, pointerType: 'touch', clientX, clientY: 0 });
  emit(host, 'pointerdown', point(1, 50)); emit(host, 'pointerdown', point(2, 50));
  emit(host, 'pointermove', point(2, 70)); assert.equal(zoom.value, 1);
  emit(host, 'pointercancel', point(1, 50)); emit(host, 'pointercancel', point(2, 70));
  emit(host, 'pointerdown', point(3, 40)); emit(host, 'pointerdown', point(4, 60));
  emit(host, 'pointermove', point(4, 70)); assert.equal(zoom.value, 1.5);
  zoom.dispose();
});
