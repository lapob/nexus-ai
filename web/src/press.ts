/**
 * @module web/press
 * @description Feedback di pressione al tocco, moderno e contenuto nel controllo: una lieve
 * compressione a molla (Web Animations) al posto del riquadro grezzo del browser. Non tocca le
 * transizioni dei componenti, solo la proprietà `scale`, e rispetta la riduzione del movimento.
 */
const PRESSABLE = 'button:not(:disabled), a[href], [role="button"], [role="menuitem"], [role="tab"], [role="radio"], [role="option"]';
const active = new WeakMap<Element, Animation>();

function depthFor(element: Element) {
  // I controlli grandi si comprimono meno: la stessa sensazione fisica a ogni dimensione.
  const { width, height } = element.getBoundingClientRect();
  const size = Math.max(width, height);
  return size > 280 ? .988 : size > 120 ? .975 : .93;
}

export function installPressFeedback(root: Document = document) {
  if (typeof window === 'undefined' || typeof Element.prototype.animate !== 'function') return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const release = (element: Element) => {
    const animation = active.get(element);
    if (!animation) return;
    active.delete(element);
    const from = getComputedStyle(element).scale;
    animation.cancel();
    element.animate([{ scale: from === 'none' ? '1' : from }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.2, 0, 0, 1)' });
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || reduced.matches || !(event.target instanceof Element)) return;
    const element = event.target.closest(PRESSABLE);
    if (!element || element.closest('[data-no-press]')) return;
    active.get(element)?.cancel();
    active.set(element, element.animate([{ scale: '1' }, { scale: String(depthFor(element)) }], { duration: 110, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards' }));
    const up = () => { release(element); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
  root.addEventListener('pointerdown', down, { capture: true, passive: true });
  return () => root.removeEventListener('pointerdown', down, { capture: true } as EventListenerOptions);
}
