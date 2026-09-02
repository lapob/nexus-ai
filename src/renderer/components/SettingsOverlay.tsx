/**
 * @module renderer/components/SettingsOverlay
 * @description Centro impostazioni per voce, interfaccia, prestazioni e intelligenza NexusNXS.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type {
  HardwareProfile,
  InterfacePreferences,
  ModelDescriptor,
  NexusSettings,
  RemoteSessionStatus,
  UpdateStatus,
  WorkspaceContext,
} from '../types/nexus';
import { DEFAULT_INTERFACE_PREFERENCES } from '../systems/InterfacePreferences';
import { publicUiError } from '../systems/PublicError';
import { uiCopy } from '../systems/Localization';
import { VoiceRecognition } from '../systems/VoiceRecognition';
import { modelDisplayName, uniquePresentedModels } from '../systems/ModelPresentation';
import { NexusSelect } from './NexusSelect';
import { QuietClose } from './QuietClose';

// #region 01 — Contratti, dispositivi e test microfono

interface SettingsOverlayProps {
  open: boolean;
  settings: NexusSettings | null;
  preferences: InterfacePreferences;
  hardware: HardwareProfile | null;
  models: ModelDescriptor[];
  remoteInference?: boolean;
  onClose: () => void;
  onSave: (settings: Partial<NexusSettings>) => Promise<void>;
  onSavePreferences: (preferences: InterfacePreferences) => void;
  onExportPersonalData: (passphrase: string) => Promise<'saved' | 'cancelled'>;
  onImportPersonalData: (passphrase: string) => Promise<'imported' | 'cancelled'>;
}

type SettingsTab = 'audio' | 'appearance' | 'ai' | 'connections' | 'shortcuts' | 'permissions' | 'data' | 'updates' | 'remote';
interface SettingsSection {
  value: SettingsTab;
  label: string;
  detail: string;
  title: string;
  description: string;
  keywords: string;
}
type MicrophoneTestPhase = 'idle' | 'listening' | 'analyzing' | 'success' | 'silent' | 'error';
interface MicrophoneReport {
  quality: number;
  environment: 'Silenzioso' | 'Bilanciato' | 'Rumoroso' | 'Voce distante' | 'Segnale troppo forte';
  noise: number;
  voice: number;
  clipping: number;
  recommendation: string;
}

function deviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label || `Microfono ${index + 1}`;
}

function selectableMicrophones(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  // "default" e "communications" sono alias di Windows, non dispositivi SDL:
  // escluderli mantiene allineato l'indice passato al backend whisper.cpp.
  return devices.filter((device) => !['default', 'communications'].includes(device.deviceId));
}

function friendlyPairingUrls(urls: string[] = []): string[] {
  let meshAdded = false;
  let homeAdded = false;
  return urls.filter((url) => {
    const mesh = /\/\/100\.|\.ts\.net(?:\/|$)/i.test(url);
    if (mesh && !meshAdded) { meshAdded = true; return true; }
    if (!mesh && !homeAdded) { homeAdded = true; return true; }
    return false;
  });
}

function microphoneTestError(error: unknown): string {
  const name = String((error as { name?: unknown } | null)?.name || '');
  const detail = `${name} ${String((error as { message?: unknown } | null)?.message || error || '')}`;
  if (/notallowed|permission|denied|security/i.test(detail)) {
    return 'Accesso al microfono negato. Abilita NEXUSNXS in Windows → Privacy e sicurezza → Microfono.';
  }
  if (/notfound|overconstrained|requested device|device.*not found/i.test(detail)) {
    return 'Il microfono selezionato non è più disponibile. Seleziona Automatico oppure ricollega il dispositivo.';
  }
  if (/notreadable|trackstart|could not start|device.*busy|aborterror/i.test(detail)) {
    return 'Il microfono è occupato o non risponde. Chiudi le altre app audio e riprova con Automatico.';
  }
  return publicUiError(error, 'Il dispositivo audio non ha risposto. Prova Automatico o ricollega il microfono.');
}

async function enumerateMicrophones(requestPermission = false): Promise<MediaDeviceInfo[]> {
  let permissionStream: MediaStream | null = null;
  try {
    // I browser oscurano i nomi prima del consenso: il flusso viene aperto
    // soltanto per ottenere l'elenco e viene chiuso immediatamente.
    if (requestPermission) permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  } finally {
    permissionStream?.getTracks().forEach((track) => track.stop());
  }
}

// #endregion

// #region 02 — Centro impostazioni

export function SettingsOverlay(props: SettingsOverlayProps) {
  const {
    open, settings, preferences, hardware, models, remoteInference = false, onClose, onSave, onSavePreferences,
    onExportPersonalData, onImportPersonalData
  } = props;
  const labels = uiCopy(preferences.locale);
  const [tab, setTab] = useState<SettingsTab>('audio');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [draft, setDraft] = useState<NexusSettings | null>(settings);
  const [uiDraft, setUiDraft] = useState(preferences);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [expressiveAvailable, setExpressiveAvailable] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [microphoneTestPhase, setMicrophoneTestPhase] = useState<MicrophoneTestPhase>('idle');
  const [microphoneTestSeconds, setMicrophoneTestSeconds] = useState(0);
  const [microphoneReport, setMicrophoneReport] = useState<MicrophoneReport | null>(null);
  const [trainingStats, setTrainingStats] = useState<{ examples: number; approved: number; quarantined: number; corrected: number; preferencePairs: number; domains: Record<string, number>; evaluationExamples: number; evaluationReady: boolean; nextMilestone: number; memories?: number } | null>(null);
  const [trainingEvaluation, setTrainingEvaluation] = useState<{ examples: number; readiness: number; diversity: number; correctionCoverage: number; averagePromptTokens: number; status: 'ready' | 'growing' | 'early' } | null>(null);
  const [memories, setMemories] = useState<Array<{ id: number; type: string; content: string; updatedAt: number; expiresAt?: number | null }>>([]);
  const [responseCache, setResponseCache] = useState<{ entries: number; hits: number }>({ entries: 0, hits: 0 });
  const [confirmTrainingClear, setConfirmTrainingClear] = useState(false);
  const [actionHistory, setActionHistory] = useState<Array<{ timestamp: string; event: string; tool: string; preview?: string }>>([]);
  const [localIntegrations, setLocalIntegrations] = useState<Array<{ id: string; label: string }>>([]);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<RemoteSessionStatus | null>(null);
  const [startupStatus, setStartupStatus] = useState<{ available: boolean; enabled: boolean }>({ available: false, enabled: false });
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: number; urls?: string[] } | null>(null);
  const [pairingUrl, setPairingUrl] = useState('');
  const [pairingQr, setPairingQr] = useState('');
  const [pairingOpen, setPairingOpen] = useState(false);
  const [healthCheck, setHealthCheck] = useState<'idle' | 'running' | 'ready' | 'attention'>('idle');
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [settingsScrolled, setSettingsScrolled] = useState(false);

  useEffect(() => {
    const openRequestedTab = (event: Event) => {
      const requested = (event as CustomEvent<SettingsTab>).detail;
      if (requested && ['audio', 'appearance', 'ai', 'connections', 'shortcuts', 'permissions', 'data', 'updates', 'remote'].includes(requested)) {
        setTab(requested);
        setSettingsQuery('');
        requestAnimationFrame(() => settingsContent.current?.scrollTo({ top: 0 }));
      }
    };
    window.addEventListener('nexus:open-settings-tab', openRequestedTab);
    return () => window.removeEventListener('nexus:open-settings-tab', openRequestedTab);
  }, []);

  const settingsSections: SettingsSection[] = [
    {
      value: 'audio', label: labels.voice,
      detail: 'Microfono, riconoscimento e sintesi',
      title: 'Voce, ascolto e conversazione naturale',
      description: 'Configura il microfono, verifica la qualità della voce e scegli come NexusNXS ascolta, pronuncia e risponde.',
      keywords: 'audio microfono voce ascolto riconoscimento trascrizione sintesi kokoro sensibilità parole richiamo nexus wake word offline'
    },
    {
      value: 'appearance', label: labels.appearance,
      detail: 'Visualizer, qualità e accessibilità',
      title: 'Aspetto, movimento e qualità visiva',
      description: 'Personalizza il NexusNXS Core e lascia che fluidità, nitidezza e gamma dinamica si adattino al computer e al display.',
      keywords: 'aspetto grafica visualizer qualità hdr movimento animazioni particelle compatta prestazioni'
    },
    {
      value: 'ai', label: labels.intelligence,
      detail: 'Modelli, identità e collaborazione',
      title: 'Modelli, intelligenza e stile delle risposte',
      description: 'Definisci il modo in cui NexusNXS ti conosce, comunica con te e adatta profondità, tono e presenza alla conversazione.',
      keywords: 'intelligenza modelli risposta identità nome stile interessi istruzioni personale naturale'
    },
    {
      value: 'permissions', label: labels.permissions,
      detail: 'Autonomia, conferme e attività',
      title: 'Permessi, strumenti e controllo delle azioni',
      description: 'Scegli quanta autonomia concedere a NexusNXS, quando deve chiedere conferma e quali attività locali può svolgere.',
      keywords: 'permessi autorizzazioni autonomia accesso completo conferma azioni strumenti integrazioni attività sicurezza'
    },
    {
      value: 'connections', label: 'Funzioni',
      detail: 'Git, Computer Use e plugin',
      title: 'Strumenti e connessioni',
      description: 'Collega un progetto, controlla le capacità operative e scopri le integrazioni disponibili senza esporre dettagli tecnici.',
      keywords: 'git repository cartella computer use plugin integrazioni strumenti progetto'
    },
    {
      value: 'shortcuts', label: 'Scorciatoie',
      detail: 'Tastiera e accesso rapido',
      title: 'Scorciatoie da tastiera',
      description: 'Personalizza i comandi principali mantenendo combinazioni semplici, coerenti e accessibili.',
      keywords: 'scorciatoie tastiera shortcut tasti spazio ctrl comandi'
    },
    {
      value: 'data', label: labels.data,
      detail: 'Memoria, knowledge e backup',
      title: 'Memoria, conoscenza e dati personali',
      description: 'Gestisci ciò che NexusNXS ricorda, aggiorna la conoscenza locale e proteggi cronologia e preferenze con backup cifrati.',
      keywords: 'dati memoria knowledge conoscenza cronologia archivio backup esporta importa privacy cancella'
    },
    {
      value: 'remote', label: labels.remote,
      detail: 'Telefono, continuità e avvio',
      title: 'Dispositivi, continuità e accesso remoto',
      description: 'Collega in modo privato i tuoi dispositivi e mantieni NexusNXS disponibile quando il computer viene acceso.',
      keywords: 'remoto telefono dispositivi qr collegamento tailscale avvio windows continuità accesso'
    },
    {
      value: 'updates', label: 'Aggiornamenti',
      detail: 'Versione, canale e novità',
      title: 'Aggiornamenti affidabili e discreti',
      description: 'Controlla la versione installata e applica gli aggiornamenti firmati quando preferisci.',
      keywords: 'aggiornamenti versione update stabile beta novità riavvio'
    }
  ];
  const normalizedSettingsQuery = settingsQuery.trim().toLocaleLowerCase();
  const visibleSettingsSections = normalizedSettingsQuery
    ? settingsSections.filter((section) => `${section.label} ${section.detail} ${section.title} ${section.keywords}`.toLocaleLowerCase().includes(normalizedSettingsQuery))
    : settingsSections;
  const activeSection = settingsSections.find((section) => section.value === tab) || settingsSections[0];

  useEffect(() => {
    if (!normalizedSettingsQuery) return;
    const target = settingsSections.find((section) => `${section.label} ${section.detail} ${section.title} ${section.keywords}`
      .toLocaleLowerCase().includes(normalizedSettingsQuery));
    if (target && target.value !== tab) {
      setTab(target.value);
      setMessage(`Aperta la sezione ${target.label}.`);
      requestAnimationFrame(() => settingsContent.current?.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  // La query è il solo evento che deve spostare automaticamente la sezione.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSettingsQuery]);
  const selectableModels = uniquePresentedModels(models
    .filter((model) => model.capabilities?.chat !== false)
    .filter((model) => !/^nexus-nexus-personal(?::|$)/i.test(model.id)), draft?.chatModel || draft?.model || '');
  const [remoteBaseUrl, setRemoteBaseUrl] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const settingsContent = useRef<HTMLDivElement>(null);
  const microphoneTest = useRef<{
    voice: VoiceRecognition;
    frame: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    window.nexus.updateStatus().then(setUpdateStatus).catch(() => {});
    const stopUpdates = window.nexus.onUpdateEvent(setUpdateStatus);
    const frame = requestAnimationFrame(() => settingsContent.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    }));
    return () => { cancelAnimationFrame(frame); stopUpdates(); };
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    // Le versioni precedenti potevano lasciare la finestra nella vecchia
    // modalità compatta. Il centro impostazioni ripristina sempre una
    // superficie leggibile prima di mostrare i contenuti.
    void window.nexus.setCompactWindow(false);
    setDraft(settings);
    setUiDraft(preferences);
    setMessage('');
    setMicrophoneReport(null);
    setDiscardConfirmation(false);
    closeButton.current?.focus();
    const syncMicrophones = () => enumerateMicrophones(true).then((devices) => {
      setMicrophones(devices);
      setUiDraft((current) => {
        if (current.microphoneId === 'default' || devices.some((device) => device.deviceId === current.microphoneId)) return current;
        setMessage('Il microfono salvato non è più presente: ho ripristinato Automatico.');
        return { ...current, microphoneId: 'default', microphoneCaptureId: -1 };
      });
    }).catch((error) => {
      setMicrophones([]);
      setMessage(microphoneTestError(error));
    });
    void syncMicrophones();
    const refreshVoices = () => setSpeechVoices(window.speechSynthesis?.getVoices()
      .sort((left, right) => left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name)) || []);
    refreshVoices();
    window.nexus.neuralVoiceCapabilities()
      .then((capabilities) => {
        const expressive = Boolean(capabilities.engines?.expressive?.available);
        setExpressiveAvailable(expressive);
        if (!expressive) setUiDraft((current) => current.voiceEngine === 'expressive'
          ? { ...current, voiceEngine: 'neural' }
          : current);
      })
      .catch(() => setExpressiveAvailable(false));
    window.nexus.trainingStats().then(setTrainingStats).catch(() => setTrainingStats(null));
    window.nexus.trainingEvaluation().then(setTrainingEvaluation).catch(() => setTrainingEvaluation(null));
    window.nexus.listMemories().then(setMemories).catch(() => setMemories([]));
    window.nexus.responseCacheStats().then(setResponseCache).catch(() => setResponseCache({ entries: 0, hits: 0 }));
    window.nexus.actionHistory().then(setActionHistory).catch(() => setActionHistory([]));
    window.nexus.listAgentCapabilities()
      .then((capabilities) => setLocalIntegrations(capabilities.applications))
      .catch(() => setLocalIntegrations([]));
    window.nexus.getWorkspace().then(setWorkspace).catch(() => setWorkspace(null));
    window.nexus.remoteStatus().then(setRemoteStatus).catch(() => setRemoteStatus(null));
    window.nexus.startupStatus().then(setStartupStatus).catch(() => setStartupStatus({ available: false, enabled: false }));
    window.speechSynthesis?.addEventListener('voiceschanged', refreshVoices);
    navigator.mediaDevices?.addEventListener('devicechange', syncMicrophones);
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoices);
      navigator.mediaDevices?.removeEventListener('devicechange', syncMicrophones);
    };
  }, [open, preferences, settings]);

  useEffect(() => () => {
    if (!microphoneTest.current) return;
    cancelAnimationFrame(microphoneTest.current.frame);
    microphoneTest.current.voice.stop().catch(() => {});
    microphoneTest.current = null;
  }, []);

  useEffect(() => {
    const fallbackBase = remoteStatus?.publicUrl || (remoteStatus?.allowLan
      ? remoteStatus.addresses?.[0]
      : remoteStatus?.localUrl);
    const url = (pairingCode && remoteBaseUrl ? `${remoteBaseUrl.replace(/\/$/, '')}/#pair=${pairingCode.code}&device=Telefono` : '')
      || friendlyPairingUrls(pairingCode?.urls)[0]
      || (pairingCode && fallbackBase ? `${fallbackBase}/#pair=${pairingCode.code}&device=Telefono` : '');
    setPairingUrl(url);
  }, [pairingCode, remoteStatus, remoteBaseUrl]);

  useEffect(() => {
    let current = true;
    if (!pairingUrl) { setPairingQr(''); return () => { current = false; }; }
    const parsed = new URL(pairingUrl);
    const code = new URLSearchParams(parsed.hash.slice(1)).get('pair') || pairingCode?.code || '';
    const server = `${parsed.protocol}//${parsed.host}`;
    // Schema dedicato: la fotocamera consegna il QR soltanto all'app NexusNXS,
    // evitando browser, pagine intermedie e selettori ambigui.
    const qrPayload = `nexus://remote?pair=${encodeURIComponent(code)}&server=${encodeURIComponent(server)}`;
    QRCode.toDataURL(qrPayload, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#A8F4F4', light: '#031010' }
    }).then((url) => { if (current) setPairingQr(url); }).catch(() => { if (current) setPairingQr(''); });
    return () => { current = false; };
  }, [pairingCode?.code, pairingUrl]);

  useEffect(() => {
    if (pairingCode && pairingCode.expiresAt > Date.now()) setPairingOpen(true);
  }, [pairingCode]);

  useEffect(() => {
    if (open || !microphoneTest.current) return;
    cancelAnimationFrame(microphoneTest.current.frame);
    microphoneTest.current.voice.stop().catch(() => {});
    microphoneTest.current = null;
    setMicrophoneLevel(0);
    setMicrophoneTestPhase('idle');
    setMicrophoneTestSeconds(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const startPairing = () => { void connectRemoteDevice(); };
    window.addEventListener('nexus:start-pairing', startPairing);
    return () => window.removeEventListener('nexus:start-pairing', startPairing);
  });

  if (!draft) return null;
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(settings)
    || JSON.stringify(uiDraft) !== JSON.stringify(preferences);
  const requestClose = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    setDiscardConfirmation(true);
  };

  const connectRemoteDevice = async () => {
    setBusy(true);
    try {
      if (remoteStatus?.running) {
        setPairingCode(await window.nexus.createRemotePairing());
        setMessage('Collegamento pronto. Inquadra il QR con il telefono.');
        return;
      }
      const result = await window.nexus.setupRemoteAccess('away');
      if (result.url) setRemoteBaseUrl(result.url);
      if (result.status === 'ready') {
        const nextStatus = await window.nexus.remoteStatus();
        setRemoteStatus(nextStatus);
        setPairingCode(await window.nexus.createRemotePairing());
        setMessage('Collegamento pronto. Inquadra il QR con il telefono.');
        return;
      }
      setMessage(result.status === 'install-required'
        ? 'Installa Tailscale sul computer e sul telefono, accedi con lo stesso account e riprova.'
        : result.status === 'authorization-required'
          ? 'Completa l’autorizzazione nella pagina appena aperta, quindi premi di nuovo Collega dispositivo.'
          : 'Collegamento non completato. Controlla che Tailscale sia connesso e riprova.');
    } catch (error) {
      setMessage(publicUiError(error, 'Collegamento non completato. Riprova.'));
    } finally {
      setBusy(false);
    }
  };

  const previewSystemVoice = async () => {
    const preferredLanguage = (navigator.language || 'it-IT').split('-')[0].toLowerCase();
    const genderPattern = uiDraft.voiceGender === 'male' ? /cosimo|diego|male/i : /elsa|isabella|female/i;
    const selected = speechVoices.find((voice) => voice.name === uiDraft.voiceName)
      || speechVoices.find((voice) => voice.lang.toLowerCase().startsWith(preferredLanguage) && genderPattern.test(voice.name))
      || speechVoices.find((voice) => voice.lang.toLowerCase().startsWith(preferredLanguage) && voice.localService)
      || speechVoices.find((voice) => voice.lang.toLowerCase().startsWith(preferredLanguage))
      || speechVoices[0];
    const language = selected?.lang || navigator.language || 'it-IT';
    const phrase = language.toLowerCase().startsWith('en') ? 'Hello, I am NexusNXS. How can I help you?'
      : language.toLowerCase().startsWith('es') ? 'Hola, soy NexusNXS. ¿Cómo puedo ayudarte?'
        : language.toLowerCase().startsWith('fr') ? 'Bonjour, je suis NexusNXS. Comment puis-je vous aider ?'
          : language.toLowerCase().startsWith('de') ? 'Hallo, ich bin NexusNXS. Wie kann ich helfen?'
            : 'Ciao, sono NEXUSNXS. Come posso aiutarti?';
    const sample = new SpeechSynthesisUtterance(phrase);
    sample.lang = language;
    sample.rate = 0.96;
    sample.pitch = uiDraft.voiceGender === 'male' ? 0.96 : 1.02;
    sample.voice = selected
      || null;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.speechSynthesis.cancel();
        reject(new Error('La voce di Windows non ha risposto.'));
      }, 12_000);
      sample.onend = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      sample.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.error === 'canceled' ? 'Anteprima interrotta.' : 'Voce di Windows non disponibile.'));
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(sample);
    });
  };

  const calibrateMicrophone = async () => {
    setBusy(true);
    setMessage('Parla con voce naturale per circa dieci secondi…');
    setMicrophoneLevel(0);
    setMicrophoneTestPhase('listening');
    setMicrophoneTestSeconds(10);
    setMicrophoneReport(null);
    let voice: VoiceRecognition | null = null;
    let observedPeak = 0;
    try {
      voice = new VoiceRecognition();
      await voice.start(uiDraft.microphoneId, uiDraft.audioSensitivity);
      let peak = 0;
      const levels: number[] = [];
      const speechScores: number[] = [];
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        const sample = () => {
          const activity = voice!.activity();
          peak = Math.max(peak, activity.level);
          observedPeak = peak;
          if (activity.calibrated) {
            levels.push(activity.level);
            speechScores.push(activity.speech);
          }
          setMicrophoneLevel(activity.level);
          const elapsed = performance.now() - startedAt;
          setMicrophoneTestSeconds(Math.max(0, Math.ceil((9_000 - elapsed) / 1000)));
          if (elapsed >= 9_000) {
            resolve();
            return;
          }
          const frame = requestAnimationFrame(sample);
          microphoneTest.current = { voice: voice!, frame };
        };
        sample();
      });
      const audio = await voice.finishRecording();
      microphoneTest.current = null;
      setMicrophoneTestPhase('analyzing');
      setMicrophoneTestSeconds(0);
      setMessage('Analizzo la frase con lo stesso motore usato da NEXUSNXS…');
      const transcription = await window.nexus.transcribeVoiceAudio(audio);
      if (transcription.error) throw new Error(transcription.error);
      const recognized = String(transcription.text || '').trim();
      const quietSamples = levels.filter((_, index) => (speechScores[index] || 0) < 0.18);
      const voiceSamples = levels.filter((_, index) => (speechScores[index] || 0) >= 0.32);
      const average = (values: number[]) => values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
      const noise = average(quietSamples);
      const voiceLevel = average(voiceSamples);
      const clipping = levels.length ? levels.filter((level) => level > 0.9).length / levels.length : 0;
      const signalGap = Math.max(0, voiceLevel - noise);
      const sensitivity = peak < 0.16 || signalGap < 0.09 ? 1.35
        : peak < 0.3 || signalGap < 0.16 ? 1.2
          : peak > 0.82 || clipping > 0.05 ? 0.85
            : 1;
      const environment: MicrophoneReport['environment'] = clipping > 0.05 || peak > 0.94
        ? 'Segnale troppo forte'
        : noise > 0.14
          ? 'Rumoroso'
          : voiceLevel > 0 && voiceLevel < 0.2
            ? 'Voce distante'
            : noise < 0.055
              ? 'Silenzioso'
              : 'Bilanciato';
      const quality = Math.round(Math.max(0, Math.min(100,
        (recognized ? 52 : 12)
        + Math.min(28, signalGap * 110)
        + Math.max(0, 14 - noise * 55)
        - clipping * 90
      )));
      const recommendation = environment === 'Segnale troppo forte'
        ? 'Allontana leggermente il microfono o riduci il guadagno di Windows.'
        : environment === 'Rumoroso'
          ? 'Riduci il rumore ambientale o usa un microfono più direzionale.'
          : environment === 'Voce distante'
            ? 'Avvicina il microfono e parla verso la capsula.'
            : quality >= 78
              ? 'Configurazione adatta: non servono modifiche.'
              : 'Parla con ritmo naturale e lascia un breve silenzio iniziale.';
      setMicrophoneReport({ quality, environment, noise, voice: voiceLevel, clipping, recommendation });
      setUiDraft((current) => ({ ...current, audioSensitivity: sensitivity }));
      setMessage(!recognized
        ? 'Il microfono funziona, ma non ho riconosciuto parole. Avvicinati e riprova parlando per tutta la prova.'
        : `Prova riuscita · ho riconosciuto: “${recognized}” · sensibilità ${Math.round(sensitivity * 100)}%`);
      setMicrophoneTestPhase(recognized ? 'success' : 'error');
      setMicrophones(await enumerateMicrophones());
    } catch (error) {
      const silent = observedPeak < 0.025;
      setMessage(silent
        ? 'Microfono disponibile, ma durante la prova non è stata rilevata una voce. Parla normalmente e riprova.'
        : microphoneTestError(error));
      setMicrophoneTestPhase(silent ? 'silent' : 'error');
    } finally {
      if (voice) await voice.stop().catch(() => {});
      microphoneTest.current = null;
      setBusy(false);
    }
  };

  const saveAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      // Le impostazioni AI vengono validate dal processo principale prima di
      // rendere persistenti quelle locali: un errore non lascia un salvataggio
      // parziale difficile da comprendere.
      await onSave(draft);
      onSavePreferences(uiDraft);
    } catch (error) {
      setMessage(publicUiError(error, 'Salvataggio non riuscito.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="settings-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (discardConfirmation) setDiscardConfirmation(false);
            else requestClose();
          }}
        >
          <motion.section
            className="settings-overlay settings-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="sr-only" id="settings-title">{labels.settings} NEXUSNXS</h2>
            <QuietClose ref={closeButton} className="settings-close" onClick={requestClose} label={labels.settings} />

            <div
              className="settings-content"
              ref={settingsContent}
              data-scrolled={settingsScrolled}
              onScroll={(event) => setSettingsScrolled(event.currentTarget.scrollTop > 10)}
            >
              <i className="settings-scroll-blur settings-scroll-blur-top" aria-hidden="true" />
              <div className="settings-navigation">
                <div className="settings-navigation-heading" aria-hidden="true">
                  <strong>{labels.settings}</strong>
                  <small>Preferenze di NexusNXS</small>
                </div>
                <label className="settings-search">
                  <span className="sr-only">Cerca nelle impostazioni</span>
                  <i aria-hidden="true" />
                  <input
                    type="search"
                    value={settingsQuery}
                    onChange={(event) => setSettingsQuery(event.target.value)}
                    placeholder="Cerca impostazioni"
                    autoComplete="off"
                  />
                  {settingsQuery && <button type="button" aria-label="Cancella ricerca" onClick={() => setSettingsQuery('')}>×</button>}
                </label>
                <div
                  className="settings-tabs"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-label="Sezioni impostazioni"
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
                    const next = event.key === 'Home' ? 0
                      : event.key === 'End' ? tabs.length - 1
                        : event.key === 'ArrowDown' ? (current + 1) % tabs.length
                          : (current - 1 + tabs.length) % tabs.length;
                    event.preventDefault();
                    tabs[next]?.focus();
                    tabs[next]?.click();
                  }}
                >
                  {visibleSettingsSections.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      id={`settings-tab-${item.value}`}
                      aria-controls={`settings-panel-${item.value}`}
                      aria-selected={tab === item.value}
                      tabIndex={tab === item.value ? 0 : -1}
                      onClick={() => {
                        setTab(item.value as SettingsTab);
                        setMessage('');
                        settingsContent.current?.scrollTo({ top: 0, behavior: 'auto' });
                      }}
                    >
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </button>
                  ))}
                  {visibleSettingsSections.length === 0 && (
                    <p className="settings-search-empty">Nessuna impostazione trovata</p>
                  )}
                </div>
              </div>
              {tab === 'audio' && (
                <div className="settings-panel" id="settings-panel-audio" role="tabpanel" aria-labelledby="settings-tab-audio">
                  <div className="settings-section-copy settings-page-intro settings-wide">
                    <span>Voce</span>
                    <strong>{activeSection.title}</strong>
                    <p>{activeSection.description}</p>
                  </div>
                  <div className="settings-subsection-title settings-wide"><strong>Ingresso e rilevamento</strong><small>Audio e trascrizione restano sul computer.</small></div>
                  <label className="settings-field settings-wide microphone-select-field">
                    <span>Microfono</span>
                    <NexusSelect
                      ariaLabel="Microfono"
                      value={uiDraft.microphoneId}
                      options={[
                        { value: 'default', label: 'Automatico', detail: 'Segue il dispositivo predefinito di Windows' },
                        ...selectableMicrophones(microphones).map((device, index) => ({
                          value: device.deviceId,
                          label: deviceLabel(device, index),
                          detail: 'Ingresso audio locale'
                        }))
                      ]}
                      onValueChange={(microphoneId) => setUiDraft({
                        ...uiDraft,
                        microphoneId,
                        // L'indice SDL viene risolto dinamicamente per nome
                        // al momento dell'ascolto, anche dopo hot-plug.
                        microphoneCaptureId: -1
                      })}
                    />
                    <small>Automatico è consigliato e segue i cambi di dispositivo del sistema.</small>
                  </label>
                  <div className="microphone-actions">
                    <button className="settings-secondary settings-test-microphone" type="button" disabled={busy} onClick={calibrateMicrophone}>
                      {busy ? 'Ascolto…' : 'Prova microfono'}
                    </button>
                    <div className="microphone-test-indicator" data-state={microphoneTestPhase} role="meter" aria-label="Livello del microfono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(microphoneLevel * 100)}>
                      <i aria-hidden="true" />
                      <div className="microphone-test-wave" aria-hidden="true">
                        {Array.from({ length: 11 }, (_, index) => (
                          <span
                            key={index}
                            style={{ transform: `scaleY(${Math.max(0.14, Math.min(1, microphoneLevel * (1.6 + ((index % 5) * 0.34))))})` }}
                          />
                        ))}
                      </div>
                      <small>
                        {microphoneTestPhase === 'listening' ? `Ti ascolto${microphoneTestSeconds ? ` · ${microphoneTestSeconds}s` : ''}`
                          : microphoneTestPhase === 'analyzing' ? 'Analisi della voce'
                            : microphoneTestPhase === 'success' ? 'Ingresso verificato'
                              : microphoneTestPhase === 'silent' ? 'Nessuna voce rilevata'
                              : microphoneTestPhase === 'error' ? 'Prova da ripetere'
                                : 'Pronto per la prova'}
                      </small>
                    </div>
                  </div>
                  {microphoneReport && (
                    <div className="microphone-report settings-wide" data-quality={microphoneReport.quality >= 78 ? 'good' : microphoneReport.quality >= 52 ? 'fair' : 'poor'}>
                      <div className="microphone-report-score">
                        <strong>{microphoneReport.quality >= 78 ? 'Ottimo' : microphoneReport.quality >= 52 ? 'Buono' : 'Da migliorare'}</strong>
                        <span>ascolto</span>
                      </div>
                      <div className="microphone-report-copy">
                        <strong>{microphoneReport.environment}</strong>
                        <small>{microphoneReport.recommendation}</small>
                      </div>
                    </div>
                  )}
                  <label className="settings-field">
                    <span>Sensibilità visualizer <output>{Math.round(uiDraft.audioSensitivity * 100)}%</output></span>
                    <input
                      type="range"
                      min="0.7"
                      max="1.35"
                      step="0.05"
                      value={uiDraft.audioSensitivity}
                      onChange={(event) => setUiDraft({ ...uiDraft, audioSensitivity: Number(event.target.value) })}
                    />
                    <small>Regola la risposta grafica, non il volume registrato.</small>
                  </label>
                  <label className="settings-switch settings-wide">
                    <input
                      type="checkbox"
                      checked={uiDraft.wakeWordEnabled}
                      onChange={(event) => setUiDraft({ ...uiDraft, wakeWordEnabled: event.target.checked })}
                    />
                    <span>
                      <strong>Richiamo “Nexus”</strong>
                      <small>Opzionale e disattivato all’installazione. Windows riconosce solo “Nexus” e “Hey Nexus”, offline; la Presence si materializza al centro per ascolto, ragionamento e risposta senza aprire l’interfaccia completa.</small>
                    </span>
                  </label>
                  {uiDraft.wakeWordEnabled && (
                    <>
                      <label className="settings-field">
                        <span>Precisione del richiamo</span>
                        <NexusSelect
                          ariaLabel="Precisione del richiamo vocale"
                          value={String(uiDraft.wakeWordConfidence)}
                          options={[
                            { value: '0.78', label: 'Sensibile', detail: 'Per ambienti silenziosi' },
                            { value: '0.84', label: 'Bilanciata', detail: 'Consigliata' },
                            { value: '0.9', label: 'Selettiva', detail: 'Riduce le attivazioni involontarie' }
                          ]}
                          onValueChange={(value) => setUiDraft({ ...uiDraft, wakeWordConfidence: Number(value) })}
                        />
                      </label>
                      <label className="settings-field">
                        <span>Pausa tra i richiami</span>
                        <NexusSelect
                          ariaLabel="Pausa tra i richiami vocali"
                          value={String(uiDraft.wakeWordCooldownMs)}
                          options={[
                            { value: '3000', label: '3 secondi', detail: 'Rapida' },
                            { value: '5000', label: '5 secondi', detail: 'Consigliata' },
                            { value: '10000', label: '10 secondi', detail: 'Più protettiva' }
                          ]}
                          onValueChange={(value) => setUiDraft({ ...uiDraft, wakeWordCooldownMs: Number(value) })}
                        />
                      </label>
                    </>
                  )}
                  <label className="settings-switch settings-wide">
                    <input
                      type="checkbox"
                      checked={uiDraft.voiceOutputEnabled}
                      onChange={(event) => setUiDraft({ ...uiDraft, voiceOutputEnabled: event.target.checked })}
                    />
                    <span>
                      <strong>Risposte vocali</strong>
                      <small>NEXUSNXS risponde con la voce naturale locale scelta qui sotto.</small>
                    </span>
                  </label>
                  <section className="voice-profile-section settings-wide" aria-labelledby="voice-style-title">
                    <div className="voice-profile-heading">
                      <span><strong id="voice-style-title">Stile della voce</strong><small>La voce viene generata localmente e resta privata.</small></span>
                      <i aria-hidden="true" />
                    </div>
                    <div className="voice-choice-grid" role="radiogroup" aria-label="Qualità della voce">
                      <button type="button" role="radio" aria-checked={uiDraft.voiceEngine === 'neural'} data-selected={uiDraft.voiceEngine === 'neural'} onClick={() => setUiDraft({ ...uiDraft, voiceEngine: 'neural' })}>
                        <span className="voice-choice-icon voice-choice-icon--natural" aria-hidden="true"><i /><i /></span>
                        <span><strong>Naturale</strong><small>Più morbida e adatta al dialogo</small></span>
                        <em>Qualità</em>
                      </button>
                      {expressiveAvailable && (
                        <button type="button" role="radio" aria-checked={uiDraft.voiceEngine === 'expressive'} data-selected={uiDraft.voiceEngine === 'expressive'} onClick={() => setUiDraft({ ...uiDraft, voiceEngine: 'expressive' })}>
                          <span className="voice-choice-icon" aria-hidden="true">≈</span>
                          <span><strong>Espressiva</strong><small>Timbro più ricco e umano</small></span>
                          <em>Qualità massima</em>
                        </button>
                      )}
                    </div>
                    <div className="voice-gender-control" role="radiogroup" aria-label="Profilo della voce">
                      <span>Profilo</span>
                      <div>
                        <button type="button" role="radio" aria-checked={uiDraft.voiceGender === 'male'} data-selected={uiDraft.voiceGender === 'male'} onClick={() => setUiDraft({ ...uiDraft, voiceGender: 'male' })}>Maschile</button>
                        <button type="button" role="radio" aria-checked={uiDraft.voiceGender === 'female'} data-selected={uiDraft.voiceGender === 'female'} onClick={() => setUiDraft({ ...uiDraft, voiceGender: 'female' })}>Femminile</button>
                      </div>
                    </div>
                    <label className="settings-field settings-wide voice-vocabulary-field">
                      <span>Parole importanti</span>
                      <textarea rows={2} maxLength={2000} value={uiDraft.voiceVocabulary}
                        onChange={(event) => setUiDraft({ ...uiDraft, voiceVocabulary: event.target.value })}
                        placeholder="NexusNXS, Docker, Kubernetes…" />
                      <small>Un nome o termine per riga. La correzione resta locale e interviene solo su parole quasi identiche.</small>
                    </label>
                    <div className="voice-output-actions">
                      <button className="settings-secondary voice-preview" type="button" disabled={busy} onClick={async () => {
                        window.speechSynthesis.cancel();
                        setBusy(true);
                        setMessage(uiDraft.voiceEngine === 'expressive'
                          ? 'Chatterbox sta preparando la voce espressiva…'
                          : uiDraft.voiceEngine === 'neural'
                            ? 'Kokoro sta preparando la voce…'
                            : '');
                        try {
                          if (uiDraft.voiceEngine !== 'system') {
                            const expressive = uiDraft.voiceEngine === 'expressive';
                            const result = await window.nexus.synthesizeVoice({
                              text: 'Ciao, sono NEXUSNXS. Come posso aiutarti?',
                              gender: uiDraft.voiceGender,
                              language: 'it',
                              engine: expressive ? 'expressive' : 'neural'
                            });
                            const buffer = new ArrayBuffer(result.audio.byteLength);
                            new Uint8Array(buffer).set(result.audio);
                            const url = URL.createObjectURL(new Blob([buffer], { type: result.mimeType || 'audio/wav' }));
                            const audio = new Audio(url);
                            audio.onended = () => URL.revokeObjectURL(url);
                            audio.onerror = () => URL.revokeObjectURL(url);
                            await audio.play();
                            setMessage(`${expressive ? 'Voce espressiva' : 'Voce Kokoro'} ${uiDraft.voiceGender === 'male' ? 'maschile' : 'femminile'} attiva`);
                          } else {
                            await previewSystemVoice();
                            setMessage('Anteprima della voce rapida');
                          }
                        } catch (error) {
                          setMessage(publicUiError(error, 'Anteprima vocale non disponibile.'));
                        } finally {
                          setBusy(false);
                        }
                      }}><span aria-hidden="true">▶</span> {busy ? 'Preparazione…' : 'Ascolta'}</button>
                    </div>
                  </section>
                </div>
              )}

              {tab === 'appearance' && (
                <div className="settings-panel" id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance">
                  <div className="settings-section-copy settings-page-intro settings-wide">
                    <span>Aspetto</span>
                    <strong>{activeSection.title}</strong>
                    <p>{activeSection.description} Le modifiche vengono applicate senza riavviare l’app.</p>
                  </div>
                  <label className="settings-field">
                    <span>Lingua dell’interfaccia</span>
                    <NexusSelect
                      ariaLabel="Lingua dell’interfaccia"
                      value={uiDraft.locale}
                      options={[
                        { value: 'system', label: 'Automatica', detail: 'Segue la lingua del dispositivo' },
                        { value: 'it', label: 'Italiano' },
                        { value: 'en', label: 'English' }
                      ]}
                      onValueChange={(locale) => setUiDraft({ ...uiDraft, locale: locale as InterfacePreferences['locale'] })}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Colore principale</span>
                    <NexusSelect
                      ariaLabel="Colore principale"
                      value={uiDraft.accent}
                      options={[
                        { value: 'cyan', label: 'Ciano NexusNXS' },
                        { value: 'blue', label: 'Blu profondo' },
                        { value: 'violet', label: 'Viola cosmico' },
                        { value: 'emerald', label: 'Smeraldo' }
                      ]}
                      onValueChange={(accent) => setUiDraft({ ...uiDraft, accent: accent as InterfacePreferences['accent'] })}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Aspetto del NexusNXS Core</span>
                    <NexusSelect
                      ariaLabel="Aspetto del NexusNXS Core"
                      value={uiDraft.coreAppearance}
                      options={[
                        { value: 'saturn-experimental', label: 'Saturno particellare', detail: 'Presenza immersiva consigliata' },
                        { value: 'jarvis-reactor', label: 'Nucleo radiale', detail: 'Corone concentriche e materia particellare reattiva' },
                        { value: 'neural', label: 'Neurale', detail: 'Forma stabile e minimale' }
                      ]}
                      onValueChange={(coreAppearance) => setUiDraft({ ...uiDraft, coreAppearance: coreAppearance as InterfacePreferences['coreAppearance'] })}
                    />
                    <small>Puoi tornare istantaneamente al visualizer precedente.</small>
                  </label>
                  <div className="settings-field">
                    <span>Adattamento automatico</span>
                    <strong>{hardware ? 'Attivo' : 'Preparazione in corso'}</strong>
                    <small>NexusNXS mantiene l’esperienza fluida e nitida in modo autonomo.</small>
                  </div>
                  <label className="settings-field">
                    <span>Qualità grafica</span>
                    <NexusSelect
                      ariaLabel="Qualità grafica"
                      value={uiDraft.visualQuality}
                      options={[
                        { value: 'auto', label: 'Automatica', detail: 'Consigliata: si adatta continuamente' },
                        { value: 'efficient', label: 'Essenziale', detail: 'Più leggera e sempre fluida' },
                        { value: 'balanced', label: 'Bilanciata', detail: 'Nitida e armoniosa' },
                        { value: 'ultra', label: 'Alta', detail: 'Più ricca e dettagliata' },
                        { value: 'super', label: 'Massima', detail: 'La migliore resa disponibile' }
                      ]}
                      onValueChange={(visualQuality) => setUiDraft({
                        ...uiDraft,
                        visualQuality: visualQuality as InterfacePreferences['visualQuality']
                      })}
                    />
                    <small>Automatico è consigliato; la scelta manuale resta salvata su questo PC.</small>
                  </label>
                  <label className="settings-field">
                    <span>Movimento</span>
                    <NexusSelect
                      ariaLabel="Movimento"
                      value={uiDraft.motion}
                      options={[
                        { value: 'system', label: 'Adattivo', detail: 'Segue le preferenze del sistema' },
                        { value: 'full', label: 'Completo', detail: 'Movimento e particelle attivi' },
                        { value: 'reduced', label: 'Essenziale', detail: 'Animazioni ridotte' }
                      ]}
                      onValueChange={(motion) => setUiDraft({ ...uiDraft, motion: motion as InterfacePreferences['motion'] })}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Interazione con le particelle</span>
                    <NexusSelect
                      ariaLabel="Interazione con le particelle"
                      value={uiDraft.particleInteraction}
                      options={[
                        { value: 'auto', label: 'Automatica', detail: 'Si adatta a dispositivo e accessibilità' },
                        { value: 'gentle', label: 'Delicata', detail: 'Reazione locale più discreta' },
                        { value: 'off', label: 'Disattivata', detail: 'Il puntatore non muove il visualizer' }
                      ]}
                      onValueChange={(particleInteraction) => setUiDraft({
                        ...uiDraft,
                        particleInteraction: particleInteraction as InterfacePreferences['particleInteraction']
                      })}
                    />
                  </label>
                  <label className="settings-field">
                    <span>Gamma dinamica</span>
                    <NexusSelect
                      ariaLabel="Gamma dinamica"
                      value={uiDraft.hdr}
                      options={[
                        { value: 'auto', label: 'Automatica', detail: 'Attiva la resa HDR soltanto quando è supportata' },
                        { value: 'on', label: 'HDR', detail: 'Colori e luci estesi sui display compatibili' },
                        { value: 'off', label: 'Standard', detail: 'Resa coerente su qualsiasi display' }
                      ]}
                      onValueChange={(hdr) => setUiDraft({ ...uiDraft, hdr: hdr as InterfacePreferences['hdr'] })}
                    />
                    <small>Sui display standard NexusNXS conserva automaticamente la resa originale.</small>
                  </label>
                  <button
                    className="settings-quiet-action settings-reset-appearance settings-wide"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      // Il ripristino interessa soltanto l'interfaccia: non
                      // cancella modelli, vault o configurazione del runtime AI.
                      setUiDraft({ ...DEFAULT_INTERFACE_PREFERENCES });
                      setMessage('Preferenze interfaccia ripristinate. Salva per confermare.');
                    }}
                  >
                    Ripristina aspetto
                  </button>
                </div>
              )}

              {tab === 'remote' && (
                <div className="settings-panel" id="settings-panel-remote" role="tabpanel" aria-labelledby="settings-tab-remote">
                  <div className="settings-section-copy settings-page-intro settings-wide">
                    <span>Remoto</span>
                    <strong>{activeSection.title}</strong>
                    <p>{activeSection.description}</p>
                  </div>
                  <div className="settings-wide remote-overview" data-ready={Boolean(remoteStatus?.running)}>
                    <div className="remote-overview-copy">
                      <i aria-hidden="true" />
                      <span>
                        <strong>{remoteStatus?.running ? 'Pronto per i tuoi dispositivi' : 'Non ancora configurato'}</strong>
                        <small>{remoteStatus?.running
                          ? 'Il collegamento resta disponibile finché questo computer è acceso.'
                          : 'Collega il primo dispositivo in pochi secondi.'}</small>
                      </span>
                    </div>
                    <div className="remote-overview-actions">
                      <button className="settings-primary remote-connect" type="button" disabled={busy} onClick={connectRemoteDevice}>
                        {busy ? 'Preparazione…' : 'Collega dispositivo'}
                      </button>
                      {remoteStatus?.enabled && <button className="settings-quiet-action" type="button" disabled={busy} onClick={async () => {
                        setBusy(true);
                        try {
                          const next = await window.nexus.configureRemote({ enabled: false, allowLan: false, port: remoteStatus.port });
                          setRemoteStatus(next);
                          setPairingCode(null);
                          setMessage('Accesso remoto disattivato.');
                        } catch (error) { setMessage(publicUiError(error, 'Impossibile disattivare l’accesso remoto.')); }
                        finally { setBusy(false); }
                      }}>Disattiva</button>}
                    </div>
                  </div>
                  <label className="settings-switch settings-wide remote-startup">
                    <input
                      type="checkbox"
                      checked={startupStatus.enabled}
                      disabled={!startupStatus.available || busy}
                      onChange={async (event) => {
                        setBusy(true);
                        try {
                          const next = await window.nexus.configureStartup(event.target.checked);
                          setStartupStatus(next);
                          setMessage(next.enabled ? 'Core e Presence saranno pronti con Windows, senza aprire l’app.' : 'Avvio automatico disattivato.');
                        } catch (error) {
                          setMessage(publicUiError(error, 'Impossibile modificare l’avvio automatico.'));
                        } finally { setBusy(false); }
                      }}
                    />
                    <span>
                      <strong>Core e Presence all’accensione</strong>
                      <small>{startupStatus.available
                        ? 'Avvia il motore in background e un visualizer discreto. L’interfaccia completa resta chiusa finché non la richiami.'
                        : 'Disponibile nella versione installata di NexusNXS.'}</small>
                    </span>
                  </label>
                  {Boolean(remoteStatus?.devices.length) && (
                    <div className="settings-wide remote-devices">
                      <strong>I tuoi dispositivi</strong>
                      {remoteStatus!.devices.map((device) => (
                        <div key={device.id}>
                          <span><i aria-hidden="true" /><b>{device.name}</b><small>Può accedere quando NexusNXS è attivo</small></span>
                          <button className="settings-quiet-action" type="button" onClick={async () => { setRemoteStatus(await window.nexus.revokeRemoteDevice(device.id)); setMessage('Accesso del dispositivo revocato.'); }}>Rimuovi</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="settings-wide remote-privacy-note">L’accesso è privato e può essere revocato in qualsiasi momento.</p>
                </div>
              )}

              {(['ai', 'permissions', 'data', 'connections', 'shortcuts', 'updates'] as SettingsTab[]).includes(tab) && (
                <div className="settings-panel" id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
                  <div className="settings-section-copy settings-wide">
                    <span>{activeSection.label}</span>
                    <strong>{activeSection.title}</strong>
                    <p>{activeSection.description}</p>
                  </div>
                  {tab === 'data' && <>
                  <div className="local-integrations settings-wide knowledge-maintenance">
                    <span>
                      <strong>Conoscenza locale</strong>
                      <small>NexusNXS rileva automaticamente le note cambiate. Usa Aggiorna soltanto dopo aver aggiunto o spostato molti contenuti.</small>
                    </span>
                    <div>
                      <button className="settings-secondary" type="button" disabled={busy} onClick={async () => {
                        setBusy(true);
                        setMessage('Aggiornamento della conoscenza locale…');
                        try {
                          const stats = await window.nexus.reindex();
                          setMessage(stats.notes > 0 ? 'Conoscenza aggiornata.' : 'Conoscenza pronta, nessun contenuto da aggiornare.');
                        } catch (error) {
                          setMessage(publicUiError(error, 'Aggiornamento della conoscenza non riuscito.'));
                        } finally {
                          setBusy(false);
                        }
                      }}>Aggiorna conoscenza</button>
                    </div>
                  </div>
                  <div className="personal-evaluation-card settings-wide">
                    <div><strong>Memoria</strong><small>NexusNXS conserva localmente soltanto ciò che hai approvato per rendere le risposte più adatte a te.</small></div>
                  </div>
                  <div className="data-overview settings-wide" aria-label="Stato dati personali">
                    <article><span>Ricordi</span><strong>{memories.length}</strong><small>Approvati da te</small></article>
                    <article><span>Risposte rapide</span><strong>{responseCache.entries}</strong><small>{responseCache.hits ? `${responseCache.hits} riutilizzi locali` : 'Ottimizzazione pronta'}</small></article>
                    <article><span>Esempi</span><strong>{trainingStats?.examples || 0}</strong><small>Per migliorare NexusNXS</small></article>
                    {!remoteInference && <article><span>Preferenze</span><strong>{trainingStats?.preferencePairs || 0}</strong><small>Scelto contro scartato</small></article>}
                  </div>
                  {!remoteInference && trainingEvaluation && <section className="training-quality-card settings-wide" aria-label="Qualità del dataset approvato">
                    <div className="training-quality-heading"><span><strong>Dataset approvato</strong><small>Solo dati locali revisionati. Nessun peso viene modificato automaticamente.</small></span><b>{trainingEvaluation.readiness}%</b></div>
                    <div className="training-quality-meter" aria-label={`Maturità ${trainingEvaluation.readiness}%`}><i style={{ width: `${trainingEvaluation.readiness}%` }} /></div>
                    <div className="training-quality-grid">
                      <span><small>Diversità</small><strong>{trainingEvaluation.diversity}%</strong></span>
                      <span><small>Correzioni</small><strong>{trainingEvaluation.correctionCoverage}%</strong></span>
                      <span><small>Domini</small><strong>{Object.keys(trainingStats?.domains || {}).length}</strong></span>
                      <span><small>Prossimo controllo</small><strong>{trainingStats?.nextMilestone || 20}</strong></span>
                    </div>
                  </section>}
                  {memories.length > 0 && <div className="memory-list settings-wide">
                    <div className="memory-list-heading"><span><strong>Ciò che NexusNXS ricorda</strong><small>Puoi rimuovere un singolo elemento senza cancellare tutto.</small></span></div>
                    {memories.slice(0, 8).map((memory) => <article key={memory.id}>
                      <span><small>{memory.type === 'preference' ? 'Preferenza' : memory.type === 'project' ? 'Progetto' : memory.type === 'procedural' ? 'Procedura' : memory.type === 'episodic' ? 'Evento' : 'Informazione'}</small><strong>{memory.content}</strong></span>
                      <button type="button" className="settings-quiet-action" disabled={busy} onClick={async () => {
                        setBusy(true);
                        try {
                          await window.nexus.forgetMemory(memory.id);
                          setMemories(await window.nexus.listMemories());
                          setTrainingStats(await window.nexus.trainingStats());
                          setMessage('Ricordo rimosso.');
                        } finally { setBusy(false); }
                      }}>Dimentica</button>
                    </article>)}
                  </div>}
                  {responseCache.entries > 0 && <div className="cache-maintenance settings-wide">
                    <span><strong>Ottimizzazione delle risposte</strong><small>Le risposte stabili vengono riutilizzate soltanto su questo computer. Azioni, dati temporali e segreti sono esclusi.</small></span>
                    <button className="settings-secondary" type="button" disabled={busy} onClick={async () => {
                      setBusy(true);
                      try {
                        const result = await window.nexus.clearResponseCache();
                        setResponseCache(await window.nexus.responseCacheStats());
                        setMessage(result.removed ? 'Ottimizzazione locale azzerata.' : 'Nessuna risposta da eliminare.');
                      } finally { setBusy(false); }
                    }}>Azzera risposte rapide</button>
                  </div>}
                  <div className="settings-inline-actions settings-wide training-controls">
                    <button className="settings-secondary settings-danger-subtle" type="button" disabled={busy || !(trainingStats?.examples || trainingStats?.memories)} onClick={async () => {
                      if (!confirmTrainingClear) {
                        setConfirmTrainingClear(true);
                        setMessage('Premi di nuovo per cancellare memoria ed esempi personali approvati.');
                        return;
                      }
                      setBusy(true);
                      try {
                        const result = await window.nexus.clearTrainingExamples();
                        setTrainingStats(await window.nexus.trainingStats());
                        setTrainingEvaluation(await window.nexus.trainingEvaluation());
                        setMemories([]);
                        setResponseCache({ entries: 0, hits: 0 });
                        setConfirmTrainingClear(false);
                        setMessage(result.removed ? 'Memoria personale cancellata.' : 'La memoria personale era già vuota.');
                      } finally { setBusy(false); }
                    }}>{confirmTrainingClear ? 'Conferma cancellazione' : 'Cancella memoria'}</button>
                  </div>
                  </>}
                  {tab === 'connections' && <>
                    <div className="settings-section-copy settings-wide"><strong>Git e cartella di lavoro</strong><p>Seleziona il repository su cui NexusNXS può leggere, creare e modificare file secondo i permessi scelti.</p></div>
                    <div className="settings-feature-card settings-wide">
                      <span><strong>{workspace?.active ? workspace.name : 'Nessun progetto collegato'}</strong><small>{workspace?.active ? 'Cartella di lavoro attiva' : 'Puoi collegarla quando inizi un’attività di sviluppo.'}</small></span>
                      <div className="settings-inline-actions">
                        <button className="settings-secondary" type="button" onClick={async () => setWorkspace(await window.nexus.selectWorkspace())}>{workspace?.active ? 'Cambia' : 'Collega Git'}</button>
                        {workspace?.active && <button className="settings-secondary" type="button" onClick={async () => setWorkspace(await window.nexus.clearWorkspace())}>Scollega</button>}
                      </div>
                    </div>
                    <div className="settings-section-copy settings-wide"><strong>Computer Use</strong><p>NexusNXS può usare applicazioni e strumenti locali; ogni azione rispetta il livello di autorizzazione configurato.</p></div>
                    <div className="settings-feature-card settings-wide">
                      <span><strong>{localIntegrations.length ? 'Disponibile' : 'In attesa di strumenti compatibili'}</strong><small>{localIntegrations.length ? `${localIntegrations.length} integrazioni pronte` : 'Le capacità vengono rilevate automaticamente.'}</small></span>
                      <button className="settings-secondary" type="button" onClick={() => setTab('permissions')}>Gestisci permessi</button>
                    </div>
                    <div className="settings-section-copy settings-wide"><strong>Plugin</strong><p>Le estensioni compatibili vengono convalidate prima di apparire e non possono ottenere permessi impliciti.</p></div>
                    <div className="local-integrations settings-wide">
                      <span><strong>Integrazioni disponibili</strong><small>Rilevate automaticamente in questo dispositivo.</small></span>
                      <div>{localIntegrations.length ? localIntegrations.map((integration) => <i key={integration.id}>{integration.label}</i>) : <i>Nessun plugin attivo</i>}</div>
                    </div>
                  </>}
                  {tab === 'shortcuts' && <>
                    <div className="settings-section-copy settings-wide"><strong>Comandi rapidi</strong><p>Le etichette nella schermata principale si aggiornano insieme alle combinazioni.</p></div>
                    {([
                      ['voice', 'Parla', ['Space', 'Alt+Space']],
                      ['composer', 'Scrivi', ['Ctrl+K', 'Ctrl+L']],
                      ['history', 'Cronologia', ['Ctrl+H', 'Ctrl+J']],
                      ['models', 'Modelli', ['Ctrl+M', 'Ctrl+Shift+M']],
                      ['settings', 'Impostazioni', ['Ctrl+,', 'Ctrl+.']],
                      ['privacy', 'Privacy', ['Ctrl+Shift+P', 'Ctrl+Shift+L']]
                    ] as const).map(([key, label, values]) => (
                      <label className="settings-field" key={key}>
                        <span>{label}</span>
                        <NexusSelect ariaLabel={`Scorciatoia ${label}`} value={uiDraft.shortcuts[key]} options={values.map((value) => ({ value, label: value.replaceAll('+', ' + ') }))} onValueChange={(value) => setUiDraft({ ...uiDraft, shortcuts: { ...uiDraft.shortcuts, [key]: value } })} />
                      </label>
                    ))}
                  </>}
                  {tab === 'updates' && <>
                    <div className="settings-section-copy settings-page-intro settings-wide">
                      <span>Aggiornamenti</span><strong>{activeSection.title}</strong><p>{activeSection.description}</p>
                    </div>
                    <div className="settings-feature-card settings-wide">
                      <span><strong>Versione {updateStatus?.version || 'corrente'}</strong><small>Canale {updateStatus?.channel === 'preview' ? 'Anteprima' : updateStatus?.channel === 'beta' ? 'Beta' : 'Stabile'} · gli aggiornamenti vengono verificati prima dell’installazione.</small></span>
                      <button className="settings-secondary" type="button" disabled={busy || updateStatus?.status === 'checking'} onClick={async () => {
                        setBusy(true); setMessage('Controllo aggiornamenti…');
                        try { const next = await window.nexus.checkForUpdates(); setUpdateStatus(next); setMessage(next.status === 'ready' ? 'Aggiornamento pronto.' : next.status === 'disabled' ? 'Aggiornamenti disponibili nella versione installata.' : 'NexusNXS è aggiornato.'); }
                        catch { setMessage('Controllo non riuscito. NexusNXS continuerà a funzionare normalmente.'); }
                        finally { setBusy(false); }
                      }}>{updateStatus?.status === 'checking' ? 'Controllo…' : 'Controlla ora'}</button>
                    </div>
                    {updateStatus?.status === 'downloading' && <div className="settings-health-check settings-wide" data-state="running" role="status"><span><i aria-hidden="true" /><strong>Download in corso</strong><small>{updateStatus.progress}% · puoi continuare a usare NexusNXS.</small></span></div>}
                    {updateStatus?.status === 'ready' && <div className="settings-feature-card settings-wide"><span><strong>{updateStatus.releaseName || `Versione ${updateStatus.version}`}</strong><small>{updateStatus.releaseNotes || 'Pronta per essere applicata con un riavvio.'}</small></span><button className="settings-secondary" type="button" onClick={() => window.nexus.installUpdate()}>Riavvia e aggiorna</button></div>}
                    <div className="settings-section-copy settings-wide"><strong>Aggiornamento sicuro</strong><p>Il download riprende automaticamente in caso di interruzione. Prima della pubblicazione, installer, firma e integrità devono superare i controlli di rilascio.</p></div>
                  </>}
                  {tab === 'permissions' && <>
                  <div className="settings-section-copy settings-wide"><strong>Controllo del computer</strong><p>Scegli quando NEXUSNXS deve fermarsi e chiedere la tua autorizzazione.</p></div>
                  <div className="action-policy-grid settings-wide" role="radiogroup" aria-label="Autorizzazioni azioni locali">
                    {[
                      { id: 'always', title: 'Chiedi sempre', detail: 'Mostra il consenso prima di ogni azione locale.', badge: 'Massimo controllo' },
                      { id: 'dangerous-only', title: 'Automatico', detail: 'Esegue le azioni comuni e chiede per script o operazioni importanti.', badge: 'Consigliato' },
                      { id: 'full-access', title: 'Accesso completo', detail: 'Esegue le azioni senza chiedere ogni volta.', badge: 'Più autonomia' }
                    ].map((policy) => {
                      const selected = (draft.actionApprovalMode || 'dangerous-only') === policy.id;
                      return (
                        <button
                          key={policy.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          data-selected={selected}
                          data-policy={policy.id}
                          onClick={() => setDraft({ ...draft, actionApprovalMode: policy.id as NexusSettings['actionApprovalMode'] })}
                        >
                          <span><strong>{policy.title}</strong><small>{policy.detail}</small></span>
                          <em>{policy.badge}</em>
                        </button>
                      );
                    })}
                  </div>
                  <p className="action-policy-note settings-wide">Le azioni distruttive, i percorsi protetti e i comandi non consentiti restano bloccati in ogni modalità.</p>
                  <div className="local-integrations settings-wide">
                    <span>
                      <strong>Integrazioni locali disponibili</strong>
                      <small>Rilevate sul computer. Ogni utilizzo segue il profilo di autorizzazione scelto.</small>
                    </span>
                    <div>
                      {localIntegrations.length
                        ? localIntegrations.map((integration) => <i key={integration.id}>{integration.label}</i>)
                        : <i>Nessuna applicazione compatibile rilevata</i>}
                    </div>
                  </div>
                  <div className="action-history settings-wide">
                    <strong>Attività recenti</strong>
                    {actionHistory.length === 0
                      ? <small>Nessuna azione eseguita.</small>
                      : actionHistory.slice(0, 5).map((item, index) => (
                        <div key={`${item.timestamp}-${index}`}>
                          <span>{item.tool || 'azione'} · {item.event}</span>
                          <small>{item.preview || new Date(item.timestamp).toLocaleString(document.documentElement.lang || navigator.language)}</small>
                        </div>
                      ))}
                  </div>
                  </>}
                  {tab === 'ai' && <>
                  <div className="settings-subsection-title settings-wide"><strong>Scelta del modello</strong><small>NexusNXS mantiene rapide le richieste semplici.</small></div>
                  <label className="settings-field settings-wide model-settings-field">
                    <span>Modello principale</span>
                    <NexusSelect
                      ariaLabel="Modello principale"
                      value={draft.autoSelectModel !== false ? 'automatic' : (draft.chatModel || draft.model || 'automatic')}
                      options={[
                        { value: 'automatic', label: 'Automatico', detail: remoteInference ? 'NexusNXS sceglie sul server il modello più adatto alla richiesta' : 'NexusNXS sceglie il modello più adatto alla richiesta e al computer' },
                        ...selectableModels.map((model) => ({
                          value: model.id,
                          label: modelDisplayName(model),
                          detail: model.compatible === false
                            ? 'Non consigliato su questo computer'
                            : model.recommended
                              ? 'Consigliato per questo computer'
                              : 'Disponibile'
                        }))
                      ]}
                      onValueChange={(model) => setDraft(model === 'automatic'
                        ? { ...draft, autoSelectModel: true }
                        : { ...draft, model, chatModel: model, autoSelectModel: false })}
                    />
                    <small>{remoteInference ? 'Automatico instrada ogni richiesta verso il livello di intelligenza adeguato, senza usare risorse AI di questo PC.' : 'Automatico usa un modello leggero per le risposte immediate e quello principale quando servono più ragionamento o precisione.'}</small>
                  </label>
                  {!selectableModels.length && (
                    <div className="settings-model-empty settings-wide" role="status">
                      <span><strong>{remoteInference ? 'Connessione a NexusNXS' : 'Modelli in preparazione'}</strong><small>{remoteInference ? 'L’intelligenza viene elaborata sul servizio NexusNXS; questo computer regola soltanto grafica e fluidità.' : 'NexusNXS completerà automaticamente la configurazione compatibile con questo computer.'}</small></span>
                    </div>
                  )}
                  <div className="settings-section-copy"><strong>Identità personale</strong><p>Definisci chi sei e come deve rivolgersi a te il tuo assistente. Tutto resta su questo computer.</p></div>
                  <label className="settings-field"><span>Il tuo nome</span><input maxLength={80} value={draft.personalization?.userName || ''} onChange={(event) => setDraft({ ...draft, personalization: { assistantName: 'NEXUSNXS', occupation: '', interests: '', responseStyle: 'natural', customInstructions: '', ...draft.personalization, userName: event.target.value } })} /></label>
                  <label className="settings-field"><span>Nome assistente</span><input maxLength={80} value={draft.personalization?.assistantName || 'NEXUSNXS'} onChange={(event) => setDraft({ ...draft, personalization: { userName: '', occupation: '', interests: '', responseStyle: 'natural', customInstructions: '', ...draft.personalization, assistantName: event.target.value } })} /></label>
                  <label className="settings-field"><span>Occupazione</span><input maxLength={160} value={draft.personalization?.occupation || ''} onChange={(event) => setDraft({ ...draft, personalization: { userName: '', assistantName: 'NEXUSNXS', interests: '', responseStyle: 'natural', customInstructions: '', ...draft.personalization, occupation: event.target.value } })} /></label>
                  <label className="settings-field"><span>Stile risposte</span><NexusSelect ariaLabel="Stile risposte" value={draft.personalization?.responseStyle || 'natural'} options={[{ value: 'concise', label: 'Conciso' }, { value: 'natural', label: 'Naturale' }, { value: 'detailed', label: 'Dettagliato' }]} onValueChange={(responseStyle) => setDraft({ ...draft, personalization: { userName: '', assistantName: 'NEXUSNXS', occupation: '', interests: '', customInstructions: '', ...draft.personalization, responseStyle: responseStyle as 'concise' | 'natural' | 'detailed' } })} /></label>
                  <label className="settings-field settings-wide"><span>Interessi</span><textarea rows={2} maxLength={500} value={draft.personalization?.interests || ''} onChange={(event) => setDraft({ ...draft, personalization: { userName: '', assistantName: 'NEXUSNXS', occupation: '', responseStyle: 'natural', customInstructions: '', ...draft.personalization, interests: event.target.value } })} /></label>
                  <label className="settings-field settings-wide"><span>Istruzioni personali</span><textarea rows={3} maxLength={2000} value={draft.personalization?.customInstructions || ''} onChange={(event) => setDraft({ ...draft, personalization: { userName: '', assistantName: 'NEXUSNXS', occupation: '', interests: '', responseStyle: 'natural', ...draft.personalization, customInstructions: event.target.value } })} /><small>NEXUSNXS userà queste preferenze nelle conversazioni, senza inviarle al cloud.</small></label>
                  <label className="settings-switch settings-wide">
                    <input type="checkbox" checked={draft.personalization?.attentiveFollowUp !== false} onChange={(event) => setDraft({ ...draft, personalization: { userName: '', assistantName: 'NEXUSNXS', occupation: '', interests: '', responseStyle: 'natural', customInstructions: '', ...draft.personalization, attentiveFollowUp: event.target.checked } })} />
                    <span><strong>Presenza naturale</strong><small>Dopo una domanda senza risposta, NexusNXS può richiamarti una sola volta usando il tuo nome.</small></span>
                  </label>
                  </>}
                  {tab === 'data' && <>
                  <div className="settings-section-copy settings-wide"><strong>Archivio personale</strong><p>Esporta o ripristina impostazioni, cronologia ed esempi approvati in un unico file locale.</p></div>
                  <label className="settings-field settings-wide"><span>Password archivio</span><input type="password" autoComplete="new-password" minLength={10} maxLength={256} value={backupPassphrase} onChange={(event) => setBackupPassphrase(event.target.value)} placeholder="Almeno 10 caratteri" /><small>Protegge il backup. NEXUSNXS non salva questa password.</small></label>
                  <div className="settings-inline-actions settings-wide">
                    <button className="settings-secondary" type="button" disabled={busy} onClick={async () => {
                      setBusy(true);
                      try { if (backupPassphrase.length < 10) throw new Error('Inserisci una password di almeno 10 caratteri.'); setMessage((await onExportPersonalData(backupPassphrase)) === 'saved' ? 'Archivio personale cifrato esportato.' : 'Esportazione annullata.'); }
                      catch (error) { setMessage(publicUiError(error, 'Esportazione non riuscita.')); }
                      finally { setBusy(false); }
                    }}>Esporta archivio</button>
                    <button className="settings-secondary" type="button" disabled={busy} onClick={async () => {
                      setBusy(true);
                      try { if (backupPassphrase.length < 10) throw new Error('Inserisci la password usata per il backup.'); setMessage((await onImportPersonalData(backupPassphrase)) === 'imported' ? 'Archivio ripristinato.' : 'Ripristino annullato.'); }
                      catch (error) { setMessage(publicUiError(error, 'Ripristino non riuscito.')); }
                      finally { setBusy(false); }
                    }}>Ripristina archivio</button>
                  </div>
                  <div className="settings-section-copy settings-wide"><strong>Controllo di funzionamento</strong><p>Verifica in un solo passaggio intelligenza locale, voce e servizi essenziali senza mostrare dati tecnici.</p></div>
                  <div className="settings-health-check settings-wide" data-state={healthCheck} role="status">
                    <span><i aria-hidden="true" /><strong>{healthCheck === 'running' ? 'Controllo in corso…' : healthCheck === 'ready' ? 'NexusNXS è pronto' : healthCheck === 'attention' ? 'Serve attenzione' : 'Controlla NexusNXS'}</strong><small>{healthCheck === 'ready' ? 'Intelligenza, voce e runtime rispondono correttamente.' : healthCheck === 'attention' ? 'Apri la sezione indicata dal messaggio per completare la configurazione.' : 'Il controllo resta locale e non modifica le preferenze.'}</small></span>
                    <button className="settings-secondary" type="button" disabled={busy || healthCheck === 'running'} onClick={async () => {
                      setHealthCheck('running');
                      setMessage('');
                      try {
                        const report = await window.nexus.diagnostics();
                        const ready = report.ai?.status === 'ready' && report.runtime?.available === true && report.voice?.available !== false && Number(report.voice?.devices || 0) > 0;
                        setHealthCheck(ready ? 'ready' : 'attention');
                        setMessage(ready ? 'Controllo completato: NexusNXS è pronto.' : Number(report.voice?.devices || 0) < 1 ? 'Nessun microfono disponibile: controlla la sezione Voce.' : 'Il motore locale richiede attenzione: controlla la sezione Intelligenza.');
                      } catch (error) {
                        setHealthCheck('attention');
                        setMessage(publicUiError(error, 'Controllo non completato. Riprova tra poco.'));
                      }
                    }}>Avvia controllo</button>
                  </div>
                  </>}
                </div>
              )}

            </div>

            <footer className="settings-footer">
              {message && <p role="status">{message}</p>}
              <div>
                <button className="settings-cancel" type="button" onClick={requestClose}>Annulla</button>
                <button className="settings-save" type="button" disabled={busy || !hasUnsavedChanges} onClick={saveAll}>
                  <span>{busy ? 'Salvataggio…' : hasUnsavedChanges ? 'Salva' : 'Aggiornato'}</span><i aria-hidden="true">→</i>
                </button>
              </div>
            </footer>
            <AnimatePresence>
              {pairingOpen && pairingCode && pairingCode.expiresAt > Date.now() && (
                <motion.div className="remote-pairing-layer" role="dialog" aria-modal="true" aria-labelledby="remote-pairing-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPairingOpen(false)}>
                  <motion.div className="remote-pairing-card" initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} transition={{ duration: .24 }} onClick={(event) => event.stopPropagation()}>
                    <button className="remote-pairing-close" type="button" aria-label="Chiudi associazione" onClick={() => setPairingOpen(false)}>×</button>
                    <span className="remote-pairing-eyebrow">NexusNXS Remote</span>
                    <h2 id="remote-pairing-title">Collega il telefono</h2>
                    <p>Apri NexusNXS sul telefono e inquadra questo codice.</p>
                    <div className="remote-qr-orbit">
                      <i aria-hidden="true" />
                      {pairingQr && <img src={pairingQr} alt="QR per associare il telefono a NexusNXS" />}
                    </div>
                    <small>Oppure inserisci il codice</small>
                    <strong className="remote-manual-code" aria-label={`Codice manuale ${pairingCode.code}`}>{pairingCode.code}</strong>
                    <div className="remote-pairing-actions">
                      <button type="button" onClick={async () => { if (pairingUrl) await window.nexus.copyText(pairingUrl); setMessage('Collegamento copiato.'); }}>Copia collegamento</button>
                      <button type="button" onClick={async () => setPairingCode(await window.nexus.createRemotePairing())}>Nuovo codice</button>
                    </div>
                    <footer><i aria-hidden="true" /> Collegamento privato · valido per pochi minuti</footer>
                  </motion.div>
                </motion.div>
              )}
              {discardConfirmation && (
                <motion.div
                  className="nexus-confirm-layer"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="discard-title"
                  aria-describedby="discard-description"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="nexus-confirm-card"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.985 }}
                  >
                    <span className="nexus-confirm-mark" aria-hidden="true">◇</span>
                    <div>
                      <strong id="discard-title">Modifiche non salvate</strong>
                      <p id="discard-description">Vuoi uscire dalle impostazioni e ignorare le modifiche effettuate?</p>
                    </div>
                    <footer>
                      <button type="button" onClick={() => setDiscardConfirmation(false)}>Continua a modificare</button>
                      <button className="danger-subtle" type="button" onClick={() => {
                        setDiscardConfirmation(false);
                        onClose();
                      }}>Esci senza salvare</button>
                    </footer>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// #endregion
