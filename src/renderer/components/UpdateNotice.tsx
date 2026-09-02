/**
 * @module renderer/components/UpdateNotice
 * @description Avviso discreto mostrato soltanto quando un aggiornamento è pronto.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../types/nexus';

export function UpdateNotice() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState('');
  useEffect(() => {
    window.nexus.updateStatus().then(setUpdate).catch(() => {});
    return window.nexus.onUpdateEvent(setUpdate);
  }, []);
  const visible = update?.status === 'ready' && update.version !== dismissedVersion;
  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          className="update-notice"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.985 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          aria-live="polite"
        >
          <i aria-hidden="true" />
          <div><strong>NexusNXS è pronto per aggiornarsi</strong><small>{update.releaseNotes || 'La nuova versione verrà applicata con un riavvio.'}</small></div>
          <button type="button" onClick={() => window.nexus.installUpdate()}>Riavvia</button>
          <button className="update-notice-later" type="button" aria-label="Ricordamelo più tardi" onClick={() => setDismissedVersion(update.version)}>Più tardi</button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
