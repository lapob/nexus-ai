/**
 * @module renderer/components/ResponseSurface
 * @description Superficie di lettura per risposte, Markdown e sorgenti.
 */
import { memo, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QuietClose } from './QuietClose';
import type { OperationalArtifact } from '../types/nexus';

// #region 01 — Markdown leggero e sicuro

interface ResponseSurfaceProps {
  response: string;
  error: string;
  active: boolean;
  artifacts: OperationalArtifact[];
  previousResponse?: string;
  trainingSaved: boolean;
  onApproveTraining: (approvedResponse?: string, rejectedResponse?: string) => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onDismiss: () => void;
}

type MarkdownBlock =
  | { kind: 'code'; language: string; content: string }
  | { kind: 'heading'; level: number; content: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'callout'; tone: 'note' | 'tip' | 'warning' | 'result'; title: string; content: string }
  | { kind: 'divider' }
  | { kind: 'quote'; content: string }
  | { kind: 'paragraph'; content: string };

type ResponseKind = 'answer' | 'plan' | 'research' | 'code';

function responseKind(text: string): ResponseKind {
  if (/```|\b(?:function|class|const|SELECT|CREATE TABLE|def )\b/u.test(text)) return 'code';
  if (/\[[^\]]+\]\(https:\/\/|\b(?:fonti|sources|ricerca web)\b/iu.test(text)) return 'research';
  if (/^#{1,4}\s|(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/mu.test(text)) return 'plan';
  return 'answer';
}

function streamSafeMarkdown(markdown: string) {
  let safe = markdown;
  for (const token of ['**', '`']) {
    if ((safe.split(token).length - 1) % 2 !== 0) {
      const index = safe.lastIndexOf(token);
      safe = `${safe.slice(0, index)}${safe.slice(index + token.length)}`;
    }
  }
  const singleStars = [...safe.matchAll(/(?<!\*)\*(?!\*)/g)];
  if (singleStars.length % 2 !== 0) {
    const index = singleStars.at(-1)?.index ?? -1;
    if (index >= 0) safe = `${safe.slice(0, index)}${safe.slice(index + 1)}`;
  }
  return safe;
}

function tableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w#+.-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', language: fence[1] || 'text', content: code.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, content: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: 'divider' });
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length
      && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]) && lines[index + 1].includes('|')) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index++]));
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    const callout = line.match(/^>\s*\[!(NOTE|TIP|WARNING|RESULT)\]\s*(.*)$/i);
    if (callout) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && /^>\s?/.test(lines[index])) content.push(lines[index++].replace(/^>\s?/, ''));
      const tone = callout[1].toLowerCase() as 'note' | 'tip' | 'warning' | 'result';
      const defaultTitle = { note: 'Nota', tip: 'Suggerimento', warning: 'Attenzione', result: 'Risultato' }[tone];
      blocks.push({ kind: 'callout', tone, title: callout[2] || defaultTitle, content: content.join(' ') });
      continue;
    }

    const listItem = line.match(/^\s*(?:(\d+)[.)]|[-*])\s+(.+)$/);
    if (listItem) {
      const ordered = Boolean(listItem[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:(\d+)[.)]|[-*])\s+(.+)$/);
        if (!match || Boolean(match[1]) !== ordered) break;
        items.push(match[2]);
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index++].replace(/^>\s?/, ''));
      }
      blocks.push({ kind: 'quote', content: quote.join(' ') });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !/^```/.test(lines[index])
      && !/^(#{1,4})\s+/.test(lines[index])
      && !/^\s*(?:(\d+)[.)]|[-*])\s+/.test(lines[index])
      && !/^>\s?/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', content: paragraph.join(' ') });
  }

  return blocks;
}

function RichLink({ label, url }: { label: string; url: string }) {
  const [preview, setPreview] = useState(false);
  const previewId = useId();
  let hostname = 'Fonte pubblica';
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { /* Il main process valida nuovamente l'URL. */ }
  return (
    <span className="rich-link-wrap" onMouseEnter={() => setPreview(true)} onMouseLeave={() => setPreview(false)}>
      <a
        className="rich-link"
        href={url}
        rel="noreferrer"
        aria-describedby={preview ? previewId : undefined}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        onClick={(event) => {
          event.preventDefault();
          void window.nexus.openExternal(url);
        }}
      >{label}</a>
      {preview && (
        <span className="rich-link-preview" id={previewId} role="tooltip">
          <strong>{hostname}</strong>
          <small>Apri la fonte verificata nel browser</small>
        </span>
      )}
    </span>
  );
}

function inlineMarkup(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('`')) nodes.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) nodes.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    else nodes.push(<RichLink key={match.index} label={match[2]} url={match[3]} />);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function highlightedLine(line: string, language: string): ReactNode[] {
  const keywords = /^(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|try|catch|throw|new|true|false|null|undefined|def|self|elif|except|with|as|switch|case|break|continue|public|private|protected|static|void)$/;
  const pattern = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    if (match.index > cursor) nodes.push(line.slice(cursor, match.index));
    const token = match[0];
    const kind = /^(?:\/\/|#|\/\*)/.test(token) ? 'comment'
      : /^["'`]/.test(token) ? 'string'
        : /^\d/.test(token) ? 'number'
          : keywords.test(token) ? 'keyword'
            : /^(?:javascript|typescript|tsx|jsx|python|powershell|shell|css|html|json|yaml|sql)$/i.test(language) ? 'identifier' : 'plain';
    nodes.push(<span key={`${match.index}-${token}`} className={`syntax-${kind}`}>{token}</span>);
    cursor = match.index + token.length;
  }
  if (cursor < line.length) nodes.push(line.slice(cursor));
  return nodes;
}

function HighlightedCode({ language, content }: { language: string; content: string }) {
  const lines = content.split('\n');
  const visibleLines = lines.slice(0, 1_200);
  return <code>{visibleLines.map((line, index) => (
    <span className="syntax-line" data-diff={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : undefined} key={index}>
      <i aria-hidden="true">{index + 1}</i><b>{highlightedLine(line, language)}</b>{'\n'}
    </span>
  ))}{lines.length > visibleLines.length && <span className="syntax-omitted">… {lines.length - visibleLines.length} righe non renderizzate</span>}</code>;
}

function CodeBlock({ language, content }: { language: string; content: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copy = async () => {
    try {
      await window.nexus.copyText(content);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 1_600);
  };

  return (
    <section className="code-card">
      <div className="code-card-meta">
        <span>{language}</span>
        <button type="button" onClick={copy}>
          {copyState === 'copied' ? 'Copiato' : copyState === 'error' ? 'Non riuscito' : 'Copia'}
        </button>
      </div>
      <pre><HighlightedCode language={language} content={content} /></pre>
    </section>
  );
}

export function ArtifactShelf({ artifacts }: { artifacts: OperationalArtifact[] }) {
  const [openId, setOpenId] = useState('');
  const [viewMode, setViewMode] = useState<'result' | 'diff' | 'split'>('result');
  useEffect(() => {
    if (!openId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenId(''); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openId]);
  if (!artifacts.length) return null;
  const changed = artifacts.filter((item) => item.kind === 'file-change').length;
  const added = artifacts.reduce((total, item) => total + (item.added || 0), 0);
  const removed = artifacts.reduce((total, item) => total + (item.removed || 0), 0);
  return (
    <section className="artifact-shelf" aria-label="Risultati operativi">
      <div className="artifact-summary">
        <span>{changed ? `${changed} ${changed === 1 ? 'file modificato' : 'file modificati'}` : `${artifacts.length} ${artifacts.length === 1 ? 'risultato' : 'risultati'}`}</span>
        {added > 0 && <strong data-tone="added">+{added}</strong>}
        {removed > 0 && <strong data-tone="removed">−{removed}</strong>}
      </div>
      <div className="artifact-items">
        {artifacts.map((artifact) => (
          <div className="artifact-item" data-open={openId === artifact.id} key={artifact.id}>
            <button type="button" aria-expanded={openId === artifact.id} onMouseEnter={() => { setOpenId(artifact.id); setViewMode('result'); }} onFocus={() => { setOpenId(artifact.id); setViewMode('result'); }} onClick={() => { setViewMode('result'); setOpenId(artifact.id); }}>
              <span>{artifact.title}</span><small>{artifact.subtitle || 'Dettaglio'}</small>
            </button>
            {openId === artifact.id && createPortal((
                <motion.div className="artifact-popover" role="dialog" aria-label={`Dettaglio ${artifact.title}`} initial={{ opacity: 0, y: 6, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }}>
                  <div className="artifact-popover-meta">
                    <span>{artifact.title}</span>
                    <span>
                      {artifact.kind === 'file-change' && artifact.previousContent !== undefined && <>
                        <button type="button" data-active={viewMode === 'result'} onClick={() => setViewMode('result')}>Risultato</button>
                        <button type="button" data-active={viewMode === 'diff'} onClick={() => setViewMode('diff')}>Modifiche</button>
                        <button type="button" data-active={viewMode === 'split'} onClick={() => setViewMode('split')}>Prima / dopo</button>
                      </>}
                      <button type="button" onClick={() => void window.nexus.copyText(artifact.content || '')}>Copia</button>
                      <button type="button" onClick={() => setOpenId('')} aria-label="Chiudi dettaglio">Chiudi</button>
                    </span>
                  </div>
                  {viewMode === 'split' && artifact.previousContent !== undefined
                    ? <div className="artifact-split"><div><small>Prima</small><pre><HighlightedCode language={artifact.language || 'text'} content={artifact.previousContent || 'File nuovo'} /></pre></div><div><small>Dopo</small><pre><HighlightedCode language={artifact.language || 'text'} content={artifact.content || ''} /></pre></div></div>
                    : <pre><HighlightedCode language={viewMode === 'diff' ? 'diff' : artifact.language || 'text'} content={viewMode === 'diff' ? artifact.diff || 'Nessuna differenza disponibile.' : artifact.content || 'Nessun output.'} /></pre>}
                  {Boolean(artifact.events?.length) && <ol className="artifact-timeline">{artifact.events?.map((event, index) => <li key={`${event.label}-${index}`} data-status={event.status}><i />{event.label}</li>)}</ol>}
                  {Boolean(artifact.diagnostics?.length) && <div className="artifact-diagnostics">{artifact.diagnostics?.map((entry, index) => <div key={`${entry.file}-${entry.line}-${index}`}><strong>{entry.file}:{entry.line}{entry.column ? `:${entry.column}` : ''}</strong><span>{entry.message}</span></div>)}</div>}
                  {artifact.truncated && <small className="artifact-truncated">Anteprima abbreviata per mantenere fluida la chat.</small>}
                </motion.div>
              ), document.body)}
          </div>
        ))}
      </div>
    </section>
  );
}

export const MarkdownContent = memo(function MarkdownContent({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={`answer-markdown${streaming ? ' answer-stream-text' : ''}`}>
      {blocks.map((block, index) => {
        if (block.kind === 'code') return <CodeBlock key={index} language={block.language} content={block.content} />;
        if (block.kind === 'heading') {
          const Heading = `h${Math.min(block.level + 1, 4)}` as 'h2' | 'h3' | 'h4';
          return <Heading key={index}>{inlineMarkup(block.content)}</Heading>;
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkup(item)}</li>)}</List>;
        }
        if (block.kind === 'table') return (
          <div className="response-table-wrap" key={index}>
            <table><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkup(cell)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_header, cellIndex) => <td key={cellIndex}>{inlineMarkup(row[cellIndex] || '')}</td>)}</tr>)}</tbody></table>
          </div>
        );
        if (block.kind === 'callout') return <aside className="response-callout" data-tone={block.tone} key={index}><strong>{inlineMarkup(block.title)}</strong>{block.content && <p>{inlineMarkup(block.content)}</p>}</aside>;
        if (block.kind === 'divider') return <hr key={index} />;
        if (block.kind === 'quote') return <blockquote key={index}>{inlineMarkup(block.content)}</blockquote>;
        return <p key={index}>{inlineMarkup(block.content)}</p>;
      })}
    </div>
  );
});

// #endregion

// #region 02 — Canvas della risposta

export function ResponseSurface({ response, error, active, artifacts, previousResponse = '', trainingSaved, onApproveTraining, onRegenerate, onContinue, onDismiss }: ResponseSurfaceProps) {
  const [correcting, setCorrecting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [correction, setCorrection] = useState(response);
  const scrollSurface = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  const followFrame = useRef<number | null>(null);
  useEffect(() => {
    // Durante lo stream `response` cambia molte volte al secondo. La copia
    // editabile serve soltanto a risposta conclusa: evitarla dimezza i render.
    if (active) return;
    setCorrecting(false);
    setActionsOpen(false);
    setCorrection(response);
  }, [active, response]);
  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActionsOpen(false); };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.answer-actions')) setActionsOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [actionsOpen]);
  const visible = Boolean(response || error);
  const substantial = response.length > 260 || response.includes('```') || response.split('\n').length > 7;
  const kind = useMemo(() => responseKind(response), [response]);
  const kindLabel = { answer: 'Risposta', plan: 'Percorso', research: 'Ricerca', code: 'Codice' }[kind];
  useEffect(() => {
    if (!visible) followTail.current = true;
  }, [visible]);
  useEffect(() => {
    if (!followTail.current || !scrollSurface.current) return;
    if (followFrame.current !== null) window.cancelAnimationFrame(followFrame.current);
    followFrame.current = window.requestAnimationFrame(() => {
      followFrame.current = null;
      const surface = scrollSurface.current;
      if (surface) surface.scrollTop = surface.scrollHeight;
    });
    return () => {
      if (followFrame.current !== null) {
        window.cancelAnimationFrame(followFrame.current);
        followFrame.current = null;
      }
    };
  }, [active, response, substantial]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.article
          className="answer-surface"
          data-size={substantial ? 'expanded' : 'compact'}
          data-streaming={active}
          data-reveal="ready"
          initial={{ opacity: 0, y: substantial ? 10 : 7 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          aria-live={active ? 'off' : 'polite'}
          aria-busy={active}
        >
          <QuietClose onClick={onDismiss} label="Chiudi risposta" />
          {!error && active && <span className="answer-stream-indicator" aria-hidden="true" />}
          {!error && <div className="answer-context" data-kind={kind} role="status" aria-live="polite">
            <i aria-hidden="true" />
            <span><small>{kindLabel}</small><strong>{active ? 'In composizione' : 'Risposta pronta'}</strong></span>
          </div>}
          <div
            className="answer-scroll"
            ref={scrollSurface}
            onScroll={(event) => {
              const surface = event.currentTarget;
              followTail.current = surface.scrollHeight - surface.scrollTop - surface.clientHeight < 48;
            }}
          >
            {error
              ? <p className="answer-error">{error}</p>
              : active
                ? <MarkdownContent text={streamSafeMarkdown(response)} streaming />
                : <MarkdownContent text={response} />}
          </div>
          {!error && !active && <ArtifactShelf artifacts={artifacts} />}
          {!error && !active && comparing && previousResponse && (
            <section className="response-comparison" aria-label="Confronto risposte">
              <div>
                <small>Precedente</small><MarkdownContent text={previousResponse} />
                <button type="button" disabled={trainingSaved} onClick={() => { onApproveTraining(previousResponse, response); setComparing(false); }}>Preferisco questa</button>
              </div>
              <div>
                <small>Nuova</small><MarkdownContent text={response} />
                <button type="button" disabled={trainingSaved} onClick={() => { onApproveTraining(response, previousResponse); setComparing(false); }}>Preferisco questa</button>
              </div>
            </section>
          )}
          {!error && response && !active && (
            <footer className="answer-actions">
              {correcting && !trainingSaved && (
                <textarea
                  aria-label="Correggi la risposta prima di salvarla"
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                />
              )}
              <button className="answer-feedback-action" type="button" disabled={trainingSaved || (correcting && !correction.trim())} onClick={() => correcting ? onApproveTraining(correction, response) : onApproveTraining()}>{trainingSaved ? 'Approvata' : correcting ? 'Salva correzione' : 'Utile'}</button>
              {!trainingSaved && <button className="answer-feedback-action" type="button" onClick={() => { setCorrection(response); setCorrecting((current) => !current); }}>{correcting ? 'Annulla' : 'Correggi'}</button>}
              <button className="answer-action-primary" type="button" onClick={() => void window.nexus.copyText(response)}>Copia</button>
              <button className="answer-action-menu-trigger" type="button" aria-expanded={actionsOpen} aria-label="Altre azioni sulla risposta" onClick={() => setActionsOpen((open) => !open)}>•••</button>
              {actionsOpen && <div className="answer-action-menu" role="menu">
                <button role="menuitem" type="button" onClick={() => { onRegenerate(); setActionsOpen(false); }}>Rigenera</button>
                {previousResponse && <button role="menuitem" type="button" data-active={comparing} onClick={() => { setComparing((value) => !value); setActionsOpen(false); }}>Confronta</button>}
                <button role="menuitem" type="button" onClick={() => { onContinue(); setActionsOpen(false); }}>Continua</button>
                {!trainingSaved && <button role="menuitem" type="button" onClick={() => { setCorrection(response); setCorrecting((current) => !current); setActionsOpen(false); }}>{correcting ? 'Annulla correzione' : 'Correggi risposta'}</button>}
                <button role="menuitem" type="button" disabled={trainingSaved} onClick={() => { if (correcting) onApproveTraining(correction, response); else onApproveTraining(); setActionsOpen(false); }}>{trainingSaved ? 'Contributo inviato' : 'Approva come esempio'}</button>
              </div>}
            </footer>
          )}
        </motion.article>
      )}
    </AnimatePresence>
  );
}

// #endregion
