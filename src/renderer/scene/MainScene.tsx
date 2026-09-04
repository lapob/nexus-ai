/**
 * @module renderer/scene/MainScene
 * @description Scena WebGL minimale: campo particellare, camera e post-processing misurato.
 */
import { Canvas, events as createPointerEvents, type RootStore } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ACESFilmicToneMapping, HalfFloatType, NoToneMapping, SRGBColorSpace } from 'three';
import type { AudioBus, EntityState, HardwareProfile, InterfacePreferences, VisualQuality } from '../types/nexus';
import { markStartup } from '../systems/StartupMetrics';

type StartupVisualPhase = 'shell' | 'balanced' | 'full';

function viewportPointerEvents(store: RootStore) {
  const manager = createPointerEvents(store);
  manager.compute = (event, state) => {
    const bounds = state.gl.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      state.pointer.set(0, 0);
      return;
    }
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    state.pointer.set(
      Math.max(-1, Math.min(1, x)),
      Math.max(-1, Math.min(1, y))
    );
    state.raycaster.setFromCamera(state.pointer, state.camera);
  };
  return manager;
}

// Ogni visualizer vive in un chunk separato: il preset non selezionato
// alloca shader, geometrie o memoria GPU.
const ParticleEngine = lazy(() => import('./ParticleEngine').then((module) => ({ default: module.ParticleEngine })));
const SaturnVisualizer = lazy(() => import('./SaturnVisualizer').then((module) => ({ default: module.SaturnVisualizer })));
const NexusCore = lazy(() => import('./NexusCore').then((module) => ({ default: module.NexusCore })));

interface MainSceneProps {
  state: EntityState;
  audioBus: AudioBus;
  preferences: InterfacePreferences;
  hardware: HardwareProfile | null;
  suspended: boolean;
}

// #region 01 — Qualità adattiva

function adaptiveParticleCount(reducedMotion: boolean, quality: VisualQuality, performanceLevel = 1): number {
  // La preferenza di accessibilità riduce anche il carico GPU, non soltanto
  // le transizioni CSS che circondano la scena.
  if (reducedMotion) return 6_000 + (performanceLevel * 5_000);
  if (quality === 'efficient') return performanceLevel <= 1 ? 9_000 : performanceLevel === 2 ? 28_000 : 72_000;
  if (quality === 'balanced') return performanceLevel <= 3 ? 150_000 : performanceLevel === 4 ? 230_000 : 280_000;
  const viewportScale = Math.max(0.58, Math.min(1.32,
    Math.sqrt((window.innerWidth * window.innerHeight) / (1920 * 1080))));
  if (quality === 'super') return Math.round((performanceLevel >= 5 ? 430_000 : 300_000) * viewportScale);
  if (quality === 'ultra') return Math.round((performanceLevel >= 5 ? 340_000 : 260_000) * viewportScale);
  const cores = navigator.hardwareConcurrency || 4;
  const compact = window.innerWidth < 900;
  if (compact) return 150_000;
  if (cores >= 8 && window.innerWidth >= 1360) return 320_000;
  if (cores >= 6) return 230_000;
  return 150_000;
}

function qualityForHardware(hardware: HardwareProfile | null): Exclude<VisualQuality, 'auto'> {
  if (!hardware) return 'efficient';
  if (!hardware.accelerated || hardware.tier === 'lite' || hardware.gpuMemoryBytes < 3 * 1024 ** 3) return 'efficient';
  if (hardware.performanceLevel === 5 && hardware.gpuMemoryBytes >= 14 * 1024 ** 3) return 'super';
  if (hardware.tier === 'performance' && hardware.gpuMemoryBytes >= 8 * 1024 ** 3) return 'ultra';
  return 'balanced';
}

function useAdaptiveQuality(preference: VisualQuality, hardware: HardwareProfile | null, active: boolean): {
  quality: Exclude<VisualQuality, 'auto'>;
  visible: boolean;
} {
  const [quality, setQuality] = useState<Exclude<VisualQuality, 'auto'>>(() => qualityForHardware(hardware));
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const healthyWindows = useRef(0);
  const slowWindows = useRef(0);

  useEffect(() => {
    if (preference === 'auto') setQuality(qualityForHardware(hardware));
  }, [hardware, preference]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (preference !== 'auto' || !visible || !active) return;
    let frame = 0;
    let previous = performance.now();
    let elapsed = 0;
    let handle = 0;
    const sample = (now: number) => {
      frame += 1;
      elapsed += now - previous;
      previous = now;
      if (elapsed >= 4_000) {
        const fps = frame * 1_000 / elapsed;
        // L'isteresi evita continui cambi qualità quando gli FPS oscillano
        // vicino alla soglia e lascia al sistema il tempo di stabilizzarsi.
        setQuality((current) => {
          // Una workstation livello 5 parte e rimane su Ultra durante normali
          // oscillazioni di carico. Scala soltanto dopo due finestre realmente
          // critiche; sugli altri PC reagisce prima per preservare fluidità.
          if (hardware?.performanceLevel === 5 && (current === 'ultra' || current === 'super')) {
            slowWindows.current = fps < 30 ? slowWindows.current + 1 : 0;
            if (slowWindows.current < 2) return current;
            slowWindows.current = 0;
            healthyWindows.current = 0;
            return current === 'super' ? 'ultra' : 'balanced';
          }
          if (fps < 48) {
            slowWindows.current = 0;
            healthyWindows.current = 0;
            return current === 'super' ? 'ultra' : current === 'ultra' ? 'balanced' : 'efficient';
          }
          slowWindows.current = 0;
          // L'upgrade automatico è conservativo: evita che pochi secondi
          // fortunati riportino una GPU integrata su un profilo instabile.
          if (fps > 57) healthyWindows.current += 1;
          else healthyWindows.current = 0;
          if (healthyWindows.current >= 3 && current === 'efficient' && hardware?.tier !== 'lite'
            && (hardware?.gpuMemoryBytes ?? 0) >= 4 * 1024 ** 3) {
            healthyWindows.current = 0;
            return 'balanced';
          }
          if (healthyWindows.current >= 3 && current === 'balanced'
            && hardware?.performanceLevel === 5
            && (hardware?.gpuMemoryBytes ?? 0) >= 12 * 1024 ** 3) {
            healthyWindows.current = 0;
            return 'ultra';
          }
          if (healthyWindows.current >= 3 && current === 'ultra'
            && hardware?.performanceLevel === 5
            && (hardware?.gpuMemoryBytes ?? 0) >= 14 * 1024 ** 3) {
            healthyWindows.current = 0;
            return 'super';
          }
          return current;
        });
        frame = 0;
        elapsed = 0;
      }
      handle = requestAnimationFrame(sample);
    };
    handle = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(handle);
  }, [active, hardware, preference, visible]);

  return {
    quality: preference === 'auto' ? quality : preference,
    visible
  };
}

/**
 * Lascia al browser due paint completi prima di inizializzare la scena e
 * sposta la geometria massima in una finestra idle. La qualità finale non
 * cambia: viene raggiunta progressivamente senza contendere il thread alla
 * shell, al caricamento font e all'idratazione iniziale.
 */
function useStartupVisualRamp(): StartupVisualPhase {
  const [phase, setPhase] = useState<StartupVisualPhase>('shell');

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let balanceTimer = 0;
    let fullTimer = 0;
    let idleHandle: number | null = null;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        balanceTimer = window.setTimeout(() => {
          if (!cancelled) setPhase('balanced');
        }, 420);

        fullTimer = window.setTimeout(() => {
          const promote = () => {
            if (!cancelled) setPhase('full');
          };
          if ('requestIdleCallback' in window) {
            idleHandle = window.requestIdleCallback(promote, { timeout: 3_500 });
          } else {
            promote();
          }
        }, 2_200);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(balanceTimer);
      window.clearTimeout(fullTimer);
      if (idleHandle !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle);
    };
  }, []);

  return phase;
}

// #endregion

// #region 02 — Canvas e composizione

export function MainScene({ state, audioBus, preferences, hardware, suspended }: MainSceneProps) {
  const pointerPresence = useRef(0);
  const pointerReleaseTimer = useRef<number | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const contextCleanup = useRef<(() => void) | null>(null);
  const restoreTimer = useRef<number | null>(null);
  useEffect(() => () => {
    contextCleanup.current?.();
    if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
    if (pointerReleaseTimer.current !== null) window.clearTimeout(pointerReleaseTimer.current);
  }, []);
  useEffect(() => {
    const releasePointer = () => { pointerPresence.current = 0; };
    window.addEventListener('blur', releasePointer);
    document.addEventListener('pointerleave', releasePointer);
    document.addEventListener('visibilitychange', releasePointer);
    return () => {
      window.removeEventListener('blur', releasePointer);
      document.removeEventListener('pointerleave', releasePointer);
      document.removeEventListener('visibilitychange', releasePointer);
    };
  }, []);
  const systemReducedMotion = useReducedMotion() === true;
  // Il livello minimo prevale anche su una vecchia preferenza "Completo":
  // spostando il profilo su un PC debole l'app deve proteggersi da sola.
  const reducedMotion = hardware?.performanceLevel === 1
    || preferences.motion === 'reduced'
    || (preferences.motion === 'system' && systemReducedMotion);
  // La qualità è sempre adattiva: NEXUSNXS misura il dispositivo e protegge gli
  // FPS senza chiedere all'utente di conoscere profili GPU.
  const runtime = useAdaptiveQuality(preferences.visualQuality, hardware, !suspended);
  const startupPhase = useStartupVisualRamp();
  const performanceLevel = hardware?.performanceLevel || 1;
  const pointerIntensity = preferences.particleInteraction === 'off'
    ? 0
    : preferences.particleInteraction === 'gentle'
      ? 0.55
      : performanceLevel <= 1 || reducedMotion ? 0.38 : 1;
  const effectiveQuality = startupPhase === 'shell'
    ? 'efficient'
    : startupPhase === 'balanced' && (runtime.quality === 'ultra' || runtime.quality === 'super')
      ? 'balanced'
      : runtime.quality;
  const fullParticleCount = adaptiveParticleCount(reducedMotion, effectiveQuality, performanceLevel);
  const particleCount = startupPhase === 'shell'
    ? Math.min(fullParticleCount, performanceLevel <= 1 ? 24_000 : 52_000)
    : startupPhase === 'balanced'
      ? Math.min(fullParticleCount, 120_000)
      : fullParticleCount;
  const wideGamutDisplay = window.matchMedia('(color-gamut: p3)').matches;
  const highDynamicRangeDisplay = window.matchMedia('(dynamic-range: high)').matches;
  const hdrEnabled = preferences.hdr === 'on'
    || (preferences.hdr === 'auto'
      && performanceLevel >= 5
      && (highDynamicRangeDisplay || wideGamutDisplay)
      && startupPhase === 'full'
      && (effectiveQuality === 'super' || effectiveQuality === 'ultra'));
  const activatePointer = () => {
    pointerPresence.current = pointerIntensity;
    if (pointerReleaseTimer.current !== null) window.clearTimeout(pointerReleaseTimer.current);
    pointerReleaseTimer.current = window.setTimeout(() => {
      pointerPresence.current = 0;
      pointerReleaseTimer.current = null;
    }, 820);
  };
  const releasePointer = () => {
    pointerPresence.current = 0;
    if (pointerReleaseTimer.current !== null) {
      window.clearTimeout(pointerReleaseTimer.current);
      pointerReleaseTimer.current = null;
    }
  };
  return (
    <>
    <Canvas
      events={viewportPointerEvents}
      onPointerMove={activatePointer}
      onPointerDown={activatePointer}
      onPointerLeave={releasePointer}
      onPointerCancel={releasePointer}
      onLostPointerCapture={releasePointer}
      onPointerUp={(event) => { if (event.pointerType === 'touch') releasePointer(); }}
      frameloop={suspended || !runtime.visible
        ? 'never'
        : 'always'}
      camera={{ position: [0, 1.8, 11.8], fov: 43, near: 0.1, far: 40 }}
      dpr={startupPhase === 'shell'
        ? [0.55, 0.75]
        : effectiveQuality === 'efficient'
        ? performanceLevel <= 1 ? [0.45, 0.6] : [0.6, 0.8]
        : effectiveQuality === 'super'
          ? performanceLevel >= 5 ? [1.35, 2] : [1.05, 1.4]
          : effectiveQuality === 'ultra'
            ? performanceLevel >= 5 ? [1.15, 1.7] : [1, 1.3]
          : performanceLevel >= 4 ? [0.9, 1.2] : [0.82, 1.05]}
      gl={{
        // MSAA sui profili capaci rende i punti leggibili senza ricorrere a
        // bloom forte, che finirebbe per fondere i dettagli in una foschia.
        antialias: effectiveQuality !== 'efficient',
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true
      }}
      onCreated={({ gl }) => {
        markStartup('webgl-ready');
        gl.setClearColor('#010304', 1);
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = hdrEnabled ? ACESFilmicToneMapping : NoToneMapping;
        gl.toneMappingExposure = hdrEnabled ? 1.08 : 1;
        contextCleanup.current?.();
        const canvas = gl.domElement;
        const lost = (event: Event) => {
          event.preventDefault();
          setContextLost(true);
          if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
          restoreTimer.current = window.setTimeout(() => {
            restoreTimer.current = null;
            gl.forceContextRestore();
          }, 280);
        };
        const restored = () => setContextLost(false);
        canvas.addEventListener('webglcontextlost', lost);
        canvas.addEventListener('webglcontextrestored', restored);
        contextCleanup.current = () => {
          canvas.removeEventListener('webglcontextlost', lost);
          canvas.removeEventListener('webglcontextrestored', restored);
        };
      }}
    >
      <Suspense fallback={null}>
        {preferences.coreAppearance === 'neural' ? (
          <ParticleEngine
            state={state}
            audioBus={audioBus}
            particleCount={particleCount}
            reducedMotion={reducedMotion}
            quality={effectiveQuality}
            pointerPresence={pointerPresence}
          />
        ) : preferences.coreAppearance === 'jarvis-reactor' ? (
          <NexusCore
            state={state}
            audioBus={audioBus}
            reducedMotion={reducedMotion}
            quality={effectiveQuality}
            performanceLevel={performanceLevel}
            pointerPresence={pointerPresence}
          />
        ) : (
          <SaturnVisualizer
            state={state}
            audioBus={audioBus}
            reducedMotion={reducedMotion}
            quality={effectiveQuality}
            performanceLevel={performanceLevel}
            pointerPresence={pointerPresence}
          />
        )}
      </Suspense>
      {startupPhase !== 'shell' && effectiveQuality !== 'efficient' && (
        <EffectComposer multisampling={0} frameBufferType={hdrEnabled ? HalfFloatType : undefined}>
          <Bloom
            resolutionScale={effectiveQuality === 'super' ? 0.9 : effectiveQuality === 'ultra' && performanceLevel >= 5 ? 0.78 : effectiveQuality === 'ultra' ? 0.58 : 0.4}
            intensity={preferences.coreAppearance === 'saturn-experimental'
              ? effectiveQuality === 'super' ? 0.31 : effectiveQuality === 'ultra' ? 0.3 : 0.24
              : preferences.coreAppearance === 'jarvis-reactor'
                ? effectiveQuality === 'super' ? 0.25 : effectiveQuality === 'ultra' ? 0.24 : 0.18
                : effectiveQuality === 'super' ? 0.23 : effectiveQuality === 'ultra' ? 0.22 : 0.16}
            luminanceThreshold={preferences.coreAppearance === 'saturn-experimental' ? 0.5 : 0.58}
            luminanceSmoothing={0.1}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
    {contextLost && <div className="webgl-recovery" role="status">Ripristino grafica…</div>}
    </>
  );
}

// #endregion
