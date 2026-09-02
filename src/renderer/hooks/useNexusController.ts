/**
 * @module renderer/hooks/useNexusController
 * @description Orchestra voce, chat, azioni, log e configurazione senza mescolare logica WebGL.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EntityState,
  HardwareProfile,
  InterfacePreferences,
  LiveLogEntry,
  LocalAttachment,
  ModelDescriptor,
  NexusSettings,
  StreamEvent,
  TaskStep,
  WorkspaceContext,
  OperationalArtifact
} from '../types/nexus';
import { VoiceRecognition } from '../systems/VoiceRecognition';
import { publicUiError } from '../systems/PublicError';
import { loadInterfacePreferences, saveInterfacePreferences } from '../systems/InterfacePreferences';
import {
  loadConversationHistory,
  hydrateConversationHistory,
  removeConversation,
  saveConversation,
  type ConversationRecord,
  type ConversationTurn
} from '../systems/ConversationHistory';
import { canActivateVoiceShortcut, canStartVoiceTurn, shouldQueueTurn } from '../systems/InteractionPolicy';
import { playActivationSound } from '../systems/ActivationSound';
import { applyVoiceVocabulary } from '../systems/VoiceVocabulary';
import { shortcutMatches } from '../systems/KeyboardShortcuts';

const ACTION_VERB_PATTERN = /\b(?:apri(?:re)?|avvia(?:re)?|lancia(?:re)?|mostra(?:re)?|esegui(?:re)?|chiudi|chiudere|leggi|leggere|elenca(?:re)?|cerca(?:re)?|trova(?:re)?|crea(?:re|mi)?|scrivi|scrivere|scrivimi|modifica(?:re|mi)?|rinomina(?:re|mi)?|sposta(?:re|mi)?|copia(?:re|mi)?|elimina(?:re|mi)?|costruisci|costruire|costruiscimi|implementa(?:re|mi)?|sviluppa(?:re|mi)?|sistema(?:re|mi)?|correggi|correggere|correggimi|aggiorna(?:re|mi)?|aggiungi|aggiungere|aggiungimi|rimuovi|rimuovere|rimuovimi|salva(?:re|mi)?|lavora(?:re)?|work|open|create|write|edit|update|fix|delete|remove|move|copy|rename|run)\b/i;
const ACTION_LEAD_PATTERN = /^(?:nexus[\s,.:;-]+)?(?:(?:per favore|puoi|potresti|vorrei che|voglio che|mi serve che|ti chiedo di)\s+)?/i;
const INFORMATIONAL_ACTION_PATTERN = /^(?:nexus[\s,.:;-]+)?(?:come|perché|cosa|quale|quando|dove|posso|potrei|dovrei|si può|mi spieghi)\b/i;
const FILE_ACTION_PATTERN = /\b(?:file|cartell[ae]|progetto|sito|codice|repository|desktop|documenti|crea|scrivi|modifica|rinomina|sposta|copia|elimina|cestino)\b/i;
const WORKSPACE_MUTATION_PATTERN = /\b(?:sistema(?:re|mi)?|correggi|correggere|correggimi|aggiorna(?:re|mi)?|aggiungi|aggiungere|aggiungimi|rimuovi|rimuovere|rimuovimi|implementa(?:re|mi)?|sviluppa(?:re|mi)?|refactor|fix|edit|update|delete|remove|write)\b/i;
const DIRECT_APPLICATION_PATTERN = /\b(?:apri(?:re)?|avvia(?:re)?|lancia(?:re)?|mostra(?:re)?|open|launch)\b[\s\S]*\b(?:calcolatrice|calculator|brave|browser|internet|esplora file|file manager|blocco note|notepad|notion|paint|screenshot|gestione attività|task manager|terminale|terminal|powershell|visual studio code|vscode|obsidian|impostazioni di windows)\b/i;
const INSPECTION_TOOLS = new Set(['list_directory', 'read_file']);
const MAX_ACTION_STEPS = 5;

function isActionRequest(text: string): boolean {
  const normalized = String(text || '').trim();
  if (!normalized || INFORMATIONAL_ACTION_PATTERN.test(normalized) || /^(?:spiegami|dimmi)\s+come\b/i.test(normalized)) return false;
  const candidate = normalized.replace(ACTION_LEAD_PATTERN, '');
  return ACTION_VERB_PATTERN.test(candidate);
}
const DEEP_WORK_PATTERN = /\b(?:analizza|confronta|progetta|implementa|sviluppa|programma|codice|sorgente|debug|bug|errore|refactor|architettura|sicurezza|audit|ottimizza|spiegami perché|piano completo)\b/i;
const ACTION_STEPS: TaskStep[] = [
  { id: 'understand', label: 'Capisco cosa vuoi ottenere', status: 'waiting' },
  { id: 'plan', label: 'Preparo un piano sicuro', status: 'waiting' },
  { id: 'execute', label: 'Eseguo ciò che hai autorizzato', status: 'waiting' },
  { id: 'verify', label: 'Controllo il risultato', status: 'waiting' }
];
const INTERRUPTED_DRAFT_KEY = 'nexus.interrupted-response.v1';
const VOICE_CONFIRM_PATTERN = /^(?:s[iì]|yes|ok(?:ay)?|conferma|confermo|procedi|vai)$/i;
const VOICE_CANCEL_PATTERN = /^(?:no|annulla|cancella|cancel|stop)$/i;

function interruptedDraft(): { transcript: string; response: string } {
  try {
    const value = JSON.parse(window.localStorage.getItem(INTERRUPTED_DRAFT_KEY) || 'null');
    if (!value || typeof value !== 'object') return { transcript: '', response: '' };
    return {
      transcript: String(value.transcript || '').slice(0, 12_000),
      response: String(value.response || '').slice(0, 30_000)
    };
  } catch {
    return { transcript: '', response: '' };
  }
}

export interface PermissionProposal {
  id: string;
  summary: string;
  preview: string;
  reason?: string;
  risk: string;
  expiresAt?: number;
}

function createTaskSteps(activeId: string, options: { mode?: 'fast' | 'deep'; attachments?: number; action?: boolean } = {}): TaskStep[] {
  const steps: TaskStep[] = options.action
    ? ACTION_STEPS
    : options.mode === 'deep'
      ? [
          { id: 'understand', label: 'Comprendo il problema', status: 'waiting' },
          { id: 'plan', label: options.attachments ? 'Leggo i materiali e collego il contesto' : 'Cerco il contesto utile', status: 'waiting' },
          { id: 'execute', label: 'Costruisco una soluzione completa', status: 'waiting' },
          { id: 'verify', label: 'Rileggo e verifico la risposta', status: 'waiting' }
        ]
      : [
          { id: 'understand', label: 'Capisco la richiesta', status: 'waiting' },
          { id: 'plan', label: options.attachments ? 'Leggo i materiali' : 'Preparo la risposta', status: 'waiting' },
          { id: 'execute', label: 'Formulo la risposta', status: 'waiting' },
          { id: 'verify', label: 'Controllo finale', status: 'waiting' }
        ];
  return steps.map((step) => ({
    ...step,
    status: step.id === activeId ? 'active' : 'waiting',
    ...(step.id === activeId ? { startedAt: Date.now() } : {})
  }));
}

function timestamp(): string {
  return new Date().toLocaleTimeString(navigator.language || undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function publicResponseText(value: string): string {
  const text = String(value || '');
  // La maggior parte dei token non può contenere riferimenti locali. Evitare
  // cinque sostituzioni globali sull'intera risposta a ogni frame elimina la
  // crescita quadratica senza indebolire il filtro quando compare un indizio.
  if (!/[A-Z]:\\|\/(?:Users|home)\/|fonti locali|local sources|Obsidian|vault privata|knowledge privata/i.test(text)) {
    return text;
  }
  return text
    .replace(/\b[A-Z]:\\(?:Users\\[^\\\s]+\\|[^\s\n`"']*\\\.obsidian\\)[^\s\n`"']*/gi, '[percorso privato]')
    .replace(/\/(?:Users|home)\/[^/\s]+\/[^\s\n`"']*/g, '[percorso privato]')
    .replace(/^\s*(?:fonti locali|local sources)\s*[·:]?.*$/gim, '')
    .replace(/\b(?:Obsidian|vault privata|knowledge privata)\b/gi, 'contesto personale')
    .replace(/\n{3,}/g, '\n\n');
}

function conversationMode(text: string, requested: 'fast' | 'deep', attachments: LocalAttachment[]): 'fast' | 'deep' {
  if (requested === 'deep' || attachments.length > 0) return 'deep';
  if (text.length >= 220 || DEEP_WORK_PATTERN.test(text)) return 'deep';
  return 'fast';
}

function prepareSpokenText(text: string): string {
  const entities: Record<string, string> = {
    agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì',
    ograve: 'ò', ugrave: 'ù', apos: "'", quot: '"', amp: '&'
  };
  const normalizedInput = text
    .replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, token: string) => {
      if (token[0] === '#') {
        const hexadecimal = token[1]?.toLowerCase() === 'x';
        const value = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : entity;
      }
      return entities[token.toLowerCase()] ?? entity;
    })
    .replace(/Ã /g, 'à')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¬/g, 'ì')
    .replace(/Ã²/g, 'ò')
    .replace(/Ã¹/g, 'ù')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFC');
  const clean = normalizedInput
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^\s*(?:fonti|sources|riferimenti)\s*:?[\s\S]*$/gim, ' ')
    .replace(/\[(?:Fonte|Source)\s*\d+\]/gi, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[\p{Regional_Indicator}]{2}/gu, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]/gu, ' ')
    .replace(/(?:^|\s)(?:[:;=8][\-^']?[)(/\\DPpOo]|<3)(?=\s|$)/g, ' ')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ' ')
    .replace(/^[\s>*#+=-]+/gm, ' ')
    .replace(/[*_#>~-]+/g, ' ')
    .replace(/\b[A-Z]:\\(?:[^\\\s]+\\)*[^\s,.;!?]+/gi, 'un file locale')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[;:]+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);
  // Le risposte normali vengono lette integralmente. Per documenti lunghi la
  // voce pronuncia solo un'introduzione sensata e rimanda alla modalità lettura.
  const isLong = clean.length > 360 || words.length > 52 || text.split('\n').length > 7;
  if (!isLong) return clean;

  const spokenLimit = 230;
  const wordLimit = 30;
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  let spoken = '';
  for (const sentence of sentences) {
    const candidate = `${spoken}${spoken ? ' ' : ''}${sentence.trim()}`.trim();
    const words = candidate.split(/\s+/).filter(Boolean).length;
    if (spoken && (candidate.length > spokenLimit || words > wordLimit)) break;
    spoken = candidate.slice(0, spokenLimit);
    // Due frasi complete sono normalmente sufficienti; una frase iniziale
    // brevissima viene sempre accompagnata da quella successiva.
    if (spoken.split(/\s+/).length >= 9 && /[.!?]$/.test(spoken)) break;
  }
  if (spoken.length < clean.length && !/[.!?]$/.test(spoken)) {
    spoken = spoken
      .slice(0, spokenLimit)
      .replace(/\s+\S*$/, '')
      .replace(/[,.:\s]+$/, '');
  }
  const concise = spoken
    .replace(/[,;:]\s+[^,;:]*$/, '')
    .replace(/[,.:\s]+$/, '');
  const introduction = concise
    ? `${concise}${/[.!?]$/.test(concise) ? '' : '.'}`
    : 'Ho completato la risposta.';
  const naturalBridge = /```|codice|script|comando|funzione|errore|bug/i.test(text)
    ? 'Ti lascio il codice e i dettagli sullo schermo, così puoi guardarli con calma.'
    : /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/m.test(text)
      ? 'Trovi tutti i punti sullo schermo, così puoi leggerli con calma.'
      : /\b(?:passaggi|procedura|istruzioni|procedimento|come fare)\b/i.test(text)
        ? 'Ti mostro tutti i passaggi sullo schermo.'
        : 'Ti lascio il resto sullo schermo, così puoi leggerlo con calma.';
  return `${introduction} ${naturalBridge}`;
}

function inferVoiceDelivery(text: string): 'neutral' | 'warm' | 'calm' | 'serious' | 'energetic' {
  const value = text.trim();
  if (/\b(?:attenzione|errore|rischio|pericolo|non posso|bloccato|sicurezza|urgente)\b/i.test(value)) return 'serious';
  if (/\b(?:tranquill|con calma|respira|nessun problema|va tutto bene)\b/i.test(value)) return 'calm';
  if (/\b(?:fatto|completato|riuscito|perfetto|ottimo|bene|volentieri)\b/i.test(value)) return 'warm';
  if (/!{1,3}(?:\s|$)/.test(value) && !/\b(?:errore|attenzione|pericolo)\b/i.test(value)) return 'energetic';
  return value.endsWith('?') ? 'warm' : 'neutral';
}

function speechLocale(language: string): string {
  const normalized = String(language || '').toLowerCase();
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized) && normalized !== 'und') return normalized;
  return navigator.language || 'en-US';
}

function initialVoiceEnabled(): boolean {
  // Ogni avvio parte pronto alla voce. La pausa con V vale soltanto per la
  // sessione corrente e non deve sorprendere l'utente al riavvio successivo.
  try { window.localStorage.removeItem('nexus.voice.enabled'); } catch {}
  return true;
}

function initialPrivacyMode(): boolean {
  try { return window.sessionStorage.getItem('nexus.privacy.active') === 'true'; }
  catch { return false; }
}

function friendlyVoiceError(error: unknown): string {
  const message = publicUiError(error, 'Microfono o riconoscimento vocale non disponibili.');
  if (/requested device not found|notfounderror|device.*not found/i.test(message)) {
    return 'Nessun microfono rilevato. Collega o abilita un dispositivo di ingresso.';
  }
  if (/notallowederror|permission denied|access.*denied/i.test(message)) {
    return 'Accesso al microfono negato. Abilitalo nelle impostazioni di Windows.';
  }
  if (/trascrizione locale non disponibile/i.test(message)) {
    return 'Trascrizione locale non disponibile su questo sistema.';
  }
  return message;
}

export function useNexusController() {
  // #region 01 — Stato condiviso e primitive
  const voice = useMemo(() => new VoiceRecognition(), []);
  const [state, setState] = useState<EntityState>('booting');
  const [logs, setLogs] = useState<LiveLogEntry[]>([]);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const restoredDraft = useMemo(interruptedDraft, []);
  const [transcript, setTranscript] = useState(restoredDraft.transcript);
  const [response, setResponse] = useState(restoredDraft.response);
  const [previousResponse, setPreviousResponse] = useState('');
  const regenerationPending = useRef(false);
  const [artifacts, setArtifacts] = useState<OperationalArtifact[]>([]);
  const artifactsRef = useRef<OperationalArtifact[]>([]);
  const [permission, setPermission] = useState<PermissionProposal | null>(null);
  const [settings, setSettings] = useState<NexusSettings | null>(null);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [managedRuntime, setManagedRuntime] = useState(false);
  const [remoteInference, setRemoteInference] = useState(false);
  const [runtimePreparing, setRuntimePreparing] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceContext>({ path: '', name: '', active: false });
  const [conversationHistory, setConversationHistory] = useState(loadConversationHistory);
  const [viewedConversation, setViewedConversation] = useState<ConversationRecord | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(initialVoiceEnabled);
  const [privacyMode, setPrivacyMode] = useState(initialPrivacyMode);
  const [interfacePreferences, setInterfacePreferences] = useState(loadInterfacePreferences);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [fatalError, setFatalError] = useState('');
  const [trainingSaved, setTrainingSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bargeInListening, setBargeInListening] = useState(false);
  const [queuedVoicePrompt, setQueuedVoicePrompt] = useState('');
  const [attentionRequest, setAttentionRequest] = useState('');
  const logId = useRef(0);
  const activeRequest = useRef('');
  const lastCompletedRequest = useRef('');
  const requestGenerating = useRef(false);
  const bargeInActive = useRef(false);
  const queuedVoicePromptRef = useRef('');
  const pendingVoiceConfirmation = useRef('');
  const queuedTurnRef = useRef<{ mode: 'fast' | 'deep'; attachments: LocalAttachment[] }>({
    mode: 'fast',
    attachments: []
  });
  const advancingQueuedTurn = useRef(false);
  const activeConversationMode = useRef<'fast' | 'deep'>('fast');
  const activeSpeechLanguage = useRef(navigator.language || 'it-IT');
  const responseRef = useRef(restoredDraft.response);
  const responseFrame = useRef<number | null>(null);
  const responsePaintTimer = useRef<number | null>(null);
  const draftSaveTimer = useRef<number | null>(null);
  const lastResponsePaintAt = useRef(0);
  const history = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const currentConversationId = useRef<string>(crypto.randomUUID());
  const currentConversationCreatedAt = useRef(Date.now());
  const listening = useRef(false);
  const nativeVoiceCapture = useRef(false);
  const visualMeterActive = useRef(false);
  const nativeSpeechActive = useRef(false);
  useEffect(() => {
    let active = true;
    hydrateConversationHistory().then((records) => {
      if (active) setConversationHistory(records);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const nativeSpeechEnergy = useRef(0);
  const nativeSpeechReleasedAt = useRef(0);
  const voiceDetected = useRef(false);
  const voiceStartedAt = useRef(0);
  const speechStartedAt = useRef(0);
  const lastSpeechAt = useRef(0);
  const speechFrames = useRef(0);
  const finishVoiceRequested = useRef(false);
  const voiceAvailable = useRef(false);
  const voiceEnabledRef = useRef(voiceEnabled);
  const voiceSession = useRef(0);
  const voiceTranscribing = useRef(false);
  const recordingFinished = useRef<((captured: boolean) => void) | null>(null);
  const permissionDecision = useRef<((approved: boolean) => void) | null>(null);
  const interfacePreferencesRef = useRef(interfacePreferences);
  const settingsRef = useRef<NexusSettings | null>(settings);
  const speechAudio = useRef<HTMLAudioElement | null>(null);
  const speechAudioUrl = useRef('');
  const speechSession = useRef(0);
  const lastSpeechRequest = useRef('');
  const voiceNoticeTimer = useRef<number | null>(null);
  const attentiveFollowUpTimer = useRef<number | null>(null);

  // Lo stream può produrre decine di token al secondo. La stringa completa
  // resta nel ref. Sui PC Lite raggruppiamo più token: il testo appare subito,
  // ma Markdown e layout non vengono ricalcolati decine di volte al secondo.
  const scheduleResponsePaint = useCallback(() => {
    if (responseFrame.current !== null || responsePaintTimer.current !== null) return;
    // Il testo arriva subito, ma viene dipinto con una cadenza leggibile e
    // stabile. Raggruppare pochi token evita l'effetto mitragliatrice e riduce
    // il layout thrashing senza introdurre una finta animazione carattere-per-carattere.
    const interval = hardware?.performanceLevel === 1 ? 44 : hardware?.tier === 'lite' ? 38 : hardware?.tier === 'balanced' ? 30 : 24;
    const remaining = Math.max(0, interval - (performance.now() - lastResponsePaintAt.current));
    const paint = () => {
      responsePaintTimer.current = null;
      responseFrame.current = window.requestAnimationFrame(() => {
        responseFrame.current = null;
        lastResponsePaintAt.current = performance.now();
        setResponse(publicResponseText(responseRef.current));
      });
    };
    if (remaining > 1) responsePaintTimer.current = window.setTimeout(paint, remaining);
    else paint();
  }, [hardware?.performanceLevel, hardware?.tier]);

  const flushResponsePaint = useCallback(() => {
    if (responsePaintTimer.current !== null) {
      window.clearTimeout(responsePaintTimer.current);
      responsePaintTimer.current = null;
    }
    if (responseFrame.current !== null) {
      window.cancelAnimationFrame(responseFrame.current);
      responseFrame.current = null;
    }
    setResponse(publicResponseText(responseRef.current));
  }, []);

  useEffect(() => {
    interfacePreferencesRef.current = interfacePreferences;
  }, [interfacePreferences]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const addLog = useCallback((message: string) => {
    setLogs((current) => [...current.slice(-10), {
      id: ++logId.current,
      time: timestamp(),
      message,
      createdAt: Date.now()
    }]);
  }, []);

  useEffect(() => window.nexus.onProactiveEvent((event) => {
    const labels: Record<string, string> = {
      'system.resume': 'Sistema nuovamente disponibile',
      'system.suspend': 'Sistema in sospensione',
      'power.source': event.metadata.source === 'battery' ? 'Alimentazione a batteria' : 'Alimentazione collegata',
      'network.status': event.metadata.state === 'online' ? 'Connessione ripristinata' : 'Connessione non disponibile',
      'security.alert': 'Controllo di sicurezza richiesto',
      'update.available': 'Aggiornamento disponibile',
      'device.health': 'Stato del dispositivo aggiornato'
    };
    addLog(typeof event.metadata.summary === 'string'
      ? event.metadata.summary
      : labels[event.type] || 'Stato aggiornato');
  }), [addLog]);

  const setStep = useCallback((id: string, status: TaskStep['status']) => {
    setSteps((current) => current.map((step) => step.id === id ? {
      ...step,
      status,
      ...(status === 'active' && step.status !== 'active' ? { startedAt: Date.now(), completedAt: undefined } : {}),
      ...(status === 'complete' ? { completedAt: Date.now() } : {})
    } : step));
  }, []);

  const showVoiceNotice = useCallback((message: string) => {
    if (voiceNoticeTimer.current !== null) window.clearTimeout(voiceNoticeTimer.current);
    setVoiceNotice(message);
    voiceNoticeTimer.current = window.setTimeout(() => {
      setVoiceNotice('');
      voiceNoticeTimer.current = null;
    }, 3_800);
  }, []);

  const stopSpeech = useCallback(async (returnToIdle = true) => {
    if (attentiveFollowUpTimer.current !== null) window.clearTimeout(attentiveFollowUpTimer.current);
    attentiveFollowUpTimer.current = null;
    setAttentionRequest('');
    const session = ++speechSession.current;
    window.speechSynthesis?.cancel();
    speechAudio.current?.pause();
    if (speechAudioUrl.current) URL.revokeObjectURL(speechAudioUrl.current);
    speechAudio.current = null;
    speechAudioUrl.current = '';
    await window.nexus.stopSpeaking().catch(() => false);
    if (returnToIdle && session === speechSession.current) setState('idle');
  }, []);

  const speak = useCallback(async (text: string, requestKey: string = crypto.randomUUID(), allowFollowUp = true) => {
    // Il completamento può arrivare da più confini asincroni (stream, azione,
    // salvataggio). La chiave rende l'output vocale exactly-once anche se lo
    // stesso evento viene consegnato nuovamente.
    if (lastSpeechRequest.current === requestKey) return;
    lastSpeechRequest.current = requestKey;
    // Ogni risposta possiede una generazione. Un risultato Kokoro tardivo non
    // può più partire dopo che l'utente ha iniziato una nuova interazione.
    const session = ++speechSession.current;
    window.speechSynthesis?.cancel();
    speechAudio.current?.pause();
    if (speechAudioUrl.current) URL.revokeObjectURL(speechAudioUrl.current);
    speechAudio.current = null;
    speechAudioUrl.current = '';
    await window.nexus.stopSpeaking().catch(() => false);
    if (session !== speechSession.current) return;

    const clean = prepareSpokenText(text);
    if (!clean || !interfacePreferencesRef.current.voiceOutputEnabled) {
      setState('idle');
      return;
    }

    // Se l'utente sceglie una voce locale naturale, la stessa preferenza vale
    // anche nel dialogo live. Il worker viene preriscaldato dal main process;
    // in caso di indisponibilità resta il fallback immediato di Windows.
    // Sul livello hardware minimo la voce di sistema evita di caricare un
    // secondo runtime neurale mentre il modello linguistico usa la RAM. Sugli
    // altri livelli la voce naturale resta automatica e mantiene il fallback.
    const outputLocale = speechLocale(activeSpeechLanguage.current);
    const outputLanguage = outputLocale.split('-')[0];
    const voiceEngine = interfacePreferencesRef.current.voiceEngine === 'system'
      ? 'neural'
      : interfacePreferencesRef.current.voiceEngine;
    if (String(voiceEngine) !== 'system') {
      try {
        const expressive = voiceEngine === 'expressive';
        addLog(expressive ? 'Preparazione voce espressiva' : 'Preparazione voce naturale');
        const result = await window.nexus.synthesizeVoice({
          text: clean,
          gender: interfacePreferencesRef.current.voiceGender,
          language: outputLanguage,
          engine: expressive ? 'expressive' : 'neural',
          delivery: inferVoiceDelivery(clean)
        });
        if (session !== speechSession.current) return;
        const audioBuffer = new ArrayBuffer(result.audio.byteLength);
        new Uint8Array(audioBuffer).set(result.audio);
        const blob = new Blob([audioBuffer], { type: result.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;
        // Il WAV è locale e completo: HAVE_CURRENT_DATA è sufficiente per
        // partire. `canplaythrough` stima una rete che qui non esisteva e su
        // alcuni driver aggiungeva fino a 1,5 s di silenzio artificiale.
        await new Promise<void>((resolve, reject) => {
          if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return resolve();
          const timer = window.setTimeout(resolve, 350);
          const ready = () => {
            window.clearTimeout(timer);
            resolve();
          };
          audio.addEventListener('loadeddata', ready, { once: true });
          audio.addEventListener('canplay', ready, { once: true });
          audio.addEventListener('error', () => {
            window.clearTimeout(timer);
            reject(new Error('Audio neurale non riproducibile.'));
          }, { once: true });
          audio.load();
        });
        if (session !== speechSession.current) {
          URL.revokeObjectURL(url);
          return;
        }
        speechAudio.current = audio;
        speechAudioUrl.current = url;
        audio.onplay = () => {
          if (session === speechSession.current) setState('responding');
        };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (speechAudio.current === audio) speechAudio.current = null;
          if (speechAudioUrl.current === url) speechAudioUrl.current = '';
          if (session !== speechSession.current) return;
          setState('idle');
          addLog('Risposta completata');
          const personalization = settingsRef.current?.personalization;
          const userName = String(personalization?.userName || '').trim();
          if (allowFollowUp && personalization?.attentiveFollowUp !== false && userName && /\?\s*$/.test(clean)) {
            attentiveFollowUpTimer.current = window.setTimeout(() => {
              attentiveFollowUpTimer.current = null;
              if (session !== speechSession.current || listening.current || requestGenerating.current
                || !voiceEnabledRef.current || document.visibilityState !== 'visible') return;
              setAttentionRequest(userName);
            }, 18_000);
          }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (speechAudio.current === audio) speechAudio.current = null;
          if (speechAudioUrl.current === url) speechAudioUrl.current = '';
          if (session === speechSession.current) setState('idle');
        };
        let playbackStarted = false;
        audio.addEventListener('playing', () => { playbackStarted = true; }, { once: true });
        try {
          await audio.play();
        } catch (error) {
          // Alcuni driver risolvono l'avvio e notificano subito dopo un errore
          // transitorio. Se la riproduzione è partita, non avviare anche SAPI.
          if (playbackStarted || audio.currentTime > 0 || !audio.paused) return;
          throw error;
        }
        return;
      } catch {
        if (session !== speechSession.current) return;
        // Un errore Kokoro non deve rendere muta l'intera risposta. Ripulisce
        // l'eventuale player parziale e usa una sola voce di sistema, mai due
        // output concorrenti.
        speechAudio.current?.pause();
        if (speechAudioUrl.current) URL.revokeObjectURL(speechAudioUrl.current);
        speechAudio.current = null;
        speechAudioUrl.current = '';
        await window.nexus.stopSpeaking().catch(() => false);
        addLog('Voce naturale non pronta, uso la voce del dispositivo');
      }
    }

    if (!window.speechSynthesis) {
      setState('idle');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = outputLocale;
    const voices = window.speechSynthesis.getVoices();
    const preferences = interfacePreferencesRef.current;
    const preferredName = preferences.voiceName;
    const genderPattern = preferences.voiceGender === 'male' ? /cosimo|diego/i : /elsa|isabella/i;
    utterance.voice = voices.find((candidate) => candidate.name === preferredName)
      || voices.find((candidate) => candidate.lang.toLowerCase().startsWith(outputLanguage) && genderPattern.test(candidate.name))
      || voices.find((candidate) => candidate.lang.toLowerCase() === outputLocale && candidate.localService)
      || voices.find((candidate) => candidate.lang.toLowerCase().startsWith(outputLanguage))
      || null;
    utterance.rate = 1;
    utterance.pitch = preferences.voiceGender === 'male' ? 0.98 : 1.02;
    utterance.onstart = () => {
      if (session === speechSession.current) setState('responding');
    };
    utterance.onend = () => {
      if (session !== speechSession.current) return;
      setState('idle');
      addLog('Risposta completata');
    };
    utterance.onerror = () => {
      if (session === speechSession.current) setState('idle');
    };
    window.speechSynthesis.speak(utterance);
  }, [addLog, hardware?.performanceLevel]);

  useEffect(() => {
    if (!attentionRequest) return;
    const name = attentionRequest;
    setAttentionRequest('');
    void speak(`Ci sei, ${name}?`, `attention-${Date.now()}`, false);
  }, [attentionRequest, speak]);

  const completeConversation = useCallback((requestKey: string = crypto.randomUUID(), incomplete = false, announce = true) => {
    const answer = responseRef.current.trim();
    setStep('verify', 'complete');
    addLog('Completato');
    if (answer) {
      history.current = [...history.current, {
        role: 'assistant' as const,
        content: answer,
        ...(artifactsRef.current.length ? { artifacts: artifactsRef.current } : {})
      }].slice(-16);
      const now = Date.now();
      const turns: ConversationTurn[] = history.current.map((turn, index) => ({
        ...turn,
        createdAt: now - ((history.current.length - index) * 10)
      }));
      setConversationHistory(saveConversation({
        id: currentConversationId.current,
        title: '',
        createdAt: currentConversationCreatedAt.current,
        updatedAt: now,
        turns,
        incomplete,
        ...(workspace.active ? { workspace: { path: workspace.path, name: workspace.name } } : {})
      }));
      // Durante il barge-in la vecchia risposta resta leggibile ma non viene
      // pronunciata sopra al microfono o alla frase già pronta in coda.
      if (bargeInActive.current || queuedVoicePromptRef.current) setState('listening');
      else if (announce) void speak(answer, requestKey);
      else setState('idle');
    } else {
      setState('idle');
    }
  }, [addLog, setStep, speak, workspace]);
  // #endregion

  // #region 02 — Lifecycle, bootstrap e stream del modello

  useEffect(() => {
    const unsubscribe = window.nexus.onStreamEvent((event: StreamEvent) => {
      if (event.requestId !== activeRequest.current) return;
      if (event.type === 'phase' && event.phase) {
        setSteps((current) => current.map((step) => {
          if (step.id === event.phase?.step) return {
            ...step,
            label: event.phase.label,
            status: 'active',
            startedAt: step.status === 'active' ? step.startedAt : Date.now(),
            completedAt: undefined
          };
          if (step.status === 'active') return { ...step, status: 'complete', completedAt: Date.now() };
          return step;
        }));
        addLog(event.phase.label);
        if (!bargeInActive.current) setState(event.phase.step === 'execute' ? 'responding' : 'thinking');
      } else if (event.type === 'start') {
        // Il turno accodato resta visibile fino alla conferma di avvio del
        // nuovo stream. Così non esiste un frame in cui la vecchia risposta
        // torna al centro prima di essere sostituita.
        if (advancingQueuedTurn.current) {
          advancingQueuedTurn.current = false;
          setQueuedVoicePrompt('');
          setVoiceNotice('');
        }
        setStep('plan', 'complete');
        setStep('execute', 'active');
        addLog('NEXUSNXS è pronto');
        if (!bargeInActive.current) setState('thinking');
      } else if (event.type === 'token') {
        if (!responseRef.current) {
          setStep('execute', 'complete');
          setStep('verify', 'active');
          addLog('Flusso di risposta avviato');
        }
        responseRef.current += event.token || '';
        scheduleResponsePaint();
        if (!bargeInActive.current) setState('responding');
      } else if (event.type === 'replace') {
        responseRef.current = event.token || '';
        flushResponsePaint();
        addLog('Risposta verificata');
        if (!bargeInActive.current) setState('responding');
      } else if (event.type === 'thinking') {
        if (!bargeInActive.current) setState('thinking');
      } else if (event.type === 'complete') {
        lastCompletedRequest.current = event.requestId;
        activeRequest.current = '';
        requestGenerating.current = false;
        setGenerating(false);
        responseRef.current = publicResponseText(responseRef.current);
        flushResponsePaint();
        window.localStorage.removeItem(INTERRUPTED_DRAFT_KEY);
        completeConversation(event.requestId, event.result?.incomplete === true);
      } else if (event.type === 'cancel') {
        activeRequest.current = '';
        requestGenerating.current = false;
        if (advancingQueuedTurn.current) {
          advancingQueuedTurn.current = false;
          queuedVoicePromptRef.current = '';
          queuedTurnRef.current = { mode: 'fast', attachments: [] };
          setQueuedVoicePrompt('');
        }
        setGenerating(false);
        addLog('Richiesta annullata');
        setState(bargeInActive.current ? 'listening' : 'idle');
      } else if (event.type === 'error') {
        activeRequest.current = '';
        requestGenerating.current = false;
        if (advancingQueuedTurn.current) {
          advancingQueuedTurn.current = false;
          queuedVoicePromptRef.current = '';
          queuedTurnRef.current = { mode: 'fast', attachments: [] };
          setQueuedVoicePrompt('');
        }
        setGenerating(false);
        const message = publicUiError(event.error, 'NEXUSNXS non ha completato la risposta. Riprova.');
        addLog(message);
        setFatalError(message);
        setState(bargeInActive.current ? 'listening' : 'error');
      }
    });
    return unsubscribe;
  }, [addLog, completeConversation, flushResponsePaint, scheduleResponsePaint, setStep]);

  useEffect(() => {
    if (!generating || !response) return;
    // localStorage è sincrono: una scrittura per token bloccava il renderer.
    // Salviamo soltanto dopo una breve quiete, conservando comunque il crash recovery.
    if (draftSaveTimer.current !== null) window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      draftSaveTimer.current = null;
      try {
        window.localStorage.setItem(INTERRUPTED_DRAFT_KEY, JSON.stringify({
          transcript,
          response,
          savedAt: Date.now()
        }));
        const now = Date.now();
        const partialTurns: ConversationTurn[] = [
          ...history.current.map((turn, index) => ({ ...turn, createdAt: now - ((history.current.length - index) * 10) })),
          { role: 'assistant', content: response, createdAt: now }
        ];
        setConversationHistory(saveConversation({
          id: currentConversationId.current,
          title: transcript,
          createdAt: currentConversationCreatedAt.current,
          updatedAt: now,
          turns: partialTurns,
          incomplete: true,
          ...(workspace.active ? { workspace: { path: workspace.path, name: workspace.name } } : {})
        }));
      } catch {}
    }, 800);
    return () => {
      if (draftSaveTimer.current !== null) {
        window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
    };
  }, [generating, response, transcript, workspace]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        addLog('Avvio del nucleo NEXUSNXS');
        const data = await window.nexus.bootstrap();
        if (!mounted) return;
        setSettings(data.settings);
        setModels(data.ai.models || []);
        setHardware(data.hardware);
        setWorkspace(data.workspace || { path: '', name: '', active: false });
        setManagedRuntime(data.runtime.managed);
        setRemoteInference(data.runtime.remoteInference === true);
        setRuntimePreparing(!data.ai.health.ok);
        const capabilities = await window.nexus.voiceCapabilities();
        voiceAvailable.current = capabilities.available;
        addLog(data.runtime.remoteInference === true ? 'Servizio NexusNXS configurato' : 'Contesto locale disponibile');
        addLog(data.ai.health.ok ? 'NEXUSNXS è pronto' : data.runtime.remoteInference === true ? 'NEXUSNXS è offline' : 'NEXUSNXS è in preparazione');
        setState(data.ai.health.ok ? 'idle' : 'offline');
      } catch (error) {
        const message = publicUiError(error, 'Avvio di NEXUSNXS non riuscito.');
        setFatalError(message);
        addLog(message);
        setState('error');
      }
    })();
    return () => {
      mounted = false;
      voice.stop();
      window.speechSynthesis?.cancel();
      window.nexus.stopSpeaking().catch(() => false);
      speechAudio.current?.pause();
      if (speechAudioUrl.current) URL.revokeObjectURL(speechAudioUrl.current);
      speechAudio.current = null;
      speechAudioUrl.current = '';
      if (voiceNoticeTimer.current !== null) window.clearTimeout(voiceNoticeTimer.current);
      if (responsePaintTimer.current !== null) window.clearTimeout(responsePaintTimer.current);
      if (responseFrame.current !== null) window.cancelAnimationFrame(responseFrame.current);
    };
  }, [addLog, voice]);

  useEffect(() => {
    if (!runtimePreparing) return;
    let cancelled = false;
    let timer: number | undefined;
    const check = async () => {
      try {
        const health = await window.nexus.health();
        if (cancelled) return;
        if (health.ok) {
          setRuntimePreparing(false);
          setState('idle');
          const installed = await window.nexus.listModels();
          if (!cancelled) setModels(installed);
          addLog(remoteInference ? 'NEXUSNXS è di nuovo disponibile' : 'Preparazione locale completata');
          return;
        }
      } catch { /* Il preflight continua in background. */ }
      if (!cancelled) timer = window.setTimeout(check, 2_000);
    };
    timer = window.setTimeout(check, 1_000);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [addLog, remoteInference, runtimePreparing]);

  useEffect(() => {
    const unsubscribe = window.nexus.onVoiceActivity((activity) => {
      if (!nativeVoiceCapture.current) return;
      nativeSpeechActive.current = Boolean(activity.active);
      nativeSpeechEnergy.current = activity.active
        ? Math.max(0.35, Math.min(1, Number(activity.level) || 0.72))
        : 0;
      if (activity.active) {
        nativeSpeechReleasedAt.current = 0;
        voiceDetected.current = true;
        lastSpeechAt.current = performance.now();
      } else {
        nativeSpeechReleasedAt.current = performance.now();
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.nexus.onVoicePartial((partial) => {
      if (!nativeVoiceCapture.current || !listening.current) return;
      const text = String(partial.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      setTranscript(text);
      voiceDetected.current = true;
      lastSpeechAt.current = performance.now();
      setState('speaking');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!listening.current) {
        voice.bus.current = { level: 0, bass: 0, mid: 0, treble: 0 };
        setAudioLevel(0);
        return;
      }
      if (nativeVoiceCapture.current) {
        if (visualMeterActive.current) {
          const activity = voice.activity();
          const level = activity.level;
          const now = performance.now();
          setAudioLevel(level);
          if (activity.speech >= 0.34 || level >= 0.075) {
            voiceDetected.current = true;
            lastSpeechAt.current = now;
          }
          const visuallySpeaking = voiceDetected.current
            && (activity.speech >= 0.2 || level >= 0.035 || now - lastSpeechAt.current < 280);
          setState(visuallySpeaking ? 'speaking' : 'listening');
          if (voiceDetected.current
            && !finishVoiceRequested.current
            && lastSpeechAt.current > 0
            && now - lastSpeechAt.current >= 700) {
            finishVoiceRequested.current = true;
            setState('thinking');
            addLog('Fine della frase rilevata');
            void window.nexus.finishVoice();
          }
          return;
        }
        const now = performance.now();
        const releaseActive = nativeSpeechReleasedAt.current > 0
          && now - nativeSpeechReleasedAt.current < 180;
        const perceivedActive = nativeSpeechActive.current || releaseActive;
        const target = nativeSpeechActive.current ? nativeSpeechEnergy.current : 0;
        const visualTarget = target * 0.84;
        const previous = voice.bus.current.level;
        const envelope = visualTarget > previous
          ? previous + ((visualTarget - previous) * 0.42)
          : previous * 0.76;
        const pulse = target > 0
          ? Math.min(1, envelope * (0.88 + (Math.sin(now * 0.022) * 0.12)))
          : envelope;
        voice.bus.current = {
          level: pulse,
          bass: pulse * (0.7 + (Math.sin(now * 0.014) * 0.12)),
          mid: pulse * (0.82 + (Math.sin(now * 0.021 + 1.3) * 0.1)),
          treble: pulse * (0.58 + (Math.sin(now * 0.03 + 2.1) * 0.14))
        };
        setAudioLevel(pulse);
        setState(perceivedActive ? 'speaking' : 'listening');
        return;
      }
      const activity = voice.activity();
      const level = activity.level;
      const now = performance.now();
      setAudioLevel(level);
      if (!activity.calibrated) {
        setState('listening');
        return;
      }
      // La probabilità spettrale è già normalizzata sul rumore del singolo
      // microfono. Una soglia morbida con tre conferme consecutive sente la
      // voce bassa senza scambiare click o respiri isolati per parole.
      if (activity.speech >= 0.23 || level >= 0.032) {
        speechFrames.current += 1;
        if (speechFrames.current >= 3 && !voiceDetected.current) {
          voiceDetected.current = true;
          speechStartedAt.current = now;
        }
      } else if (activity.speech < 0.12 && level < 0.018) {
        speechFrames.current = 0;
      }
      const speechPresent = activity.speech >= 0.14 || level >= 0.021;
      if (voiceDetected.current && speechPresent) lastSpeechAt.current = now;
      setState(voiceDetected.current && (speechPresent || now - lastSpeechAt.current < 360) ? 'speaking' : 'listening');
      const utteranceMs = Math.max(0, now - speechStartedAt.current);
      const naturalPauseMs = utteranceMs < 1_200 ? 1_250 : utteranceMs < 5_000 ? 1_550 : 1_850;
      if (voiceDetected.current
        && !finishVoiceRequested.current
        && lastSpeechAt.current > 0
            // Le frasi lunghe ricevono più spazio per pause naturali; un
            // comando breve si conclude prima senza tagliare l'ultima parola.
            && now - lastSpeechAt.current >= naturalPauseMs) {
        finishVoiceRequested.current = true;
        listening.current = false;
        setState('thinking');
        addLog('Fine della frase rilevata');
        recordingFinished.current?.(true);
        recordingFinished.current = null;
      } else if (!voiceDetected.current && now - voiceStartedAt.current >= 14_000) {
        listening.current = false;
        finishVoiceRequested.current = true;
        recordingFinished.current?.(false);
        recordingFinished.current = null;
        showVoiceNotice('Non ho rilevato parole · premi Spazio per riprovare');
        setState(settings?.model ? 'idle' : 'offline');
      }
    }, 90);
    return () => window.clearInterval(interval);
  }, [addLog, settings?.model, showVoiceNotice, voice]);

  useEffect(() => {
    // I log operativi sono effimeri: l'ultimo resta visibile, gli eventi più
    // vecchi vengono rimossi in base alla preferenza dell'utente.
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setLogs((current) => current.filter((entry, index) => entry.createdAt >= cutoff || index === current.length - 1));
    }, 2_000);
    return () => window.clearInterval(interval);
  }, []);
  // #endregion

  // #region 03 — Conversazione, azioni e voce

  const executeAction = useCallback(async (instruction: string) => {
    setSteps(createTaskSteps('understand', { action: true }));
    const needsWorkspace = FILE_ACTION_PATTERN.test(instruction)
      || WORKSPACE_MUTATION_PATTERN.test(instruction)
      || !DIRECT_APPLICATION_PATTERN.test(instruction);
    if (!workspace.active && needsWorkspace) {
      addLog('Scegli dove autorizzare il lavoro');
      const selected = await window.nexus.selectWorkspace();
      setWorkspace(selected);
      if (!selected.active) {
        const message = 'Scegli una cartella o un’unità per consentire a NEXUSNXS di leggere e modificare soltanto quello spazio.';
        responseRef.current = message;
        setResponse(message);
        setState('idle');
        return;
      }
      addLog(`Cartella autorizzata · ${selected.name}`);
    }
    addLog('Comando vocale rilevato');
    setState('thinking');
    await wait(260);
    setStep('understand', 'complete');
    setStep('plan', 'active');
    addLog('Pianificazione azione locale');
    const approvalMode = settings?.actionApprovalMode || 'dangerous-only';
    let outcome: Awaited<ReturnType<typeof window.nexus.executeAction>> | null = null;
    const observations: string[] = [];

    for (let actionIndex = 0; actionIndex < MAX_ACTION_STEPS; actionIndex += 1) {
      const planned = await window.nexus.planAction({ instruction, observations });
      if (planned.error) throw new Error(planned.error);
      if (!planned.proposal) {
        const message = planned.message || (observations.length
          ? 'Ho esaminato la cartella, ma mi serve un dettaglio in più prima di modificarla.'
          : 'Serve un dettaglio in più.');
        setResponse(message);
        responseRef.current = message;
        setState('responding');
        completeConversation();
        return;
      }

      setStep('plan', 'complete');
      setStep('execute', 'active');
      const requiresApproval = approvalMode === 'always'
        || (approvalMode === 'dangerous-only' && planned.proposal.risk === 'high');
      let approved = true;
      if (requiresApproval) {
        setPermission(planned.proposal);
        setState('permission');
        addLog('Consenso richiesto');
        approved = await new Promise<boolean>((resolve) => {
          permissionDecision.current = resolve;
        });
        permissionDecision.current = null;
        setPermission(null);
      } else {
        addLog(approvalMode === 'full-access' ? 'Accesso completo · azione autorizzata' : 'Azione sicura autorizzata automaticamente');
        setState('executing');
      }

      outcome = await window.nexus.executeAction(planned.proposal.id, approved);
      if (outcome.status === 'denied') {
        addLog('Consenso negato');
        setResponse(outcome.message || 'Azione annullata.');
        setState('idle');
        return;
      }

      if (outcome.status === 'completed' && INSPECTION_TOOLS.has(planned.proposal.tool)) {
        const observation = [outcome.message, outcome.stdout].filter(Boolean).join('\n\n').slice(0, 18_000);
        observations.push(`${planned.proposal.tool}: ${observation}`);
        addLog(planned.proposal.tool === 'read_file' ? 'File letto · preparo la modifica' : 'Cartella esaminata · continuo il lavoro');
        setState('thinking');
        setStep('plan', 'active');
        continue;
      }
      break;
    }

    if (!outcome || (outcome.status === 'completed' && observations.length && outcome.verification === 'read-complete')) {
      const message = 'Ho completato la ricognizione, ma non ho applicato modifiche: il piano operativo ha raggiunto il limite di sicurezza.';
      setResponse(message);
      responseRef.current = message;
      setState('idle');
      completeConversation();
      return;
    }
    setState('executing');
    addLog(outcome.message || 'Azione completata');
    setStep('execute', 'complete');
    setStep('verify', 'active');
    addLog('Verifica del risultato');
    setStep('verify', 'complete');
    addLog(outcome.verification === 'exit-code-zero' ? 'Risultato verificato'
      : outcome.verification === 'exit-code-failure' ? 'Operazione conclusa con errore'
        : 'Avvio accettato dal sistema');
    const answer = [outcome.message, outcome.stdout].filter(Boolean).join('\n\n');
    const nextArtifacts = Array.isArray(outcome.artifacts) ? outcome.artifacts.slice(0, 12) : [];
    artifactsRef.current = nextArtifacts;
    setArtifacts(nextArtifacts);
    responseRef.current = answer;
    setResponse(answer);
    completeConversation();
  }, [addLog, completeConversation, settings?.actionApprovalMode, setStep, speak, workspace.active]);

  const respondToPermission = useCallback((approved: boolean) => {
    permissionDecision.current?.(approved);
    permissionDecision.current = null;
  }, []);

  const submit = useCallback(async (rawText: string, mode: 'fast' | 'deep' = 'fast', attachments: LocalAttachment[] = []) => {
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (!regenerationPending.current) setPreviousResponse('');
    regenerationPending.current = false;
    if (/^(?:mostra|fammi vedere|apri)\s+(?:la\s+)?(?:cronologia|conversazioni|chat precedenti)(?:\s+(?:delle\s+)?chat)?[.!?]?$/i.test(text)) {
      setCommandOpen(false);
      setModelSwitcherOpen(false);
      setSettingsOpen(false);
      setHistoryOpen(true);
      return;
    }
    if (/^(?:(?:mostra|apri|vai (?:a|alle)|open|show)\s+)?(?:impostazioni|settings)[.!?]?$/i.test(text)) {
      setCommandOpen(false);
      setHistoryOpen(false);
      setModelSwitcherOpen(false);
      setSettingsOpen(true);
      return;
    }
    if (/^(?:(?:mostra|apri|scegli|cambia|open|show|select|change)\s+)?(?:i\s+)?(?:modelli|modello|models?|model)[.!?]?$/i.test(text)) {
      setCommandOpen(false);
      setHistoryOpen(false);
      setSettingsOpen(false);
      setModelSwitcherOpen(true);
      return;
    }
    if (/^(?:(?:collega|associa|connetti|pair|connect)\s+)(?:(?:il|un|my)\s+)?(?:telefono|smartphone|phone|device|dispositivo)[.!?]?$/i.test(text)) {
      setCommandOpen(false);
      setHistoryOpen(false);
      setModelSwitcherOpen(false);
      setSettingsOpen(true);
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('nexus:open-settings-tab', { detail: 'remote' }));
        window.dispatchEvent(new CustomEvent('nexus:start-pairing'));
      });
      return;
    }
    if (/^(?:(?:apri|mostra|open|show)\s+)?(?:tastiera|scrittura|composer|keyboard|type)[.!?]?$/i.test(text)) {
      setHistoryOpen(false);
      setModelSwitcherOpen(false);
      setSettingsOpen(false);
      setCommandOpen(true);
      return;
    }
    const permissionCommand = /\b(?:imposta|usa|attiva|passa a)\s+(?:i\s+)?(?:permessi?\s+)?(?:su\s+)?(accesso completo|chiedi sempre|solo azioni pericolose)\b/i.exec(text)?.[1]?.toLocaleLowerCase('it-IT');
    if (permissionCommand) {
      const actionApprovalMode = permissionCommand === 'accesso completo' ? 'full-access' : permissionCommand === 'chiedi sempre' ? 'always' : 'dangerous-only';
      setSettings(await window.nexus.saveSettings({ actionApprovalMode }));
      addLog(actionApprovalMode === 'full-access' ? 'Accesso completo attivo' : actionApprovalMode === 'always' ? 'Consenso richiesto per ogni azione' : 'Consenso richiesto solo per azioni pericolose');
      setCommandOpen(false);
      return;
    }
    if (/^(?:scegli|seleziona|cambia|apri)\s+(?:la\s+)?cartella\s+(?:di\s+)?lavoro\b/i.test(text)) {
      const selected = await window.nexus.selectWorkspace();
      setWorkspace(selected);
      if (selected.active) addLog(`Cartella attiva · ${selected.name}`);
      setCommandOpen(false);
      return;
    }
    if (/^(?:annulla|ripristina)(?:\s+(?:la|l['’]))?\s*(?:ultima\s+)?(?:modifica|azione)(?:\s+(?:ai|sui)\s+file)?[.!]?$/i.test(text)) {
      setState('executing');
      addLog('Ripristino dell’ultima modifica');
      try {
        const restored = await window.nexus.undoLastAction();
        responseRef.current = restored.message;
        setResponse(restored.message);
        addLog(restored.status === 'restored' ? 'Punto di ripristino applicato' : 'Nessuna modifica da annullare');
        setState('responding');
      } catch (error) {
        const message = publicUiError(error, 'Non è stato possibile annullare la modifica.');
        setFatalError(message);
        setState('error');
      }
      setCommandOpen(false);
      return;
    }
    // Un nuovo invio non cancella il turno attivo: viene accodato e conserva
    // modalità, allegati e contesto fino alla conclusione della generazione.
    // viene conservato con allegati e modalità, poi parte appena lo stream
    // precedente ha pubblicato il proprio evento terminale.
    if (shouldQueueTurn(requestGenerating.current)) {
      queuedVoicePromptRef.current = text;
      queuedTurnRef.current = { mode, attachments: [...attachments] };
      setQueuedVoicePrompt(text);
      setVoiceNotice('Messaggio in coda · partirà al termine della risposta');
      setCommandOpen(false);
      return;
    }
    // Parlare o scrivere di nuovo equivale a interrompere educatamente NexusNXS.
    // Attendiamo l'arresto del worker per non accumulare sintesi obsolete.
    await stopSpeech(false);
    setVoiceNotice('');
    setCommandOpen(false);
    setTranscript(text);
    if (responseFrame.current !== null) {
      window.cancelAnimationFrame(responseFrame.current);
      responseFrame.current = null;
    }
    if (responsePaintTimer.current !== null) {
      window.clearTimeout(responsePaintTimer.current);
      responsePaintTimer.current = null;
    }
    setResponse('');
    artifactsRef.current = [];
    setArtifacts([]);
    responseRef.current = '';
    lastCompletedRequest.current = '';
    setFatalError('');
    setTrainingSaved(false);
    history.current = [...history.current, { role: 'user' as const, content: text }].slice(-16);
    try {
      if (/^\/reindex$/i.test(text)) {
        setState('executing');
        addLog('Aggiornamento del contesto avviato');
        await window.nexus.reindex();
        addLog('Contesto aggiornato');
        setState('idle');
        return;
      }
      if (isActionRequest(text)) {
        await executeAction(text);
        return;
      }
      const selectedMode = conversationMode(text, mode, attachments);
      setSteps(createTaskSteps('understand', { mode: selectedMode, attachments: attachments.length }));
      setState('thinking');
      addLog('Comprensione della richiesta');
      setStep('understand', 'complete');
      setStep('plan', 'active');
      addLog(attachments.length ? `Analisi di ${attachments.length} allegati` : 'Ricognizione del contesto');
      activeConversationMode.current = selectedMode;
      if (selectedMode === 'deep') addLog('Preparo una risposta approfondita');
      activeRequest.current = crypto.randomUUID();
      requestGenerating.current = true;
      setGenerating(true);
      await window.nexus.streamChat({
        requestId: activeRequest.current,
        question: text,
        mode: selectedMode,
        history: history.current.slice(0, -1),
        attachmentIds: attachments.map((attachment) => attachment.id)
      });
    } catch (error) {
      requestGenerating.current = false;
      advancingQueuedTurn.current = false;
      queuedVoicePromptRef.current = '';
      queuedTurnRef.current = { mode: 'fast', attachments: [] };
      setGenerating(false);
      setQueuedVoicePrompt('');
      const message = publicUiError(error);
      addLog(message);
      setFatalError(message);
      setState('error');
    }
  }, [addLog, executeAction, setStep, stopSpeech]);

  useEffect(() => {
    if (generating || !queuedVoicePrompt) return;
    const next = queuedVoicePrompt;
    const queued = queuedTurnRef.current;
    queuedVoicePromptRef.current = '';
    queuedTurnRef.current = { mode: 'fast', attachments: [] };
    advancingQueuedTurn.current = true;
    void submit(next, queued.mode, queued.attachments);
  }, [generating, queuedVoicePrompt, submit]);

  const regenerateResponse = useCallback(() => {
    if (!transcript.trim() || requestGenerating.current) return;
    setPreviousResponse(responseRef.current);
    regenerationPending.current = true;
    if (history.current.at(-1)?.role === 'assistant') history.current = history.current.slice(0, -1);
    if (history.current.at(-1)?.role === 'user') history.current = history.current.slice(0, -1);
    void submit(transcript, activeConversationMode.current);
  }, [submit, transcript]);

  const continueResponse = useCallback(() => {
    if (requestGenerating.current) return;
    void submit('Continua dal punto in cui ti sei fermato, senza ripetere quanto già scritto.', activeConversationMode.current);
  }, [submit]);

  const toggleVoice = useCallback(async () => {
    // Il composer possiede l'intera interazione finché è visibile. Questo
    // secondo confine protegge anche click già accodati o callback partiti
    // nello stesso frame in cui React apre la chat.
    if (document.querySelector('.command-input')) return;
    if (voiceTranscribing.current) {
      showVoiceNotice('Sto completando la trascrizione precedente');
      return;
    }
    if (!voiceEnabledRef.current) {
      addLog('Riconoscimento vocale in pausa · premi V');
      return;
    }
    if (!canStartVoiceTurn(requestGenerating.current)) return;
    if (listening.current) {
      voiceSession.current += 1;
      listening.current = false;
      recordingFinished.current?.(false);
      recordingFinished.current = null;
      nativeVoiceCapture.current = false;
      nativeSpeechActive.current = false;
      nativeSpeechEnergy.current = 0;
      nativeSpeechReleasedAt.current = 0;
      visualMeterActive.current = false;
      voiceDetected.current = false;
      bargeInActive.current = false;
      setBargeInListening(false);
      await Promise.allSettled([voice.stop(), window.nexus.stopVoice()]);
      addLog('Ascolto interrotto');
      setState(requestGenerating.current ? 'responding' : settings?.model ? 'idle' : 'offline');
      return;
    }
    const session = ++voiceSession.current;
    const listeningOverResponse = requestGenerating.current;
    // La sessione viene prenotata prima di qualsiasi await. In questo modo
    // una seconda pressione intenzionale può annullare anche la fase di avvio
    // (stop TTS, apertura AudioContext, permesso microfono) senza lasciare che
    // la prima callback riaccenda più tardi cattura e visualizer.
    listening.current = true;
    try {
      playActivationSound();
      // Una richiesta completata non resta "attiva": Spazio può interrompere
      // soltanto la lettura vocale, mai lo stream che deve ancora essere
      // salvato nella cronologia.
      await stopSpeech(false);
      if (session !== voiceSession.current) return;
      // Una nuova pressione di Spazio apre un turno pulito: la modalità
      // lettura scompare e il visualizer torna prima dell'accesso al microfono.
      if (responseFrame.current !== null) {
        window.cancelAnimationFrame(responseFrame.current);
        responseFrame.current = null;
      }
      if (responsePaintTimer.current !== null) {
        window.clearTimeout(responsePaintTimer.current);
        responsePaintTimer.current = null;
      }
      if (!listeningOverResponse) {
        responseRef.current = '';
        setResponse('');
        setFatalError('');
        setTrainingSaved(false);
      }
      setVoiceNotice('');
      setTranscript('');
      bargeInActive.current = listeningOverResponse;
      setBargeInListening(listeningOverResponse);
      listening.current = true;
      nativeVoiceCapture.current = false;
      nativeSpeechActive.current = false;
      nativeSpeechEnergy.current = 0;
      nativeSpeechReleasedAt.current = 0;
      voiceDetected.current = false;
      voiceStartedAt.current = performance.now();
      speechStartedAt.current = 0;
      lastSpeechAt.current = 0;
      speechFrames.current = 0;
      finishVoiceRequested.current = false;
      setState('listening');
      addLog('Microfono attivo');
      if (!voiceAvailable.current) throw new Error('Trascrizione locale non disponibile');
      await voice.start(
        interfacePreferencesRef.current.microphoneId,
        interfacePreferencesRef.current.audioSensitivity
      );
      visualMeterActive.current = true;
      const captured = await new Promise<boolean>((resolve) => {
        recordingFinished.current = resolve;
      });
      if (session !== voiceSession.current) return;
      recordingFinished.current = null;
      if (!captured) {
        await voice.stop();
        return;
      }
      // La cattura è conclusa prima di trascrizione e TTS: nessuna nuova
      // pressione o callback può scambiare la riproduzione per una sessione
      // microfono ancora attiva.
      listening.current = false;
      const audio = await voice.finishRecording();
      visualMeterActive.current = false;
      voiceDetected.current = false;
      finishVoiceRequested.current = false;
      voiceTranscribing.current = true;
      let result: Awaited<ReturnType<typeof window.nexus.transcribeVoiceAudio>>;
      try {
        result = await window.nexus.transcribeVoiceAudio(audio);
      } finally {
        voiceTranscribing.current = false;
      }
      if (!voiceEnabledRef.current) {
        setState(settings?.model ? 'idle' : 'offline');
        return;
      }
      if (result.error) throw new Error(result.error);
      let text = applyVoiceVocabulary(String(result.text || '').trim(), interfacePreferencesRef.current.voiceVocabulary);
      if (!text) {
        bargeInActive.current = false;
        setBargeInListening(false);
        showVoiceNotice('Non ho sentito nulla · premi Spazio per riprovare');
        setState(requestGenerating.current ? 'responding' : settings?.model ? 'idle' : 'offline');
        return;
      }
      if (result.language && result.language !== 'und') activeSpeechLanguage.current = result.language;
      if (pendingVoiceConfirmation.current) {
        if (VOICE_CANCEL_PATTERN.test(text)) {
          pendingVoiceConfirmation.current = '';
          showVoiceNotice('Azione annullata');
          setState(settings?.model ? 'idle' : 'offline');
          return;
        }
        if (VOICE_CONFIRM_PATTERN.test(text)) {
          text = pendingVoiceConfirmation.current;
          pendingVoiceConfirmation.current = '';
        } else {
          pendingVoiceConfirmation.current = '';
        }
      }
      if (isActionRequest(text) && typeof result.confidence === 'number' && result.confidence < 0.72) {
        pendingVoiceConfirmation.current = text;
        showVoiceNotice(`Ho capito “${text.slice(0, 90)}”. Di' conferma oppure annulla.`);
        setState(settings?.model ? 'idle' : 'offline');
        return;
      }
      addLog('Voce riconosciuta');
      bargeInActive.current = false;
      setBargeInListening(false);
      if (requestGenerating.current) {
        queuedVoicePromptRef.current = text;
        queuedTurnRef.current = { mode: 'fast', attachments: [] };
        setQueuedVoicePrompt(text);
        showVoiceNotice('Richiesta pronta · parte al termine della risposta');
        setState('responding');
        return;
      }
      // La conversazione vocale deve rispondere rapidamente: il modello
      // principale resta disponibile dalla modalità approfondita manuale.
      await submit(text, 'fast');
    } catch (error) {
      // La conclusione tardiva di una sessione annullata non può modificare
      // quella successiva né spegnerne AudioContext e visualizer.
      if (session !== voiceSession.current) return;
      recordingFinished.current = null;
      listening.current = false;
      nativeVoiceCapture.current = false;
      nativeSpeechActive.current = false;
      nativeSpeechEnergy.current = 0;
      nativeSpeechReleasedAt.current = 0;
      visualMeterActive.current = false;
      voiceDetected.current = false;
      bargeInActive.current = false;
      setBargeInListening(false);
      await voice.stop();
      if (!voiceEnabledRef.current) {
        setState('idle');
        return;
      }
      const message = friendlyVoiceError(error);
      addLog(message);
      if (requestGenerating.current) {
        showVoiceNotice(message);
        setState('responding');
      } else {
        setFatalError(message);
        setState('error');
      }
    }
  }, [addLog, settings?.model, showVoiceNotice, stopSpeech, submit, voice]);

  const toggleVoiceAccess = useCallback(async () => {
    const enabled = !voiceEnabledRef.current;
    voiceEnabledRef.current = enabled;
    setVoiceEnabled(enabled);
    if (!enabled) {
      voiceSession.current += 1;
      listening.current = false;
      voiceDetected.current = false;
      bargeInActive.current = false;
      setBargeInListening(false);
      queuedVoicePromptRef.current = '';
      queuedTurnRef.current = { mode: 'fast', attachments: [] };
      setQueuedVoicePrompt('');
      await Promise.allSettled([voice.stop(), window.nexus.stopVoice(), stopSpeech(false)]);
      addLog('Riconoscimento vocale sospeso');
      setState('idle');
      return;
    }
    addLog('Riconoscimento vocale attivato');
    setFatalError('');
    setState(settings?.model ? 'idle' : 'offline');
  }, [addLog, settings?.model, stopSpeech, voice]);

  const togglePrivacyMode = useCallback(async () => {
    const enabled = !privacyMode;
    setPrivacyMode(enabled);
    try { window.sessionStorage.setItem('nexus.privacy.active', String(enabled)); } catch {}
    if (enabled) {
      voiceSession.current += 1;
      listening.current = false;
      voiceDetected.current = false;
      bargeInActive.current = false;
      setBargeInListening(false);
      queuedVoicePromptRef.current = '';
      queuedTurnRef.current = { mode: 'fast', attachments: [] };
      setQueuedVoicePrompt('');
      const requestId = activeRequest.current;
      activeRequest.current = '';
      await Promise.allSettled([
        voice.stop(),
        window.nexus.stopVoice(),
        stopSpeech(false),
        requestId ? window.nexus.cancel(requestId) : Promise.resolve(false)
      ]);
      setCommandOpen(false);
      setModelSwitcherOpen(false);
      setSettingsOpen(false);
      setTranscript('');
      setResponse('');
      setFatalError('');
      setLogs([]);
      setState('idle');
      return;
    }
    addLog('Modalità privacy disattivata');
    setState(settings?.model ? 'idle' : 'offline');
  }, [addLog, privacyMode, settings?.model, stopSpeech, voice]);

  const detectModels = useCallback(async (next?: Partial<NexusSettings>, quiet = false) => {
    if (!quiet) addLog(remoteInference ? 'Aggiornamento dei modelli disponibili' : 'Sincronizzazione delle risorse AI');
    if (next) {
      const saved = await window.nexus.saveSettings(next);
      setSettings(saved);
    }
    const installed = await window.nexus.listModels();
    setModels(installed);
    if (!quiet) addLog(`${installed.length} modelli disponibili`);
    return installed;
  }, [addLog, remoteInference]);

  const saveSettings = useCallback(async (next: Partial<NexusSettings>) => {
    const saved = await window.nexus.saveSettings(next);
    setSettings(saved);
    setSettingsOpen(false);
    setState(saved.model ? 'idle' : 'offline');
    addLog(remoteInference ? 'Preferenze di intelligenza salvate' : 'Impostazioni AI locali salvate');
  }, [addLog, remoteInference]);

  const selectWorkspace = useCallback(async () => {
    const selected = await window.nexus.selectWorkspace();
    setWorkspace(selected);
    if (selected.active) addLog(`Cartella attiva · ${selected.name}`);
  }, [addLog]);

  const clearWorkspace = useCallback(async () => {
    setWorkspace(await window.nexus.clearWorkspace());
    addLog('Cartella di lavoro rimossa');
  }, [addLog]);

  const setApprovalMode = useCallback(async (actionApprovalMode: NonNullable<NexusSettings['actionApprovalMode']>) => {
    const saved = await window.nexus.saveSettings({ actionApprovalMode });
    setSettings(saved);
    addLog(actionApprovalMode === 'always' ? 'Consenso richiesto per ogni azione' : actionApprovalMode === 'full-access' ? 'Accesso completo attivo' : 'Consenso richiesto solo per azioni pericolose');
  }, [addLog]);

  const selectActiveModel = useCallback(async (modelId: string) => {
    const selected = models.find((model) => model.id === modelId && model.capabilities?.chat !== false);
    if (!selected) throw new Error('Modello conversazionale non disponibile.');
    const fastCandidate = /(?:^|:)1[4-9]b|(?:^|:)[2-9]\db/i.test(selected.id)
      ? models.find((model) => /qwen3:8b/i.test(model.id) && model.capabilities?.chat !== false)
        || models.find((model) => /(?:^|:)(?:3|4|7|8)b/i.test(model.id) && model.capabilities?.chat !== false)
      : selected;
    // La scelta del modello principale non deve rendere lenta anche la voce:
    // un modello compatto installato conserva il ruolo conversazionale rapido.
    const saved = await window.nexus.saveSettings({
      model: selected.id,
      chatModel: selected.id,
      fastModel: fastCandidate?.id || selected.id,
      autoSelectModel: false
    });
    setSettings(saved);
    setState('idle');
    addLog(`${selected.name} è ora il modello attivo`);
  }, [addLog, models]);

  const approveForTraining = useCallback(async (approvedResponse?: string, rejectedResponse?: string) => {
    if (!transcript.trim() || !response.trim() || !lastCompletedRequest.current || !settings) return;
    const chosen = approvedResponse?.trim() || response;
    const rejected = rejectedResponse?.trim()
      || (approvedResponse?.trim() && approvedResponse.trim() !== response ? response : undefined);
    await window.nexus.saveTrainingExample({
      requestId: lastCompletedRequest.current,
      prompt: transcript,
      response: chosen,
      originalResponse: rejected && rejected !== chosen ? rejected : undefined,
      model: activeConversationMode.current === 'deep'
        ? settings.chatModel || settings.model
        : settings.fastModel || settings.chatModel || settings.model,
      mode: activeConversationMode.current
    });
    setTrainingSaved(true);
    addLog('Esempio approvato per il miglioramento');
  }, [addLog, response, settings, transcript]);

  const saveUiPreferences = useCallback((next: InterfacePreferences) => {
    const saved = saveInterfacePreferences(next);
    setInterfacePreferences(saved);
    addLog('Preferenze interfaccia salvate');
  }, [addLog]);

  const exportPersonalData = useCallback(async (passphrase: string) => {
    const result = await window.nexus.exportPersonalData({
      conversations: conversationHistory,
      interfacePreferences
    }, passphrase);
    if (result.status === 'saved') addLog('Archivio personale esportato');
    return result.status;
  }, [addLog, conversationHistory, interfacePreferences]);

  const importPersonalData = useCallback(async (passphrase: string) => {
    const result = await window.nexus.importPersonalData(passphrase);
    if (result.status !== 'imported') return result.status;
    const client = result.clientData && typeof result.clientData === 'object'
      ? result.clientData as { conversations?: unknown; interfacePreferences?: unknown }
      : {};
    if (Array.isArray(client.conversations)) {
      window.localStorage.setItem('nexus.conversations.v1', JSON.stringify(client.conversations));
    }
    if (client.interfacePreferences) {
      window.localStorage.setItem('nexus.interface.preferences.v1', JSON.stringify(client.interfacePreferences));
    }
    window.location.reload();
    return result.status;
  }, []);

  const startNewConversation = useCallback(() => {
    const requestId = activeRequest.current;
    activeRequest.current = '';
    if (requestId) void window.nexus.cancel(requestId);
    void stopSpeech(false);
    currentConversationId.current = crypto.randomUUID();
    currentConversationCreatedAt.current = Date.now();
    history.current = [];
    lastCompletedRequest.current = '';
    requestGenerating.current = false;
    advancingQueuedTurn.current = false;
    queuedVoicePromptRef.current = '';
    queuedTurnRef.current = { mode: 'fast', attachments: [] };
    setGenerating(false);
    setQueuedVoicePrompt('');
    responseRef.current = '';
    setTranscript('');
    setResponse('');
    setPreviousResponse('');
    artifactsRef.current = [];
    setArtifacts([]);
    window.localStorage.removeItem(INTERRUPTED_DRAFT_KEY);
    setFatalError('');
    setSteps([]);
    setHistoryOpen(false);
    setViewedConversation(null);
    setState(settings?.model ? 'idle' : 'offline');
  }, [settings?.model, stopSpeech]);

  const openConversation = useCallback((record: ConversationRecord) => {
    const requestId = activeRequest.current;
    activeRequest.current = '';
    requestGenerating.current = false;
    advancingQueuedTurn.current = false;
    queuedVoicePromptRef.current = '';
    queuedTurnRef.current = { mode: 'fast', attachments: [] };
    setGenerating(false);
    setQueuedVoicePrompt('');
    if (requestId) void window.nexus.cancel(requestId);
    void stopSpeech(false);
    currentConversationId.current = record.id;
    currentConversationCreatedAt.current = record.createdAt;
    history.current = record.turns.map(({ role, content }) => ({ role, content })).slice(-16);
    if (record.workspace?.path) setWorkspace({ ...record.workspace, active: true });
    const lastUser = [...record.turns].reverse().find((turn) => turn.role === 'user')?.content || '';
    const lastAnswer = [...record.turns].reverse().find((turn) => turn.role === 'assistant')?.content || '';
    const lastArtifacts = [...record.turns].reverse().find((turn) => turn.role === 'assistant')?.artifacts || [];
    artifactsRef.current = lastArtifacts;
    setArtifacts(lastArtifacts);
    responseRef.current = lastAnswer;
    setTranscript(lastUser);
    setResponse(lastAnswer);
    setPreviousResponse('');
    setFatalError('');
    setHistoryOpen(false);
    setViewedConversation(record);
    setState('idle');
  }, [stopSpeech]);

  const closeConversationView = useCallback(() => {
    // Uscire dalla lettura non crea un nuovo turno e non riattiva il
    // microfono. Il contesto resta in history.current, mentre l'ultima
    // risposta viene rimossa soltanto dalla superficie visiva.
    setViewedConversation(null);
    responseRef.current = '';
    setResponse('');
    setPreviousResponse('');
    artifactsRef.current = [];
    setArtifacts([]);
    setTranscript('');
    setFatalError('');
    setHistoryOpen(true);
    setState(settings?.model ? 'idle' : 'offline');
  }, [settings?.model]);

  const dismissResponse = useCallback(() => {
    const requestId = activeRequest.current;
    activeRequest.current = '';
    requestGenerating.current = false;
    setGenerating(false);
    if (requestId) void window.nexus.cancel(requestId);
    void stopSpeech(false);
    responseRef.current = '';
    setResponse('');
    setPreviousResponse('');
    artifactsRef.current = [];
    setArtifacts([]);
    setTranscript('');
    setFatalError('');
    setSteps([]);
    setState(settings?.model ? 'idle' : 'offline');
  }, [settings?.model, stopSpeech]);

  const stopResponse = useCallback(() => {
    const requestId = activeRequest.current;
    if (!requestId) return;
    activeRequest.current = '';
    requestGenerating.current = false;
    setGenerating(false);
    void window.nexus.cancel(requestId);
    void stopSpeech(false);
    responseRef.current = publicResponseText(responseRef.current);
    flushResponsePaint();
    window.localStorage.removeItem(INTERRUPTED_DRAFT_KEY);
    if (responseRef.current.trim()) completeConversation(requestId, true, false);
    else {
      addLog('Generazione interrotta');
      setState(settings?.model ? 'idle' : 'offline');
    }
  }, [addLog, completeConversation, flushResponsePaint, settings?.model, stopSpeech]);

  const deleteConversation = useCallback((id: string) => {
    setConversationHistory(removeConversation(id));
    if (id === currentConversationId.current) startNewConversation();
  }, [startNewConversation]);

  const steerConversation = useCallback((record: ConversationRecord, turnIndex: number, instruction: string) => {
    if (requestGenerating.current) return;
    const baseTurns = record.turns.slice(0, Math.max(0, turnIndex + 1));
    currentConversationId.current = record.id;
    currentConversationCreatedAt.current = record.createdAt;
    history.current = baseTurns.map(({ role, content }) => ({ role, content })).slice(-16);
    setViewedConversation(null);
    setHistoryOpen(false);
    responseRef.current = '';
    setResponse('');
    setTranscript('');
    setConversationHistory(saveConversation({ ...record, turns: baseTurns, updatedAt: Date.now(), incomplete: false }));
    void submit(instruction, 'fast');
  }, [submit]);

  const deleteConversationFrom = useCallback((record: ConversationRecord, turnIndex: number) => {
    if (requestGenerating.current) return;
    const turns = record.turns.slice(0, Math.max(0, turnIndex));
    const updated = { ...record, turns, updatedAt: Date.now(), incomplete: false };
    setConversationHistory(saveConversation(updated));
    setViewedConversation(updated);
    if (record.id === currentConversationId.current) history.current = turns.map(({ role, content }) => ({ role, content })).slice(-16);
  }, []);

  // #endregion

  // #region 04 — Shortcut e API del controller

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Eventi sintetici, tecnologie assistive e alcuni WebView possono avere
      // come target Window/Document invece di un elemento HTML.
      const typing = typeof target?.matches === 'function'
        && target.matches('input, textarea, select, [contenteditable="true"]');
      const composerVisible = commandOpen || Boolean(document.querySelector('.command-input'));
      const shortcuts = interfacePreferencesRef.current.shortcuts;
      const privacyShortcut = shortcutMatches(event, shortcuts.privacy);
      if (privacyMode && !privacyShortcut && event.key !== 'Escape') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (viewedConversation) {
          closeConversationView();
          return;
        }
        if (commandOpen || modelSwitcherOpen || settingsOpen || historyOpen) {
          setCommandOpen(false);
          setModelSwitcherOpen(false);
          setSettingsOpen(false);
          setHistoryOpen(false);
          return;
        }
        if (responseRef.current || activeRequest.current) {
          dismissResponse();
          return;
        }
        respondToPermission(false);
        void stopSpeech();
        if (!commandOpen && !settingsOpen && activeRequest.current) {
          window.nexus.cancel(activeRequest.current);
        }
        setCommandOpen(false);
        setModelSwitcherOpen(false);
        setSettingsOpen(false);
        setHistoryOpen(false);
        setViewedConversation(null);
        return;
      }
      if (shortcutMatches(event, shortcuts.composer)) {
        event.preventDefault();
        setModelSwitcherOpen(false);
        setCommandOpen(true);
        setHistoryOpen(false);
      } else if (shortcutMatches(event, shortcuts.history)) {
        event.preventDefault();
        setCommandOpen(false);
        setModelSwitcherOpen(false);
        setSettingsOpen(false);
        setHistoryOpen((current) => !current);
      } else if (shortcutMatches(event, shortcuts.models)) {
        event.preventDefault();
        setCommandOpen(false);
        setSettingsOpen(false);
        setHistoryOpen(false);
        setModelSwitcherOpen(true);
      } else if (shortcutMatches(event, shortcuts.settings)) {
        event.preventDefault();
        setCommandOpen(false);
        setModelSwitcherOpen(false);
        setHistoryOpen(false);
        setSettingsOpen(true);
      } else if (privacyShortcut) {
        event.preventDefault();
        togglePrivacyMode();
      } else if (event.key.toLowerCase() === 'v' && !typing && !commandOpen && !modelSwitcherOpen && !settingsOpen && !historyOpen && !viewedConversation && !event.repeat) {
        event.preventDefault();
        toggleVoiceAccess();
      } else if (shortcutMatches(event, shortcuts.voice)
        && canActivateVoiceShortcut(
          typing,
          composerVisible,
          modelSwitcherOpen,
          settingsOpen,
          historyOpen || Boolean(viewedConversation),
          event.repeat
        )) {
        event.preventDefault();
        toggleVoice();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeConversationView, commandOpen, dismissResponse, historyOpen, modelSwitcherOpen, privacyMode, respondToPermission, settingsOpen, stopSpeech, togglePrivacyMode, toggleVoice, toggleVoiceAccess, viewedConversation]);

  return {
    state,
    logs,
    steps,
    transcript,
    response,
    previousResponse,
    artifacts,
    permission,
    respondToPermission,
    fatalError,
    trainingSaved,
    generating,
    bargeInListening,
    queuedVoicePrompt,
    settings,
    models,
    hardware,
    managedRuntime,
    remoteInference,
    runtimePreparing,
    commandOpen,
    modelSwitcherOpen,
    settingsOpen,
    historyOpen,
    workspace,
    conversationHistory,
    viewedConversation,
    currentConversationId: currentConversationId.current,
    voiceEnabled,
    privacyMode,
    interfacePreferences,
    audioLevel,
    voiceNotice,
    audioBus: voice.bus,
    toggleVoice,
    toggleVoiceAccess,
    togglePrivacyMode,
    submit,
    regenerateResponse,
    continueResponse,
    stopResponse,
    dismissResponse,
    detectModels,
    saveSettings,
    selectWorkspace,
    clearWorkspace,
    setApprovalMode,
    selectActiveModel,
    approveForTraining,
    exportPersonalData,
    importPersonalData,
    saveUiPreferences,
    openConversation,
    startNewConversation,
    deleteConversation,
    steerConversation,
    deleteConversationFrom,
    closeConversationView,
    setCommandOpen,
    setModelSwitcherOpen,
    setSettingsOpen,
    setHistoryOpen
  };
  // #endregion
}
