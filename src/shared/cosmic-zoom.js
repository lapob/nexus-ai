/** @module shared/cosmic-zoom Direct particle inspection without scaling a raster surface. */
function createCosmicZoom(host, { onChange = () => {}, maximum = 2.25 } = {}) {
  // #region Direct gesture ownership
  maximum = Number.isFinite(maximum) ? Math.max(1, Math.min(2.25, maximum)) : 2.25;
  const previousTouchAction = host.style?.touchAction || '';
  if (host.style) host.style.touchAction = 'none';
  const pointers = new Map();
  let value = 1, distance = 0, pinching = false, blockedUntil = 0;
  const set = next => {
    if (!Number.isFinite(next)) return value;
    const bounded = Math.max(1, Math.min(maximum, next));
    if (bounded !== value) { value = bounded; onChange(value); }
    return value;
  };
  const span = () => { const points = [...pointers.values()]; return points.length < 2 ? 0 : Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]); };
  const consume = event => { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); };
  const down = event => {
    if (event.pointerType !== 'touch' || pointers.size >= 2 && !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size < 2) return;
    pinching = true; distance = span(); blockedUntil = performance.now() + 500;
    host.dispatchEvent(new Event('nexuscorezoomstart'));
    consume(event);
    for (const id of pointers.keys()) { try { host.setPointerCapture?.(id); } catch { /* A cancelled pointer may already be gone. */ } }
  };
  const move = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (!pinching) return;
    const next = span(); if (distance > 0 && next > 0) set(value * next / distance);
    distance = next; consume(event);
  };
  const up = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!pinching) return;
    blockedUntil = performance.now() + 500; consume(event);
    if (!pointers.size) { pinching = false; distance = 0; }
  };
  const cancel = () => { pointers.clear(); pinching = false; distance = 0; };
  const click = event => { if (performance.now() < blockedUntil) consume(event); };
  const wheel = event => {
    // Preserve the browser's own page zoom and accessibility shortcuts.
    if (event.ctrlKey || event.metaKey) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight || 500 : 1);
    if (!Number.isFinite(delta) || !delta || value === 1 && delta > 0) return;
    set(value * Math.exp(-Math.max(-300, Math.min(300, delta)) * .002)); consume(event);
  };
  const key = event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const next = ['+', '='].includes(event.key) ? value * 1.2 : ['-', '_'].includes(event.key) ? value / 1.2 : event.key === '0' ? 1 : null;
    if (next !== null) { set(next); consume(event); }
  };
  // #endregion
  // #region Listener lifecycle
  const bindings = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['click', click], ['wheel', wheel], ['keydown', key]];
  for (const [name, listener] of bindings) host.addEventListener(name, listener, { capture: true, passive: false });
  globalThis.addEventListener?.('pointerup', up, true); globalThis.addEventListener?.('pointercancel', up, true);
  globalThis.addEventListener?.('blur', cancel);
  return { get value() { return value; }, set, dispose() { cancel(); if (host.style) host.style.touchAction = previousTouchAction; for (const [name, listener] of bindings) host.removeEventListener(name, listener, { capture: true }); globalThis.removeEventListener?.('pointerup', up, true); globalThis.removeEventListener?.('pointercancel', up, true); globalThis.removeEventListener?.('blur', cancel); } };
  // #endregion
}
module.exports = { createCosmicZoom };
