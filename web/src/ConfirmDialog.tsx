/**
 * @module web/ConfirmDialog
 * @description Dialogo di conferma premium (alertdialog): vetro pieno, icona del tono, ingresso a molla e uscita morbida.
 * Annullare è la scelta predefinita e ha il fuoco; Esc o un clic fuori annullano; Tab resta dentro il dialogo;
 * il fuoco torna al controllo di partenza. Sta sopra a qualsiasi foglio aperto (anche il Centro di controllo).
 */
import { m } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';
import { settleConfirm, type PendingConfirm } from './confirm';
import { Icon, type IconName } from './Icon';

const TONE_ICON: Record<NonNullable<PendingConfirm['tone']>, IconName> = { default: 'shield', danger: 'trash', warning: 'alert' };

export function ConfirmDialog({ request }: { request: PendingConfirm }) {
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const tone = request.tone ?? 'default';

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus({ preventScroll: true });
    // Cattura: Esc chiude solo questo dialogo, non il foglio che c'è sotto.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); settleConfirm(request.id, false); return; }
      if (event.key !== 'Tab' || !box.current) return;
      const buttons = [...box.current.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      event.stopImmediatePropagation();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [request.id]);

  return (
    <m.div className="overlay confirm-overlay" role="presentation" onMouseDown={() => settleConfirm(request.id, false)}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <m.div ref={box} className="confirm glass" data-tone={tone} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}>
        <span className="confirm-icon" aria-hidden="true"><Icon name={TONE_ICON[tone]} size={22} /></span>
        <h2 id={titleId}>{request.title}</h2>
        <div id={bodyId} className="confirm-body">
          {request.message && <p>{request.message}</p>}
          {request.detail && <p className="confirm-detail">{request.detail}</p>}
        </div>
        <div className="confirm-actions">
          <button ref={cancel} type="button" className="confirm-cancel" onClick={() => settleConfirm(request.id, false)}>{request.cancelLabel ?? 'Annulla'}</button>
          <button type="button" className="confirm-ok" onClick={() => settleConfirm(request.id, true)}>{request.confirmLabel ?? 'Conferma'}</button>
        </div>
      </m.div>
    </m.div>
  );
}
