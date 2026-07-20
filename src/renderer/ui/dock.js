import { $$, listen } from '../utils/dom.js';
import { clamp, motionQuery } from '../utils/motion.js';

export function createDock(onAction) {
  const dock = document.querySelector('#floatingDock'); const items = $$('.dock-item', dock); const cleanups = [];
  let centers = []; let frame = 0; let pointerX = 0;
  const measure = () => { centers = items.map((item) => { const bounds = item.getBoundingClientRect(); return bounds.left + bounds.width / 2; }); };
  const render = () => { items.forEach((item, index) => { const influence = clamp(1 - Math.abs(pointerX - centers[index]) / 115, 0, 1); item.style.setProperty('--dock-scale', 1 + influence * .14); item.style.setProperty('--dock-lift', `${influence * -6}px`); }); frame = 0; };
  for (const item of items) listen(item, 'click', () => { if (!item.disabled) onAction(item.dataset.action); }, undefined, cleanups);
  listen(dock, 'pointerenter', measure, undefined, cleanups);
  listen(dock, 'pointermove', (event) => { pointerX = event.clientX; if (!frame && !motionQuery.matches) frame = requestAnimationFrame(render); }, undefined, cleanups);
  listen(dock, 'pointerleave', () => { cancelAnimationFrame(frame); frame = 0; items.forEach((item) => { item.style.removeProperty('--dock-scale'); item.style.removeProperty('--dock-lift'); }); }, undefined, cleanups);
  const setActive = (action) => items.forEach((item) => item.classList.toggle('active', item.dataset.action === action));
  return { setActive, destroy: () => { cancelAnimationFrame(frame); cleanups.forEach((cleanup) => cleanup()); } };
}
