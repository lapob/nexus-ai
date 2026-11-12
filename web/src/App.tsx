/**
 * @module web/App
 * @description Shell della nuova web app NexusNXS AI: conversazioni locali, streaming con fasi, nucleo WebGPU, palette comandi e preferenze.
 */
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Capabilities, PlanStep, Preferences } from './api';
import { highlight, lexicalSearch, semanticSearch, type SearchDoc, type SearchHit } from './search';
import { useDesktopPresence, useDesktopUpdate } from './desktopPresence';
import { UpdateCard } from './UpdateCard';
import { desktopBridge, platform } from './platform';
import { pairDevice, pairedToken } from './paired';
import brandIcon from './assets/nexus-mark-ui.png';
import { ACCEPT, formatSize, limitsFor, prepareFiles, type Pending } from './attachments';
import { Core, type CoreState } from './Core';
import { Markdown } from './Markdown';
import { Icon, type IconName } from './Icon';
import { CATEGORIES, SLASH_COMMANDS, greeting, matchSlash, mixedSuggestions, needsInput, sample, type SlashCommand } from './prompts';
import { createPlayer, isNoiseTranscript, listMicrophones, listenForBargeIn, preferredMicrophone, setPreferredMicrophone, speakableText, startRecording, type Recording } from './voice';
import { Tooltips } from './Tooltips';
import { useSwipeGestures } from './gestures';
import { mergeStep } from './steps';
import { activeConversation, appendMessage, assignProject, createProject, clearAll, deleteConversation, forkConversation, getState, groupConversations, newConversation, openProject, projectContext, projectFor, renameConversation, setState, togglePin, uid, updateConversation, useStore, type Conversation, type Message } from './store';
import { ProjectNav, ProjectSheet } from './Projects';
import { Panel } from './Panel';
import { closePanel, openPanel, usePanel } from './panelStore';

// Centro di controllo solo desktop (protocollo nexus://, script-src 'self'): caricato alla prima apertura, fuori dal bundle iniziale.
const ControlCenter = lazy(() => import('./ControlCenter').then((module) => ({ default: module.ControlCenter })));
// Il selettore serve solo nelle preferenze: resta fuori dal bundle di avvio.
const Select = lazy(() => import('./Select').then((module) => ({ default: module.Select })));

/** Rinomina e, dove la cronologia vive altrove (desktop), salva subito anche le conversazioni non attive. */
function rename(id: string, title: string) {
  renameConversation(id, title);
  const updated = getState().conversations.find((item) => item.id === id);
  if (updated?.messages.length) platform.saveConversation(updated);
}

/** Il progetto della conversazione per i trasporti: il contesto si costruisce al budget di ciascun canale. */
function projectRef(conversationId: string) {
  const project = projectFor(conversationId);
  return project ? { name: project.name, context: (budget: number) => projectContext(project, budget) } : null;
}

const timeLabel = (at: number) => new Date(at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+K', 'Comandi e conversazioni'], ['Ctrl+Maiusc+O', 'Nuova conversazione'], ['Ctrl+B', 'Mostra o nascondi la barra laterale'],
  ['Ctrl+Maiusc+L', 'Voce live'], ['Ctrl+Maiusc+Spazio', 'Barra rapida da qualsiasi programma (app desktop)'], ['Ctrl+/', 'Scorciatoie da tastiera'], ['/', 'Comandi rapidi nel messaggio'],
  ['Invio', 'Invia'], ['Maiusc+Invio', 'Vai a capo'], ['Esc', 'Chiudi pannelli o interrompi la risposta']
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

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function useServiceStatus() {
  const [status, setStatus] = useState<'ready' | 'preparing' | 'offline' | 'unknown'>('unknown');
  useEffect(() => {
    let alive = true;
    let timer = 0;
    // Offline si riprova ogni 5 s per sbloccare l'invio appena il PC torna; online ogni 30 s.
    const check = async () => {
      window.clearTimeout(timer);
      const next = navigator.onLine === false ? 'offline' : await platform.status().catch(() => 'offline' as const);
      if (!alive) return;
      setStatus(next);
      timer = window.setTimeout(check, next === 'ready' ? 30_000 : 5_000);
    };
    const lost = () => { window.clearTimeout(timer); setStatus('offline'); timer = window.setTimeout(check, 5_000); };
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    window.addEventListener('online', check);
    window.addEventListener('offline', lost);
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener('online', check); window.removeEventListener('offline', lost); document.removeEventListener('visibilitychange', visible); };
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
  const offline = status === 'offline';
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Barra laterale nascondibile su schermi larghi: la scelta resta per le visite successive.
  const [sidebarHidden, setSidebarHidden] = useState(() => { try { return localStorage.getItem('nxs.sidebar') === 'hidden'; } catch { return false; } });
  const compact = useMedia('(max-width: 839px)');
  // Fuori vista = fuori dal Tab e dagli screen reader: sul telefono quando è chiusa, su desktop quando è nascosta.
  const sidebarAway = compact ? !sidebarOpen : sidebarHidden && !sidebarOpen;
  const toggleSidebar = useCallback(() => setSidebarHidden((hidden) => {
    try { localStorage.setItem('nxs.sidebar', hidden ? 'shown' : 'hidden'); } catch { /* archiviazione non disponibile */ }
    return !hidden;
  }), []);
  // Dalla colonna di icone: apre la barra e porta il focus (o la vista) sull'elemento scelto.
  const revealSidebar = useCallback((selector: string) => {
    setSidebarHidden(false);
    try { localStorage.setItem('nxs.sidebar', 'shown'); } catch { /* archiviazione non disponibile */ }
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;
      if (target.matches('input')) target.focus(); else { target.scrollIntoView({ block: 'nearest' }); target.querySelector<HTMLElement>('button')?.focus(); }
    }, 340);
  }, []);
  const [showJump, setShowJump] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState<boolean | 'memory'>(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pinned = useStore((state) => state.pinned);
  const projects = useStore((state) => state.projects);
  const projectView = useStore((state) => state.projectView);
  const currentProject = useStore((state) => projectFor(state.activeId, state));
  const viewedProject = projects.find((item) => item.id === projectView) ?? null;
  const [projectSheet, setProjectSheet] = useState<string | null>(null);
  const closeProjectSheet = useCallback(() => setProjectSheet(null), []);
  const panelDoc = usePanel();
  // Home dinamica: categoria scelta e rotazione dei suggerimenti (nuova a ogni conversazione o con «Altre idee»).
  const [category, setCategory] = useState<string | null>(null);
  const [roll, setRoll] = useState(0);
  const suggestions = useMemo(() => {
    const picked = CATEGORIES.find((item) => item.id === category);
    return picked ? sample(picked.prompts, 4).map((text) => ({ text, icon: picked.icon })) : mixedSuggestions(4);
  }, [category, roll]); // eslint-disable-line react-hooks/exhaustive-deps
  const hello = useMemo(() => greeting(), [roll]); // eslint-disable-line react-hooks/exhaustive-deps
  const [slashIndex, setSlashIndex] = useState(0);
  const slash = matchSlash(draft);
  const [toast, setToast] = useState('');
  const controller = useRef<AbortController | null>(null);
  const pendingId = useRef('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const coreLayerRef = useRef<HTMLDivElement>(null);
  const coreSlotRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const touchY = useRef(0);
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
    const { accepted, errors } = await prepareFiles(files, pending, limitsFor(platform.kind));
    if (accepted.length) setPending((current) => [...current, ...accepted]);
    if (errors.length) notify(errors[0]);
  }, [notify, pending]);

  const removePending = (id: string) => setPending((current) => {
    const removed = current.find((item) => item.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    return current.filter((item) => item.id !== id);
  });

  const send = useCallback(async (raw: string, { voice = false, autoSpeak = true, forceDeep = false, attach }: { voice?: boolean; autoSpeak?: boolean; forceDeep?: boolean; attach?: Pending[] } = {}): Promise<{ id: string; text: string } | null> => {
    const attachments = attach ?? pending;
    const text = raw.trim() || (attachments.length ? 'Analizza gli allegati.' : '');
    if (!text || getState().generating) return null;
    // Offline nessun invio: il testo resta nel composer e si invia quando il PC torna raggiungibile.
    if (offlineRef.current) { notify('Offline: il PC non è raggiungibile. Il messaggio resta qui, riprovo da solo.'); return null; }
    stopSpeaking();
    const conversationId = activeConversation()?.id ?? newConversation();
    const history = (activeConversation()?.messages ?? []).filter((message) => !message.error).map(({ role, content }) => ({ role, content }));
    appendMessage(conversationId, { id: uid(), role: 'user', content: text, createdAt: Date.now(), voice,
      ...(attachments.length ? { attachments: attachments.map(({ name, mime, size }) => ({ name, mime, size })) } : {}) });
    const requestId = uid();
    const assistant: Message = { id: uid(), role: 'assistant', content: '', createdAt: Date.now(), requestId };
    appendMessage(conversationId, assistant);
    setDraft('');
    for (const item of attachments) if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
    if (!attach) setPending([]);
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
        text, history, mode: forceDeep ? 'deep' : getState().mode, clientMessageId: pendingId.current, preferences: getState().preferences, signal: abort.signal, attachments, conversationId, project: projectRef(conversationId),
        onEvent: (event) => {
          if (event.type === 'token' || event.type === 'replace') {
            buffered = event.type === 'token' ? buffered + event.token : event.text;
            // Un repaint per frame anche con centinaia di token al secondo.
            if (!raf) raf = requestAnimationFrame(paint);
            if (getState().phase) setState((state) => ({ ...state, phase: '' }), { durable: false });
          } else if (event.type === 'phase') {
            setState((state) => ({ ...state, phase: event.label }), { durable: false });
            // Cronologia visibile dei passaggi (strumenti, ricerche, verifiche), senza duplicati consecutivi.
            patch((message) => ({ ...message, steps: mergeStep(message.steps, event.label) }));
          } else if (event.type === 'sources') patch((message) => ({ ...message, sources: event.sources }));
          else if (event.type === 'memory') patch((message) => ({ ...message, memory: event.memory }), true);
          else if (event.type === 'plan') patch((message) => ({ ...message, plan: event.plan }), true);
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
  const update = useDesktopUpdate();
  // Revisione settimanale della memoria: un invito discreto se ci sono ricordi dedotti da confermare
  // e la memoria non è stata aperta negli ultimi 7 giorni («Più tardi» rimanda di un giorno).
  const [memoryReview, setMemoryReview] = useState(0);
  useEffect(() => {
    if (!desktopBridge?.memoryDigest) return;
    let last = 0;
    try { last = Number(localStorage.getItem('nxs.memory.reviewedAt')) || 0; } catch { return; }
    if (Date.now() - last < 7 * 86_400_000) return;
    const timer = window.setTimeout(() => {
      Promise.resolve(desktopBridge!.memoryDigest()).then((digest: { toConfirm?: unknown[] }) => setMemoryReview(Array.isArray(digest?.toConfirm) ? digest.toConfirm.length : 0)).catch(() => {});
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, []);
  // Barra rapida Ctrl+Maiusc+Spazio: la domanda arriva qui e parte in una conversazione nuova
  // (se una risposta è in corso, resta nel composer per non interromperla).
  const quickSend = useRef(send); quickSend.current = send;
  useEffect(() => {
    if (!desktopBridge?.onQuickPrompt) return;
    return desktopBridge.onQuickPrompt(({ text, attachment }: { text: string; attachment?: { id: string; name: string; mime: string; size: number } }) => {
      // Cattura dello schermo già registrata dal processo principale: qui viaggia solo il suo id.
      const screen: Pending[] = attachment && typeof attachment.id === 'string'
        ? [{ id: attachment.id.slice(0, 128), name: String(attachment.name || 'Schermo.jpg').slice(0, 120), mime: 'image/jpeg', size: Math.max(0, Number(attachment.size) || 0), data: '' }]
        : [];
      if (getState().generating || offlineRef.current) {
        setDraft(text);
        if (screen.length) setPending((current) => [...current, ...screen]);
        inputRef.current?.focus();
        return;
      }
      newConversation();
      void quickSend.current(text, screen.length ? { attach: screen } : {});
    }) as () => void;
  }, []);

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

  const startNew = useCallback(() => { if (!getState().generating) transition(() => { newConversation(); setSidebarOpen(false); setCategory(null); setRoll((value) => value + 1); }); inputRef.current?.focus(); }, []);

  /** Mette un testo nel composer con il cursore in fondo (suggerimenti da completare, comandi «/»). */
  const prefill = useCallback((text: string) => {
    setDraft(text);
    window.requestAnimationFrame(() => { const input = inputRef.current; if (input) { input.focus(); input.setSelectionRange(text.length, text.length); } });
  }, []);
  const applySlash = useCallback((command: SlashCommand) => { prefill(command.template); setSlashIndex(0); }, [prefill]);
  const branch = useCallback((messageId: string) => {
    const current = activeConversation();
    if (!current || getState().generating) return;
    transition(() => { if (forkConversation(current.id, messageId)) notify('Nuovo ramo creato: puoi continuare da qui.'); });
  }, [notify]);
  const toggleMode = useCallback(() => setState((state) => ({ ...state, mode: state.mode === 'fast' ? 'deep' : 'fast' })), []);

  // Scorciatoie globali: ⌘K palette, ⌘⇧O nuova chat, Esc chiude i pannelli o ferma.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
      else if (meta && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); startNew(); }
      else if (meta && !event.shiftKey && event.key.toLowerCase() === 'b') { event.preventDefault(); if (window.matchMedia('(min-width: 840px)').matches) toggleSidebar(); else setSidebarOpen((open) => !open); }
      else if (meta && event.shiftKey && event.key.toLowerCase() === 'l') { event.preventDefault(); if (liveRef.current) endLive(); else void startLive(); }
      else if (meta && event.key === '/') { event.preventDefault(); setShortcutsOpen((open) => !open); }
      else if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        if (liveRef.current && !paletteOpen && !settingsOpen) endLive();
        else if (paletteOpen || settingsOpen || sidebarOpen || controlOpen || shortcutsOpen || projectSheet) { setPaletteOpen(false); setSettingsOpen(false); setSidebarOpen(false); setControlOpen(false); setShortcutsOpen(false); setProjectSheet(null); }
        else if (panelDoc) closePanel();
        else if (recording) recording.cancel();
        else if (getState().generating) stop();
        else stopSpeaking();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlOpen, endLive, paletteOpen, panelDoc, projectSheet, recording, settingsOpen, shortcutsOpen, sidebarOpen, startLive, startNew, stop, stopSpeaking, toggleSidebar]);

  useSwipeGestures({ sidebarOpen, panelOpen: Boolean(panelDoc) }, { openSidebar: () => setSidebarOpen(true), closeSidebar: () => setSidebarOpen(false), closePanel });

  const jumpToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  // Segue la risposta solo se l'utente è già in fondo: leggere sopra non viene interrotto.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Home senza messaggi: si legge dall'alto (titolo e idee), su schermi bassi non deve sparire sopra.
    if (!conversation?.messages.length) { element.scrollTop = 0; return; }
    if (stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [conversation?.messages]);

  const onComposerKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Menu dei comandi «/»: frecce per scegliere, Invio o Tab per applicare, Esc per chiudere.
    if (slash?.length) {
      const selected = Math.min(slashIndex, slash.length - 1);
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex((selected + 1) % slash.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex((selected - 1 + slash.length) % slash.length); return; }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') { event.preventDefault(); applySlash(slash[selected]); return; }
      if (event.key === 'Escape') { event.preventDefault(); setDraft(''); return; }
    }
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
      <div className="app" data-sidebar={sidebarOpen ? 'open' : 'closed'} data-collapsed={sidebarHidden} data-live={live} data-panel={Boolean(panelDoc)}>
        <aside className="sidebar glass" aria-label="Conversazioni" aria-hidden={compact && sidebarAway ? true : undefined} inert={compact && sidebarAway ? true : undefined}>
          {/* Desktop con barra chiusa: colonna di icone come in Claude, mai un vuoto. */}
          <nav className="sidebar-rail" aria-label="Barra compatta" inert={compact || !sidebarHidden ? true : undefined}>
            <button type="button" className="icon-button rail-brand" aria-label="Mostra barra laterale (Ctrl+B)" title="Mostra barra laterale" onClick={toggleSidebar}><img src={brandIcon} alt="" width="22" height="22" /><Icon name="sidebar" /></button>
            <button type="button" className="icon-button rail-new" aria-label="Nuova conversazione" title="Nuova conversazione" onClick={startNew} disabled={generating}><Icon name="plus" /></button>
            <button type="button" className="icon-button" aria-label="Cerca nelle conversazioni" title="Cerca" onClick={() => revealSidebar('.sidebar-full input[type="search"]')}><Icon name="search" /></button>
            <button type="button" className="icon-button" aria-label="Progetti" title="Progetti" onClick={() => revealSidebar('.sidebar-full .projects')}><Icon name="folder" /></button>
            <span className="rail-spacer" />
            <ProfileMenu compactRail status={status} onSettings={() => setSettingsOpen(true)} onControl={desktopBridge ? () => setControlOpen(true) : undefined} onShortcuts={() => setShortcutsOpen(true)} />
          </nav>
          <div className="sidebar-full" inert={!compact && sidebarHidden ? true : undefined}>
          <div className="sidebar-head">
            <span className="brand"><img src={brandIcon} alt="" width="22" height="22" />NexusNXS</span>
            <span className="sidebar-actions">
              <button type="button" className="icon-button only-wide" aria-label="Nascondi barra laterale (Ctrl+B)" onClick={toggleSidebar}><Icon name="sidebar" /></button>
            </span>
          </div>
          <button type="button" className="new-chat" aria-label="Nuova conversazione" onClick={startNew} disabled={generating}><Icon name="plus" size={18} /><span>Nuova conversazione</span><kbd className="only-wide">Ctrl+Maiusc+O</kbd></button>
          <ProjectNav onEdit={setProjectSheet} disabled={generating} />
          <ConversationList onEditProject={setProjectSheet} onPick={(id) => transition(() => { setState((state) => ({ ...state, activeId: id })); setSidebarOpen(false); })} disabled={generating} />
          <div className="sidebar-foot">
            <ProfileMenu status={status} onSettings={() => setSettingsOpen(true)} onControl={desktopBridge ? () => setControlOpen(true) : undefined} onShortcuts={() => setShortcutsOpen(true)} />
          </div>
          </div>
        </aside>
        <button type="button" className="scrim" aria-label="Chiudi menu" tabIndex={sidebarOpen ? 0 : -1} onClick={() => setSidebarOpen(false)} />

        <main className="stage"
          onDragOver={(event) => { if (caps.attachments && platform.acceptsDroppedFiles && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
          onDragLeave={(event) => { if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (caps.attachments && platform.acceptsDroppedFiles) void addFiles([...event.dataTransfer.files]); }}>
          <header className="topbar">
            <button type="button" className="icon-button only-compact" aria-label="Apri conversazioni" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
            {conversation && !empty
              ? <TitleEditor key={conversation.id} conversation={conversation} disabled={generating} />
              : <h1 className="title">{viewedProject ? viewedProject.name : 'NexusNXS AI'}</h1>}
            {currentProject && !empty && <button type="button" className="project-chip only-wide" title="Istruzioni e file del progetto" onClick={() => setProjectSheet(currentProject.id)}><Icon name="folder" size={15} /><span>{currentProject.name}</span></button>}
            {conversation && !empty && <span className="title-actions only-wide">
              <button type="button" className="icon-button small" aria-label={pinned.includes(conversation.id) ? 'Rimuovi dalle fissate' : 'Fissa conversazione'} title={pinned.includes(conversation.id) ? 'Rimuovi dalle fissate' : 'Fissa in cima'}
                aria-pressed={pinned.includes(conversation.id)} data-active={pinned.includes(conversation.id)} onClick={() => togglePin(conversation.id)}><Icon name="pin" size={18} /></button>
              <button type="button" className="icon-button small" aria-label="Esporta in Markdown" title="Esporta in Markdown" disabled={generating} onClick={() => exportConversation(conversation)}><Icon name="download" size={18} /></button>
            </span>}
            <span className="status" data-status={status} role="status" aria-live="polite" title={status === 'ready' ? 'Online' : status === 'preparing' ? 'In preparazione' : status === 'offline' ? 'Offline' : 'Connessione…'}>
              <i aria-hidden="true" /><span className="status-text sr-only">{status === 'ready' ? 'Online' : status === 'preparing' ? 'In preparazione' : status === 'offline' ? 'Offline' : 'Connessione…'}</span>
            </span>
            <button type="button" className="icon-button" aria-label="Comandi (Ctrl+K)" onClick={() => setPaletteOpen(true)}><Icon name="command" /></button>
          </header>

          <div ref={coreLayerRef} className={`core-layer ${empty || live ? 'hero' : 'ambient'}`} data-state={coreState}><Core state={coreState} className="core" level={micLevel} /><div className="core-hud" aria-hidden="true"><i /><i /><i /></div></div>
          {dragging && <div className="dropzone" aria-hidden="true"><span className="glass"><Icon name="paperclip" />{Number.isFinite(limitsFor(platform.kind).maxCount) ? 'Rilascia per allegare (max 2 file, 1,5 MB)' : 'Rilascia per allegare'}</span></div>}

          <div className="scroll" ref={scrollRef}
            // Intenzione dell'utente, non posizione: il primo gesto verso l'alto stacca subito lo scorrimento
            // automatico (prima un piccolo scroll entro 80px veniva riportato giù a ogni token: effetto glitch).
            onWheel={(event) => { if (event.deltaY < 0) stickToBottom.current = false; }}
            onTouchStart={(event) => { touchY.current = event.touches[0]?.clientY ?? 0; }}
            onTouchMove={(event) => { const y = event.touches[0]?.clientY ?? 0; if (y > touchY.current + 4) stickToBottom.current = false; touchY.current = y; }}
            onKeyDown={(event) => { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stickToBottom.current = false; }}
            onScroll={(event) => {
              const element = event.currentTarget;
              const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
              // Si riaggancia solo quando l'utente torna davvero in fondo.
              if (distance < 12) stickToBottom.current = true;
              const far = distance > 240;
              if (far !== showJump) setShowJump(far);
            }}>
            {empty ? (
              <section className="welcome" aria-label="Inizia">
                <div ref={coreSlotRef} className="core-slot" aria-hidden="true" />
                {viewedProject && <m.p className="project-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Icon name="folder" size={15} />{viewedProject.name}{viewedProject.files.length ? ` · ${viewedProject.files.length} file` : ''}{viewedProject.instructions.trim() ? ' · istruzioni attive' : ''}</m.p>}
                <m.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}>
                  {hello} <span className="accent">Cosa creiamo?</span>
                </m.h2>
                {caps.voiceInput && caps.voiceOutput && !live && (
                  <m.button type="button" className="live-cta" onClick={() => void startLive()}
                    initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.4 }}>
                    <Icon name="wave" />Parla con l’entità<kbd>Ctrl+Maiusc+L</kbd>
                  </m.button>
                )}
                <div className="categories" role="group" aria-label="Categorie di suggerimenti">
                  {CATEGORIES.map((item) => (
                    <button key={item.id} type="button" className="category" aria-pressed={category === item.id} data-active={category === item.id}
                      onClick={() => setCategory((current) => current === item.id ? null : item.id)}><Icon name={item.icon} size={17} />{item.label}</button>
                  ))}
                  <button type="button" className="category shuffle" aria-label="Altre idee" title="Altre idee" onClick={() => setRoll((value) => value + 1)}><Icon name="shuffle" size={17} /></button>
                </div>
                <div className="suggestions" key={`${category ?? 'mix'}-${roll}`}>
                  {suggestions.map((suggestion, index) => (
                    <m.button key={suggestion.text} type="button" className="chip glass" onClick={() => offline || needsInput(suggestion.text) ? prefill(suggestion.text) : void send(suggestion.text)}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * index + 0.1, duration: 0.36 }}>
                      <Icon name={suggestion.icon} size={17} /><span>{suggestion.text.replace(/:\s$/, '…')}</span>
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
                        <UserTurn message={message} disabled={generating} onResend={(text) => {
                          // La conversazione si tronca solo quando il testo modificato parte davvero.
                          const index = conversation!.messages.findIndex((item) => item.id === message.id);
                          updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.slice(0, index) }));
                          void send(text);
                        }} />
                      ) : (
                        <div className="answer">
                          {message.plan?.length ? <PlanCard plan={message.plan} live={generating && message.id === conversation!.messages.at(-1)?.id} /> : null}
                          <AgentTrail steps={message.steps} live={generating && message.id === conversation!.messages.at(-1)?.id} writing={Boolean(message.content)} />
                          {message.content ? <Markdown text={message.content} sources={message.sources} /> : (message.steps?.length ?? 0) > 1 ? null : <Thinking label={phase} />}
                          <SourceList sources={message.sources} />
                          {message.memory && <MemoryChip notice={message.memory} onView={desktopBridge ? () => setControlOpen('memory') : undefined}
                            onUndo={desktopBridge && message.memory.action === 'remember' && message.memory.id && !message.memory.undone ? async () => {
                              try {
                                await desktopBridge!.forgetMemory(message.memory!.id);
                                updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === message.id && entry.memory ? { ...entry, memory: { ...entry.memory, undone: true } } : entry) }));
                                notify('Ricordo annullato');
                              } catch { notify('Non sono riuscito ad annullare il ricordo.'); }
                            } : undefined} />}
                          {message.interrupted && <p className="note">Risposta interrotta.
                            {!generating && message.id === conversation!.messages.at(-1)?.id && <button type="button" className="inline-action" onClick={() => void send('Continua esattamente da dove ti sei fermato, senza ripetere.')}><Icon name="forward" size={16} />Continua</button>}
                          </p>}
                          {message.content && !generating && <AnswerActions text={message.content} at={message.createdAt} onBranch={message.error ? undefined : () => branch(message.id)}
                            onOpen={!message.error && message.content.length > 1_200 ? () => openPanel({ language: 'markdown', text: message.content }) : undefined}
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
                            onSpeak={() => speakingId === message.id ? stopSpeaking() : void speak(message.id, message.content)} onRetry={(deep) => {
                            const index = conversation!.messages.findIndex((item) => item.id === message.id);
                            const question = conversation!.messages[index - 1];
                            if (question?.role === 'user') {
                              updateConversation(conversation!.id, (item) => ({ ...item, messages: item.messages.slice(0, index - 1) }));
                              void send(question.content, { forceDeep: deep });
                            }
                          }} canDeepen={mode !== 'deep' && !message.error} />}
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
                <span className="live-text">{recording ? 'Ti ascolto…' : transcribing ? 'Comprendo…' : generating ? (phase || 'Penso…') : speakingId ? 'Parlo · parla sopra per interrompermi' : 'In attesa…'}</span>
              </span>
              <span className="live-actions">
                {(speakingId || generating) && <button type="button" className="row-button" onClick={() => { if (generating) stop(); stopSpeaking(); }}><Icon name="stop" />Interrompi</button>}
                <button type="button" className="live-end" onClick={endLive}><Icon name="close" />Termina</button>
              </span>
            </m.section>
          ) : (
          <form className="composer glass" data-recording={Boolean(recording)} data-offline={offline} data-generating={generating} onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
            <AnimatePresence>
              {showJump && !empty && (
                <m.button key="jump" type="button" className="jump glass" aria-label="Torna in fondo" onClick={jumpToBottom}
                  initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.9 }} transition={{ duration: 0.18 }}>
                  <Icon name="down" />
                </m.button>
              )}
            </AnimatePresence>
            {slash && slash.length > 0 && (
              <ul className="slash-menu glass" role="listbox" aria-label="Comandi rapidi">
                {slash.map((item, position) => (
                  <li key={item.command} role="option" aria-selected={position === Math.min(slashIndex, slash.length - 1)} data-selected={position === Math.min(slashIndex, slash.length - 1)}
                    onMouseEnter={() => setSlashIndex(position)} onMouseDown={(event) => { event.preventDefault(); applySlash(item); }}>
                    <Icon name={item.icon} size={18} /><span>/{item.command}</span><small>{item.label}</small>
                  </li>
                ))}
              </ul>
            )}
            {pending.length > 0 && <ul className="attachment-list">{pending.map((item) => (
              <li key={item.id} className="attachment">
                {item.preview ? <img src={item.preview} alt="" width="28" height="28" /> : <Icon name="file" />}
                <span>{item.name}</span><small>{formatSize(item.size)}</small>
                <button type="button" className="icon-button small" aria-label={`Rimuovi ${item.name}`} onClick={() => removePending(item.id)}><Icon name="close" /></button>
              </li>
            ))}</ul>}
            <textarea ref={inputRef} value={draft} rows={1} maxLength={platform.kind === 'desktop' ? 48_000 : 12_000}
              placeholder={offline ? 'Offline · il PC non è raggiungibile, riprovo da solo…' : recording ? 'Ti ascolto… parla, mi fermo quando fai una pausa' : transcribing ? 'Trascrivo…' : 'Scrivi a NexusNXS…   / per i comandi'} aria-label="Messaggio"
              onChange={(event) => { setDraft(event.target.value); setSlashIndex(0); }} onKeyDown={onComposerKey} autoFocus readOnly={Boolean(recording) || transcribing}
              onPaste={(event) => { const files = [...event.clipboardData.files]; if (files.length && caps.attachments && platform.acceptsDroppedFiles) { event.preventDefault(); void addFiles(files); } }} />
            <div className="composer-bar">
              {caps.attachments && <>
                <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => { void addFiles([...(event.target.files ?? [])]); event.target.value = ''; }} />
                <button type="button" className="icon-button small" aria-label="Allega file" disabled={generating || (!platform.pickAttachments && pending.length >= limitsFor(platform.kind).maxCount)} onClick={async () => {
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
              <span className="hint" aria-hidden="true" />
              {caps.voiceInput && caps.voiceOutput && !generating && !recording && !offline && (
                <button type="button" className="icon-button small live-toggle" aria-label="Voce live (Ctrl+Maiusc+L)" title="Conversazione vocale continua" onClick={() => void startLive()}><Icon name="wave" /></button>
              )}
              {caps.voiceInput && !generating && (
                <button type="button" className="mic" data-active={Boolean(recording)} aria-pressed={Boolean(recording)} disabled={transcribing || (offline && !recording)}
                  aria-label={recording ? 'Termina e invia' : 'Parla con NexusNXS'} onClick={() => void toggleMic()}><Icon name="mic" /></button>
              )}
              {generating
                ? <button type="button" className="send stop" aria-label="Interrompi" onClick={stop}><Icon name="stop" /></button>
                : <button type="submit" className="send" aria-label={offline ? 'Invio non disponibile: offline' : 'Invia'} title={offline ? 'Offline: il PC non è raggiungibile' : undefined} disabled={offline || (!draft.trim() && !pending.length) || Boolean(recording) || transcribing}><Icon name="arrow" /></button>}
            </div>
          </form>
          )}
        </main>

        <AnimatePresence>{panelDoc && <Panel key="panel" />}</AnimatePresence>

        <AnimatePresence>
          {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={[
            { id: 'new', label: 'Nuova conversazione', hint: 'Ctrl+Maiusc+O', icon: 'plus', run: startNew },
            ...(caps.voiceInput && caps.voiceOutput ? [{ id: 'live', label: live ? 'Termina voce live' : 'Avvia voce live', hint: 'Ctrl+Maiusc+L', icon: 'wave' as const, run: () => { if (live) endLive(); else void startLive(); } }] : []),
            { id: 'project-new', label: 'Nuovo progetto', icon: 'folderPlus', run: () => setProjectSheet(createProject()) },
            ...(conversation?.messages.length ? [
              ...projects.filter((item) => item.id !== currentProject?.id).slice(0, 8).map((item) => ({ id: `move-${item.id}`, label: `Sposta nel progetto «${item.name}»`, icon: 'folder' as const, run: () => { assignProject(conversation.id, item.id); notify(`Spostata in «${item.name}»: da ora usa istruzioni e file del progetto.`); } })),
              ...(currentProject ? [{ id: 'move-out', label: `Togli dal progetto «${currentProject.name}»`, icon: 'folder' as const, run: () => assignProject(conversation.id, null) }] : [])
            ] : []),
            ...projects.slice(0, 8).map((item) => ({ id: `open-${item.id}`, label: `Apri progetto «${item.name}»`, hint: 'Progetto', icon: 'folder' as const, run: () => transition(() => openProject(item.id)) })),
            { id: 'mode', label: mode === 'fast' ? 'Passa a modalità Approfondita' : 'Passa a modalità Rapida', icon: mode === 'fast' ? 'sparkles' : 'bolt', run: toggleMode },
            ...(conversation?.messages.length ? [
              { id: 'pin', label: pinned.includes(conversation.id) ? 'Rimuovi dalle fissate' : 'Fissa conversazione', icon: 'pin' as const, run: () => togglePin(conversation.id) },
              { id: 'export', label: 'Esporta conversazione (Markdown)', icon: 'download' as const, run: () => exportConversation(conversation) }
            ] : []),
            ...SLASH_COMMANDS.map((item) => ({ id: `s-${item.command}`, label: `Comando rapido: ${item.label}`, hint: `/${item.command}`, icon: item.icon, run: () => applySlash(item) })),
            { id: 'sidebar', label: sidebarHidden ? 'Mostra barra laterale' : 'Nascondi barra laterale', hint: 'Ctrl+B', icon: 'sidebar', run: toggleSidebar },
            { id: 'prefs', label: 'Preferenze di risposta', icon: 'sliders', run: () => setSettingsOpen(true) },
            { id: 'keys', label: 'Scorciatoie da tastiera', hint: 'Ctrl+/', icon: 'keyboard', run: () => setShortcutsOpen(true) },
            ...(desktopBridge ? [{ id: 'control', label: 'Centro di controllo (modelli, telefono, memoria, sistema)', icon: 'classic' as const, run: () => setControlOpen(true) }] : []),
            ...conversations.slice(0, 12).map((item) => ({ id: `c-${item.id}`, label: item.title, hint: 'Apri', icon: (pinned.includes(item.id) ? 'pin' : 'clock') as IconName, run: () => transition(() => setState((state) => ({ ...state, activeId: item.id }))) }))
          ]} />}
          {projectSheet && <ProjectSheet key={projectSheet} projectId={projectSheet} onClose={closeProjectSheet} notify={notify} />}
          {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
          {settingsOpen && <Settings preferences={preferences} onClose={() => setSettingsOpen(false)} onCleared={() => notify('Dati locali e risposte di ripresa cancellati.')} />}
          {controlOpen && desktopBridge && <Suspense key="control" fallback={null}><ControlCenter initialTab={controlOpen === 'memory' ? 'memory' : undefined} onClose={() => setControlOpen(false)} notify={notify} /></Suspense>}
          {!paired && <PairingScreen onPaired={() => { setPaired(true); notify('Collegato al tuo PC.'); }} />}
        </AnimatePresence>

        <Tooltips />
        <UpdateCard update={update} hidden={Boolean(toast) && update.state?.status !== 'installing'} />
        <AnimatePresence>{memoryReview > 0 && !update.visible && !toast && !controlOpen && (
          <m.div className="update-pill glass" role="status" initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <Icon name="memory" size={16} /><span>{memoryReview === 1 ? '1 ricordo della settimana da rivedere' : `${memoryReview} ricordi della settimana da rivedere`}</span>
            <button type="button" className="update-now" onClick={() => { setMemoryReview(0); setControlOpen('memory'); }}>Rivedi</button>
            <button type="button" className="icon-button small" aria-label="Più tardi" title="Più tardi" onClick={() => { setMemoryReview(0); try { localStorage.setItem('nxs.memory.reviewedAt', String(Date.now() - 6 * 86_400_000)); } catch { /* ricompare domani */ } }}><Icon name="close" size={15} /></button>
          </m.div>
        )}</AnimatePresence>
        <AnimatePresence>{toast && <m.div className="toast glass" role="alert" initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>{toast}</m.div>}</AnimatePresence>
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
/**
 * Ragionamento visibile, come nei migliori assistenti: una sola riga con la fase corrente in
 * luce scorrevole mentre lavora; si richiude da sola appena inizia la risposta e resta apribile.
 */
function AgentTrail({ steps = [], live, writing }: { steps?: string[]; live: boolean; writing: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  if (steps.length < 2) return null;
  const expanded = open ?? (live && !writing);
  const current = steps.at(-1) ?? '';
  return (
    <div className="agent-trail" data-live={live}>
      <button type="button" className="trail-toggle" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
        <Icon name={live ? 'sparkles' : 'check'} size={15} />
        <span className={live ? 'shimmer' : undefined}>{live ? current.replace(/…$/u, '') : `Ragionamento · ${steps.length} passaggi`}</span>
        <span className="trail-chevron"><Icon name="chevron" size={14} /></span>
      </button>
      <div className="trail-body" data-open={expanded}>
        <ol>{steps.map((step, index) => <li key={`${index}-${step}`} data-done={!live || index < steps.length - 1}>{step}</li>)}</ol>
      </div>
    </div>
  );
}

/**
 * Piano di lavoro dell'agente, aggiornato dal vivo: barra di avanzamento, passo corrente in luce scorrevole,
 * spunte che entrano con una molla. A lavoro finito si compatta nell'intestazione e resta apribile.
 */
function PlanCard({ plan, live }: { plan: PlanStep[]; live: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const done = plan.filter((step) => step.status === 'done' || step.status === 'skipped').length;
  const complete = done === plan.length;
  const expanded = open ?? (live || !complete);
  const label = complete ? `Piano completato · ${plan.length} passi` : `Piano · ${done}/${plan.length}`;
  return (
    <section className="plan-card" data-live={live} data-complete={complete} aria-label="Piano di lavoro">
      <button type="button" className="plan-head" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
        <Icon name={complete ? 'check' : 'sparkles'} size={15} />
        <span>{label}</span>
        <span className="plan-progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={done} aria-label="Avanzamento del piano">
          <i style={{ '--plan-progress': `${(done / plan.length) * 100}%` } as CSSProperties} />
        </span>
        <span className="trail-chevron"><Icon name="chevron" size={14} /></span>
      </button>
      <div className="trail-body" data-open={expanded}>
        <ol className="plan-steps">
          {plan.map((step, index) => (
            <li key={`${index}-${step.title}`} data-status={step.status} style={{ '--i': index } as CSSProperties}>
              <span className="plan-mark" aria-hidden="true">{step.status === 'done' ? <Icon name="check" size={12} /> : null}</span>
              <span className={step.status === 'in_progress' && live ? 'shimmer' : undefined}>{step.title}</span>
              <span className="sr-only">{({ pending: 'da fare', in_progress: 'in corso', done: 'fatto', skipped: 'saltato' } as const)[step.status]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SourceList({ sources = [] }: { sources?: Array<{ title?: string; url: string }> }) {
  const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  return (
    <div className="agent-trail">
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

/** Domanda dell'utente: copia, e modifica in linea di qualsiasi turno (Invio reinvia, Esc annulla). */
function UserTurn({ message, disabled, onResend }: { message: Message; disabled: boolean; onResend: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = area.current;
    if (!editing || !element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [editing, text]);
  const submit = () => { const value = text.trim(); if (!value) return; setEditing(false); onResend(value); };
  return (
    <div className="user-turn" data-editing={editing}>
      {message.attachments?.length ? <ul className="attachment-list sent">{message.attachments.map((item) => (
        <li key={item.name} className="attachment"><Icon name={item.mime.startsWith('image/') ? 'image' : 'file'} /><span>{item.name}</span><small>{formatSize(item.size)}</small></li>
      ))}</ul> : null}
      {editing ? (
        <div className="edit-box glass">
          <textarea ref={area} value={text} autoFocus aria-label="Modifica il messaggio" onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              else if (event.key === 'Escape') { event.preventDefault(); setEditing(false); setText(message.content); }
            }} />
          <div className="edit-actions">
            <span className="muted">Le risposte successive verranno sostituite.</span>
            <button type="button" className="ghost" onClick={() => { setEditing(false); setText(message.content); }}>Annulla</button>
            <button type="button" className="primary-small" disabled={!text.trim() || disabled} onClick={submit}>Invia</button>
          </div>
        </div>
      ) : (
        <p className="bubble" title={timeLabel(message.createdAt)}>{message.voice && <Icon name="mic" size={16} />}{message.content}</p>
      )}
      {!editing && !disabled && (
        <div className="turn-actions">
          <button type="button" className="icon-button small" aria-label={copied ? 'Copiato' : 'Copia messaggio'} onClick={async () => {
            try { await navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard negata */ }
          }}><Icon name={copied ? 'check' : 'copy'} size={17} /></button>
          <button type="button" className="icon-button small" aria-label="Modifica e reinvia" title="Modifica e reinvia" onClick={() => { setText(message.content); setEditing(true); }}><Icon name="pencil" size={17} /></button>
        </div>
      )}
    </div>
  );
}

/** Titolo della conversazione: clic per rinominare, Invio salva, Esc annulla. */
function TitleEditor({ conversation, disabled }: { conversation: Conversation; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(conversation.title);
  if (!editing) return (
    <h1 className="title"><button type="button" className="title-button" disabled={disabled} title="Rinomina" onClick={() => { setValue(conversation.title); setEditing(true); }}>{conversation.title}</button></h1>
  );
  const save = () => { rename(conversation.id, value); setEditing(false); };
  return <input className="title-input" value={value} autoFocus maxLength={80} aria-label="Nuovo titolo" onChange={(event) => setValue(event.target.value)} onBlur={save}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } else if (event.key === 'Escape') { event.preventDefault(); setEditing(false); } }} />;
}

function AnswerActions({ text, at, onBranch, onOpen, onRetry, onSpeak, speaking, canSpeak, canDeepen, rating, onRate }: { text: string; at: number; onBranch?: () => void; onOpen?: () => void; onRetry: (deep: boolean) => void; onSpeak: () => void; speaking: boolean; canSpeak: boolean; canDeepen?: boolean; rating?: 'up' | 'down'; onRate?: (rating: 'up' | 'down') => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="answer-actions" data-speaking={speaking}>
      <time className="stamp" dateTime={new Date(at).toISOString()}>{timeLabel(at)}</time>
      {onRate && <>
        <button type="button" className="icon-button small" aria-label="Risposta utile" aria-pressed={rating === 'up'} data-active={rating === 'up'} onClick={() => onRate('up')}><Icon name="thumbUp" /></button>
        <button type="button" className="icon-button small" aria-label="Risposta non utile" aria-pressed={rating === 'down'} data-active={rating === 'down'} onClick={() => onRate('down')}><Icon name="thumbDown" /></button>
      </>}
      {canSpeak && <button type="button" className="icon-button small" aria-label={speaking ? 'Interrompi lettura' : 'Leggi ad alta voce'} aria-pressed={speaking} onClick={onSpeak}><Icon name={speaking ? 'stop' : 'speaker'} /></button>}
      <button type="button" className="icon-button small" aria-label={copied ? 'Copiato' : 'Copia risposta'} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard negata */ }
      }}><Icon name={copied ? 'check' : 'copy'} /></button>
      <button type="button" className="icon-button small" aria-label="Rigenera risposta" title="Rigenera" onClick={() => onRetry(false)}><Icon name="retry" /></button>
      {canDeepen && <button type="button" className="icon-button small deepen" aria-label="Rifai in modo approfondito" title="Rifai in modo approfondito (modello più grande)" onClick={() => onRetry(true)}><Icon name="sparkles" /></button>}
      {onOpen && <button type="button" className="icon-button small" aria-label="Apri come documento nel pannello" title="Apri come documento" onClick={onOpen}><Icon name="panel" /></button>}
      {onBranch && <button type="button" className="icon-button small" aria-label="Dirama da qui" title="Dirama da qui: nuova conversazione fino a questa risposta" onClick={onBranch}><Icon name="branch" /></button>}
    </div>
  );
}

function ConversationList({ onPick, onEditProject, disabled }: { onPick: (id: string) => void; onEditProject: (id: string) => void; disabled: boolean }) {
  const allConversations = useStore((state) => state.conversations);
  const pinned = useStore((state) => state.pinned);
  const activeId = useStore((state) => state.activeId);
  const projectView = useStore((state) => state.projectView);
  const projectOf = useStore((state) => state.projectOf);
  const projects = useStore((state) => state.projects);
  const project = projects.find((item) => item.id === projectView) ?? null;
  // Dentro un progetto si vedono solo le sue chat; fuori, tutte.
  const conversations = useMemo(() => projectView ? allConversations.filter((item) => projectOf[item.id] === projectView) : allConversations, [allConversations, projectOf, projectView]);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => { if (!confirming) return; const timer = window.setTimeout(() => setConfirming(null), 3_000); return () => window.clearTimeout(timer); }, [confirming]);
  const needle = query.trim();
  // Documenti ricercabili: conversazioni e, dentro un progetto, anche i suoi file.
  const docs = useMemo<SearchDoc[]>(() => [
    ...conversations.map((item) => ({ id: item.id, title: item.title, text: item.messages.map((message) => message.content).join('\n').slice(0, 40_000), updatedAt: item.updatedAt })),
    ...(project ? project.files.map((file) => ({ id: `file:${file.id}`, title: file.name, text: file.text.slice(0, 40_000), updatedAt: 0 })) : [])
  ], [conversations, project]);
  const lexical = useMemo(() => (needle ? lexicalSearch(needle, docs) : []), [needle, docs]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    setHits(lexical);
    if (!needle || needle.length < 3 || !desktopBridge?.embedTexts) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      const embed = async (texts: string[]) => { const result = await desktopBridge!.embedTexts(texts); return Array.isArray(result?.vectors) ? result.vectors as number[][] : []; };
      semanticSearch(needle, docs, lexical, embed, abort.signal).then((ranked) => { if (!abort.signal.aborted) setHits(ranked); }).catch(() => {});
    }, 280);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [needle, docs, lexical]);
  const hitById = useMemo(() => new Map(hits.map((hit) => [hit.id, hit])), [hits]);
  const visible = needle ? hits.map((hit) => conversations.find((item) => item.id === hit.id)).filter((item): item is NonNullable<typeof item> => Boolean(item)) : conversations;
  const fileHits = needle && project ? hits.filter((hit) => hit.id.startsWith('file:')).map((hit) => ({ hit, file: project.files.find((file) => `file:${file.id}` === hit.id) })).filter((entry) => entry.file) : [];
  const groups = useMemo(() => (needle ? (visible.length ? [{ label: 'Risultati', items: visible }] : []) : groupConversations(visible, pinned)), [needle, visible, pinned]);
  return (
    <>
      {project && (
        <div className="project-banner">
          <button type="button" className="icon-button small" aria-label="Tutte le conversazioni" title="Tutte le conversazioni" onClick={() => transition(() => openProject(null))}><Icon name="back" size={17} /></button>
          <span title={project.name}><Icon name="folder" size={16} />{project.name}</span>
          <button type="button" className="icon-button small" aria-label={`Istruzioni e file di ${project.name}`} title="Istruzioni e file" onClick={() => onEditProject(project.id)}><Icon name="sliders" size={16} /></button>
        </div>
      )}
      <label className="search"><Icon name="search" size={18} /><input type="search" placeholder={project ? 'Cerca nel progetto' : 'Cerca nelle conversazioni'} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Cerca nelle conversazioni" /></label>
      {/* Su schermi bassi la lista scorre: deve restare raggiungibile da tastiera anche se vuota. */}
      <nav className="conversation-list" aria-label="Cronologia" tabIndex={0}>
        {visible.length === 0 && fileHits.length === 0 && <p className="muted empty-list">{query ? 'Nessun risultato.' : project ? 'Le chat nuove aperte qui useranno istruzioni e file del progetto.' : 'Le tue conversazioni appariranno qui.'}</p>}
        {fileHits.length > 0 && (
          <section className="conversation-group" aria-label="File del progetto">
            <h3><Icon name="file" size={13} />File del progetto</h3>
            {fileHits.map(({ hit, file }) => (
              <div key={hit.id} className="conversation search-hit">
                <button type="button" onClick={() => project && onEditProject(project.id)} title={file!.name}><span className="hit-title">{file!.name}</span><small className="snippet"><Marked text={hit.snippet} query={needle} /></small></button>
              </div>
            ))}
          </section>
        )}
        {groups.map((group) => (
          <section key={group.label} className="conversation-group" aria-label={group.label}>
            <h3>{group.label === 'Fissate' && <Icon name="pin" size={13} />}{group.label}</h3>
            {group.items.map((item) => (
              <div key={item.id} className="conversation" data-active={item.id === activeId} data-confirm={confirming === item.id}>
                {renaming === item.id ? (
                  <input className="rename" autoFocus defaultValue={item.title} maxLength={80} aria-label="Nuovo titolo"
                    onBlur={(event) => { rename(item.id, event.currentTarget.value); setRenaming(null); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === 'Escape') { event.preventDefault(); setRenaming(null); } }} />
                ) : (
                  needle && hitById.get(item.id)
                    ? <button type="button" className="search-hit-button" disabled={disabled} onClick={() => onPick(item.id)} title={item.title}>
                        <span className="hit-title">{item.title}{hitById.get(item.id)!.semantic && <em className="hit-kind">simile</em>}</span><small className="snippet"><Marked text={hitById.get(item.id)!.snippet} query={needle} /></small>
                      </button>
                    : <button type="button" disabled={disabled} onClick={() => onPick(item.id)} title={item.title}>{item.title}</button>
                )}
                {renaming !== item.id && <span className="row-actions">
                  <button type="button" className="icon-button small" aria-label={pinned.includes(item.id) ? `Rimuovi ${item.title} dalle fissate` : `Fissa ${item.title}`} data-active={pinned.includes(item.id)} onClick={() => togglePin(item.id)}><Icon name="pin" size={16} /></button>
                  <button type="button" className="icon-button small" aria-label={`Rinomina ${item.title}`} disabled={disabled} onClick={() => setRenaming(item.id)}><Icon name="pencil" size={16} /></button>
                  <button type="button" className="icon-button small danger-icon" aria-label={confirming === item.id ? `Conferma eliminazione di ${item.title}` : `Elimina ${item.title}`} title={confirming === item.id ? 'Clicca di nuovo per eliminare' : 'Elimina'} disabled={disabled}
                    onClick={() => { if (confirming !== item.id) { setConfirming(item.id); return; } setConfirming(null); platform.removeConversation(item.id); deleteConversation(item.id); }}>
                    <Icon name={confirming === item.id ? 'check' : 'trash'} size={16} /></button>
                </span>}
              </div>
            ))}
          </section>
        ))}
      </nav>
    </>
  );
}

interface Action { id: string; label: string; hint?: string; icon?: IconName; run: () => void }

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <m.div className="overlay" role="presentation" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.section className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="keys-title" onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
        <header><h2 id="keys-title">Scorciatoie da tastiera</h2><button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}><Icon name="close" /></button></header>
        <dl className="shortcuts">{SHORTCUTS.map(([keys, label]) => <div key={keys}><dt>{label}</dt><dd>{keys.split('+').map((key) => <kbd key={key}>{key}</kbd>)}</dd></div>)}</dl>
      </m.section>
    </m.div>
  );
}

function CommandPalette({ actions, onClose }: { actions: Action[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const needle = query.trim().toLocaleLowerCase('it');
  const filtered = actions.filter((action) => `${action.label} ${action.hint ?? ''}`.toLocaleLowerCase('it').includes(needle));
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
              {action.icon && <Icon name={action.icon} size={18} />}<span>{action.label}</span>{action.hint && <kbd>{action.hint}</kbd>}
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

/** Estratto con le parole trovate evidenziate (stessa tolleranza della ricerca). */
function Marked({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => highlight(text, query), [text, query]);
  return <>{parts.map((part, index) => (part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>;
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
      <Suspense fallback={<div className="field select-trigger" aria-hidden="true" />}><Select id="microphone" className="field" value={selected} onChange={(value) => { setPreferredMicrophone(value); setSelected(value); }}
        options={[{ value: '', label: 'Predefinito di sistema' }, ...devices.map((device) => ({ value: device.id, label: device.label }))]} /></Suspense>
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

type ServiceStatus = 'ready' | 'preparing' | 'offline' | 'unknown';
const STATUS_LABEL: Record<ServiceStatus, string> = { ready: 'Online', preparing: 'In preparazione', offline: 'Offline', unknown: 'Connessione…' };

/** Scheda profilo in fondo alla barra (stile Claude): chi sei, stato del PC e un menu con le impostazioni. */
function ProfileMenu({ status, compactRail = false, onSettings, onControl, onShortcuts }: { status: ServiceStatus; compactRail?: boolean; onSettings: () => void; onControl?: () => void; onShortcuts: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const who = platform.kind === 'desktop' ? 'Questo PC' : platform.kind === 'paired' ? 'Collegato al PC' : 'Ospite';
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const run = (action: () => void) => { setOpen(false); action(); };
  return (
    <div className="profile" ref={root} data-rail={compactRail}>
      <button type="button" className="profile-button" aria-haspopup="menu" aria-expanded={open} aria-label={`${who}, ${STATUS_LABEL[status]}: menu`} onClick={() => setOpen((value) => !value)}>
        <span className="avatar" data-status={status}><Icon name="user" size={16} /></span>
        {!compactRail && <span className="profile-text"><strong>{who}</strong><small>{STATUS_LABEL[status]}</small></span>}
        {!compactRail && <span className="profile-more" aria-hidden="true"><Icon name="chevrons" size={16} /></span>}
      </button>
      <AnimatePresence>
        {open && (
          <m.div className="profile-menu glass" role="menu" initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}>
            <button type="button" role="menuitem" autoFocus onClick={() => run(onSettings)}><Icon name="sliders" size={18} />Preferenze</button>
            {onControl && <button type="button" role="menuitem" onClick={() => run(onControl)}><Icon name="classic" size={18} />Centro di controllo</button>}
            <button type="button" role="menuitem" onClick={() => run(onShortcuts)}><Icon name="keyboard" size={18} />Scorciatoie<kbd>Ctrl+/</kbd></button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
/** Avviso in linea "Memoria aggiornata": cosa è stato ricordato, con Vedi (Centro di controllo) e Annulla. */
function MemoryChip({ notice, onView, onUndo }: { notice: NonNullable<Message['memory']>; onView?: () => void; onUndo?: () => void | Promise<void> }) {
  const label = notice.undone ? 'Ricordo annullato'
    : notice.action === 'forget' ? (notice.count === 1 ? 'Ho dimenticato 1 ricordo' : `Ho dimenticato ${notice.count} ricordi`)
    : notice.action === 'update' ? 'Memoria aggiornata' : 'Memoria aggiornata';
  return (
    <div className="memory-chip" role="status" data-undone={Boolean(notice.undone)}>
      <Icon name={notice.undone ? 'undo' : 'memory'} size={15} />
      <span className="memory-text"><strong>{label}</strong>{notice.content && !notice.undone && notice.action !== 'forget' ? <span title={notice.content}>{notice.content}</span> : null}</span>
      {onView && <button type="button" className="memory-action" onClick={onView} title="Apri la memoria"><Icon name="eye" size={15} /><span>Vedi</span></button>}
      {onUndo && <button type="button" className="memory-action" onClick={() => void onUndo()} title="Annulla questo ricordo"><Icon name="undo" size={15} /><span>Annulla</span></button>}
    </div>
  );
}
