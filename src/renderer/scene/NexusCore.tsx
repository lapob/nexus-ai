/**
 * @module renderer/scene/NexusCore
 * @description Presenza radiale NexusNXS composta da nucleo, corone e scansione particellare.
 */
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, MathUtils, PointsMaterial, type Group } from 'three';
import { useMemo, useRef, type RefObject } from 'react';
import type { AudioBus, EntityState, VisualQuality } from '../types/nexus';
import interactionStates from '../../../config/nexus-interaction-states.json';

// #region 01 — Profilo e generazione

interface NexusCoreProps {
  state: EntityState;
  audioBus: AudioBus;
  reducedMotion: boolean;
  quality: Exclude<VisualQuality, 'auto'>;
  performanceLevel: number;
  pointerPresence: RefObject<number>;
}

const stateColor = Object.fromEntries(Object.entries(interactionStates.states)
  .map(([state, descriptor]) => [state, descriptor.color])) as Record<EntityState, string>;
const stateThreeColor = Object.fromEntries(Object.entries(stateColor)
  .map(([state, color]) => [state, new Color(color)])) as Record<EntityState, Color>;
const continuumId = interactionStates.presentation.continuum.id;

const nexusGeometryCache = new Map<string, BufferGeometry>();

function pointCount(quality: Exclude<VisualQuality, 'auto'>, reducedMotion: boolean, performanceLevel: number): number {
  if (reducedMotion) return 10_000 + performanceLevel * 4_000;
  if (quality === 'efficient') return performanceLevel <= 1 ? 14_000 : 28_000;
  if (quality === 'balanced') return performanceLevel >= 4 ? 68_000 : 46_000;
  if (quality === 'super') return performanceLevel >= 5 ? 148_000 : 96_000;
  return performanceLevel >= 5 ? 100_000 : 76_000;
}

function random(seed: number): number {
  const value = Math.sin(seed * 91.733) * 43758.5453;
  return value - Math.floor(value);
}

function buildNexusGeometry(count: number, layer: 'rings' | 'core' | 'scanner' | 'aura'): BufferGeometry {
  const cacheKey = `${layer}:${count}`;
  const cached = nexusGeometryCache.get(cacheKey);
  if (cached) return cached;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const angle = random(index + 0.1) * Math.PI * 2;
    let radius: number;
    let depth: number;

    if (layer === 'rings') {
      // Sei corone concentriche interrotte formano un HUD tecnico leggibile.
      const ring = index % 6;
      radius = 1.05 + ring * 0.43 + (random(index + 2.4) - 0.5) * 0.045;
      const segment = Math.floor(angle / (Math.PI / 6));
      const gap = (segment + ring) % 4 === 0 && angle % (Math.PI / 6) < 0.075;
      if (gap) radius += 0.18;
      depth = (ring - 2.5) * 0.09 + (random(index + 4.2) - 0.5) * 0.055;
    } else if (layer === 'core') {
      // Reattore centrale: disco di energia, non una sfera.
      radius = Math.sqrt(random(index + 8.7)) * 0.78;
      depth = (random(index + 5.8) - 0.5) * 0.16;
    } else if (layer === 'scanner') {
      // Satelliti diagnostici lungo la corona esterna.
      const spoke = index % 12;
      const local = random(index + 11.2);
      const spokeAngle = spoke * Math.PI / 6;
      radius = 3.2 + local * 0.5;
      positions[offset] = Math.cos(spokeAngle) * radius;
      positions[offset + 1] = Math.sin(spokeAngle) * radius;
      positions[offset + 2] = (random(index + 13.1) - 0.5) * 0.12;
      continue;
    } else {
      // Pulviscolo tridimensionale: rende il Core una presenza nello spazio,
      // senza aggiungere mesh o texture. La distribuzione resta deterministica.
      const latitude = Math.acos(2 * random(index + 17.1) - 1);
      const orbit = 2.05 + random(index + 19.7) * 1.45;
      radius = orbit * Math.sin(latitude);
      depth = Math.cos(latitude) * orbit * 0.34;
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = Math.sin(angle) * radius * 0.72;
      positions[offset + 2] = depth;
      continue;
    }
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = Math.sin(angle) * radius;
    positions[offset + 2] = depth;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  nexusGeometryCache.set(cacheKey, geometry);
  return geometry;
}

// #endregion

// #region 02 — Presenza reattiva

export function NexusCore({ state, audioBus, reducedMotion, quality, performanceLevel, pointerPresence }: NexusCoreProps) {
  const group = useRef<Group>(null);
  const rings = useRef<Group>(null);
  const core = useRef<Group>(null);
  const scanner = useRef<Group>(null);
  const aura = useRef<Group>(null);
  const ringMaterial = useRef<PointsMaterial>(null);
  const coreMaterial = useRef<PointsMaterial>(null);
  const scannerMaterial = useRef<PointsMaterial>(null);
  const auraMaterial = useRef<PointsMaterial>(null);
  const pointerEnergy = useRef(0);
  const emergence = useRef(0);
  const count = pointCount(quality, reducedMotion, performanceLevel);
  const geometries = useMemo(() => ({
    rings: buildNexusGeometry(Math.floor(count * 0.55), 'rings'),
    core: buildNexusGeometry(Math.floor(count * 0.22), 'core'),
    scanner: buildNexusGeometry(Math.floor(count * 0.08), 'scanner'),
    aura: buildNexusGeometry(Math.floor(count * 0.15), 'aura')
  }), [count]);

  // Le geometrie deterministiche vengono condivise tra riaperture e cambi di
  // stato. La cache possiede il lifecycle e impedisce allocazioni ripetute.

  useFrame((frame, delta) => {
    if (!group.current || !rings.current || !core.current || !scanner.current || !aura.current
      || !ringMaterial.current || !coreMaterial.current || !scannerMaterial.current || !auraMaterial.current) return;
    const audio = audioBus.current;
    const active = !['idle', 'booting', 'offline'].includes(state);
    const motion = reducedMotion ? 0.1 : 1;
    const time = frame.clock.elapsedTime;
    emergence.current = MathUtils.damp(emergence.current, 1, reducedMotion ? 8 : 2.8, delta);
    pointerEnergy.current = MathUtils.damp(pointerEnergy.current, pointerPresence.current * 0.38, 5.2, delta);
    // Whisper possiede il microfono in esclusiva: durante l'ascolto un
    // inviluppo organico mantiene vivo il reattore senza aprire un secondo
    // stream. Quando è disponibile, l'energia audio reale ha la precedenza.
    const descriptor = interactionStates.states[state];
    const baseEnergy = descriptor.energy + (state === 'speaking' ? audio.level * 0.48 : 0);
    const stateEnergy = baseEnergy
      + Math.sin(time * (active ? 3.1 : 1.2)) * (active ? 0.09 : 0.035)
      + (active ? Math.sin(time * 7.7) * 0.035 : 0);
    const energy = Math.min(1, Math.max(stateEnergy, audio.level * 0.74 + audio.mid * 0.26));
    group.current.rotation.z += delta * (active ? 0.055 : 0.018) * motion;
    group.current.rotation.x = -0.12 + Math.sin(time * 0.22) * 0.035 * motion;
    group.current.rotation.y = Math.sin(time * 0.16) * 0.08 * motion;
    const stateSpeed = state === 'executing' ? 1.65
      : state === 'thinking' ? 1.3
        : state === 'permission' ? 0.28
          : state === 'error' ? -0.8
            : 1;
    rings.current.rotation.z += delta * ((active ? 0.28 : 0.07) * motion * stateSpeed + pointerEnergy.current * 0.12);
    core.current.rotation.z -= delta * (active ? 0.46 : 0.12) * motion * stateSpeed;
    scanner.current.rotation.z = -time * (active ? 0.34 : 0.09) * motion * stateSpeed;
    scanner.current.rotation.y = Math.sin(time * 0.9) * 0.16 * motion;
    const pulse = 1 + Math.sin(time * (active ? 3.2 : 1.1)) * (0.018 + energy * 0.035) * motion;
    group.current.scale.setScalar(pulse * (0.78 + emergence.current * 0.22));
    const stateExpansion = state === 'listening' ? 1.08
      : state === 'thinking' ? 0.92
        : state === 'responding' ? 1.12
          : state === 'permission' ? 0.96
            : state === 'error' ? 1.04 + Math.sin(time * 9) * 0.045
              : 1;
    core.current.scale.setScalar((0.94 + energy * 0.22) * stateExpansion);
    rings.current.scale.setScalar(1 + pointerEnergy.current * 0.025);
    scanner.current.scale.setScalar(1 + pointerEnergy.current * 0.055);
    aura.current.rotation.z -= delta * (active ? 0.035 : 0.012) * motion;
    aura.current.rotation.y += delta * (active ? 0.052 : 0.018) * motion;
    aura.current.scale.setScalar(1.24 - emergence.current * 0.24 + pointerEnergy.current * 0.035);
    const color = stateThreeColor[state];
    for (const material of [ringMaterial.current, coreMaterial.current, scannerMaterial.current, auraMaterial.current]) {
      material.color.lerp(color, Math.min(1, delta * 4));
    }
    const qualityLight = quality === 'super' ? 0.045 : quality === 'ultra' ? 0.035 : quality === 'balanced' ? 0.02 : 0;
    const targetRingOpacity = Math.min(0.68, 0.38 + qualityLight + energy * 0.16);
    const targetCoreOpacity = Math.min(0.76, 0.56 + qualityLight + energy * 0.12);
    const targetScannerOpacity = Math.min(0.62, 0.32 + qualityLight + energy * 0.2);
    ringMaterial.current.opacity = MathUtils.damp(ringMaterial.current.opacity, targetRingOpacity, 5.2, delta);
    coreMaterial.current.opacity = MathUtils.damp(coreMaterial.current.opacity, targetCoreOpacity, 5.6, delta);
    scannerMaterial.current.opacity = MathUtils.damp(scannerMaterial.current.opacity, targetScannerOpacity, 4.6, delta);
    const targetAuraOpacity = Math.min(0.34, (0.12 + energy * 0.14 + pointerEnergy.current * 0.08) * emergence.current);
    auraMaterial.current.opacity = MathUtils.damp(auraMaterial.current.opacity, targetAuraOpacity, 3.8, delta);
    const targetCoreSize = (quality === 'efficient' ? 0.031 : quality === 'super' ? 0.021 : quality === 'ultra' ? 0.024 : 0.025) + energy * 0.014;
    coreMaterial.current.size = MathUtils.damp(coreMaterial.current.size, targetCoreSize, 5, delta);
    const parallax = reducedMotion ? 0 : quality === 'super' ? 0.052 : quality === 'ultra' ? 0.043 : quality === 'balanced' ? 0.024 : 0;
    group.current.position.x = MathUtils.damp(group.current.position.x, frame.pointer.x * parallax, 2.4, delta);
    group.current.position.y = MathUtils.damp(group.current.position.y, frame.pointer.y * parallax * 0.5, 2.4, delta);
    group.current.rotation.y += frame.pointer.x * pointerEnergy.current * delta * 0.014;
  });

  return (
    <group name={continuumId} position={[1.15, 0, 0]} scale={0.9}>
      <group ref={group} rotation={[-0.12, 0, 0.16]}>
        <group ref={rings}>
          <points geometry={geometries.rings}>
            <pointsMaterial ref={ringMaterial} color={stateColor[state]} size={quality === 'efficient' ? 0.027 : quality === 'super' ? 0.019 : quality === 'ultra' ? 0.021 : 0.022} sizeAttenuation transparent opacity={0.58} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </points>
        </group>
        <group ref={core}>
          <points geometry={geometries.core}>
            <pointsMaterial ref={coreMaterial} color={stateColor[state]} size={quality === 'efficient' ? 0.031 : quality === 'super' ? 0.021 : quality === 'ultra' ? 0.024 : 0.025} sizeAttenuation transparent opacity={0.76} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </points>
        </group>
        <group ref={scanner}>
          <points geometry={geometries.scanner}>
            <pointsMaterial ref={scannerMaterial} color={stateColor[state]} size={quality === 'efficient' ? 0.029 : quality === 'super' ? 0.02 : quality === 'ultra' ? 0.022 : 0.023} sizeAttenuation transparent opacity={0.54} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </points>
        </group>
        <group ref={aura}>
          <points geometry={geometries.aura}>
            <pointsMaterial ref={auraMaterial} color={stateColor[state]} size={quality === 'efficient' ? 0.018 : quality === 'super' ? 0.012 : 0.014} sizeAttenuation transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </points>
        </group>
      </group>
    </group>
  );
}

// #endregion
