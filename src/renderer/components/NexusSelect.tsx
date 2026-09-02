/**
 * @module renderer/components/NexusSelect
 * @description Selettore accessibile disegnato nel linguaggio visivo NEXUSNXS.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';
import { uiCopy } from '../systems/Localization';

// #region 01 — Contratti

export interface NexusSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface NexusSelectProps {
  value: string;
  options: NexusSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
}

// #endregion

// #region 02 — Selettore

export function NexusSelect({ value, options, onValueChange, ariaLabel }: NexusSelectProps) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) || options[0];
  const labels = uiCopy();

  const toggle = () => {
    if (!open && root.current) {
      const rect = root.current.getBoundingClientRect();
      // Il menu nelle impostazioni può crescere fino a 30rem anche quando il
      // trigger è più stretto: l'allineamento usa quindi la larghezza reale
      // massima, evitando che sporga dalla finestra sulle viewport compatte.
      const desiredWidth = Math.max(rect.width, Math.min(480, window.innerWidth - 48));
      setAlign(rect.left + desiredWidth > window.innerWidth - 24 ? 'right' : 'left');
      const spaceBelow = window.innerHeight - rect.bottom - 24;
      const spaceAbove = rect.top - 24;
      setSide(spaceBelow < 260 && spaceAbove > spaceBelow ? 'top' : 'bottom');
    }
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const selectedOption = root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
      (selectedOption || root.current?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus();
    });
  }, [open]);

  return (
    <div className="nexus-select" ref={root} data-open={open} data-align={align} data-side={side}>
      <button
        ref={trigger}
        className="nexus-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span><strong>{selected?.label || labels.select}</strong>{selected?.detail && <small>{selected.detail}</small>}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            className="nexus-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onKeyDown={(event) => {
              const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])];
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                items[(current + delta + items.length) % items.length]?.focus();
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
              }
            }}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
              >
                <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// #endregion
