/**
 * @module web/UpdateCard
 * @description Scheda aggiornamento del desktop: annuncia la nuova versione, la scarica con "Aggiorna"
 * mostrando avanzamento, velocità e tempo residuo, poi accompagna il riavvio automatico dell'app.
 */
import { AnimatePresence, m } from 'framer-motion';
import type { DesktopUpdate, UpdateState } from './desktopPresence';
import { Icon } from './Icon';
import './update-card.css';

const RING = 2 * Math.PI * 19;
const SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const;

function megabytes(bytes = 0) {
  const value = bytes / (1024 * 1024);
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function remaining(state: UpdateState) {
  const left = Math.max(0, (state.total || 0) - (state.transferred || 0));
  const speed = state.bytesPerSecond || 0;
  if (!speed || !left) return '';
  const seconds = Math.ceil(left / speed);
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

function copy(state: UpdateState) {
  const version = state.version ? `NexusNXS ${state.version}` : 'Nuova versione';
  switch (state.status) {
    case 'available': return { title: `${version} è disponibile`, detail: state.releaseNotes || 'Novità, correzioni e miglioramenti di sicurezza, verificati e firmati.' };
    case 'downloading': {
      const eta = remaining(state);
      const amount = state.total ? `${megabytes(state.transferred)} di ${megabytes(state.total)} MB` : 'Avvio del download…';
      const speed = state.bytesPerSecond ? ` · ${megabytes(state.bytesPerSecond)} MB/s` : '';
      return { title: `Scarico ${version}`, detail: `${amount}${speed}${eta ? ` · ancora ${eta}` : ''}` };
    }
    case 'ready': return { title: `${version} è pronto`, detail: 'Verificato. Riavvia per completare: le conversazioni restano dove sono.' };
    case 'installing': return { title: 'Riavvio in corso…', detail: `Installo ${version}: NexusNXS si riapre da solo tra un attimo.` };
    default: return { title: state.phase === 'install' ? 'Riavvio non riuscito' : 'Download interrotto', detail: 'Nessun problema: la versione attuale continua a funzionare. Puoi riprovare.' };
  }
}

/** Anello di avanzamento attorno all'icona: indeterminato in attesa, pieno a download verificato. */
function Orb({ state }: { state: UpdateState }) {
  const progress = state.status === 'downloading' ? Math.max(0.02, (state.progress || 0) / 100) : state.status === 'available' || state.status === 'error' ? 0 : 1;
  const icon = state.status === 'installing' ? 'retry' : state.status === 'ready' ? 'check' : state.status === 'error' ? 'retry' : 'download';
  return (
    <span className="update-orb" data-state={state.status} aria-hidden="true">
      <svg viewBox="0 0 44 44" className="update-ring">
        <defs>
          <linearGradient id="update-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" />
            <stop offset="100%" stopColor="oklch(85% .12 165)" />
          </linearGradient>
        </defs>
        <circle className="update-ring-track" cx="22" cy="22" r="19" />
        <circle className="update-ring-fill" cx="22" cy="22" r="19" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
      </svg>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={icon} className="update-orb-icon" initial={{ opacity: 0, scale: 0.6, rotate: -40 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.6, rotate: 40 }} transition={SPRING}>
          <Icon name={icon} size={17} />
        </m.span>
      </AnimatePresence>
    </span>
  );
}

export function UpdateCard({ update, hidden = false }: { update: DesktopUpdate; hidden?: boolean }) {
  const state = update.state;
  const show = Boolean(state) && update.visible && !hidden;
  const text = state ? copy(state) : { title: '', detail: '' };
  const status = state?.status ?? '';
  const percent = Math.round(state?.progress || 0);
  return (
    <>
      <AnimatePresence>{show && status === 'installing' && (
        <m.div key="veil" className="update-veil" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />
      )}</AnimatePresence>
      <AnimatePresence>{show && state && (
        <m.section key="update-card" className="update-card glass" data-state={status} role="status" aria-live="polite" aria-label="Aggiornamento di NexusNXS"
          initial={{ opacity: 0, y: -16, scale: 0.96, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, scale: 0.97, filter: 'blur(4px)' }} transition={SPRING}>
          <span className="update-aura" aria-hidden="true" />
          <Orb state={state} />
          <div className="update-body">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.strong key={text.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>{text.title}</m.strong>
            </AnimatePresence>
            <small>{text.detail}</small>
            {status === 'downloading' && (
              <span className="update-track" role="progressbar" aria-label="Download aggiornamento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <i style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} />
              </span>
            )}
          </div>
          <div className="update-actions">
            {status === 'downloading' && <span className="update-percent">{percent}<small>%</small></span>}
            {status === 'available' && <button type="button" className="update-primary" onClick={update.download}><Icon name="download" size={16} /><span>Aggiorna</span></button>}
            {status === 'ready' && <button type="button" className="update-primary" onClick={update.install}><Icon name="retry" size={16} /><span>Riavvia</span></button>}
            {status === 'error' && <button type="button" className="update-primary" onClick={update.download}><Icon name="retry" size={16} /><span>Riprova</span></button>}
            {(status === 'available' || status === 'ready' || status === 'error') && (
              <button type="button" className="icon-button small update-later" aria-label={status === 'ready' ? 'Più tardi: si installa alla chiusura' : 'Più tardi'}
                title={status === 'ready' ? 'Più tardi (si installa alla chiusura)' : 'Più tardi'} onClick={update.dismiss}><Icon name="close" size={15} /></button>
            )}
          </div>
        </m.section>
      )}</AnimatePresence>
    </>
  );
}
