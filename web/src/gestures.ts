/**
 * @module web/src/gestures
 * @description Gesti rapidi touch (telefono Android/iOS): scorri a destra sulla conversazione per aprire
 * la cronologia (fuori dalla zona "Indietro" di sistema), verso sinistra per chiuderla, verso destra sul pannello documento per chiuderlo.
 * Le aree che scorrono in orizzontale (codice, suggerimenti, tabelle) mantengono il loro scroll.
 */
import { useEffect, useRef } from 'react';

export interface SwipeState { sidebarOpen: boolean; panelOpen: boolean }
export interface SwipeActions { openSidebar: () => void; closeSidebar: () => void; closePanel: () => void }

const SYSTEM_EDGE = 24; // px riservati al gesto "Indietro" di Android
const DISTANCE = 56;    // spostamento minimo
const MAX_TIME = 650;   // ms: oltre è un trascinamento, non un gesto
const HORIZONTAL_SCROLL = 'pre, .suggestions, .panel-table, textarea, input, [data-no-swipe]';

/** Decide il gesto dato inizio, fine e contesto. Pura: testabile senza DOM. */
export function swipeIntent(start: { x: number; y: number; t: number; inPanel: boolean; inScroller: boolean }, end: { x: number; y: number; t: number }, state: SwipeState, compact: boolean): keyof SwipeActions | null {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (end.t - start.t > MAX_TIME || Math.abs(dx) < DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return null;
  if (state.panelOpen) return dx > 0 && start.inPanel && !start.inScroller ? 'closePanel' : null;
  if (state.sidebarOpen) return dx < 0 ? 'closeSidebar' : null;
  // Non dal bordo estremo: su Android quella zona è il gesto "Indietro" del sistema.
  return dx > 0 && compact && start.x >= SYSTEM_EDGE && !start.inScroller ? 'openSidebar' : null;
}

export function useSwipeGestures(state: SwipeState, actions: SwipeActions) {
  const live = useRef({ state, actions });
  live.current = { state, actions };
  useEffect(() => {
    let start: Parameters<typeof swipeIntent>[0] | null = null;
    const compact = window.matchMedia('(max-width: 839px)');
    const down = (event: TouchEvent) => {
      if (event.touches.length !== 1) { start = null; return; }
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      start = { x: touch.clientX, y: touch.clientY, t: performance.now(), inPanel: Boolean(target?.closest('.panel')), inScroller: Boolean(target?.closest(HORIZONTAL_SCROLL)) };
    };
    const up = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const intent = swipeIntent(start, { x: touch.clientX, y: touch.clientY, t: performance.now() }, live.current.state, compact.matches);
      start = null;
      if (!intent) return;
      live.current.actions[intent]();
      navigator.vibrate?.(8); // conferma tattile leggera dove supportata (Android)
    };
    const cancel = () => { start = null; };
    // Movimento chiaramente orizzontale fuori da aree scorrevoli: il gesto è dell'app, non del
    // browser (che altrimenti lo leggerebbe come "Indietro"). Lo scroll verticale resta libero.
    const move = (event: TouchEvent) => {
      if (!start || start.inScroller || !event.cancelable) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.6) event.preventDefault();
    };
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', cancel);
    };
  }, []);
}
