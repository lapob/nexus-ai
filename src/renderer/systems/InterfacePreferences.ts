/**
 * @module renderer/systems/InterfacePreferences
 * @description Valida e conserva le preferenze locali dell'interfaccia senza coinvolgere l'IPC.
 */
import type { InterfacePreferences } from '../types/nexus';

// #region 01 — Valori e normalizzazione

const STORAGE_NAMESPACE = 'nexus.interface.preferences.v1';
const SATURN_MIGRATION_NAMESPACE = 'nexus.visualizer.saturn.v1';
const NATURAL_VOICE_MIGRATION_NAMESPACE = 'nexus.voice.natural.v1';
const AUTOMATIC_PERFORMANCE_MIGRATION_NAMESPACE = 'nexus.performance.automatic.v1';
const PRESENCE_MIGRATION_NAMESPACE = 'nexus.presence.visualizers.v1';

export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = {
  locale: 'system',
  accent: 'cyan',
  shortcuts: {
    voice: 'Space', composer: 'Ctrl+K', history: 'Ctrl+H',
    models: 'Ctrl+M', settings: 'Ctrl+,', privacy: 'Ctrl+Shift+P'
  },
  microphoneId: 'default',
  microphoneCaptureId: -1,
  audioSensitivity: 1,
  voiceOutputEnabled: true,
  voiceName: '',
  voiceEngine: 'neural',
  voiceGender: 'male',
  voiceVocabulary: '',
  // Il microfono non viene mai aperto in background senza consenso esplicito.
  wakeWordEnabled: false,
  wakeWordConfidence: 0.84,
  wakeWordCooldownMs: 5000,
  coreAppearance: 'saturn-experimental',
  visualQuality: 'auto',
  hdr: 'auto',
  motion: 'system',
  particleInteraction: 'auto',
};

function finiteRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

// Ogni campo viene verificato singolarmente: una preferenza corrotta non deve
// impedire l'avvio del renderer né contaminare le altre impostazioni valide.
export function normalizeInterfacePreferences(value: unknown): InterfacePreferences {
  const source = value && typeof value === 'object' ? value as Partial<InterfacePreferences> : {};
  return {
    locale: ['system', 'it', 'en'].includes(String(source.locale))
      ? source.locale as InterfacePreferences['locale'] : 'system',
    accent: ['cyan', 'blue', 'violet', 'emerald'].includes(String(source.accent))
      ? source.accent as InterfacePreferences['accent'] : 'cyan',
    shortcuts: {
      ...DEFAULT_INTERFACE_PREFERENCES.shortcuts,
      ...(source.shortcuts && typeof source.shortcuts === 'object'
        ? Object.fromEntries(Object.entries(source.shortcuts).map(([key, value]) => [key, String(value).slice(0, 32)]))
        : {})
    },
    microphoneId: typeof source.microphoneId === 'string' && source.microphoneId
      ? source.microphoneId
      : DEFAULT_INTERFACE_PREFERENCES.microphoneId,
    // Campo legacy mantenuto per compatibilità. L'indice SDL viene risolto
    // dinamicamente dal nome del device e non deriva dall'ordine WebRTC.
    microphoneCaptureId: Number.isInteger(source.microphoneCaptureId)
      && Number(source.microphoneCaptureId) >= -1
      && Number(source.microphoneCaptureId) <= 64
      ? Number(source.microphoneCaptureId)
      : -1,
    audioSensitivity: finiteRange(source.audioSensitivity, 1, 0.7, 1.35),
    voiceOutputEnabled: source.voiceOutputEnabled !== false,
    voiceName: typeof source.voiceName === 'string' ? source.voiceName.slice(0, 160) : '',
    voiceEngine: ['system', 'neural', 'expressive'].includes(String(source.voiceEngine))
      ? source.voiceEngine as InterfacePreferences['voiceEngine']
      : 'neural',
    voiceGender: source.voiceGender === 'female' ? 'female' : 'male',
    voiceVocabulary: typeof source.voiceVocabulary === 'string' ? source.voiceVocabulary.slice(0, 2000) : '',
    wakeWordEnabled: source.wakeWordEnabled === true,
    wakeWordConfidence: finiteRange(source.wakeWordConfidence, 0.84, 0.7, 0.95),
    wakeWordCooldownMs: Math.round(finiteRange(source.wakeWordCooldownMs, 5000, 2000, 30000)),
    // Saturno è ora l'identità visiva principale; il preset neurale rimane
    // disponibile come fallback leggero per hardware meno potente.
    coreAppearance: ['orbital-core', 'quantum-aurora'].includes(String(source.coreAppearance))
      ? 'jarvis-reactor'
      : ['saturn-experimental', 'jarvis-reactor', 'neural'].includes(String(source.coreAppearance))
        ? source.coreAppearance as InterfacePreferences['coreAppearance']
        : 'neural',
    // Automatico resta il default portabile; la scelta manuale è conservata
    // per chi vuole privilegiare autonomia, qualità o risparmio energetico.
    visualQuality: ['auto', 'efficient', 'balanced', 'ultra', 'super'].includes(String(source.visualQuality))
      ? source.visualQuality as InterfacePreferences['visualQuality']
      : 'auto',
    hdr: ['auto', 'on', 'off'].includes(String(source.hdr))
      ? source.hdr as InterfacePreferences['hdr']
      : 'auto',
    motion: ['system', 'reduced', 'full'].includes(String(source.motion))
      ? source.motion as InterfacePreferences['motion']
      : 'system',
    particleInteraction: ['auto', 'gentle', 'off'].includes(String(source.particleInteraction))
      ? source.particleInteraction as InterfacePreferences['particleInteraction']
      : 'auto'
  };
}

// #endregion

// #region 02 — Persistenza

export function loadInterfacePreferences(): InterfacePreferences {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_NAMESPACE) || 'null');
    const preferences = normalizeInterfacePreferences(stored);
    // La voce di sistema non è più una scelta pubblica: profili salvati da
    // versioni precedenti vengono portati alla voce neurale locale.
    if (preferences.voiceEngine === 'system') {
      preferences.voiceEngine = 'neural';
      window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(preferences));
    }
    // La migrazione cambia una sola volta il visualizer preesistente senza
    // azzerare microfono, accessibilità o le altre scelte dell'utente.
    if (!window.localStorage.getItem(SATURN_MIGRATION_NAMESPACE)) {
      preferences.coreAppearance = 'saturn-experimental';
      window.localStorage.setItem(SATURN_MIGRATION_NAMESPACE, '1');
      window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(preferences));
    }
    if (!window.localStorage.getItem(NATURAL_VOICE_MIGRATION_NAMESPACE)) {
      preferences.voiceEngine = 'neural';
      window.localStorage.setItem(NATURAL_VOICE_MIGRATION_NAMESPACE, '1');
      window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(preferences));
    }
    // Rimuove una volta sola eventuali profili Ultra/Balanced salvati da
    // versioni precedenti: spostando l'app su un altro PC non devono causare
    // lag prima che l'utente possa aprire le impostazioni.
    if (!window.localStorage.getItem(AUTOMATIC_PERFORMANCE_MIGRATION_NAMESPACE)) {
      preferences.visualQuality = 'auto';
      window.localStorage.setItem(AUTOMATIC_PERFORMANCE_MIGRATION_NAMESPACE, '1');
      window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(preferences));
    }
    // I vecchi companion sono stati sostituiti dalla sola Presence basata sui
    // tre visualizer. La riscrittura elimina i campi pet legacy senza toccare
    // voce, scorciatoie o preferenze di accessibilita.
    if (!window.localStorage.getItem(PRESENCE_MIGRATION_NAMESPACE)
      || (stored && typeof stored === 'object' && ('pet' in stored || 'petFloating' in stored))) {
      window.localStorage.setItem(PRESENCE_MIGRATION_NAMESPACE, '1');
      window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(preferences));
    }
    return preferences;
  } catch {
    return { ...DEFAULT_INTERFACE_PREFERENCES };
  }
}

export function saveInterfacePreferences(value: InterfacePreferences): InterfacePreferences {
  const normalized = normalizeInterfacePreferences(value);
  try { window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(normalized)); } catch {}
  return normalized;
}

// #endregion
