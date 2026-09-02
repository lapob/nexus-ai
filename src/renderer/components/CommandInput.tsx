/**
 * @module renderer/components/CommandInput
 * @description Campo testuale temporaneo richiamato da tastiera, invisibile quando non serve.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import type { LocalAttachment, NexusSettings, WorkspaceContext } from '../types/nexus';
import { NexusSelect } from './NexusSelect';

// #region 01 — Contratto e stato locale

interface CommandInputProps {
  open: boolean;
  queueing: boolean;
  onClose: () => void;
  onSubmit: (value: string, attachments: LocalAttachment[]) => void;
  workspace: WorkspaceContext;
  approvalMode: NonNullable<NexusSettings['actionApprovalMode']>;
  onSelectWorkspace: () => void;
  onClearWorkspace: () => void;
  onApprovalModeChange: (mode: NonNullable<NexusSettings['actionApprovalMode']>) => void;
  conversation?: { title: string; turns: number };
}

export function CommandInput({ open, queueing, onClose, onSubmit, workspace, approvalMode, onSelectWorkspace, onClearWorkspace, onApprovalModeChange, conversation }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentMessage, setAttachmentMessage] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
    else {
      setValue('');
      setAttachments([]);
      setAttachmentMessage('');
    }
  }, [open]);

  useLayoutEffect(() => {
    const textarea = input.current;
    if (!open || !textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, Math.max(96, window.innerHeight * 0.22))}px`;
  }, [open, value]);

  const selectAttachments = async () => {
    setAttachmentMessage('');
    try {
      const selected = await window.nexus.selectAttachments();
      setAttachments((current) => {
        const byId = new Map([...current, ...selected].map((attachment) => [attachment.id, attachment]));
        return [...byId.values()].slice(0, 8);
      });
    } catch {
      setAttachmentMessage('Non riesco a leggere questo elemento.');
    }
  };

  // #endregion

  // #region 02 — Composer

  return (
    <AnimatePresence>
      {open && (
        <motion.form
          className="command-input"
          data-expanded={Boolean(conversation || workspace.active || attachments.length)}
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.99 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onKeyDown={(event) => {
            // Il composer possiede tutti i tasti di scrittura. In particolare
            // Space non deve raggiungere lo shortcut vocale globale durante
            // l'animazione di apertura o se il focus viene spostato da Chromium.
            if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) onSubmit(value, attachments);
          }}
        >
          {conversation && (
            <div className="command-thread-context" aria-label={`Continui la conversazione ${conversation.title}`}>
              <i aria-hidden="true" />
              <span>
                <small>Stessa conversazione</small>
                <strong>{conversation.title}</strong>
              </span>
              <em>{conversation.turns} messaggi</em>
            </div>
          )}
          {workspace.active && (
            <div className="command-context" aria-label="Contesto operativo">
              <button type="button" className="workspace-chip" onClick={onSelectWorkspace} title="Cambia cartella di lavoro">
                <span>{workspace.name}</span>
              </button>
              <button type="button" className="workspace-clear" onClick={onClearWorkspace} aria-label="Rimuovi cartella di lavoro">Rimuovi</button>
              <div className="approval-chip">
                <NexusSelect
                  ariaLabel="Permessi azioni"
                  value={approvalMode}
                  options={[
                    { value: 'always', label: 'Chiedi sempre', detail: 'Conferma ogni azione' },
                    { value: 'dangerous-only', label: 'Solo azioni pericolose', detail: 'Conferma scritture e comandi' },
                    { value: 'full-access', label: 'Accesso completo', detail: 'Opera entro i limiti NexusNXS' }
                  ]}
                  onValueChange={(mode) => onApprovalModeChange(mode as NonNullable<NexusSettings['actionApprovalMode']>)}
                />
              </div>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="command-attachments" aria-label="Allegati">
              {attachments.map((attachment) => (
                <span className="attachment-chip" key={attachment.id}>
                  <i aria-hidden="true">·</i>
                  <span>{attachment.name}</span>
                  <button
                    type="button"
                    aria-label={`Rimuovi ${attachment.name}`}
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                  >−</button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={queueing ? 'Scrivi il prossimo messaggio…' : 'Scrivi, cerca o chiedi…'}
            maxLength={12000}
            aria-label="Comando o domanda"
            aria-keyshortcuts="Control+K"
          />
          <div className="command-meta">
            <div className="attachment-control">
              <button
                className="attachment-trigger"
                type="button"
                aria-label="Allega file"
                aria-describedby="attachment-trigger-hint"
                onClick={() => void selectAttachments()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 12.5l5.2-5.2a3 3 0 1 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.4-7.4" />
                </svg>
                <span>Allega</span>
              </button>
              <span id="attachment-trigger-hint" className="attachment-trigger-hint" role="tooltip">Foto, documenti e codice</span>
            </div>
            <span>{attachmentMessage || (attachments.length ? `${attachments.length} allegati` : 'Automatico')}</span>
            <small>{queueing ? 'Invio · metti in coda' : 'Invio per continuare'}</small>
            <button type="submit" disabled={!value.trim()} aria-label={queueing ? 'Metti il messaggio in coda' : 'Invia comando'}>↑</button>
          </div>
          <button className="sr-only" type="button" onClick={onClose}>Chiudi</button>
        </motion.form>
      )}
    </AnimatePresence>
  );

  // #endregion
}
