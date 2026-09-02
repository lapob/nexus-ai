/**
 * @module renderer/components/LiveLogs
 * @description Flusso temporale minimale delle sole operazioni utili alla persona.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { LiveLogEntry } from '../types/nexus';

export function LiveLogs({ entries }: { entries: LiveLogEntry[] }) {
  return (
    <section
      className="entity-section live-logs"
      aria-labelledby="logs-heading"
      tabIndex={0}
      aria-label="Registro live. Passa il puntatore o usa il focus per vedere gli eventi precedenti."
    >
      <span className="section-label" id="logs-heading">Registro live</span>
      <div className="log-stream" role="log" aria-live="polite">
        <AnimatePresence initial={false}>
          {entries.slice(-3).map((entry, index, visibleEntries) => (
            <motion.div
              className="log-entry"
              key={entry.id}
              data-current={index === visibleEntries.length - 1}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <i aria-hidden="true" />
              <time>{entry.time}</time>
              <span>{entry.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
