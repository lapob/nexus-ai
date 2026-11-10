/**
 * @module web/src/Tooltips
 * @description Tooltip moderni per tutta l'interfaccia: un solo gestore globale sostituisce il riquadro
 * nativo di `title` con un'etichetta in vetro animata, posizionata sopra o sotto secondo lo spazio,
 * mostrata anche al focus da tastiera e mai sul touch. Nessun componente deve cambiare.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Tip = { text: string; x: number; y: number; place: 'top' | 'bottom' };

const SPOTLIGHT = '.chip, .category, .new-chat, .project-row, .profile-button, .conversation';
const DELAY = 420;
const WARM = 650; // dopo un tooltip, i successivi compaiono subito per questo tempo

/** Sposta `title` in `data-tip` (niente riquadro nativo) senza perdere il nome accessibile. */
function adopt(element: HTMLElement): string | null {
  const title = element.getAttribute('title');
  if (title) {
    element.dataset.tip = title;
    element.removeAttribute('title');
    if (!element.hasAttribute('aria-label') && !element.textContent?.trim()) element.setAttribute('aria-label', title);
  }
  return element.dataset.tip?.trim() || null;
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    let hiddenAt = 0;
    // Gli iframe usano `title` come nome accessibile, non come suggerimento: restano esclusi.
    const find = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[title]:not(iframe),[data-tip]') : null);
    const show = (element: HTMLElement) => {
      const text = adopt(element);
      if (!text || element === current) return;
      current = element;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (current !== element || !element.isConnected) return;
        const box = element.getBoundingClientRect();
        const place = box.top > 52 ? 'top' : 'bottom';
        setTip({ text, x: box.left + box.width / 2, y: place === 'top' ? box.top - 8 : box.bottom + 8, place });
      }, performance.now() - hiddenAt < WARM ? 0 : DELAY);
    };
    const hide = () => {
      window.clearTimeout(timer);
      if (current) hiddenAt = performance.now();
      current = null;
      setTip(null);
    };
    // Luce che segue il puntatore sulle superfici interattive (vedi .spotlight in styles.css).
    const glow = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const surface = event.target instanceof Element ? event.target.closest<HTMLElement>(SPOTLIGHT) : null;
      if (!surface) return;
      const box = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${Math.round(event.clientX - box.left)}px`);
      surface.style.setProperty('--my', `${Math.round(event.clientY - box.top)}px`);
    };
    document.addEventListener('pointermove', glow, { passive: true });
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const element = find(event.target);
      if (element) show(element); else if (current) hide();
    };
    const focus = (event: FocusEvent) => {
      const element = find(event.target);
      if (element && element === event.target && element.matches(':focus-visible')) show(element);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('pointerdown', hide, { passive: true });
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointermove', glow);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Tiene il tooltip dentro lo schermo anche vicino ai bordi.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !tip) return;
    const half = node.offsetWidth / 2;
    node.style.left = `${Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8)}px`;
  }, [tip]);

  if (!tip) return null;
  return <div ref={ref} className="tooltip" data-place={tip.place} role="tooltip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}
