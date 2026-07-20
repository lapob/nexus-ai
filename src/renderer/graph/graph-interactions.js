import { motionQuery } from '../utils/motion.js';
import { listen } from '../utils/dom.js';

export function bindGraphInteractions(engine) {
  const cleanups = [];
  let drag = null;
  let resizeFrame = 0;

  listen(engine.canvas, 'pointerdown', (event) => {
    const x = event.clientX - engine.metrics.left; const y = event.clientY - engine.metrics.top;
    drag = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), moved: false, vx: 0, vy: 0, node: engine.pick(x, y) };
    engine.canvas.setPointerCapture(event.pointerId); engine.canvas.classList.add('dragging');
  }, undefined, cleanups);

  listen(engine.canvas, 'pointermove', (event) => {
    const localX = event.clientX - engine.metrics.left; const localY = event.clientY - engine.metrics.top;
    engine.pointer.targetX = localX - engine.metrics.width / 2; engine.pointer.targetY = localY - engine.metrics.height / 2;
    engine.setHovered(engine.pick(localX, localY) || null);
    if (!drag) return;
    const dx = event.clientX - drag.lastX; const dy = event.clientY - drag.lastY;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
    if (drag.moved) {
      const now = performance.now(); const elapsed = Math.max(1, now - drag.lastTime);
      engine.camera.pan(dx, dy); drag.vx = dx / elapsed; drag.vy = dy / elapsed; drag.lastTime = now; drag.lastX = event.clientX; drag.lastY = event.clientY;
    }
  }, undefined, cleanups);

  const release = (event) => {
    if (!drag) return;
    if (!drag.moved && drag.node) engine.select(drag.node, { chatOpen: document.querySelector('#chatOverlay').dataset.state === 'open' });
    else if (drag.moved) engine.camera.projectVelocity(drag.vx, drag.vy);
    if (engine.canvas.hasPointerCapture(event.pointerId)) engine.canvas.releasePointerCapture(event.pointerId);
    drag = null; engine.canvas.classList.remove('dragging');
  };
  listen(engine.canvas, 'pointerup', release, undefined, cleanups);
  listen(engine.canvas, 'pointercancel', release, undefined, cleanups);
  listen(engine.canvas, 'pointerleave', () => { engine.pointer.targetX = 0; engine.pointer.targetY = 0; engine.setHovered(null); }, undefined, cleanups);
  listen(engine.canvas, 'wheel', (event) => { event.preventDefault(); engine.camera.zoomBy(event.deltaY); if (motionQuery.matches) engine.draw(performance.now()); }, { passive: false }, cleanups);
  listen(window, 'resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => engine.resize()); }, undefined, cleanups);
  cleanups.push(() => cancelAnimationFrame(resizeFrame));
  return () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
}
