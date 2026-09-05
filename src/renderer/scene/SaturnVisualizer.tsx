/**
 * @module renderer/scene/SaturnVisualizer
 * @description Saturno astratto costruito interamente da particelle reattive alla voce.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AudioBus, EntityState } from '../types/nexus';
import { VISUALIZER_POINTER_DAMPING } from '../systems/AnimationController';

// #region 01 — Contratto e shader condiviso

interface SaturnVisualizerProps {
  state: EntityState;
  audioBus: AudioBus;
  reducedMotion: boolean;
  quality: 'auto' | 'efficient' | 'balanced' | 'ultra' | 'super';
  performanceLevel: number;
  pointerPresence: RefObject<number>;
}

interface ParticleField {
  positions: Float32Array;
  seeds: Float32Array;
  importance: Float32Array;
}

const saturnFieldCache = new Map<string, ParticleField>();

function cachedField(kind: 'planet' | 'orbit' | 'halo', count: number, create: () => ParticleField): ParticleField {
  const key = `${kind}:${count}`;
  const cached = saturnFieldCache.get(key);
  if (cached) return cached;
  const field = create();
  saturnFieldCache.set(key, field);
  while (saturnFieldCache.size > 9) saturnFieldCache.delete(saturnFieldCache.keys().next().value as string);
  return field;
}

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aImportance;
  uniform float uTime;
  uniform float uKind;
  uniform float uStateEnergy;
  uniform float uTransition;
  uniform float uRingVisibility;
  uniform float uDisintegration;
  uniform vec4 uAudio;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  uniform float uPointScale;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying float vAlpha;
  varying float vEnergy;
  varying float vKind;
  varying float vShade;

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 p = position;
    vKind = uKind;
    vShade = 1.0;
    // Saturno reagisce già alle voci leggere, mantenendo però una riserva
    // dinamica per i transienti più forti.
    float voice = clamp(uAudio.x * 1.38, 0.0, 0.9);

    if (uKind < 0.5) {
      // Il nucleo conserva una forma planetaria, ma la superficie respira e
      // viene attraversata dalle frequenze della voce.
      float radius = length(p);
      float latitude = atan(p.y, length(p.xz));
      p.xz = rotate2d(uTime * 0.035 + aSeed * 0.002) * p.xz;
      float surfaceWave = sin(latitude * 19.0 - uTime * 0.75 + aSeed * 5.0);
      p *= 1.0 + voice * 0.06 + uAudio.y * surfaceWave * 0.042
        + uTransition * 0.045 + uStateEnergy * 0.035;
      p += normalize(p) * sin(radius * 13.0 + uTime + aSeed * 8.0) * uAudio.z * 0.04;
      // Una base luminosa costante mantiene leggibile il nucleo anche offline;
      // stato e voce aggiungono energia senza saturare tutte le particelle.
      vAlpha = (0.16 + aSeed * 0.3 + voice * 0.12 + uStateEnergy * 0.14)
        * (0.32 + aImportance * 0.84);
      vec3 surfaceNormal = normalize(p);
      float directional = dot(surfaceNormal, normalize(vec3(-0.38, 0.64, 0.68))) * 0.5 + 0.5;
      float rim = pow(1.0 - abs(surfaceNormal.z), 2.2);
      vShade = 0.34 + directional * 0.5 + rim * 0.2;
    } else if (uKind < 1.5) {
      // Anelli e meteoriti costituiscono il vero spettro: ampiezza, ondulazione
      // e dispersione derivano rispettivamente da volume, medi e alti.
      float angle = atan(p.y, p.x);
      float radius = length(p.xy);
      // Ogni particella nasce sulla superficie del nucleo e raggiunge la sua
      // orbita in un momento leggermente diverso. L'easing cubico evita che la
      // geometria degli anelli appaia già completa durante la transizione.
      float formation = smoothstep(aSeed * 0.24, 0.54 + aSeed * 0.24, uRingVisibility);
      formation = formation * formation * (3.0 - 2.0 * formation);
      vec2 radialDirection = normalize(p.xy);
      vec2 ringTarget = p.xy;
      vec2 surfaceOrigin = radialDirection * (0.88 + aSeed * 0.08);
      p.xy = mix(surfaceOrigin, ringTarget, formation);
      // Conservazione del momento angolare: la materia vicina ruota un poco
      // più rapidamente di quella esterna e non sembra un disco rigido.
      float orbitalSpeed = 0.014 + 0.034 / max(1.0, length(ringTarget));
      p.xy = rotate2d((1.0 - formation) * (0.22 + aSeed * 0.5)
        + uTime * orbitalSpeed * formation) * p.xy;
      p.z = mix((aSeed - 0.5) * 0.035, p.z, formation);
      // In chiusura le orbite non rientrano come un oggetto rigido: ogni
      // particella perde coesione con velocità e direzione determinate dal seed.
      float breakup = uDisintegration * (0.25 + aSeed * 0.75);
      p.xy *= 1.0 + breakup * (0.12 + aSeed * 0.22);
      p.z += sin(aSeed * 37.0 + uTime * 2.6) * breakup * 0.48;
      // La voce attraversa gli anelli come onde concentriche. L'effetto usa
      // fase e seed diversi per non produrre un cerchio rigido da equalizzatore.
      float speechRipple = sin(radius * 8.5 - uTime * 5.2 + aSeed * 2.4);
      float transient = pow(max(0.0, sin(angle * 7.0 + uTime * 3.4 + aSeed * 5.0)), 9.0);
      // Correnti lente e non sincronizzate mantengono vivo il disco anche
      // durante le pause, senza farlo pulsare come un equalizzatore.
      float orbitalBreath = sin(uTime * (0.22 + aSeed * 0.16) + angle * 2.0 + aSeed * 9.0);
      p.xy *= 1.0 + orbitalBreath * (0.004 + aSeed * 0.004) * formation;
      p.xy *= 1.0 + voice * (0.09 + aSeed * 0.12 + speechRipple * 0.035)
        + uTransition * (0.035 + aSeed * 0.025);
      p.z += sin(angle * 3.0 - uTime * 0.32 + aSeed * 8.0) * 0.012 * formation;
      p.z += sin(angle * 10.0 - uTime * 1.25 + radius * 3.0) * uAudio.z * 0.16;
      p.z += (aSeed - 0.5) * uAudio.w * 0.28;
      p.z += transient * uAudio.w * 0.16;
      float survival = smoothstep(uDisintegration * 0.92, 1.0, fract(aSeed * 17.31 + radius * 0.37));
      float livingLight = 0.94 + 0.12 * sin(uTime * (0.34 + aSeed * 0.2) + aSeed * 17.0);
      vAlpha = (0.105 + aSeed * 0.46 + voice * (0.24 + transient * 0.24)
        + abs(uTransition) * 0.1) * aImportance * formation * survival;
      vAlpha *= livingLight;
    } else {
      // La nube esterna rompe la geometria perfetta degli anelli. Il moto è
      // volutamente lento: deve sembrare polvere cosmica, non un equalizzatore.
      float angle = atan(p.y, p.x);
      float radius = length(p.xy);
      // L'alone emerge dopo le orbite interne: prima una corona sottile sulla
      // superficie, poi polvere che si separa dolcemente dal pianeta.
      float formation = smoothstep(0.22 + aSeed * 0.2, 0.72 + aSeed * 0.18, uRingVisibility);
      formation = formation * formation * (3.0 - 2.0 * formation);
      vec2 radialDirection = normalize(p.xy);
      vec2 haloTarget = p.xy;
      p.xy = mix(radialDirection * (0.9 + aSeed * 0.07), haloTarget, formation);
      p.xy = rotate2d((1.0 - formation) * (-0.42 - aSeed * 0.66)
        - uTime * (0.006 + aSeed * 0.009) * formation) * p.xy;
      p.z = mix((aSeed - 0.5) * 0.025, p.z, formation);
      float breakup = uDisintegration * (0.35 + aSeed * 0.9);
      p.xy *= 1.0 + breakup * 0.3;
      p.z += cos(aSeed * 41.0 - uTime * 1.8) * breakup * 0.72;
      p.z += sin(uTime * 0.18 + aSeed * 11.0 + angle) * 0.018 * formation;
      p.z += sin(angle * 5.0 + radius * 2.0 - uTime * 0.45) * (0.05 + uAudio.z * 0.12);
      float haloRipple = sin(radius * 5.0 - uTime * 3.2 + aSeed * 4.0);
      p.xy *= 1.0 + voice * (0.045 + aSeed * 0.06 + haloRipple * 0.025)
        + uTransition * (0.025 + aSeed * 0.02);
      float survival = smoothstep(uDisintegration * 0.88, 1.0, fract(aSeed * 23.17 + radius));
      vAlpha = (0.014 + aSeed * 0.095 + voice * (0.08 + max(0.0, haloRipple) * 0.075))
        * aImportance * formation * survival;
    }

    vec2 pointerPosition = uPointer;
    vec2 pointerDelta = p.xy - pointerPosition;
    float pointerField = exp(-dot(pointerDelta, pointerDelta) * 2.05) * uPointerStrength;
    p.xy += normalize(pointerDelta + vec2(0.0001)) * pointerField * (0.12 + aSeed * 0.11);
    p.z += pointerField * sin(aSeed * 23.0 + uTime * 2.0) * 0.075;

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float particleScale = uKind < 0.5 ? 1.32 : (uKind < 1.5 ? 0.82 : 0.66);
    gl_PointSize = clamp(
      (0.76 + aSeed * 1.38 + uAudio.w * 1.55 + voice * 0.42 + uStateEnergy * 0.16)
        * particleScale * uPointScale * (12.0 / max(2.0, -viewPosition.z)),
      0.38,
      3.15
    );
    vEnergy = clamp(voice * 0.65 + uAudio.w * 0.35 + uStateEnergy * 0.2 + aImportance * 0.12, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  varying float vAlpha;
  varying float vEnergy;
  varying float vKind;
  varying float vShade;

  void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    // Bordo inciso e nucleo ottico più compatto: il punto resta leggibile
    // come dettaglio in primo piano invece di fondersi in una macchia.
    float alpha = smoothstep(0.49, 0.19, distanceToCenter) * vAlpha;
    if (alpha < 0.014) discard;
    vec3 deepCyan = vec3(0.0, 0.28, 0.34);
    vec3 electricCyan = vec3(0.08, 0.82, 0.86);
    vec3 color = mix(deepCyan, electricCyan, 0.5 + vEnergy * 0.3);
    color = mix(color, uAccent, 0.2 + vEnergy * 0.16);
    if (vKind < 0.5) {
      // Il nucleo acquista volume con una luce laterale e un bordo atmosferico
      // senza introdurre mesh, texture o ulteriori draw call.
      color *= vShade;
      alpha *= 0.82 + vShade * 0.24;
      color *= 1.03;
      alpha = max(alpha, smoothstep(0.48, 0.2, distanceToCenter) * 0.04);
    }
    gl_FragColor = vec4(color * uLuminosity, alpha);
  }
`;

// #endregion

// #region 02 — Generazione deterministica del pianeta

function randomUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function counts(quality: SaturnVisualizerProps['quality'], performanceLevel: number): { planet: number; orbit: number; halo: number } {
  if (quality === 'efficient') {
    return performanceLevel <= 1
      ? { planet: 18_000, orbit: 26_000, halo: 8_000 }
      : { planet: 32_000, orbit: 48_000, halo: 18_000 };
  }
  if (quality === 'super') {
    return performanceLevel >= 5
      ? { planet: 230_000, orbit: 190_000, halo: 90_000 }
      : { planet: 170_000, orbit: 130_000, halo: 64_000 };
  }
  if (quality === 'ultra') {
    return performanceLevel >= 5
      ? { planet: 90_000, orbit: 150_000, halo: 60_000 }
      : { planet: 82_000, orbit: 132_000, halo: 52_000 };
  }
  // I filamenti nello shader preservano la densità percepita con meno vertici:
  // il profilo standard riduce banda GPU senza impoverire la silhouette.
  if (quality === 'balanced') return performanceLevel >= 4
    ? { planet: 62_000, orbit: 98_000, halo: 38_000 }
    : { planet: 44_000, orbit: 68_000, halo: 24_000 };
  return { planet: 66_000, orbit: 108_000, halo: 44_000 };
}

function createPlanet(count: number): ParticleField {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const importance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = randomUnit(index * 2.17 + 1.3);
    const longitude = randomUnit(index * 1.31 + 7.1) * Math.PI * 2;
    const vertical = randomUnit(index * 3.73 + 2.9) * 2 - 1;
    const radial = Math.sqrt(1 - vertical * vertical);
    // Il riferimento mostra un volume trasparente attraversato da filamenti,
    // non una superficie uniforme. Una parte consistente vive quindi dentro
    // il nucleo e lascia intravedere la profondità.
    const interior = seed > 0.7;
    const shell = interior
      ? 0.24 + Math.pow(randomUnit(index * 5.17), 0.45) * 0.73
      : 0.94 + (seed - 0.5) * 0.13;
    const radius = 1.12 * shell;
    const turbulence = 1 + Math.sin(longitude * 7 + vertical * 11) * 0.025;
    positions[index * 3] = Math.cos(longitude) * radial * radius * turbulence;
    positions[index * 3 + 1] = vertical * radius;
    positions[index * 3 + 2] = Math.sin(longitude) * radial * radius * turbulence;
    seeds[index] = seed;
    const filament = Math.pow(Math.max(0, Math.sin(longitude * 6 + vertical * 9 + seed * 4)), 8);
    importance[index] = interior
      ? 0.1 + randomUnit(index * 7.31) * 0.34 + filament * 0.22
      : 0.2 + randomUnit(index * 7.31) * 0.34 + filament * 0.5;
  }
  return { positions, seeds, importance };
}

function createOrbit(count: number): ParticleField {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const importance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = randomUnit(index * 2.93 + 0.7);
    const angle = randomUnit(index * 1.67 + 5.4) * Math.PI * 2;
    const radialSeed = Math.pow(randomUnit(index * 5.37 + 0.3), 0.82);
    // Un disco continuo sostituisce le corsie concentriche. Le variazioni di
    // densità restano visibili come materia, mai come circonferenze perfette.
    const continuousRadius = 1.28 + radialSeed * 3.78;
    const broadWarp = Math.sin(angle * 2.0 + radialSeed * 7.4) * (0.04 + radialSeed * 0.09);
    const fineTurbulence = Math.sin(angle * 7.0 - radialSeed * 13.0 + seed * 3.0) * 0.026
      + Math.sin(angle * 19.0 + seed * 8.0) * 0.012;
    const radius = continuousRadius + broadWarp + fineTurbulence;
    const thickness = 0.026 + radialSeed * 0.085;
    const spread = (randomUnit(index * 3.21 + 4.6) - 0.5) * thickness;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = spread
      + Math.sin(angle * 2.0 + radialSeed * 5.0) * thickness * 0.28;
    seeds[index] = seed;
    const densityCloud = 0.5 + Math.sin(radialSeed * 31.0 + angle * 0.7) * 0.19
      + Math.sin(radialSeed * 73.0 - angle * 1.3) * 0.11;
    const arcEnergy = Math.pow(Math.max(0, Math.sin(angle * 3.0 + radialSeed * 17.0)), 5);
    const gap = Math.sin(radialSeed * 46.0 + 0.8) > 0.91 ? 0.28 : 1;
    importance[index] = (0.2 + densityCloud * 0.42 + arcEnergy * 0.18) * gap;
  }
  return { positions, seeds, importance };
}

function createHalo(count: number): ParticleField {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const importance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = randomUnit(index * 3.71 + 2.2);
    const angle = randomUnit(index * 1.97 + 4.8) * Math.PI * 2;
    // La distribuzione favorisce il centro ma conserva una coda ampia e
    // irregolare, come la nube diffusa visibile nel riferimento.
    const radius = 1.22 + Math.pow(randomUnit(index * 4.83 + 1.1), 0.72) * 4.35;
    const wave = Math.sin(angle * 3 + seed * 8) * 0.16
      + Math.sin(angle * 11 - seed * 4) * 0.06;
    positions[index * 3] = Math.cos(angle) * (radius + wave);
    positions[index * 3 + 1] = Math.sin(angle) * (radius + wave);
    positions[index * 3 + 2] = (randomUnit(index * 7.13 + 0.4) - 0.5) * (0.22 + radius * 0.13);
    seeds[index] = seed;
    importance[index] = 0.18 + randomUnit(index * 8.27) * 0.48;
  }
  return { positions, seeds, importance };
}

function uniforms(kind: number, luminosity: number, pointScale: number) {
  return {
    uTime: { value: 0 },
    uKind: { value: kind },
    uStateEnergy: { value: 0 },
    uTransition: { value: 0 },
    uRingVisibility: { value: 0 },
    uDisintegration: { value: 0 },
    uAudio: { value: new THREE.Vector4() },
    uAccent: { value: new THREE.Color('#72f4ff') },
    uLuminosity: { value: luminosity },
    uPointScale: { value: pointScale }
    ,
    uPointer: { value: new THREE.Vector2() },
    uPointerStrength: { value: 0 }
  };
}

// #endregion

// #region 03 — Composizione e ciclo audio

export function SaturnVisualizer({ state, audioBus, reducedMotion, quality, performanceLevel, pointerPresence }: SaturnVisualizerProps) {
  const system = useRef<THREE.Group>(null);
  const planetMaterial = useRef<THREE.ShaderMaterial>(null);
  const orbitMaterial = useRef<THREE.ShaderMaterial>(null);
  const haloMaterial = useRef<THREE.ShaderMaterial>(null);
  const amount = counts(quality, performanceLevel);
  const planet = useMemo(() => cachedField('planet', amount.planet, () => createPlanet(amount.planet)), [amount.planet]);
  const orbit = useMemo(() => cachedField('orbit', amount.orbit, () => createOrbit(amount.orbit)), [amount.orbit]);
  const halo = useMemo(() => cachedField('halo', amount.halo, () => createHalo(amount.halo)), [amount.halo]);
  // Ultra investe la potenza disponibile nella densità, non nel bagliore:
  // punti più fini lasciano distinguere superficie, orbite e polvere cosmica.
  const luminosity = quality === 'super' ? 0.9 : quality === 'ultra' ? 0.88 : quality === 'balanced' ? 0.86 : 0.84;
  const pointScale = quality === 'super' ? 0.96 : quality === 'ultra' && performanceLevel >= 5 ? 0.98 : quality === 'ultra' ? 0.94 : 0.92;
  const planetUniforms = useMemo(() => uniforms(0, luminosity, pointScale), [luminosity, pointScale]);
  const orbitUniforms = useMemo(() => uniforms(1, luminosity, pointScale), [luminosity, pointScale]);
  const haloUniforms = useMemo(() => uniforms(2, luminosity, pointScale), [luminosity, pointScale]);
  const transition = useRef(0);
  const ringVisibility = useRef(0);
  const previousState = useRef(state);
  const wasEverActive = useRef(false);
  const pointerRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const interactionNormal = useMemo(() => new THREE.Vector3(), []);
  const interactionPoint = useMemo(() => new THREE.Vector3(), []);
  const interactionOrigin = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const wasListening = previousState.current === 'listening' || previousState.current === 'speaking';
    const isListening = state === 'listening' || state === 'speaking';
    if (wasListening !== isListening) {
      // Un impulso positivo apre il sistema all'avvio dell'ascolto; quello
      // negativo richiude anelli e alone quando l'utente preme di nuovo Spazio.
      transition.current = isListening ? 1 : -1;
    }
    previousState.current = state;
  }, [state]);

  useFrame(({ clock, pointer, camera }, delta) => {
    if (!system.current || !planetMaterial.current || !orbitMaterial.current || !haloMaterial.current) return;
    const audio = audioBus.current;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const stateEnergy = state === 'speaking' ? 0.38 + audio.level * 0.54
      : state === 'listening' ? 0.48
        : state === 'thinking' ? 0.68
          : state === 'responding' ? 0.74
            : state === 'executing' ? 0.84
              : state === 'permission' ? 0.56
                : state === 'error' ? 0.62
                  : 0.22;
    transition.current = THREE.MathUtils.damp(transition.current, 0, 2.4, delta);
    const targetRingVisibility = state === 'speaking' ? 0.58 + audio.level * 0.42
      : state === 'listening' ? 0.86
        : state === 'responding' ? 0.72
          : state === 'thinking' ? 0.56
            : state === 'executing' ? 0.82
              : state === 'permission' ? 0.48
                : state === 'error' ? 0.58
                : 0;
    const ringsActive = targetRingVisibility > 0.2;
    if (ringsActive) wasEverActive.current = true;
    ringVisibility.current = THREE.MathUtils.damp(
      ringVisibility.current,
      targetRingVisibility,
      targetRingVisibility > ringVisibility.current ? 1.65 : 1.35,
      delta
    );
    const accent = state === 'error' ? '#d69a58'
      : state === 'permission' ? '#ffc46b'
        : state === 'executing' ? '#f0d46e'
          : state === 'thinking' ? '#7fbdff'
            : state === 'responding' ? '#b2efff'
              : state === 'speaking' ? '#77fbff'
                : state === 'listening' ? '#58e8bd'
                  : '#55bdc3';
    const lightResponse = state === 'speaking'
      ? 1.02 + audio.level * 0.18
      : state === 'listening'
        ? 1.035
        : state === 'thinking' || state === 'responding'
          ? 1.06
          : 1;
    system.current.updateWorldMatrix(true, false);
    interactionNormal.set(0, 0, 1).transformDirection(system.current.matrixWorld);
    system.current.getWorldPosition(interactionOrigin);
    interactionPlane.setFromNormalAndCoplanarPoint(interactionNormal, interactionOrigin);
    pointerRaycaster.setFromCamera(pointer, camera);
    const hasPointerIntersection = Boolean(pointerRaycaster.ray.intersectPlane(interactionPlane, interactionPoint));
    if (hasPointerIntersection) system.current.worldToLocal(interactionPoint);
    [planetMaterial.current, orbitMaterial.current, haloMaterial.current].forEach((material) => {
      material.uniforms.uTime.value = time;
      material.uniforms.uStateEnergy.value = stateEnergy;
      material.uniforms.uTransition.value = transition.current;
      material.uniforms.uRingVisibility.value = ringVisibility.current;
      material.uniforms.uDisintegration.value = !ringsActive && wasEverActive.current
        ? 1 - ringVisibility.current
        : 0;
      material.uniforms.uAudio.value.set(audio.level, audio.bass, audio.mid, audio.treble);
      if (hasPointerIntersection) material.uniforms.uPointer.value.set(interactionPoint.x, interactionPoint.y);
      material.uniforms.uPointerStrength.value = THREE.MathUtils.damp(
        material.uniforms.uPointerStrength.value,
        pointerPresence.current * 0.54,
        pointerPresence.current > 0 ? VISUALIZER_POINTER_DAMPING.engage : VISUALIZER_POINTER_DAMPING.release,
        delta
      );
      material.uniforms.uAccent.value.set(accent);
      material.uniforms.uLuminosity.value = THREE.MathUtils.damp(
        material.uniforms.uLuminosity.value,
        luminosity * lightResponse,
        lightResponse > 1.04 ? 4.2 : 3.2,
        delta
      );
    });
    const stateScale = state === 'listening'
      ? 1.055
      : state === 'speaking'
        ? 1.025 + audio.level * 0.035
        : state === 'thinking'
          ? 0.975
          : state === 'responding'
            ? 1.025
            : 1;
    const targetScale = 1.24 * stateScale * (1 + audio.level * 0.07);
    const scale = THREE.MathUtils.damp(system.current.scale.x, targetScale, 3.5, delta);
    system.current.scale.setScalar(scale);
    const targetRotationZ = state === 'listening'
      ? 0.035
      : state === 'speaking'
        ? -0.025
      : state === 'thinking'
          ? 0.08
          : state === 'executing'
            ? -0.075
            : state === 'error'
              ? 0.12
              : 0;
    system.current.rotation.z = THREE.MathUtils.damp(system.current.rotation.z, targetRotationZ, 3.2, delta);
    system.current.rotation.x = THREE.MathUtils.damp(system.current.rotation.x, -0.03 - pointer.y * pointerPresence.current * 0.055, 2.7, delta);
    system.current.rotation.y = THREE.MathUtils.damp(system.current.rotation.y, -0.05 + pointer.x * pointerPresence.current * 0.085, 2.7, delta);
    const parallax = reducedMotion ? 0 : quality === 'super' ? 0.055 : quality === 'ultra' ? 0.045 : quality === 'balanced' ? 0.025 : 0;
    system.current.position.x = THREE.MathUtils.damp(system.current.position.x, 1.35 + pointer.x * parallax, 2, delta);
    system.current.position.y = THREE.MathUtils.damp(system.current.position.y, 0.08 + pointer.y * parallax * 0.38, 2, delta);
  });

  const material = (
    ref: React.RefObject<THREE.ShaderMaterial | null>,
    materialUniforms: ReturnType<typeof uniforms>
  ) => (
    <shaderMaterial
      ref={ref}
      uniforms={materialUniforms}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
    />
  );

  return (
    <group ref={system} position={[1.35, 0.08, 0.45]} scale={1.24} rotation={[-0.03, -0.05, 0]}>
      {/* Il nucleo resta più piccolo del campo orbitale, come nel riferimento:
          sono gli anelli e la polvere a occupare la maggior parte della scena. */}
      <points scale={0.94}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[planet.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[planet.seeds, 1]} />
          <bufferAttribute attach="attributes-aImportance" args={[planet.importance, 1]} />
        </bufferGeometry>
        {material(planetMaterial, planetUniforms)}
      </points>
      <points scale={0.945}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[planet.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#67f1f6"
          size={quality === 'efficient' ? 0.026 : quality === 'super' ? 0.019 : quality === 'ultra' ? 0.021 : 0.023}
          sizeAttenuation
          transparent
          opacity={quality === 'super' ? 0.07 : quality === 'ultra' ? 0.065 : 0.055}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <points position={[0, -0.11, 0]} rotation={[1.38, 0.04, -0.16]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[orbit.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[orbit.seeds, 1]} />
          <bufferAttribute attach="attributes-aImportance" args={[orbit.importance, 1]} />
        </bufferGeometry>
        {material(orbitMaterial, orbitUniforms)}
      </points>
      <points position={[0, -0.11, 0]} rotation={[1.38, 0.04, -0.16]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[halo.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[halo.seeds, 1]} />
          <bufferAttribute attach="attributes-aImportance" args={[halo.importance, 1]} />
        </bufferGeometry>
        {material(haloMaterial, haloUniforms)}
      </points>
    </group>
  );
}

// #endregion
