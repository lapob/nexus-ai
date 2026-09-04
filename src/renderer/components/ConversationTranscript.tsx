/**
 * @module renderer/components/ConversationTranscript
 * @description Lettura completa e minimale di una conversazione archiviata.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationRecord } from '../systems/ConversationHistory';
import { documentUiLocale } from '../systems/Localization';
import { ArtifactShelf, MarkdownContent } from './ResponseSurface';
import { QuietClose } from './QuietClose';

interface ConversationTranscriptProps {
  record: ConversationRecord | null;
  onClose: () => void;
  onSteer: (record: ConversationRecord, turnIndex: number, instruction: string) => void;
  onDeleteFrom: (record: ConversationRecord, turnIndex: number) => void;
}

// #region 01 — Formattazione e scorrimento

function turnTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(documentUiLocale(), {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// #endregion

// #region 02 — Superficie di lettura

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return <>{text.split(pattern).map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase()
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : part)}</>;
}

export function ConversationTranscript({ record, onClose, onSteer, onDeleteFrom }: ConversationTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const turnRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeChapter, setActiveChapter] = useState(0);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [steeringTurn, setSteeringTurn] = useState<number | null>(null);
  const [steeringText, setSteeringText] = useState('');
  const [actionTurn, setActionTurn] = useState<number | null>(null);
  const [deleteTurn, setDeleteTurn] = useState<number | null>(null);
  const chapters = useMemo(() => (record?.turns || [])
    .map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => turn.role === 'user'), [record]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return (record?.turns || []).map((turn, index) => ({ turn, index }))
      .filter(({ turn }) => turn.content.toLocaleLowerCase().includes(normalized));
  }, [query, record]);

  const updateProgress = () => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null;
      const scroller = scrollRef.current;
      const indicator = progressRef.current;
      if (!scroller || !indicator) return;
      const range = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      const progress = Math.max(0, Math.min(1, scroller.scrollTop / range));
      setScrolled((current) => current === (scroller.scrollTop > 48) ? current : scroller.scrollTop > 48);
      const track = indicator.parentElement;
      const travel = Math.max(0, (track?.clientHeight || 0) - indicator.offsetHeight);
      indicator.style.transform = `translate3d(0, ${progress * travel}px, 0)`;
      track?.toggleAttribute('data-scrollable', range > 2);
      const threshold = scroller.scrollTop + scroller.clientHeight * 0.32;
      let nextChapter = 0;
      for (let index = 0; index < chapters.length; index += 1) {
        const node = turnRefs.current[chapters[index].index];
        if (node && node.offsetTop <= threshold) nextChapter = index;
      }
      setActiveChapter((current) => current === nextChapter ? current : nextChapter);
    });
  };

  const goToChapter = (turnIndex: number) => {
    const scroller = scrollRef.current;
    const target = turnRefs.current[turnIndex];
    if (!scroller || !target) return;
    scroller.scrollTo({
      top: Math.max(0, target.offsetTop - Math.min(120, scroller.clientHeight * 0.12)),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  const goToMatch = (offset: number) => {
    if (!matches.length) return;
    const next = (activeMatch + offset + matches.length) % matches.length;
    setActiveMatch(next);
    goToChapter(matches[next].index);
  };

  const toggleBookmark = (turnIndex: number) => {
    if (!record) return;
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(turnIndex)) next.delete(turnIndex); else next.add(turnIndex);
      try { window.localStorage.setItem(`nexus.conversation.bookmarks.${record.id}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!record) return;
    scrollRef.current?.scrollTo({ top: 0 });
    turnRefs.current = [];
    setActiveChapter(0);
    setQuery('');
    setActiveMatch(0);
    setSearchOpen(false);
    setScrolled(false);
    setSteeringTurn(null);
    setSteeringText('');
    setActionTurn(null);
    setDeleteTurn(null);
    try {
      const stored = JSON.parse(window.localStorage.getItem(`nexus.conversation.bookmarks.${record.id}`) || '[]');
      setBookmarks(new Set(Array.isArray(stored) ? stored.filter(Number.isInteger) : []));
    } catch { setBookmarks(new Set()); }
    updateProgress();
    return () => {
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    };
  }, [record?.id]);

  useEffect(() => {
    if (actionTurn === null && deleteTurn === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setActionTurn(null);
      setDeleteTurn(null);
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.conversation-turn-actions, .conversation-delete-confirm')) return;
      setActionTurn(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [actionTurn, deleteTurn]);

  return (
    <AnimatePresence>
      {record && (
        <motion.section
          className="conversation-transcript"
          data-scrolled={scrolled}
          initial={{ opacity: 0, y: 8, filter: 'blur(7px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0)' }}
          exit={{ opacity: 0, y: 5, filter: 'blur(4px)' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-label={`Conversazione: ${record.title}`}
          onWheel={(event) => {
            const target = event.target as Element;
            if (target.closest('textarea, input, [role="menu"], .conversation-transcript-scroll')) return;
            const scroller = scrollRef.current;
            if (!scroller) return;
            event.preventDefault();
            scroller.scrollTop += event.deltaY;
          }}
        >
          <QuietClose label="Chiudi conversazione" onClick={onClose} />
          <div className="conversation-active-context">
            <span>Conversazione attiva</span>
            <strong>{record.title}</strong>
            {record.workspace?.name && <small>⌁ {record.workspace.name}</small>}
            <button className="conversation-search-toggle" type="button" onClick={() => setSearchOpen((open) => !open)} aria-expanded={searchOpen} aria-label="Cerca nella conversazione">⌕</button>
            <div className="conversation-transcript-search" role="search" data-open={searchOpen || Boolean(query)}>
              <input aria-label="Cerca nella conversazione" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveMatch(0); }} placeholder="Cerca nella conversazione…" />
              {query && <small>{matches.length ? `${activeMatch + 1}/${matches.length}` : 'Nessun risultato'}</small>}
              {matches.length > 1 && <span><button type="button" onClick={() => goToMatch(-1)} aria-label="Risultato precedente">↑</button><button type="button" onClick={() => goToMatch(1)} aria-label="Risultato successivo">↓</button></span>}
            </div>
          </div>
          <div ref={scrollRef} className="conversation-transcript-scroll" onScroll={updateProgress}>
            <p className="conversation-transcript-date">
              {new Date(record.createdAt).toLocaleDateString(documentUiLocale(), {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </p>
            <h1>{record.title}</h1>
            {record.incomplete && (
              <p className="conversation-transcript-incomplete">
                La risposta si è fermata prima della conclusione. Continua la conversazione per completarla.
              </p>
            )}
            <div className="conversation-transcript-turns">
              {record.turns.map((turn, index) => (
                <article
                  key={`${turn.createdAt}-${index}`}
                  ref={(node) => { turnRefs.current[index] = node; }}
                  data-role={turn.role}
                  aria-label={turn.role === 'user' ? 'Il tuo messaggio' : 'Messaggio di NexusNXS'}
                >
                  <small>{turn.role === 'user' ? 'Tu' : 'NexusNXS'} · {turnTime(turn.createdAt)}</small>
                  <div className="conversation-turn-actions" data-open={actionTurn === index}>
                    <button className="conversation-turn-menu-trigger" type="button" onClick={() => setActionTurn((current) => current === index ? null : index)} aria-expanded={actionTurn === index} aria-label="Azioni del messaggio">•••</button>
                    {actionTurn === index && <div className="conversation-turn-menu" role="menu">
                      {turn.role === 'user' && <button className="conversation-bookmark" role="menuitem" type="button" data-active={bookmarks.has(index)} onClick={() => { toggleBookmark(index); setActionTurn(null); }}>{bookmarks.has(index) ? 'Rimuovi segnalibro' : 'Segna'}</button>}
                      <button role="menuitem" type="button" onClick={() => { setSteeringTurn(index); setSteeringText(''); setActionTurn(null); }}>Intervieni da qui</button>
                      <button role="menuitem" type="button" onClick={() => { setDeleteTurn(index); setActionTurn(null); }}>Elimina da qui</button>
                    </div>}
                  </div>
                  {turn.role === 'assistant'
                    ? <><MarkdownContent text={turn.content} /><ArtifactShelf artifacts={turn.artifacts || []} /></>
                    : <p><HighlightedText text={turn.content} query={query} /></p>}
                  {steeringTurn === index && (
                    <form className="conversation-steer" onSubmit={(event) => { event.preventDefault(); const value = steeringText.trim(); if (record && value) onSteer(record, index, value); }}>
                      <textarea autoFocus rows={2} maxLength={12000} value={steeringText} onChange={(event) => setSteeringText(event.target.value)} placeholder="Aggiungi una direzione da questo punto…" />
                      <span><button type="button" onClick={() => setSteeringTurn(null)}>Annulla</button><button type="submit" disabled={!steeringText.trim()}>Intervieni</button></span>
                    </form>
                  )}
                  {deleteTurn === index && (
                    <div className="conversation-delete-confirm" role="alertdialog" aria-label="Conferma eliminazione">
                      <span><strong>Eliminare da qui?</strong><small>Questo messaggio e quelli successivi verranno rimossi.</small></span>
                      <span><button type="button" onClick={() => setDeleteTurn(null)}>Annulla</button><button type="button" onClick={() => { if (record) onDeleteFrom(record, index); setDeleteTurn(null); }}>Elimina</button></span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
          <div className="conversation-transcript-progress" aria-hidden="true">
            <span ref={progressRef} />
          </div>
          {chapters.length >= 4 && (
            <aside className="conversation-chapter-rail" aria-label="Capitoli della conversazione">
              {chapters.map(({ turn, index }, chapterIndex) => (
                <button
                  key={`${turn.createdAt}-${index}`}
                  type="button"
                  data-active={chapterIndex === activeChapter}
                  data-bookmarked={bookmarks.has(index)}
                  aria-current={chapterIndex === activeChapter ? 'step' : undefined}
                  aria-label={`Capitolo ${chapterIndex + 1}: ${turn.content.slice(0, 80)}`}
                  data-label={turn.content.replace(/\s+/g, ' ').slice(0, 96)}
                  onClick={() => goToChapter(index)}
                >
                  <span />
                </button>
              ))}
            </aside>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// #endregion
