/**
 * @module web/WindowControls
 * @description Controlli finestra integrati nella barra (solo app desktop): riduci a icona,
 * ingrandisci/ripristina con icona che si trasforma secondo lo stato reale, chiudi.
 * Sostituiscono i pulsanti di sistema, poco leggibili sopra la barra trasparente.
 */
import { useEffect, useState } from 'react';
import { desktopBridge } from './platform';

type WindowState = { maximized: boolean; fullscreen: boolean; focused: boolean };

export function WindowControls() {
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true });
  const available = typeof desktopBridge?.windowAction === 'function';

  useEffect(() => {
    if (!available) return;
    let alive = true;
    void Promise.resolve(desktopBridge!.windowAction('state'))
      .then((value: WindowState | null) => { if (alive && value) setState(value); }).catch(() => {});
    const off = desktopBridge!.onWindowState?.((value: WindowState) => setState(value)) as (() => void) | undefined;
    return () => { alive = false; off?.(); };
  }, [available]);

  if (!available) return null;
  const act = (action: 'minimize' | 'toggle-maximize' | 'close') => {
    void Promise.resolve(desktopBridge!.windowAction(action))
      .then((value: WindowState | null) => value && setState(value)).catch(() => {});
  };
  const expanded = state.maximized || state.fullscreen;
  const sizeLabel = state.fullscreen ? 'Esci da schermo intero' : state.maximized ? 'Ripristina finestra' : 'Ingrandisci';

  return (
    <div className="window-controls" role="group" aria-label="Finestra" data-focused={state.focused} data-expanded={expanded}>
      <button type="button" className="window-control" data-action="minimize" aria-label="Riduci a icona" onClick={() => act('minimize')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
      </button>
      <button type="button" className="window-control" data-action="size" aria-label={sizeLabel} onClick={() => act('toggle-maximize')}>
        {/* Un quadrato (ingrandisci) che diventa due quadrati sovrapposti (ripristina). */}
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path className="window-glyph-back" d="M6 4.5V4a1.5 1.5 0 0 1 1.5-1.5H12A1.5 1.5 0 0 1 13.5 4v4.5A1.5 1.5 0 0 1 12 10h-.5" />
          <rect className="window-glyph-front" x="3" y="3" width="10" height="10" rx="1.8" />
        </svg>
      </button>
      <button type="button" className="window-control" data-action="close" aria-label="Chiudi" onClick={() => act('close')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  );
}
