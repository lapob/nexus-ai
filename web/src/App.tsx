/**
 * @module web/App
 * @description Shell della nuova web app NexusNXS AI: conversazioni locali, streaming con fasi, nucleo WebGPU, palette comandi e preferenze.
 */
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Capabilities, Preferences } from './api';
import { ControlCenter } from './ControlCenter';
import { useDesktopPresence } from './desktopPresence';
import { desktopBridge, platform } from './platform';
import { pairDevice, pairedToken } from './paired';
import brandIcon from './assets/nexus-mark-ui.png';
import { ACCEPT, formatSize, prepareFiles, type Pending } from './attachments';
import { Core, type CoreState } from './Core';
import { Markdown } from './Markdown';
import { Icon } from './Icon';
import { createPlayer, isNoiseTranscript, listMicrophones, listenForBargeIn, preferredMicrophone, setPreferredMicrophone, speakableText, startRecording, type Recording } from './voice';
import { activeConversation, appendMessage, clearAll, deleteConversation, getState, newConversation, setState, uid, updateConversation, useStore, type Message } from './store';

const SUGGESTIONS = [
  'Spiegami come funziona la fusione nucleare in modo semplice',
  'Scrivi una funzione TypeScript che deduplica un array di oggetti',
  'Quali sono le novità tecnologiche di questa settimana?',
  'Aiutami a pianificare una settimana di allenamento'
];

/** Scarica la conversazione come Markdown: resta sul dispositivo, nessun invio in rete. */
function exportConversation(conversation: { title: string; messages: Message[] }) {
  const body = conversation.messages.filter((message) => message.content && !message.error)
    .map((message) => `## ${message.role === 'user' ? 'Tu' : 'NexusNXS'}\n\n${message.content}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([`# ${conversation.title}\n\n${body}\n`], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${conversation.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'conversazione'}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Le View Transitions rendono continui i cambi di contesto, dove supportate. */
function transition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(update);
  else update();
}

function useServiceStatus() {
  const [status, setStatus] = useState<'ready' | 'preparing' | 'offline' | 'unknown'>('unknown');
  useEffect(() => {
    let alive = true;
    const check = async () => { const next = await platform.status(); if (alive) setStatus(next); };
    void check();
    const timer = window.setInterval(check, 30_000);
    window.addEventListener('online', check);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('online', check); };
  }, []);
  return status;
}

export function App() {
  const conversations = useStore((state) => state.conversations);
  const activeId = useStore((state) => state.activeId);
  const mode = useStore((state) => state.mode);
  const generating = useStore((state) => state.generating);
  const phase = useStore((state) => state.phase);
  const preferences = useStore((state) => state.preferences);
  const conversation = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [conversations, activeId]);
  const status = useServiceStatus();
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Barra laterale nascondibile su schermi larghi: la scelta resta per le visite successive.
  const [sidebarHidden, setSidebarHidden] = useState(() => { try { return localStorage.getItem('nxs.sidebar') === 'hidden'; } catch { return false; } });
  const toggleSidebar = useCallback(() => setSidebarHidden((hidden) => {
    try { localStorage.setItem('nxs.sidebar', hidden ? 'shown' : 'hidden'); } catch { /* archiviazione non disponibile */ }
    return !hidden;
  }), []);
  const [showJump, setShowJump] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const [toast, setToast] = useState('');
  const controller = useRef<AbortController | null>(null);
  const pendingId = useRef('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const coreLayerRef = useRef<HTMLDivElement>(null);
  const coreSlotRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [caps, setCaps] = useState<Capabilities>({ voiceInput: false, voiceOutput: false, attachments: true });
  const [pending, setPending] = useState<Pending[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const micLevel = useRef(0);
  const player = useRef<{ stop: () => void; abort: AbortController } | null>(null);

  useEffect(() => { void platform.capabilities().then(setCaps); }, []);

  // Desktop: la cronologia su disco è la fonte di verità (alimenta anche la memoria automatica).
  // Modalità associata: le conversazioni sono quelle del PC, dopo l'associazione con il codice.
  const [paired, setPaired] = useState(() => platform.kind !== 'paired' || Boolean(pairedToken()));
  useEffect(() => {
    if (!paired) return;
    void platform.loadConversations().then((loaded) => {
      if (loaded) setState((state) => ({ ...state, conversations: loaded.sort((a, b) => b.updatedAt - a.updatedAt), activeId: loaded.some((item) => item.id === state.activeId) ? state.activeId : null }));
    }).catch(() => notify(platform.kind === 'paired' ? 'Conversazioni del PC non raggiungibili.' : 'Cronologia locale non disponibile.'));
  }, [paired]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const expired = () => setPaired(false);
    window.addEventListener('nxs-paired-expired', expired);
    return () => window.removeEventListener('nxs-paired-expired', expired);
  }, []);
  useEffect(() => { if (conversation && !generating && conversation.messages.length) platform.saveConversation(conversation); }, [conversation, generating]);

  const coreState: CoreState = recording ? 'listening'
    : transcribing ? 'thinking'
      : generating ? (phase && !conversation?.messages.at(-1)?.content ? 'thinking' : 'responding')
        : speakingId ? 'speaking' : 'idle';

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 4_000); }, []);

  const stopSpeaking = useCallback(() => {
    player.current?.abort.abort();
    player.current?.stop();
    player.current = null;
    setSpeakingId(null);
  }, []);

  /** Legge una risposta con la voce NexusNXS, riproducendo i segmenti man mano che arrivano. */
  const speak = useCallback(async (id: string, markdown: string) => {
    stopSpeaking();
    const text = speakableText(markdown);
    if (!text) return;
    const abort = new AbortController();
    const audio = createPlayer();
    player.current = { stop: audio.stop, abort };
    setSpeakingId(id);
    try {
      await platform.synthesize(text, { signal: abort.signal, onSegment: (wav) => audio.enqueue(wav) });
      await audio.finish();
    } catch (error) {
      if (!abort.signal.aborted) notify(String((error as Error)?.message || 'Voce non disponibile.'));
    } finally {
      if (player.current?.abort === abort) { player.current = null; setSpeakingId(null); }
    }
  }, [notify, stopSpeaking]);

  const addFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const { accepted, errors } = await prepareFiles(files, pending);
    if (accepted.length) setPending((current) => [...current, ...accepted]);
    if (errors.length) notify(errors[0]);
  }, [notify, pending]);

  const removePending = (id: string) => setPending((current) => {
    const removed = current.find((item) => item.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    return current.filter((item) => item.id !== id);
  });

  const send = useCallback(async (raw: string, { voice = false, autoSpeak = true }: { voice?: boolean; autoSpeak?: boolean } = {}): Promise<{ id: string; text: string } | null> => {
    const attachments = pending;
    const text = raw.trim() || (attachments.length ? 'Analizza gli allegati.' : '');
    if (!text || getState().generating) return null;
    stopSpeaking();
    const conversationId = activeConversation()?.id ?? newConversation();
    const history = (activeConversation()?.messages ?? []).filter((message) => !message.error).map(({ role, content }) => ({ role, content }));
    appendMessage(conversationId, { id: uid(), role: 'user', content: text, createdAt: Date.now(), voice,
      ...(attachments.length ? { attachments: attachments.map(({ name, mime, size }) => ({ name, mime, size })) } : {}) });
    const requestId = uid();
    const assistant: Message = { id: uid(), role: 'assistant', content: '', createdAt: Date.now(), requestId };
    appendMessage(conversationId, assistant);
    setDraft('');
    for (const item of attachments) if (item.preview) URL.revokeObjectURL(item.preview);
    setPending([]);
    let finalText = '';
    stickToBottom.current = true;
    const abort = new AbortController();
    controller.current = abort;
    pendingId.current = requestId;
    setState((state) => ({ ...state, generating: true, phase: 'Mi collego…' }), { durable: false });
    const patch = (update: (message: Message) => Message, durable = false) => updateConversation(conversationId, (item) => ({
      ...item, messages: item.messages.map((message) => message.id === assistant.id ? update(message) : message)
    }), { durable });
    let buffered = '';
    let raf = 0;
    const paint = () => { raf = 0; const snapshot = buffered; patch((message) => ({ ...message, content: snapshot })); };
    try {
      await platform.send({
        text, history, mode: getState().mode, clientMessageId: pendingId.current, preferences: getState().preferences, signal: abort.signal, attachments, conversationId,
        onEvent: (event) => {
          if (event.type === 'token' || event.type === 'replace') {
            buffered = event.type === 'token' ? buffered + event.token : event.text;
            // Un repaint per frame anche con centinaia di token al secondo.
            if (!raf) raf = requestAnimationFrame(paint);
            if (getState().phase) setState((state) => ({ ...state, phase: '' }), { durable: false });
          } else if (event.type === 'phase') {
            setState((state) => ({ ...state, phase: event.label }), { durable: false });
            // Cronologia visibile dei passaggi (strumenti, ricerche, verifiche), senza duplicati consecutivi.
            patch((message) => message.steps?.at(-1) === event.label ? message : { ...message, steps: [...(message.steps ?? []), event.label].slice(-12) });
          } else if (event.type === 'sources') patch((message) => ({ ...message, sources: event.sources }));
          else if (event.type === 'complete') {
            cancelAnimationFrame(raf); finalText = event.message || buffered;
            patch((message) => ({ ...message, content: finalText, ...(event.sources.length ? { sources: event.sources } : {}) }), true);
          }
          else if (event.type === 'error') { cancelAnimationFrame(raf); patch((message) => ({ ...message, content: buffered || event.error, error: !buffered, interrupted: Boolean(buffered) }), true); }
        }
      });
    } catch (error) {
      cancelAnimationFrame(raf);
      const aborted = abort.signal.aborted;
      patch((message) => ({ ...message, content: buffered || (aborted ? 'Risposta interrotta.' : String((error as Error)?.message || 'Richiesta non riuscita.')), error: !buffered && !aborted, interrupted: aborted || Boolean(buffered) }), true);
      if (!aborted) notify(String((error as Error)?.message || 'Richiesta non riuscita.'));
    } finally {
      controller.current = null;
      setState((state) => ({ ...state, generating: false, phase: '' }));
      inputRef.current?.focus();
    }
    // Conversazione vocale: se hai parlato, l'entità risponde a voce.
    if (voice && autoSpeak && finalText && caps.voiceOutput) void speak(assistant.id, finalText);
    return finalText ? { id: assistant.id, text: finalText } : null;
  }, [caps.voiceOutput, notify, pending, speak, stopSpeaking]);

  // Riferimenti sempre aggiornati: il ciclo live dura molti turni e non deve usare chiusure vecchie.
  const sendRef = useRef(send); sendRef.current = send;
  const speakRef = useRef(speak); speakRef.current = speak;
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const liveRecording = useRef<Recording | null>(null);
  const stopBargeIn = useRef<(() => void) | null>(null);

  const endLive = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    liveRecording.current?.cancel();
    stopBargeIn.current?.();
    stopBargeIn.current = null;
    stopSpeaking();
  }, [stopSpeaking]);

  /**
   * Voce live: ascolta → trascrive → risponde → parla → torna ad ascoltare, finché
   * non la chiudi. Parlare sopra l'entità la interrompe e riapre subito l'ascolto.
   */
  const startLive = useCallback(async () => {
    if (liveRef.current || !caps.voiceInput) return;
    stopSpeaking();
    controller.current?.abort();
    liveRef.current = true;
    setLive(true);
    let failures = 0;
    while (liveRef.current) {
      let wav: Blob;
      try {
        const session = await startRecording((level) => { micLevel.current = level; });
        liveRecording.current = session;
        setRecording(session);
        wav = await session.done.finally(() => { setRecording(null); liveRecording.current = null; });
      } catch (error) {
        const name = (error as DOMException)?.name;
        if (!liveRef.current || name === 'AbortError') break;
        if (name === 'NoSpeech') continue;
        notify(name === 'NotAllowedError' ? 'Consenti l’accesso al microfono per parlare con NexusNXS.' : String((error as Error)?.message || 'Microfono non disponibile.'));
        break;
      }
      let text = '';
      setTranscribing(true);
      try { text = await platform.transcribe(wav); failures = 0; }
      catch (error) {
        if (++failures >= 3) { notify(String((error as Error)?.message || 'Trascrizione non disponibile.')); break; }
        continue;
      } finally { setTranscribing(false); }
      if (!liveRef.current) break;
      if (isNoiseTranscript(text)) continue;
      const reply = await sendRef.current(text, { voice: true, autoSpeak: false });
      if (!liveRef.current || !reply || !caps.voiceOutput) continue;
      stopBargeIn.current = await listenForBargeIn(() => { stopBargeIn.current = null; stopSpeaking(); }).catch(() => null);
      await speakRef.current(reply.id, reply.text);
      stopBargeIn.current?.();
      stopBargeIn.current = null;
    }
    if (liveRef.current) endLive();
  }, [caps.voiceInput, caps.voiceOutput, endLive, notify, stopSpeaking]);

  useEffect(() => () => { liveRef.current = false; liveRecording.current?.cancel(); stopBargeIn.current?.(); }, []);

  // Desktop: «Nexus» apre la voce live; la Presence segue lo stato dell'entità; avvisi del PC come toast.
  useDesktopPresence({ state: coreState, live, onWake: () => { void startLive(); }, notify });

  /** Microfono: un tocco avvia, un tocco (o il silenzio) ferma; il testo riconosciuto viene inviato. */
  const toggleMic = useCallback(async () => {
    if (recording) { recording.stop(); return; }
    if (getState().generating || transcribing) return;
    stopSpeaking();
    try {
      const session = await startRecording((level) => { micLevel.current = level; });
      setRecording(session);
      const wav = await session.done.finally(() => setRecording(null));
      setTranscribing(true);
      const text = await platform.transcribe(wav).finally(() => setTranscribing(false));
      void send(text, { voice: true });
    } catch (error) {
      setRecording(null);
      const name = (error as DOMException)?.name;
      if (name === 'AbortError') return;
      notify(name === 'NotAllowedError' ? 'Consenti l’accesso al microfono per parlare con NexusNXS.' : String((error as Error)?.message || 'Voce non disponibile.'));
    }
  }, [notify, recording, send, stopSpeaking, transcribing]);

  const stop = useCallback(() => {
    controller.current?.abort();
    if (pendingId.current) void platform.cancel(pendingId.current);
  }, []);

  const startNew = useCallback(() => { if (!getState().generating) transition(() => { newConversation(); setSidebarOpen(false); }); inputRef.current?.focus(); }, []);
  const toggleMode = useCallback(() => setState((state) => ({ ...state, mode: state.mode === 'fast' ? 'deep' : 'fast' })), []);

  // Scorciatoie globali: ⌘K palette, ⌘⇧O nuova chat, Esc chiude i pannelli o ferma.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
      else if (meta && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); startNew(); }
      else if (meta && !event.shiftKey && event.key.toLowerCase() === 'b') { event.preventDefault(); if (window.matchMedia('(min-width: 840px)').matches) toggleSidebar(); else setSidebarOpen((open) => !open); }
      else if (meta && event.shiftKey && event.key.toLowerCase() === 'l') { event.preventDefault(); if (liveRef.current) endLive(); else void startLive(); }
      else if (event.key === 'Escape') {
        if (liveRef.current && !paletteOpen && !settingsOpen) endLive();
        else if (paletteOpen || settingsOpen || sidebarOpen || controlOpen) { setPaletteOpen(false); setSettingsOpen(false); setSidebarOpen(false); setControlOpen(false); }
        else if (recording) recording.cancel();
        else if (getState().generating) stop();
        else stopSpeaking();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlOpen, endLive, paletteOpen, recording, settingsOpen, sidebarOpen, startLive, startNew, stop, stopSpeaking, toggleSidebar]);

  const jumpToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  // Segue la risposta solo se l'utente è già in fondo: leggere sopra non viene interrotto.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [conversation?.messages]);

  const onComposerKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
  };

  const empty = !conversation || conversation.messages.length === 0;

  // L'entità della home si posa sul suo spazio nel layout: niente sovrapposizioni
  // con titolo e pulsanti, a qualsiasi dimensione e anche scorrendo.
  useLayoutEffect(() => {
    const layer = coreLayerRef.current;
    const slot = coreSlotRef.current;
    const stage = layer?.parentElement;
    if (!layer || !stage) return;
    const place = () => {
      if (!slot?.isConnected) { for (const name of ['--hero-x', '--hero-y', '--hero-scale']) layer.style.removeProperty(name); return; }
      const area = stage.getBoundingClientRect();
      const target = slot.getBoundingClientRect();
      // La sfera occupa circa il 60% del canvas, largo min(80vmin, 760px).
      const sphere = Math.min(Math.min(window.innerWidth, window.innerHeight) * 0.8, 760) * 0.6;
      layer.style.setProperty('--hero-x', `${Math.round(target.left + target.width / 2 - (area.left + area.width / 2))}px`);
      layer.style.setProperty('--hero-y', `${Math.round(target.top + target.height / 2 - (area.top + area.height / 2))}px`);
      layer.style.setProperty('--hero-scale', (target.width / sphere).toFixed(3));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(stage);
    if (slot) observer.observe(slot);
    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); scroller?.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [empty, live]);

  return (
    <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user">
      <div className="app" data-sidebar={sidebarOpen ? 'open' : 'closed'} data-collapsed={sidebarHidden} data-live={live}>
        <aside className="sidebar glass" aria-label="Conversazioni" aria-hidden={sidebarHidden && !sidebarOpen ? true : undefined} inert={sidebarHidden && !sidebarOpen ? true : undefined}>
          <div className="sidebar-head">
            <span className="brand"><img src={brandIcon} alt="" width="22" height="22" />NexusNXS</span>
            <span className="sidebar-actions">
              <button type="button" className="icon-button" aria-label="Nuova conversazione" onClick={startNew}><Icon name="plus" /></button>
              <button type="button" className="icon-button only-wide" aria-label="Nascondi barra laterale (Ctrl+B)" onClick={toggleSidebar}><Icon name="sidebar" /></button>
            </span>
          </div>
          <ConversationList onPick={(id) => transition(() => { setState((state) => ({ ...state, activeId: id })); setSidebarOpen(false); })} disabled={generating} />
          <div className="sidebar-foot">
            <button type="button" className="row-button" onClick={() => setSettingsOpen(true)}><Icon name="sliders" />Preferenze</button>
            {desktopBridge && <button type="button" className="row-button" onClick={() => setControlOpen(true)}><Icon name="classic" />Centro di controllo</button>}
          </div>
        </aside>
        <button type="button" className="scrim" aria-label="Chiudi menu" tabIndex={sidebarOpen ? 0 : -1} onClick={() => setSidebarOpen(false)} />

        <main className="stage"
          onDragOver={(event) => { if (caps.attachments && platform.acceptsDroppedFiles && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
          onDragLeave={(event) => { if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (caps.attachments && platform.acceptsDroppedFiles) void addFiles([...event.dataTransfer.files]); }}>
          <header className="topbar">
            <button type="button" className="icon-button only-compact" aria-label="Apri conversazioni" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
            {sidebarHidden && <>
              <button type="button" className="icon-button only-wide" aria-label="Mostra barra laterale (Ctrl+B)" onClick={toggleSidebar}><Icon name="sidebar" /></button>
              <button type="button" className="icon-button only-wide" aria-label="Nuova conversazione" onClick={startNew}><Icon name="plus" /></button>
            </>}
            <h1 className="title">{conversation?.title && !empty ? conversation.title : 'NexusNXS AI'}</h1>
            <span className="status" data-status={status} role="status" aria-live="polite">
              <i aria-hidden="true" />{status === 'ready' ? 'Online' : status === 'preparing' ? 'In preparazione' : status === 'offline' ? 'Offline' : 'Connessione…'}
            </span>
            <button type="button" className="icon-button" aria-label="Comandi (Ctrl+K)" onClick={() => setPaletteOpen(true)}><Icon name="command" /></button>
          </header>

          <div ref={coreLayerRef} className={`core-layer ${empty || live ? 'hero' : 'ambient'}`} data-state={coreState}><Core state={coreState} className="core" level={micLevel} /></div>
          {dragging && <div className="dropzone" aria-hidden="true"><span className="glass"><Icon name="paperclip" />Rilascia per allegare (max 2 file, 1,5 MB)</span></div>}

          <div className="scroll" ref={scrollRef} onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            const far = element.scrollHeight - element.scrollTop - element.clientHeight > 240;
            if (far !== showJump) setShowJump(far);
          }}>
            {empty ? (
              <section className="welcome" aria-label="Inizia">
                <div ref={coreSlotRef} className="core-slot" aria-hidden="true" />
                <m.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}>
                  Chiedi. <span className="accent">NexusNXS</span> ragiona.
                </m.h2>
                <p>Risposte rapide o approfondite, con fonti verificabili. Le conversazioni restano su questo dispositivo.</p>
                {caps.voiceInput && caps.voiceOutput && !live && (
                  <m.button type="button" className="live-cta" onClick={() => void startLive()}
                    initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.4 }}>
                    <Icon name="wave" />Parla con l’entità<kbd>Ctrl+Maiusc+L</kbd>
                  </m.button>
                )}
                <div className="suggestions">
                  {SUGGESTIONS.map((suggestion, index) => (
                    <m.button key={suggestion} type="button" className="chip glass" onClick={() => void send(suggestion)}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * index + 0.2, duration: 0.4 }}>
                      {suggestion}
                    </m.button>
                  ))}
                </div>
              </section>
            ) : (
              <ol className="thread" aria-live="polite" aria-busy={generating}>
                <AnimatePresence initial={false}>
                  {conversation!.messages.map((message) => (
                    <m.li key={message.id} className={`message ${message.role}${message.error ? ' error' : ''}`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
                      {message.role === 'user' ? (
                        <div className="user-turn">
                          {message.attachments?.length ? <ul className="attachment-list sent">{message.attachments.map((item) => (
                            <li key={item.name} className="attachment"><Icon name={item.mime.startsWith('image/') ? 'image' : 'file'} /><span>{item.name}</span><small>{formatSize(item.size)}</small></li>
                          ))}</ul> : null}
                          <p className="bubble">{message.voice && <Icon name="mic" />}{message.content}</p>
                          {!generating && message.id === conversation!.messages.filter((item) => item.role === 'user').at(-1)?.id && (
                            <button type="button" className="icon-button small edit-turn" aria-label="Modifica e reinvia" title="Modifica e reinvia" onClick={() => {
                              const index = conversation!.messages.findIndex((item) => item.id === message.id);
                              updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.slice(0, index) }));
                              setDraft(message.content);
                              window.requestAnimationFrame(() => inputRef.current?.focus());
                            }}><Icon name="sliders" /></button>
                          )}
                        </div>
                      ) : (
                        <div className="answer">
                          {message.content ? <Markdown text={message.content} /> : <Thinking label={phase} />}
                          <AgentTrail steps={message.steps} sources={message.sources} live={generating && message.id === conversation!.messages.at(-1)?.id} />
                          {message.interrupted && <p className="note">Risposta interrotta.</p>}
                          {message.content && !generating && <AnswerActions text={message.content}
                            rating={message.rating} onRate={message.requestId && !message.error ? async (rating) => {
                              const previous = message.rating;
                              updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === message.id ? { ...entry, rating } : entry) }));
                              try { await platform.rate(message.requestId!, rating); }
                              catch {
                                updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === message.id ? { ...entry, rating: previous } : entry) }));
                                notify('Valutazione non registrata: la risposta non è più disponibile.');
                              }
                            } : undefined}
                            speaking={speakingId === message.id} canSpeak={caps.voiceOutput && !message.error}
                            onSpeak={() => speakingId === message.id ? stopSpeaking() : void speak(message.id, message.content)} onRetry={() => {
                            const index = conversation!.messages.findIndex((item) => item.id === message.id);
                            const question = conversation!.messages[index - 1];
                            if (question?.role === 'user') {
                              updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.slice(0, index - 1) }));
                              void send(question.content);
                            }
                          }} />}
                        </div>
                      )}
                    </m.li>
                  ))}
                </AnimatePresence>
              </ol>
            )}
          </div>

          {live ? (
            <m.section className="live-panel glass" aria-label="Voce live" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}>
              <span className="live-state" role="status" aria-live="polite" data-state={coreState}>
                <i aria-hidden="true" />
                {recording ? 'Ti ascolto…' : transcribing ? 'Comprendo…' : generating ? (phase || 'Penso…') : speakingId ? 'Parlo · parla sopra per interrompermi' : 'In attesa…'}
              </span>
              <span className="live-actions">
                {(speakingId || generating) && <button type="button" className="row-button" onClick={() => { if (generating) stop(); stopSpeaking(); }}><Icon name="stop" />Interrompi</button>}
                <button type="button" className="live-end" onClick={endLive}><Icon name="close" />Termina</button>
              </span>
            </m.section>
          ) : (
          <form className="composer glass" data-recording={Boolean(recording)} onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
            <AnimatePresence>
              {showJump && !empty && (
                <m.button key="jump" type="button" className="jump glass" aria-label="Torna in fondo" onClick={jumpToBottom}
                  initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.9 }} transition={{ duration: 0.18 }}>
                  <Icon name="down" />
                </m.button>
              )}
            </AnimatePresence>
            {pending.length > 0 && <ul className="attachment-list">{pending.map((item) => (
              <li key={item.id} className="attachment">
                {item.preview ? <img src={item.preview} alt="" width="28" height="28" /> : <Icon name="file" />}
                <span>{item.name}</span><small>{formatSize(item.size)}</small>
                <button type="button" className="icon-button small" aria-label={`Rimuovi ${item.name}`} onClick={() => removePending(item.id)}><Icon name="close" /></button>
              </li>
            ))}</ul>}
            <textarea ref={inputRef} value={draft} rows={1} maxLength={platform.kind === 'desktop' ? 48_000 : 12_000}
              placeholder={recording ? 'Ti ascolto… parla, mi fermo quando fai una pausa' : transcribing ? 'Trascrivo…' : 'Scrivi a NexusNXS…'} aria-label="Messaggio"
              onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKey} autoFocus readOnly={Boolean(recording) || transcribing}
              onPaste={(event) => { const files = [...event.clipboardData.files]; if (files.length && caps.attachments && platform.acceptsDroppedFiles) { event.preventDefault(); void addFiles(files); } }} />
            <div className="composer-bar">
              {caps.attachments && <>
                <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => { void addFiles([...(event.target.files ?? [])]); event.target.value = ''; }} />
                <button type="button" className="icon-button small" aria-label="Allega file" disabled={generating || (!platform.pickAttachments && pending.length >= 2)} onClick={async () => {
                  // Desktop: selettore nativo, il main process estrae il contenuto. Web: input del browser.
                  if (!platform.pickAttachments) { fileRef.current?.click(); return; }
                  try { const picked = await platform.pickAttachments(); setPending((current) => [...current, ...picked]); }
                  catch { notify('Allegato non leggibile.'); }
                }}><Icon name="paperclip" /></button>
              </>}
              <button type="button" className="mode" data-mode={mode} onClick={toggleMode} aria-pressed={mode === 'deep'}
                title="Approfondito: modello più grande e preciso, risposte più lente">
                <Icon name={mode === 'deep' ? 'sparkles' : 'bolt'} />{mode === 'deep' ? 'Approfondito' : 'Rapido'}
              </button>
              <span className="hint">Invio per inviare · Maiusc+Invio per andare a capo</span>
              {caps.voiceInput && caps.voiceOutput && !generating && !recording && (
                <button type="button" className="icon-button small live-toggle" aria-label="Voce live (Ctrl+Maiusc+L)" title="Conversazione vocale continua" onClick={() => void startLive()}><Icon name="wave" /></button>
              )}
              {caps.voiceInput && !generating && (
                <button type="button" className="mic" data-active={Boolean(recording)} aria-pressed={Boolean(recording)} disabled={transcribing}
                  aria-label={recording ? 'Termina e invia' : 'Parla con NexusNXS'} onClick={() => void toggleMic()}><Icon name="mic" /></button>
              )}
              {generating
                ? <button type="button" className="send stop" aria-label="Interrompi" onClick={stop}><Icon name="stop" /></button>
                : <button type="submit" className="send" aria-label="Invia" disabled={(!draft.trim() && !pending.length) || Boolean(recording) || transcribing}><Icon name="arrow" /></button>}
            </div>
          </form>
          )}
        </main>

        <AnimatePresence>
          {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={[
            { id: 'new', label: 'Nuova conversazione', hint: 'Ctrl+Maiusc+O', run: startNew },
            ...(caps.voiceInput && caps.voiceOutput ? [{ id: 'live', label: live ? 'Termina voce live' : 'Avvia voce live', hint: 'Ctrl+Maiusc+L', run: () => { if (live) endLive(); else void startLive(); } }] : []),
            { id: 'sidebar', label: sidebarHidden ? 'Mostra barra laterale' : 'Nascondi barra laterale', hint: 'Ctrl+B', run: toggleSidebar },
            ...(conversation?.messages.length ? [{ id: 'export', label: 'Esporta conversazione (Markdown)', run: () => exportConversation(conversation) }] : []),
            { id: 'mode', label: mode === 'fast' ? 'Passa a modalità Approfondita' : 'Passa a modalità Rapida', run: toggleMode },
            { id: 'prefs', label: 'Preferenze di risposta', run: () => setSettingsOpen(true) },
            ...conversations.slice(0, 8).map((item) => ({ id: `c-${item.id}`, label: item.title, hint: 'Apri', run: () => transition(() => setState((state) => ({ ...state, activeId: item.id }))) })),
            ...(desktopBridge ? [{ id: 'control', label: 'Centro di controllo (modelli, telefono, memoria, sistema)', run: () => setControlOpen(true) }] : [])
          ]} />}
          {settingsOpen && <Settings preferences={preferences} onClose={() => setSettingsOpen(false)} onCleared={() => notify('Dati locali e risposte di ripresa cancellati.')} />}
          {controlOpen && desktopBridge && <ControlCenter onClose={() => setControlOpen(false)} notify={notify} />}
          {!paired && <PairingScreen onPaired={() => { setPaired(true); notify('Collegato al tuo PC.'); }} />}
        </AnimatePresence>

        <AnimatePresence>{toast && <m.div className="toast glass" role="alert" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toast}</m.div>}</AnimatePresence>
      </div>
    </MotionConfig></LazyMotion>
  );
}

function Thinking({ label }: { label: string }) {
  return <p className="thinking" role="status"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{label || 'Sto pensando…'}</p>;
}

/**
 * Cosa ha fatto l'agente per rispondere: passaggi visibili (strumenti, ricerche,
 * verifiche) e fonti. Durante la risposta resta aperto; dopo si richiude.
 */
function AgentTrail({ steps = [], sources = [], live }: { steps?: string[]; sources?: Array<{ title?: string; url: string }>; live: boolean }) {
  if (!steps.length && !sources.length) return null;
  const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  return (
    <div className="agent-trail">
      {steps.length > 1 && (
        <details open={live}>
          <summary>{live ? 'Al lavoro' : `${steps.length} passaggi`}</summary>
          <ol>{steps.map((step, index) => <li key={`${index}-${step}`} data-done={!live || index < steps.length - 1}>{step}</li>)}</ol>
        </details>
      )}
      {sources.length > 0 && (
        <ul className="sources" aria-label="Fonti">
          {sources.map((source, index) => (
            <li key={`${index}-${source.url || source.title}`}>
              {source.url
                ? <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.title || source.url}><span className="index">{index + 1}</span>{source.title || host(source.url)}<small>{host(source.url)}</small></a>
                : <span title="Nota locale"><span className="index">{index + 1}</span>{source.title}<small>nota locale</small></span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnswerActions({ text, onRetry, onSpeak, speaking, canSpeak, rating, onRate }: { text: string; onRetry: () => void; onSpeak: () => void; speaking: boolean; canSpeak: boolean; rating?: 'up' | 'down'; onRate?: (rating: 'up' | 'down') => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="answer-actions" data-speaking={speaking}>
      {onRate && <>
        <button type="button" className="icon-button small" aria-label="Risposta utile" aria-pressed={rating === 'up'} data-active={rating === 'up'} onClick={() => onRate('up')}><Icon name="thumbUp" /></button>
        <button type="button" className="icon-button small" aria-label="Risposta non utile" aria-pressed={rating === 'down'} data-active={rating === 'down'} onClick={() => onRate('down')}><Icon name="thumbDown" /></button>
      </>}
      {canSpeak && <button type="button" className="icon-button small" aria-label={speaking ? 'Interrompi lettura' : 'Leggi ad alta voce'} aria-pressed={speaking} onClick={onSpeak}><Icon name={speaking ? 'stop' : 'speaker'} /></button>}
      <button type="button" className="icon-button small" aria-label={copied ? 'Copiato' : 'Copia risposta'} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard negata */ }
      }}><Icon name={copied ? 'check' : 'copy'} /></button>
      <button type="button" className="icon-button small" aria-label="Rigenera risposta" onClick={onRetry}><Icon name="retry" /></button>
    </div>
  );
}

function ConversationList({ onPick, disabled }: { onPick: (id: string) => void; disabled: boolean }) {
  const conversations = useStore((state) => state.conversations);
  const activeId = useStore((state) => state.activeId);
  const [query, setQuery] = useState('');
  const visible = query.trim()
    ? conversations.filter((item) => `${item.title} ${item.messages.map((message) => message.content).join(' ')}`.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')))
    : conversations;
  return (
    <>
      <label className="search"><Icon name="search" /><input type="search" placeholder="Cerca nelle conversazioni" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Cerca nelle conversazioni" /></label>
      <nav className="conversation-list">
        {visible.length === 0 && <p className="muted">{query ? 'Nessun risultato.' : 'Le tue conversazioni appariranno qui.'}</p>}
        {visible.map((item) => (
          <div key={item.id} className="conversation" data-active={item.id === activeId}>
            <button type="button" disabled={disabled} onClick={() => onPick(item.id)}>{item.title}</button>
            <button type="button" className="icon-button small" aria-label={`Elimina ${item.title}`} disabled={disabled} onClick={() => { platform.removeConversation(item.id); deleteConversation(item.id); }}><Icon name="trash" /></button>
          </div>
        ))}
      </nav>
    </>
  );
}

interface Action { id: string; label: string; hint?: string; run: () => void }

function CommandPalette({ actions, onClose }: { actions: Action[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const filtered = actions.filter((action) => action.label.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  const run = (action?: Action) => { if (!action) return; onClose(); action.run(); };
  return (
    <m.div className="overlay" role="presentation" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.div className="palette glass" role="dialog" aria-modal="true" aria-label="Comandi" onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.987, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.987 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}>
        <input autoFocus value={query} placeholder="Cerca un comando o una conversazione…" aria-label="Cerca comandi" role="combobox" aria-expanded="true" aria-controls="palette-list"
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((value) => Math.min(filtered.length - 1, value + 1)); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
            else if (event.key === 'Enter') { event.preventDefault(); run(filtered[index]); }
          }} />
        <ul id="palette-list" role="listbox">
          {filtered.map((action, position) => (
            <li key={action.id} role="option" aria-selected={position === index} data-selected={position === index}
              onMouseEnter={() => setIndex(position)} onClick={() => run(action)}>
              <span>{action.label}</span>{action.hint && <kbd>{action.hint}</kbd>}
            </li>
          ))}
          {filtered.length === 0 && <li className="muted">Nessun comando.</li>}
        </ul>
      </m.div>
    </m.div>
  );
}

/**
 * Associazione di questo dispositivo al PC (ingresso privato). Il link del QR
 * porta già il codice (#pair=…&device=…): in quel caso l'associazione parte da sola.
 */
function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const [code, setCode] = useState(fragment.get('pair') || '');
  const [name, setName] = useState(fragment.get('device') || 'Telefono');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pair = useCallback(async (value: string, device: string) => {
    setBusy(true); setError('');
    try {
      await pairDevice(value, device);
      history.replaceState(null, '', window.location.pathname);
      onPaired();
    } catch (failure) { setError(String((failure as Error)?.message || 'Associazione non riuscita.')); }
    finally { setBusy(false); }
  }, [onPaired]);
  useEffect(() => { if (fragment.get('pair')) void pair(fragment.get('pair')!, fragment.get('device') || 'Telefono'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overlay" role="presentation">
      <m.form className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="pair-title" onSubmit={(event) => { event.preventDefault(); void pair(code, name); }}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
        <header><h2 id="pair-title">Collega questo dispositivo al PC</h2></header>
        <p className="muted">Inserisci il codice mostrato sul PC in Centro di controllo → Telefono. Il collegamento è privato e revocabile.</p>
        <label htmlFor="pair-code">Codice</label>
        <input id="pair-code" className="field" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={(event) => setCode(event.target.value)} required />
        <label htmlFor="pair-name">Nome del dispositivo</label>
        <input id="pair-name" className="field" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        {error && <p className="pair-error" role="alert">{error}</p>}
        <button type="submit" className="live-cta pair-submit" disabled={busy || !code.trim()}>{busy ? 'Collego…' : 'Collega'}</button>
      </m.form>
    </div>
  );
}

/** Scelta del microfono per dettatura e voce live; resta solo su questo dispositivo. */
function MicrophonePicker() {
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selected, setSelected] = useState(preferredMicrophone);
  useEffect(() => { void listMicrophones().then(setDevices); }, []);
  if (devices.length < 2) return null;
  return (
    <>
      <label htmlFor="microphone">Microfono</label>
      <select id="microphone" className="field" value={selected} onChange={(event) => { setPreferredMicrophone(event.target.value); setSelected(event.target.value); }}>
        <option value="">Predefinito di sistema</option>
        {devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
      </select>
    </>
  );
}

function Settings({ preferences, onClose, onCleared }: { preferences: Preferences; onClose: () => void; onCleared: () => void }) {
  const set = (patch: Partial<Preferences>) => setState((state) => ({ ...state, preferences: { ...state.preferences, ...patch } }));
  const option = <K extends keyof Preferences>(key: K, values: Array<[Preferences[K], string]>) => (
    <div className="segmented" role="radiogroup">
      {values.map(([value, label]) => (
        <button key={String(value)} type="button" role="radio" aria-checked={preferences[key] === value} data-active={preferences[key] === value}
          onClick={() => set({ [key]: value } as Partial<Preferences>)}>{label}</button>
      ))}
    </div>
  );
  return (
    <m.div className="overlay" role="presentation" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.section className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
        <header><h2 id="settings-title">Preferenze</h2><button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}><Icon name="close" /></button></header>
        <label>Lunghezza delle risposte</label>
        {option('responseStyle', [['concise', 'Concise'], ['natural', 'Naturali'], ['detailed', 'Dettagliate']])}
        <label>Tono</label>
        {option('tone', [['neutral', 'Equilibrato'], ['warm', 'Caloroso'], ['direct', 'Diretto']])}
        <label>Lingua</label>
        {option('responseLanguage', [['auto', 'Auto'], ['it', 'IT'], ['en', 'EN'], ['es', 'ES'], ['fr', 'FR'], ['de', 'DE']])}
        <MicrophonePicker />
        <p className="muted">Le preferenze accompagnano le richieste; nome e dati personali non vengono inviati.</p>
        <button type="button" className="danger" onClick={async () => {
          if (!window.confirm('Cancellare tutte le conversazioni salvate su questo dispositivo?')) return;
          for (const conversation of getState().conversations) platform.removeConversation(conversation.id);
          clearAll(); await platform.forgetRemote(); onClose(); onCleared();
        }}><Icon name="trash" />Cancella dati locali</button>
      </m.section>
    </m.div>
  );
}
