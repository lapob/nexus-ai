/**
 * @module renderer/systems/AnimationController
 * @description Traduce gli stati cognitivi di NEXUSNXS in parametri continui per gli shader.
 */
import type { EntityState } from '../types/nexus';

// Shared inspection physics: fast response to the pointer, ~2.4 s to settle.
// Only decorative deformation uses this; voice/state feedback stays immediate.
export const VISUALIZER_POINTER_DAMPING = { engage: 7, release: 1.25 } as const;

export interface AnimationProfile {
  mode: number;
  energy: number;
  coherence: number;
  rotation: number;
  turbulence: number;
  breath: number;
}

const PROFILES: Record<EntityState, AnimationProfile> = {
  booting: { mode: 0, energy: 0.08, coherence: 0.8, rotation: 0.03, turbulence: 0.08, breath: 0.15 },
  idle: { mode: 0, energy: 0.17, coherence: 0.92, rotation: 0.035, turbulence: 0.1, breath: 0.28 },
  listening: { mode: 1, energy: 0.42, coherence: 0.76, rotation: 0.085, turbulence: 0.2, breath: 0.46 },
  speaking: { mode: 2, energy: 0.76, coherence: 0.6, rotation: 0.14, turbulence: 0.46, breath: 0.56 },
  thinking: { mode: 3, energy: 0.58, coherence: 0.97, rotation: 0.17, turbulence: 0.29, breath: 0.2 },
  responding: { mode: 4, energy: 0.68, coherence: 0.9, rotation: 0.11, turbulence: 0.22, breath: 0.62 },
  executing: { mode: 5, energy: 0.76, coherence: 0.72, rotation: 0.27, turbulence: 0.38, breath: 0.2 },
  permission: { mode: 6, energy: 0.46, coherence: 0.99, rotation: 0.018, turbulence: 0.06, breath: 0.12 },
  offline: { mode: 0, energy: 0.04, coherence: 0.65, rotation: 0.012, turbulence: 0.04, breath: 0.08 },
  error: { mode: 7, energy: 0.48, coherence: 0.34, rotation: 0.02, turbulence: 0.5, breath: 0.1 }
};

export class AnimationController {
  private current: AnimationProfile = { ...PROFILES.booting };
  private target: AnimationProfile = PROFILES.booting;

  setState(state: EntityState): void {
    this.target = PROFILES[state];
  }

  update(delta: number): AnimationProfile {
    // Una costante più pronta mantiene lo stato visivo sincronizzato con voce
    // e streaming. Con 2.8 il 95% della transizione richiedeva oltre un
    // secondo: il feedback arrivava quando la fase cognitiva era già cambiata.
    const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 5.2);
    // `mode` è un identificatore discreto, non un parametro animabile.
    // Interpolarlo attraversava gli stati intermedi (per esempio da idle a
    // error passava visivamente da ascolto, voce, pensiero ed esecuzione).
    // La dissolvenza del nuovo stato viene gestita direttamente dallo shader.
    this.current.mode = this.target.mode;
    this.current.energy += (this.target.energy - this.current.energy) * ease;
    this.current.coherence += (this.target.coherence - this.current.coherence) * ease;
    this.current.rotation += (this.target.rotation - this.current.rotation) * ease;
    this.current.turbulence += (this.target.turbulence - this.current.turbulence) * ease;
    this.current.breath += (this.target.breath - this.current.breath) * ease;
    return this.current;
  }
}
