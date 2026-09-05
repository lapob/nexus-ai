/**
 * @module renderer/scene/ParticleEngine
 * @description Campo di particelle GPU che dà forma e comportamento alla voce di NEXUSNXS.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AudioBus, EntityState, VisualQuality } from '../types/nexus';
import { AnimationController, VISUALIZER_POINTER_DAMPING } from '../systems/AnimationController';

// #region 01 — Contratto e shader GPU

interface ParticleEngineProps {
  state: EntityState;
  audioBus: AudioBus;
  particleCount: number;
  reducedMotion: boolean;
  quality: Exclude<VisualQuality, 'auto'>;
  pointerPresence: RefObject<number>;
}

const vertexShader = /* glsl */ `
  precision highp float;
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uMode;
  uniform float uEnergy;
  uniform float uCoherence;
  uniform float uRotation;
  uniform float uTurbulence;
  uniform float uBreath;
  uniform float uStateBlend;
  uniform vec4 uAudio;
  uniform vec3 uAccent;
  uniform float uLuminosity;
  uniform float uPointScale;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying float vAlpha;
  varying vec3 vColor;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  vec3 rotateY(vec3 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  float stateWeight(float mode) {
    // Una finestra stretta impedisce a due comportamenti adiacenti di
    // deformare contemporaneamente la stessa particella durante le transizioni.
    return (1.0 - smoothstep(0.28, 0.72, abs(uMode - mode))) * uStateBlend;
  }

  void main() {
    vec3 p = position;
    float time = uTime;
    // Il renderer amplifica soprattutto i livelli bassi; la clamp conserva
    // margine visivo durante urla o rumori improvvisi.
    float voice = clamp(uAudio.x * 1.08, 0.0, 0.96);
    float bass = clamp(uAudio.y * 1.08, 0.0, 0.96);
    float mid = clamp(uAudio.z * 1.06, 0.0, 0.96);
    float high = clamp(uAudio.w * 1.04, 0.0, 0.96);

    float breathing = sin(time * 0.42 + aSeed.x * 6.2831) * uBreath;
    float longitudinal = sin(p.x * 0.72 + time * (0.18 + uRotation) + aSeed.y * 2.0);
    float crossWave = cos(p.z * 1.64 - time * 0.24 + aSeed.z * 3.0);
    float fineNoise = sin(p.x * 2.7 + p.z * 3.4 + time * 0.5 + aSeed.w * 9.0);
    float depthWave = sin(length(p.xz * vec2(0.82, 1.34)) * 2.15 - time * 0.56 + aSeed.x * 1.8);

    // Superficie non geometrica: un tessuto orizzontale piegato in più falde.
    p.y += longitudinal * (0.14 + abs(p.z) * 0.04) * uCoherence;
    p.y += crossWave * (0.055 + uTurbulence * 0.14);
    p.z += fineNoise * uTurbulence * 0.08;
    p.y += breathing * (0.055 + aSeed.z * 0.085);
    p.y += depthWave * (0.025 + uEnergy * 0.055) * (0.35 + aSeed.w);

    // Una piega centrale asimmetrica dà alla materia un "centro di attenzione"
    // senza trasformarla in sfera, cerchio o volto.
    float foldedZ = p.z + sin(p.x * 0.44 + time * 0.11) * 0.48;
    float focusFold = exp(-(p.x * p.x * 0.22 + foldedZ * foldedZ * 0.52));
    p.y += focusFold * (0.86 + sin(p.x * 1.3 - time * 0.37) * 0.14);
    p.z += focusFold * sin(p.x * 1.05 + time * 0.21) * 0.28;

    // Filamenti radi e una seconda piega fuori asse rendono la presenza più
    // scenica senza aggiungere oggetti riconoscibili o simmetrie circolari.
    float filament = pow(max(0.0, sin(p.x * 1.46 + p.z * 2.18 - time * 0.31 + aSeed.y * 5.0)), 18.0);
    float sideFocus = exp(-((p.x + 2.15) * (p.x + 2.15) * 0.24 + (p.z - 0.55) * (p.z - 0.55) * 0.7));
    p.y += filament * (0.09 + uEnergy * 0.18) * (0.3 + aSeed.z);
    p.y += sideFocus * sin(time * 0.42 + p.z * 1.7) * (0.1 + uBreath * 0.08);

    // Ascolto: piccole increspature che attraversano il tessuto.
    float listenMix = stateWeight(1.0);
    p.y += listenMix * sin(p.x * 1.8 - time * 1.3 + aSeed.y * 4.0) * (0.06 + voice * 0.18);

    // Voce utente: compressione, espansione e rottura controllata sullo spettro.
    float speechMix = stateWeight(2.0);
    p.x *= 1.0 + speechMix * bass * (0.12 + aSeed.x * 0.16);
    p.z *= 1.0 - speechMix * mid * 0.16;
    p.y += speechMix * (voice * (0.18 + aSeed.z * 0.42)) * sin(p.x * 1.15 + aSeed.w * 12.0);
    p += speechMix * high * 0.065 * vec3(
      sin(aSeed.x * 31.0 + time * 4.0),
      cos(aSeed.y * 27.0 - time * 5.0),
      sin(aSeed.z * 23.0 + time * 3.0)
    );

    // Pensiero: convergenza densa e precisa verso una piega mobile, non una sfera.
    float thinkMix = stateWeight(3.0);
    float thought = sin(abs(p.x) * 1.25 - time * 1.65 + p.z * 0.6);
    p.y += thinkMix * thought * 0.28;
    p.z *= 1.0 - thinkMix * 0.08 * sin(time * 0.7);

    // Risposta: onde armoniche più ampie e coerenti.
    float responseMix = stateWeight(4.0);
    p.y += responseMix * (
      sin(p.x * 0.52 - time * 0.9) * 0.34 +
      cos(p.z * 1.1 + time * 0.48) * 0.16
    );
    p.z += responseMix * sin(p.x * 0.38 + time * 0.62) * 0.22;

    // Esecuzione: impulsi direzionali, più tecnici ma sempre organici.
    float executeMix = stateWeight(5.0);
    float scan = smoothstep(0.82, 1.0, sin(p.x * 1.7 - time * 2.2));
    p.y += executeMix * scan * (0.18 + aSeed.y * 0.32);

    // Permesso: la materia si arresta in una lente ampia e perfettamente
    // coerente. Errore: la stessa trama si spezza in impulsi irregolari.
    float permissionMix = stateWeight(6.0);
    p.x *= 1.0 + permissionMix * 0.08;
    p.z *= 1.0 - permissionMix * 0.22;
    p.y += permissionMix * sin(length(p.xz) * 2.4 - time * 0.8) * 0.09;
    float errorMix = stateWeight(7.0);
    p += errorMix * (0.05 + aSeed.w * 0.09) * vec3(
      sin(time * 8.0 + aSeed.x * 43.0),
      cos(time * 6.7 + aSeed.y * 37.0),
      sin(time * 9.2 + aSeed.z * 31.0)
    );

    float globalPulse = 1.0 + uEnergy * 0.07 + voice * 0.12;
    p.xz *= globalPulse;
    p = rotateY(p, time * uRotation * 0.08 + voice * 0.035);

    // Il dito o il cursore aprono una piccola corrente nella materia. La
    // risposta è locale, continua e torna a riposo senza spostare l'intero Core.
    vec2 pointerPosition = uPointer;
    vec2 pointerDelta = p.xy - pointerPosition;
    float pointerDistance = dot(pointerDelta, pointerDelta);
    float pointerField = exp(-pointerDistance * 1.85) * uPointerStrength;
    vec2 pointerDirection = normalize(pointerDelta + vec2(0.0001));
    p.xy += pointerDirection * pointerField * (0.18 + aSeed.z * 0.15);
    p.z += pointerField * sin(aSeed.w * 18.0 + time * 2.1) * 0.11;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Punti piccoli e separati: la massa deve restare leggibile, mai diventare una fascia bianca.
    float perspective = 14.0 / max(2.0, -mvPosition.z);
    gl_PointSize = clamp((0.54 + aSeed.w * 1.2 + high * 0.74) * uPointScale * perspective, 0.5, 2.65);

    float depthFade = smoothstep(12.0, 2.0, -mvPosition.z);
    float edgeFade = 1.0 - smoothstep(7.0, 9.2, abs(p.x));
    vAlpha = (0.09 + aSeed.x * 0.39) * edgeFade * (0.5 + depthFade * 0.44);
    vAlpha *= 0.68 + uEnergy * 0.38 + voice * 0.24;
    vAlpha *= 1.0 + filament * 0.72 + focusFold * 0.18;

    vec3 teal = vec3(0.035, 0.52, 0.58);
    vec3 cyan = vec3(0.08, 0.76, 0.82);
    vec3 ice = vec3(0.62, 0.86, 0.9);
    float intelligence = clamp(responseMix * 0.45 + thinkMix * 0.3 + high * 0.35 + aSeed.y * 0.22, 0.0, 1.0);
    vColor = mix(teal, cyan, 0.24 + aSeed.z * 0.55);
    vColor = mix(vColor, ice, clamp(intelligence + filament * 0.28 + focusFold * 0.08, 0.0, 1.0));
    vColor = mix(vColor, uAccent, 0.25 + listenMix * 0.12 + speechMix * 0.1
      + executeMix * 0.2 + permissionMix * 0.3 + errorMix * 0.42);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uLuminosity;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point);
    float alpha = smoothstep(0.49, 0.18, distanceToCenter) * vAlpha;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(vColor * uLuminosity, alpha);
  }
`;

// #endregion

// #region 02 — Attributi, uniform e ciclo di rendering

function randomSigned(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

interface ParticleAttributes {
  positions: Float32Array;
  seeds: Float32Array;
}

const attributeCache = new Map<number, ParticleAttributes>();

function buildParticleAttributes(particleCount: number): ParticleAttributes {
  const cached = attributeCache.get(particleCount);
  if (cached) return cached;
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount * 4);
  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 3;
    const seedOffset = index * 4;
    const s1 = (randomSigned(index * 0.93 + 1.7) + 1) * 0.5;
    const s2 = (randomSigned(index * 1.31 + 8.2) + 1) * 0.5;
    const s3 = (randomSigned(index * 2.17 + 3.4) + 1) * 0.5;
    const s4 = (randomSigned(index * 3.73 + 9.9) + 1) * 0.5;
    const layer = s4 < 0.68 ? 0 : s4 < 0.9 ? 1 : 2;
    const x = (s1 * 2 - 1) * (5.75 + layer * 0.38);
    const zDensity = Math.pow(s2, 1.55) * (s3 < 0.5 ? -1 : 1);
    const z = zDensity * (2.65 + layer * 0.52);
    const ridge = Math.sin(x * 0.58 + z * 1.12) * (0.22 + layer * 0.18);
    const y = ridge + randomSigned(index * 4.19) * (0.08 + layer * 0.16) + (layer - 0.5) * 0.14;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    seeds[seedOffset] = s1;
    seeds[seedOffset + 1] = s2;
    seeds[seedOffset + 2] = s3;
    seeds[seedOffset + 3] = s4;
  }
  const attributes = { positions, seeds };
  attributeCache.set(particleCount, attributes);
  while (attributeCache.size > 3) attributeCache.delete(attributeCache.keys().next().value as number);
  return attributes;
}

function useParticleAttributes(particleCount: number): ParticleAttributes {
  const [attributes, setAttributes] = useState(() => buildParticleAttributes(Math.min(particleCount, 52_000)));

  useEffect(() => {
    const cached = attributeCache.get(particleCount);
    if (cached) {
      setAttributes(cached);
      return;
    }
    if (particleCount <= 60_000 || typeof Worker === 'undefined') {
      setAttributes(buildParticleAttributes(particleCount));
      return;
    }
    const worker = new Worker(new URL('./particle-field-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ParticleAttributes & { count: number }>) => {
      const next = { positions: event.data.positions, seeds: event.data.seeds };
      attributeCache.set(event.data.count, next);
      while (attributeCache.size > 3) attributeCache.delete(attributeCache.keys().next().value as number);
      setAttributes(next);
      worker.terminate();
    };
    worker.onerror = () => worker.terminate();
    worker.postMessage({ count: particleCount });
    return () => worker.terminate();
  }, [particleCount]);

  return attributes;
}

export function ParticleEngine({ state, audioBus, particleCount, reducedMotion, quality, pointerPresence }: ParticleEngineProps) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const controller = useMemo(() => new AnimationController(), []);
  const previousState = useRef(state);
  const stateBlend = useRef(1);
  const pointerRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const interactionPlane = useMemo(() => new THREE.Plane(), []);
  const interactionNormal = useMemo(() => new THREE.Vector3(), []);
  const interactionPoint = useMemo(() => new THREE.Vector3(), []);
  const interactionOrigin = useMemo(() => new THREE.Vector3(), []);

  const attributes = useParticleAttributes(particleCount);

  useFrame(({ clock, pointer, camera }, delta) => {
    if (!material.current || !group.current) return;
    controller.setState(state);
    const profile = controller.update(delta);
    const audio = audioBus.current;
    if (previousState.current !== state) {
      previousState.current = state;
      stateBlend.current = 0;
    }
    stateBlend.current = THREE.MathUtils.damp(stateBlend.current, 1, 5.2, delta);
    const voiceBlend = state === 'speaking' ? audio.level : 1;
    // Con "Riduci movimento" il Core conserva forma e feedback audio, ma non
    // produce respirazione, rotazione e oscillazioni automatiche continue.
    material.current.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    material.current.uniforms.uMode.value = profile.mode;
    material.current.uniforms.uEnergy.value = state === 'speaking'
      ? THREE.MathUtils.lerp(0.34, profile.energy, voiceBlend)
      : profile.energy;
    material.current.uniforms.uCoherence.value = state === 'speaking'
      ? THREE.MathUtils.lerp(0.78, profile.coherence, voiceBlend)
      : profile.coherence;
    material.current.uniforms.uRotation.value = profile.rotation;
    material.current.uniforms.uTurbulence.value = state === 'speaking'
      ? THREE.MathUtils.lerp(0.18, profile.turbulence, voiceBlend)
      : profile.turbulence;
    material.current.uniforms.uBreath.value = state === 'speaking'
      ? THREE.MathUtils.lerp(0.4, profile.breath, voiceBlend)
      : profile.breath;
    material.current.uniforms.uStateBlend.value = stateBlend.current;
    material.current.uniforms.uAudio.value.set(audio.level, audio.bass, audio.mid, audio.treble);
    // Proietta il puntatore sul piano locale del visualizer. Una scala fissa
    // in NDC si disallinea inevitabilmente su aspect ratio diversi.
    group.current.updateWorldMatrix(true, false);
    interactionNormal.set(0, 0, 1).transformDirection(group.current.matrixWorld);
    group.current.getWorldPosition(interactionOrigin);
    interactionPlane.setFromNormalAndCoplanarPoint(interactionNormal, interactionOrigin);
    pointerRaycaster.setFromCamera(pointer, camera);
    if (pointerRaycaster.ray.intersectPlane(interactionPlane, interactionPoint)) {
      group.current.worldToLocal(interactionPoint);
      material.current.uniforms.uPointer.value.set(interactionPoint.x, interactionPoint.y);
    }
    material.current.uniforms.uPointerStrength.value = THREE.MathUtils.damp(
      material.current.uniforms.uPointerStrength.value,
      pointerPresence.current * 0.58,
      pointerPresence.current > 0 ? VISUALIZER_POINTER_DAMPING.engage : VISUALIZER_POINTER_DAMPING.release,
      delta
    );
    const accent = state === 'error' ? '#d69a58'
      : state === 'permission' ? '#ffbf69'
        : state === 'executing' ? '#efd36f'
          : state === 'thinking' ? '#7ebdff'
            : state === 'responding' ? '#b2efff'
              : state === 'speaking' ? '#78f8ff'
                : state === 'listening' ? '#58ddb2'
                  : '#55b9bf';
    material.current.uniforms.uAccent.value.set(accent);
    const baseLuminosity = quality === 'super' ? 1.04 : quality === 'ultra' ? 1.02 : quality === 'balanced' ? 0.98 : 0.94;
    const targetLuminosity = baseLuminosity * (state === 'speaking'
      ? 1.015 + audio.level * 0.16
      : state === 'listening'
        ? 1.025
        : state === 'thinking' || state === 'responding'
          ? 1.05
          : 1);
    material.current.uniforms.uLuminosity.value = THREE.MathUtils.damp(
      material.current.uniforms.uLuminosity.value,
      targetLuminosity,
      4.6,
      delta
    );
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -0.2, 2.5, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, state === 'speaking' ? 0.035 : -0.015, 1.8, delta);
    const parallax = reducedMotion ? 0 : quality === 'super' ? 0.07 : quality === 'ultra' ? 0.06 : quality === 'balanced' ? 0.035 : 0;
    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, pointer.x * parallax, 2.2, delta);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, 0.18 + pointer.y * parallax * 0.34, 2.2, delta);
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMode: { value: 0 },
    uEnergy: { value: 0.1 },
    uCoherence: { value: 0.9 },
    uRotation: { value: 0.03 },
    uTurbulence: { value: 0.1 },
    uBreath: { value: 0.2 },
    uStateBlend: { value: 1 },
    uAudio: { value: new THREE.Vector4() },
    uAccent: { value: new THREE.Color('#72f4ff') }
    ,
    // La qualità superiore aumenta il campionamento del campo; non deve
    // trasformare i filamenti in una superficie sovraesposta.
    uLuminosity: { value: quality === 'super' ? 1.04 : quality === 'ultra' ? 1.02 : quality === 'balanced' ? 0.98 : 0.94 },
    uPointScale: { value: quality === 'super' ? 0.96 : quality === 'ultra' ? 1.02 : quality === 'balanced' ? 0.98 : 0.96 }
    ,
    uPointer: { value: new THREE.Vector2() },
    uPointerStrength: { value: 0 }
  }), [quality]);

  return (
    <group ref={group} position={[0, 0.18, 0]}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[attributes.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[attributes.seeds, 4]} />
        </bufferGeometry>
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

// #endregion
