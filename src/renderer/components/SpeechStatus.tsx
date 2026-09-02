/**
 * @module renderer/components/SpeechStatus
 * @description Stato essenziale della voce con micro-copy contestuale.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { EntityState } from '../types/nexus';
import type { TaskStep } from '../types/nexus';

// #region 01 — Copy e contratto

const COPY: Record<EntityState, { title: string; detail: string }> = {
  booting: { title: 'Risveglio…', detail: 'Inizializzazione locale' },
  idle: { title: 'Pronto', detail: 'Premi Spazio per parlare' },
  listening: { title: 'In ascolto…', detail: 'Microfono attivo' },
  speaking: { title: 'Voce rilevata…', detail: 'Sto riconoscendo la tua voce' },
  thinking: { title: 'Sto pensando…', detail: 'Comprensione e pianificazione' },
  responding: { title: 'Sto rispondendo…', detail: 'Risposta in corso' },
  executing: { title: 'Esecuzione…', detail: 'Azione autorizzata in corso' },
  permission: { title: 'Consenso richiesto', detail: 'Controlla la richiesta di sistema' },
  offline: { title: 'NEXUSNXS non disponibile', detail: 'Controlla le impostazioni e riprova' },
  error: { title: 'Richiede attenzione', detail: 'Controlla il registro live' }
};

interface SpeechStatusProps {
  state: EntityState;
  voiceEnabled: boolean;
  audioLevel: number;
  generating: boolean;
  activeStep?: TaskStep;
  onToggleVoiceAccess: () => void;
  runtimePreparing?: boolean;
  serviceNotice?: string;
}

// #endregion

// #region 02 — Stato vocale e meter

export function SpeechStatus({ state, voiceEnabled, audioLevel, generating, activeStep, onToggleVoiceAccess, runtimePreparing = false, serviceNotice = '' }: SpeechStatusProps) {
  const copy = runtimePreparing
    ? { title: 'Sto preparando NexusNXS…', detail: 'Puoi già esplorare l’app' }
    : state === 'offline' && serviceNotice
      ? { title: 'NexusNXS non è raggiungibile', detail: serviceNotice }
      : voiceEnabled
    ? COPY[state]
    : { title: 'Voce in pausa', detail: 'Riconoscimento vocale disattivato' };
  const detail = generating && (state === 'listening' || state === 'speaking')
    ? 'Ti ascolto mentre la risposta continua'
    : (state === 'thinking' || state === 'executing') && activeStep
      ? activeStep.label
    : copy.detail;
  return (
    <section
      className="entity-section speech-status"
      data-voice-enabled={voiceEnabled}
      data-state={state}
      aria-label={copy.title}
    >
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          className="status-copy"
          key={state}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="status-title">
            <span className="status-pulse" aria-hidden="true"><i /></span>
            <strong>{copy.title}</strong>
          </div>
          <p>{detail}</p>
          {(state === 'listening' || state === 'speaking') && (
            <div className="listening-waveform" role="meter" aria-label="Livello microfono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioLevel * 100)}>
              {Array.from({ length: 42 }, (_, index) => {
                const profile = 0.22 + Math.abs(Math.sin(index * 0.73)) * 0.78;
                // La radice comprime i picchi ma amplifica i segnali bassi:
                // il meter resta vivo anche quando l'utente parla sottovoce.
                const perceivedLevel = Math.pow(Math.max(0, audioLevel), 0.52);
                const amplitude = Math.max(0.12, Math.min(1, perceivedLevel * 2.15 * profile));
                return (
                  <span
                    key={index}
                    style={{
                      transform: `scaleY(${amplitude})`,
                      opacity: 0.42 + amplitude * 0.58
                    }}
                  />
                );
              })}
            </div>
          )}
          {(state !== 'idle' || !voiceEnabled) && (
            <button
              className="voice-access-toggle"
              type="button"
              aria-pressed={voiceEnabled}
              onClick={onToggleVoiceAccess}
            >
              <span>{voiceEnabled ? 'Voce attiva' : 'Voce disattivata'}</span>
              <kbd>V</kbd>
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// #endregion
