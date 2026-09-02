/**
 * @module renderer/components/ConversationHistory
 * @description Archivio locale delle conversazioni, richiamabile senza dashboard.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConversationRecord } from '../systems/ConversationHistory';
import { documentUiLocale } from '../systems/Localization';
import { QuietClose } from './QuietClose';

interface ConversationHistoryProps {
  open: boolean;
  records: ConversationRecord[];
  currentId: string;
  onClose: () => void;
  onSelect: (record: ConversationRecord) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

const HISTORY_PAGE_SIZE = 80;

// #region 01 — Ricerca e date

function relativeDate(timestamp: number): string {
  const distance = Date.now() - timestamp;
  if (distance < 60_000) return 'adesso';
  if (distance < 3_600_000) return `${Math.max(1, Math.round(distance / 60_000))} min`;
  if (distance < 86_400_000) return `${Math.round(distance / 3_600_000)} h`;
  return new Date(timestamp).toLocaleDateString(documentUiLocale(), { day: '2-digit', month: 'short' });
}

function dateGroup(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const distance = Math.round((start - day) / 86_400_000);
  if (distance <= 0) return 'Oggi';
  if (distance === 1) return 'Ieri';
  if (distance < 7) return 'Questa settimana';
  return date.toLocaleDateString(documentUiLocale(), { month: 'long', year: 'numeric' });
}

// #endregion

// #region 02 — Superficie cronologia

export function ConversationHistory(props: ConversationHistoryProps) {
  const { open, records, currentId, onClose, onSelect, onNew, onDelete } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'changes' | 'errors'>('all');
  const [visibleLimit, setVisibleLimit] = useState(HISTORY_PAGE_SIZE);
  const availableFilters = useMemo(() => ({
    changes: records.some((record) => record.turns.some((turn) => (turn.artifacts || []).some((item) => item.kind === 'file-change'))),
    errors: records.some((record) => record.incomplete || record.turns.some((turn) => /\b(?:errore|error|fallit|failed|codice [1-9])\b/i.test(turn.content)))
  }), [records]);
  const visibleRecords = useMemo(() => {
    const locale = documentUiLocale();
    const normalized = query.toLocaleLowerCase(locale).trim();
    return records.filter((record) => {
      const artifacts = record.turns.flatMap((turn) => turn.artifacts || []);
      if (filter === 'changes' && !artifacts.some((item) => item.kind === 'file-change')) return false;
      if (filter === 'errors' && !record.incomplete && !record.turns.some((turn) => /\b(?:errore|error|fallit|failed|codice [1-9])\b/i.test(turn.content))) return false;
      if (!normalized) return true;
      return record.title.toLocaleLowerCase(locale).includes(normalized)
        || record.turns.some((turn) => turn.content.toLocaleLowerCase(locale).includes(normalized)
          || (turn.artifacts || []).some((item) => `${item.title} ${item.language || ''} ${item.subtitle || ''}`.toLocaleLowerCase(locale).includes(normalized)));
    });
  }, [filter, query, records]);
  const renderedRecords = useMemo(
    () => visibleRecords.slice(0, visibleLimit),
    [visibleLimit, visibleRecords]
  );
  useEffect(() => {
    if (open) setVisibleLimit(HISTORY_PAGE_SIZE);
  }, [filter, open, query]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="conversation-history-scrim"
          initial={false}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.aside
            className="conversation-history"
            data-density={visibleRecords.length <= 3 ? 'sparse' : 'full'}
            initial={false}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            aria-label="Cronologia conversazioni"
          >
            <div className="conversation-history-floating-actions">
              <button type="button" aria-label="Nuova conversazione" title="Nuova conversazione" onClick={onNew}>+</button>
              <QuietClose label="Chiudi cronologia" onClick={onClose} />
            </div>
            <div className="conversation-history-controls">
              <label className="conversation-history-search">
                <span className="sr-only">Cerca nella cronologia</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={records.length === 1 ? 'Cerca in 1 conversazione' : `Cerca in ${records.length} conversazioni`}
                  autoFocus
                />
              </label>
              {(availableFilters.changes || availableFilters.errors) && (
                <div className="conversation-history-filters" aria-label="Filtra cronologia">
                  <button type="button" data-active={filter === 'all'} onClick={() => setFilter('all')}>Tutte</button>
                  {availableFilters.changes && <button type="button" data-active={filter === 'changes'} onClick={() => setFilter('changes')}>File modificati</button>}
                  {availableFilters.errors && <button type="button" data-active={filter === 'errors'} onClick={() => setFilter('errors')}>Da controllare</button>}
                </div>
              )}
            </div>
            <div className="conversation-history-list">
              {records.length === 0 && (
                <div className="conversation-history-empty">
                  <i aria-hidden="true">◇</i>
                  <strong>La cronologia è vuota</strong>
                  <p>Le conversazioni completate appariranno qui, soltanto su questo PC.</p>
                </div>
              )}
              {records.length > 0 && visibleRecords.length === 0 && (
                <div className="conversation-history-empty">
                  <i aria-hidden="true">◇</i>
                  <strong>Nessun risultato</strong>
                  <p>Prova con un termine presente nel titolo o nei messaggi.</p>
                </div>
              )}
              {renderedRecords.map((record, index) => {
                const group = dateGroup(record.updatedAt);
                const previousGroup = index > 0 ? dateGroup(renderedRecords[index - 1].updatedAt) : '';
                return (
                  <Fragment key={record.id}>
                    {group !== previousGroup && <div className="conversation-history-group">{group}</div>}
                    <article data-current={record.id === currentId}>
                      <button type="button" onClick={() => onSelect(record)}>
                        <strong>{record.title}</strong>
                        <small className="conversation-history-meta">
                          <span>{relativeDate(record.updatedAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{record.turns.length} {record.turns.length === 1 ? 'messaggio' : 'messaggi'}</span>
                          <span className="conversation-history-signals" aria-hidden="true">
                            {record.id === currentId && <i data-kind="active" title="Conversazione attiva" />}
                            {record.incomplete && <i data-kind="incomplete" title="Risposta da completare" />}
                            {record.turns.some((turn) => (turn.artifacts || []).length > 0) && <i data-kind="activity" title="Contiene attività" />}
                          </span>
                          <span className="sr-only">
                            {record.id === currentId ? ' Conversazione attiva.' : ''}
                            {record.incomplete ? ' Risposta da completare.' : ''}
                            {record.turns.some((turn) => (turn.artifacts || []).length > 0) ? ' Contiene attività.' : ''}
                          </span>
                        </small>
                      </button>
                      <button className="conversation-delete" type="button" aria-label={`Elimina ${record.title}`} onClick={() => onDelete(record.id)}>Rimuovi</button>
                    </article>
                  </Fragment>
                );
              })}
              {renderedRecords.length < visibleRecords.length && (
                <button
                  className="conversation-history-more"
                  type="button"
                  onClick={() => setVisibleLimit((current) => current + HISTORY_PAGE_SIZE)}
                >
                  Mostra altre conversazioni
                  <small>{visibleRecords.length - renderedRecords.length} rimanenti</small>
                </button>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// #endregion
