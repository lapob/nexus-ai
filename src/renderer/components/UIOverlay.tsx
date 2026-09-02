/**
 * @module renderer/components/UIOverlay
 * @description Colonna narrativa: stato, task, log, trascrizione e risposta senza controlli permanenti.
 */
import { AnimatePresence, motion } from 'framer-motion';
import nexusMark from '../assets/nexus-mark-ui.png';
import type { EntityState, LiveLogEntry, TaskStep } from '../types/nexus';
import { LiveLogs } from './LiveLogs';
import { SpeechStatus } from './SpeechStatus';
import { TaskPanel } from './TaskPanel';
import { shortcutLabel } from '../systems/KeyboardShortcuts';
import type { InterfacePreferences } from '../types/nexus';

// #region 01 — Contratto

interface UIOverlayProps {
  state: EntityState;
  steps: TaskStep[];
  logs: LiveLogEntry[];
  transcript: string;
  voiceNotice: string;
  voiceEnabled: boolean;
  audioLevel: number;
  generating: boolean;
  bargeInListening: boolean;
  queuedVoicePrompt: string;
  runtimePreparing: boolean;
  fatalError: string;
  onToggleVoiceAccess: () => void;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  onToggleVoice: () => void;
  onOpenCommand: () => void;
  shortcuts: InterfacePreferences['shortcuts'];
}

// #endregion

// #region 02 — Superfici contestuali

export function UIOverlay({ state, steps, logs, transcript, voiceNotice, voiceEnabled, audioLevel, generating, bargeInListening, queuedVoicePrompt, runtimePreparing, fatalError, onToggleVoiceAccess, privacyMode, onTogglePrivacy, onToggleVoice, onOpenCommand, shortcuts }: UIOverlayProps) {
  // Il registro è contestuale: emerge durante attività e anomalie, poi lascia
  // nuovamente il centro della scena al NexusNXS Core.
  const revealLogs = ['executing', 'permission', 'offline', 'error'].includes(state);
  const revealTask = ['executing', 'permission', 'error'].includes(state) && steps.length > 0;
  return (
    <>
      <aside className="ui-overlay">
        <div className="entity-signature" aria-hidden="true">
          <img src={nexusMark} alt="" />
          <span>NEXUSNXS</span>
        </div>
        {runtimePreparing && state === 'booting' && (
          <div className="runtime-identity" aria-label="Preparazione in corso">
            <i data-preparing="true" aria-hidden="true" />
            <span>Preparazione</span>
          </div>
        )}
        {privacyMode ? (
          <section className="entity-section privacy-presence">
            <span className="section-label">Privacy</span>
            <strong>Sessione sospesa</strong>
            <p>Microfono, richieste e registro sono disattivati.</p>
            <button type="button" className="voice-access-toggle" onClick={onTogglePrivacy}>Riattiva NEXUSNXS</button>
          </section>
        ) : (
          <SpeechStatus state={state} voiceEnabled={voiceEnabled} audioLevel={audioLevel} generating={generating} activeStep={steps.find((step) => step.status === 'active')} onToggleVoiceAccess={onToggleVoiceAccess} runtimePreparing={runtimePreparing} serviceNotice={fatalError} />
        )}
        {!privacyMode && revealTask && <TaskPanel steps={steps} />}
        <AnimatePresence>
          {!privacyMode && revealLogs && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <LiveLogs entries={logs} />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!privacyMode && (bargeInListening || queuedVoicePrompt) && (
            <motion.div
              className="queued-turn"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <i aria-hidden="true" />
              <span>{queuedVoicePrompt || 'Ti ascolto mentre completo la risposta'}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!privacyMode && transcript && (
            <motion.section className="entity-section transcript-block" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="section-label">Tu</span>
              <p>{transcript}</p>
            </motion.section>
          )}
        </AnimatePresence>
      </aside>
      <AnimatePresence>
        {!privacyMode && (fatalError || voiceNotice) && (
          <motion.div
            className="voice-notice"
            role={fatalError ? 'alert' : 'status'}
            aria-live={fatalError ? 'assertive' : 'polite'}
            data-tone={fatalError ? 'error' : 'info'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <i aria-hidden="true" />
            <span>{fatalError || voiceNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="interaction-hint">
        <button type="button" className="shortcut-item" onClick={onToggleVoice}><kbd>{shortcutLabel(shortcuts.voice)}</kbd><small>PARLA</small></button>
        <button type="button" className="shortcut-item" onClick={onOpenCommand}><kbd>{shortcutLabel(shortcuts.composer)}</kbd><small>SCRIVI</small></button>
      </div>
      <div className="sr-only" aria-label="Capacità disponibili a voce">
        Puoi chiedere a NexusNXS di mostrare cronologia, modelli, impostazioni, privacy o collegamento del telefono.
        <button type="button" className="history-shortcut" onClick={() => window.dispatchEvent(new CustomEvent('nexus:voice-command', { detail: 'history' }))}>Cronologia</button>
      </div>
    </>
  );
}

// #endregion
