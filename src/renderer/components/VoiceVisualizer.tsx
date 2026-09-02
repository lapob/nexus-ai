/**
 * @module renderer/components/VoiceVisualizer
 * @description Superficie principale e interattiva dell'entità vocale NEXUSNXS.
 */
import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { AudioBus, EntityState, HardwareProfile, InterfacePreferences } from '../types/nexus';
import { ThinkingAnimation } from './ThinkingAnimation';
import { markStartup } from '../systems/StartupMetrics';

// #region 01 — Caricamento differito e confine WebGL

// La shell testuale appare subito; WebGL viene caricato in un chunk separato
// e prende il controllo appena il runtime grafico è pronto.
const MainScene = lazy(() => import('../scene/MainScene').then((module) => ({ default: module.MainScene })));

interface VoiceVisualizerProps {
  state: EntityState;
  audioBus: AudioBus;
  preferences: InterfacePreferences;
  hardware: HardwareProfile | null;
  suspended: boolean;
  interactionDisabled: boolean;
  onActivate: () => void;
}

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('WebGL renderer non disponibile.', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <ThinkingAnimation fallback /> : this.props.children;
  }
}

// #endregion
// #region 02 — Presenza interattiva e transizioni narrative

export function VoiceVisualizer({ state, audioBus, preferences, hardware, suspended, interactionDisabled, onActivate }: VoiceVisualizerProps) {
  const [sceneReady, setSceneReady] = useState(false);
  const previousState = useRef(state);
  const [transition, setTransition] = useState({ id: 0, from: state, to: state });

  useEffect(() => {
    // La shell e i controlli hanno la precedenza sul bundle WebGL. Un piccolo
    // rinvio idle lascia a Chromium il primo paint e impedisce al chunk Three
    // (quasi 1 MB) di contendersi il thread con font, IPC e bootstrap locale.
    let cancelled = false;
    let idleHandle: number | null = null;
    const delay = hardware?.performanceLevel === 1 ? 1_600 : hardware?.performanceLevel === 2 ? 1_050 : 650;
    const timer = window.setTimeout(() => {
      const reveal = () => {
        if (!cancelled) {
          markStartup('webgl-requested');
          setSceneReady(true);
        }
      };
      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(reveal, { timeout: 2_000 });
      } else {
        reveal();
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleHandle !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle);
    };
  }, [hardware?.performanceLevel]);

  useEffect(() => {
    if (previousState.current === state) return;
    setTransition((current) => ({
      id: current.id + 1,
      from: previousState.current,
      to: state
    }));
    previousState.current = state;
  }, [state]);

  const understood = transition.from === 'speaking'
    && (transition.to === 'thinking' || transition.to === 'responding');

  return (
    <section
      className="voice-visualizer"
      data-core-appearance={preferences.coreAppearance}
      data-entity-state={state}
      role="button"
      tabIndex={interactionDisabled ? -1 : 0}
      aria-disabled={interactionDisabled}
      aria-label={interactionDisabled
        ? 'Entità vocale NEXUSNXS temporaneamente non interattiva.'
        : 'Entità vocale NEXUSNXS. Premi Spazio o fai clic per parlare.'}
      onClick={() => {
        if (!interactionDisabled) onActivate();
      }}
      onKeyDown={(event) => {
        // Lo spazio è già gestito dallo shortcut globale; Enter rende
        // esplicita l'attivazione quando la superficie ha il focus.
        if (event.key === 'Enter' && !interactionDisabled) onActivate();
      }}
    >
      <WebGLBoundary>
        <Suspense fallback={<ThinkingAnimation fallback />}>
          {sceneReady
            ? <MainScene state={state} audioBus={audioBus} preferences={preferences} hardware={hardware} suspended={suspended} />
            : <ThinkingAnimation fallback />}
        </Suspense>
      </WebGLBoundary>
      <div className="visualizer-ambient" aria-hidden="true">
        <i className="ambient-depth ambient-depth-far" />
        <i className="ambient-depth ambient-depth-near" />
      </div>
      <div
        className="visualizer-transition"
        data-understood={understood}
        data-from={transition.from}
        data-to={transition.to}
        key={transition.id}
        aria-hidden="true"
      >
        <i className="comprehension-wave" />
        <i className="voice-echo voice-echo-primary" />
        <i className="voice-echo voice-echo-secondary" />
      </div>
      <div className="visualizer-vignette" aria-hidden="true" />
    </section>
  );
}

// #endregion
