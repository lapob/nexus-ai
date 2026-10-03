/**
 * @module renderer/components/TaskPanel
 * @description Sequenza discreta delle fasi cognitive e operative correnti.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useState } from 'react';
import type { TaskStep } from '../types/nexus';

export function TaskPanel({ steps }: { steps: TaskStep[] }) {
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!steps.some((step) => step.status === 'active')) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [steps]);
  if (!steps.length) return null;
  const deep = steps.some((step) => step.label === 'Comprendo il problema');
  const active = steps.find((step) => step.status === 'active');
  const elapsed = active?.startedAt ? Math.max(0, Math.floor((now - active.startedAt) / 1000)) : 0;
  const completed = steps.filter((step) => step.status === 'complete').length;
  return (
    <section className="entity-section task-panel" data-depth={deep ? 'deep' : 'quick'} aria-label="Attività corrente">
      <div className="task-panel-heading">
        <span className="section-label">Sto lavorando <i>{active && elapsed > 0 ? `${elapsed}s` : deep ? 'Approfondita' : 'Diretta'}</i></span>
        <button className="response-icon-action" type="button" aria-label={expanded ? 'Nascondi fasi di lavoro' : 'Mostra fasi di lavoro'} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m3 7 2 2 3-3m-5 9 2 2 3-3M12 7h9M12 15h9" /></svg>
        </button>
      </div>
      {active && <strong className="task-active-label" aria-live="polite">{active.label}</strong>}
      <div className="task-phase-rail" aria-label={`${completed} fasi completate su ${steps.length}`}>
        {steps.map((step) => <i key={step.id} data-status={step.status} />)}
      </div>
      <ol id={detailsId} aria-label="Fasi di lavoro" hidden={!expanded}>
        <AnimatePresence initial={false}>
          {expanded && steps.map((step, index) => (
            <motion.li
              key={step.id}
              data-status={step.status}
              initial={reducedMotion ? false : { opacity: 0, x: -5 }}
              animate={{ opacity: step.status === 'waiting' ? 0.34 : 1, x: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1], delay: reducedMotion ? 0 : index * 0.015 }}
            >
              <span className="task-dot" />
              <span>{step.label}</span>
              {step.status === 'complete' && <em aria-label="Completato">✓</em>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
