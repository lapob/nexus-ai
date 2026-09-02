/**
 * @module renderer/components/TaskPanel
 * @description Sequenza discreta delle fasi cognitive e operative correnti.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { TaskStep } from '../types/nexus';

export function TaskPanel({ steps }: { steps: TaskStep[] }) {
  const [now, setNow] = useState(Date.now());
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
    <section className="entity-section task-panel" data-depth={deep ? 'deep' : 'quick'} aria-labelledby="task-heading">
      <span className="section-label" id="task-heading">Sto lavorando <i>{active && elapsed > 0 ? `${elapsed}s` : deep ? 'Approfondita' : 'Diretta'}</i></span>
      {active && <strong className="task-active-label" aria-live="polite">{active.label}</strong>}
      <div className="task-phase-rail" aria-label={`${completed} fasi completate su ${steps.length}`}>
        {steps.map((step) => <i key={step.id} data-status={step.status} />)}
      </div>
      <ol aria-label="Fasi di lavoro">
        <AnimatePresence initial={false}>
          {steps.filter((step) => step.status !== 'waiting').map((step, index) => (
            <motion.li
              key={step.id}
              data-status={step.status}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: step.status === 'waiting' ? 0.34 : 1, x: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: index * 0.015 }}
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
