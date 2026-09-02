/**
 * @module renderer/components/Permissions
 * @description Consenso monouso integrato per le azioni locali proposte da NEXUSNXS.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { PermissionProposal } from '../hooks/useNexusController';

export function Permissions({
  proposal,
  onDecision
}: {
  proposal: PermissionProposal | null;
  onDecision: (approved: boolean) => void;
}) {
  return (
    <AnimatePresence>
      {proposal && (
        <motion.div
          className="permission-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="permission-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') onDecision(false);
          }}
        >
          <motion.section
            className="permission-card"
            data-risk={proposal.risk}
            initial={{ opacity: 0, scale: 0.985, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 10 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="permission-heading">
              <span className="permission-orbit" data-risk={proposal.risk} aria-hidden="true"><i /></span>
              <div>
                <small>{proposal.risk === 'high' ? 'Conferma necessaria' : 'Autorizzazione richiesta'}</small>
                <strong id="permission-title">{proposal.summary}</strong>
              </div>
            </div>
            {proposal.reason && <p className="permission-reason">{proposal.reason}</p>}
            <details className="permission-preview" open={proposal.risk === 'high'}>
              <summary>Dettagli dell’operazione</summary>
              <pre>{proposal.preview}</pre>
            </details>
            <div className="permission-footer-copy">
              <span>Valida una sola volta</span>
              <small>L’azione successiva richiederà una nuova conferma</small>
            </div>
            <footer>
              <button type="button" className="permission-deny" onClick={() => onDecision(false)}>Annulla</button>
              <button type="button" className="permission-approve" autoFocus onClick={() => onDecision(true)}>
                Consenti
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
