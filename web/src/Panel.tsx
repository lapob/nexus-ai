/**
 * @module web/Panel
 * @description Pannello laterale per codice e documenti delle risposte: anteprime sicure (HTML eseguito solo in sandbox a origine separata), righe numerate, copia e download.
 */
import { m } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Markdown } from './Markdown';
import { closePanel, fileName, parseDelimited, previewKind, usePanel, type PanelDocument } from './panelStore';
import { platform } from './platform';

const KIND_ICON: Record<string, IconName> = { markdown: 'book', svg: 'image', csv: 'chart', html: 'code' };

/** SVG mostrato come immagine: il browser non esegue script né carica risorse esterne in un <img>. */
function SvgPreview({ text }: { text: string }) {
  const url = useMemo(() => {
    // Desktop: la CSP del renderer ammette data:, il web blob:.
    if (platform.kind === 'desktop') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    return URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  }, [text]);
  useEffect(() => () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }, [url]);
  return <div className="panel-svg"><img src={url} alt="Anteprima dell’immagine SVG" /></div>;
}

/**
 * HTML eseguibile, come gli "artifacts" dei grandi assistenti: iframe `sandbox="allow-scripts"` (origine opaca,
 * niente storage né accesso a questa pagina) caricato da un'origine separata con CSP senza rete.
 * Desktop: protocollo nexus-sandbox://, web: nexusnxs.com/sandbox. Il codice arriva solo via postMessage.
 */
export const SANDBOX_URL = platform.kind === 'desktop' ? 'nexus-sandbox://run/v1' : 'https://nexusnxs.com/sandbox/v1';
function HtmlPreview({ text }: { text: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [run, setRun] = useState(0);
  useEffect(() => {
    setState('loading');
    const timer = window.setTimeout(() => setState((value) => value === 'loading' ? 'failed' : value), 8_000);
    const receive = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target || event.data?.type !== 'nexus-sandbox-ready') return;
      // L'origine dell'iframe è opaca ("null"): '*' consegna solo a quella finestra, verificata sopra.
      target.postMessage({ type: 'nexus-sandbox-render', html: text }, '*');
      setState('ready');
    };
    window.addEventListener('message', receive);
    return () => { window.clearTimeout(timer); window.removeEventListener('message', receive); };
  }, [text, run]);
  return (
    <div className="panel-html" data-state={state}>
      <iframe key={run} ref={frame} title="Anteprima HTML in sandbox" src={SANDBOX_URL}
        sandbox="allow-scripts allow-modals" referrerPolicy="no-referrer" allow="" loading="eager" />
      {state !== 'ready' && <p className="panel-html-note" role="status">{state === 'loading' ? 'Preparo l’anteprima isolata…' : 'Anteprima non raggiungibile: serve la connessione (web) o l’app aggiornata.'}</p>}
      <button type="button" className="icon-button small panel-html-rerun" aria-label="Riesegui" title="Riesegui" onClick={() => setRun((value) => value + 1)}><Icon name="retry" size={16} /></button>
    </div>
  );
}

function CsvPreview({ text }: { text: string }) {
  const rows = useMemo(() => parseDelimited(text), [text]);
  if (!rows.length) return <p className="muted">Nessuna riga da mostrare.</p>;
  const [head, ...body] = rows;
  return (
    <div className="panel-table">
      <table>
        <thead><tr>{head.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
        <tbody>{body.map((row, index) => <tr key={index}>{head.map((_, column) => <td key={column}>{row[column] ?? ''}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CodeView({ text, wrap }: { text: string; wrap: boolean }) {
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  return (
    <pre className="panel-code" data-wrap={wrap} style={{ ['--gutter' as string]: `${String(lines.length).length + 1}ch` }}>
      <code>{lines.map((line, index) => <span key={index} className="line">{line || ' '}</span>)}</code>
    </pre>
  );
}

function download(document_: PanelDocument) {
  const url = URL.createObjectURL(new Blob([document_.text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(document_);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function Panel() {
  const document_ = usePanel();
  const kind = document_ ? previewKind(document_.language, document_.text) : null;
  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setView('preview'); setCopied(false); }, [document_?.id]);
  if (!document_) return null;
  const showPreview = kind !== null && view === 'preview';
  const lines = document_.text.split('\n').length;
  return (
    <m.aside className="panel glass" aria-label={`Pannello: ${document_.title}`} key={document_.id}
      initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}>
      <header className="panel-head">
        <span className="panel-title"><Icon name={kind ? KIND_ICON[kind] : 'code'} size={18} /><span title={document_.title}>{document_.title}</span><small>{document_.language} · {lines} {lines === 1 ? 'riga' : 'righe'}</small></span>
        {kind && (
          <span className="segmented" role="group" aria-label="Vista">
            <button type="button" aria-label="Anteprima" title="Anteprima" aria-pressed={view === 'preview'} data-active={view === 'preview'} onClick={() => setView('preview')}><Icon name="eye" size={17} /></button>
            <button type="button" aria-label="Codice" title="Codice" aria-pressed={view === 'code'} data-active={view === 'code'} onClick={() => setView('code')}><Icon name="code" size={17} /></button>
          </span>
        )}
        <span className="panel-actions">
          {!showPreview && <button type="button" className="icon-button small" aria-label={wrap ? 'Non andare a capo' : 'Vai a capo'} title={wrap ? 'Non andare a capo' : 'Vai a capo'} aria-pressed={wrap} data-active={wrap} onClick={() => setWrap((value) => !value)}><Icon name="wrap" size={17} /></button>}
          <button type="button" className="icon-button small" aria-label={copied ? 'Copiato' : 'Copia tutto'} title="Copia" onClick={async () => {
            try { await navigator.clipboard.writeText(document_.text); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard negata */ }
          }}><Icon name={copied ? 'check' : 'copy'} size={17} /></button>
          <button type="button" className="icon-button small" aria-label={`Scarica ${fileName(document_)}`} title="Scarica" onClick={() => download(document_)}><Icon name="download" size={17} /></button>
          <button type="button" className="icon-button small" aria-label="Chiudi pannello" title="Chiudi (Esc)" onClick={closePanel}><Icon name="close" size={17} /></button>
        </span>
      </header>
      <div className="panel-body" tabIndex={0}>
        {showPreview
          ? kind === 'markdown' ? <div className="panel-doc"><Markdown text={document_.text} /></div>
            : kind === 'svg' ? <SvgPreview text={document_.text} />
              : kind === 'html' ? <HtmlPreview text={document_.text} />
                : <CsvPreview text={document_.text} />
          : <CodeView text={document_.text} wrap={wrap} />}
      </div>
    </m.aside>
  );
}
