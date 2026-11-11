/**
 * @module web/Select
 * @description Selettore premium al posto del <select> nativo: pannello in vetro animato dall'origine,
 * posizionato in un portale con flip e clamp al viewport (mai tagliato, mai sopra ai bordi),
 * tastiera completa (frecce, Home/Fine, Invio/Spazio, Esc, Tab, ricerca per iniziali) e ARIA listbox.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface SelectOption { value: string; label: string; hint?: string }

interface Props {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

const GAP = 6;
const MARGIN = 10;
const MAX_HEIGHT = 320;

interface Place { left: number; top?: number; bottom?: number; width: number; maxHeight: number; above: boolean }

/** Calcola la posizione del pannello: sotto se c'è spazio, altrimenti sopra; sempre dentro lo schermo. */
export function placePanel(trigger: { left: number; top: number; bottom: number; width: number }, viewport: { width: number; height: number }, wanted: number): Place {
  const below = viewport.height - trigger.bottom - GAP - MARGIN;
  const over = trigger.top - GAP - MARGIN;
  const above = below < Math.min(wanted, 180) && over > below;
  const room = Math.max(96, above ? over : below);
  const width = Math.min(Math.max(trigger.width, 200), viewport.width - MARGIN * 2);
  const left = Math.min(Math.max(trigger.left, MARGIN), viewport.width - width - MARGIN);
  const maxHeight = Math.min(MAX_HEIGHT, room);
  return above
    ? { left, bottom: viewport.height - trigger.top + GAP, width, maxHeight, above }
    : { left, top: trigger.bottom + GAP, width, maxHeight, above };
}

export function Select({ id, value, options, onChange, ariaLabel, className = '' }: Props) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const current = options[selectedIndex];

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const wanted = Math.min(MAX_HEIGHT, options.length * 40 + 12);
    setPlace(placePanel(box, { width: window.innerWidth, height: window.innerHeight }, wanted));
  }, [options.length]);

  const show = () => { measure(); setActive(selectedIndex); setClosing(false); setOpen(true); };
  const hide = useCallback((focus = true) => {
    setClosing(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => { setOpen(false); setClosing(false); }, reduce ? 0 : 140);
    if (focus) triggerRef.current?.focus({ preventScroll: true });
  }, []);
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    hide();
  };

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) hide(false);
    };
    const reflow = (event: Event) => { if (!listRef.current?.contains(event.target as Node)) measure(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, hide, measure]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKey = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const move = (index: number) => { event.preventDefault(); if (!open) show(); setActive(Math.min(Math.max(index, 0), last)); };
    switch (event.key) {
      case 'ArrowDown': return move(open ? active + 1 : selectedIndex);
      case 'ArrowUp': return move(open ? active - 1 : selectedIndex);
      case 'Home': return move(0);
      case 'End': return move(last);
      case 'PageDown': return move(active + 6);
      case 'PageUp': return move(active - 6);
      case 'Enter': case ' ':
        event.preventDefault();
        return open ? choose(active) : show();
      case 'Escape':
        if (open) { event.preventDefault(); event.stopPropagation(); hide(); }
        return;
      case 'Tab':
        if (open) { choose(active); }
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase(), at: now };
          const from = open ? active : selectedIndex;
          const order = [...options.keys()].map((step) => (from + 1 + step) % options.length);
          const hit = order.find((index) => options[index].label.toLowerCase().startsWith(typed.current.text))
            ?? order.find((index) => options[index].label.toLowerCase().startsWith(event.key.toLowerCase()));
          if (hit !== undefined) { if (open) setActive(hit); else if (options[hit].value !== value) onChange(options[hit].value); }
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef} id={id} type="button" className={`select-trigger ${className}`.trim()}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={ariaLabel} aria-activedescendant={open ? `${listId}-${active}` : undefined}
        data-open={open && !closing}
        onClick={() => (open ? hide() : show())} onKeyDown={onKey}
      >
        <span className="select-value">{current?.label ?? ''}</span>
        <span className="select-chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
      </button>
      {open && place && createPortal(
        <ul
          ref={listRef} id={listId} role="listbox" className="select-panel glass" tabIndex={-1}
          data-side={place.above ? 'top' : 'bottom'} data-closing={closing}
          style={{ left: place.left, top: place.top, bottom: place.bottom, width: place.width, maxHeight: place.maxHeight }}
          onPointerDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <li
              key={option.value} id={`${listId}-${index}`} role="option" data-index={index}
              aria-selected={index === selectedIndex} data-active={index === active}
              style={{ '--i': Math.min(index, 8) } as CSSProperties}
              onPointerMove={() => { if (active !== index) setActive(index); }}
              onClick={() => choose(index)}
            >
              <span className="select-label"><span>{option.label}</span>{option.hint && <small>{option.hint}</small>}</span>
              <span className="select-check" aria-hidden="true"><Icon name="check" size={15} /></span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}
