/** @module renderer/scene/VisualizerInspection
 * A shared, reversible 3D inspection gesture for all desktop visualizers.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';

// #region Gesture ownership and time-based physics
export function VisualizerInspection({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const group = useRef<Group>(null);
  const { gl } = useThree();
  const motion = useRef({ id: -1, startX: 0, startY: 0, dragging: false, suppressClickUntil: 0, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 });
  useEffect(() => {
    const canvas = gl.domElement, state = motion.current;
    const host = canvas.closest('.voice-visualizer') || canvas;
    const release = () => {
      if (state.dragging) state.suppressClickUntil = performance.now() + 350;
      const id = state.id;
      state.id = -1; state.dragging = false; state.targetX = state.targetY = 0;
      if (id >= 0 && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    const click = (event: Event) => {
      if (performance.now() < state.suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const down = (event: PointerEvent) => {
      if (reduced || event.button !== 0) return;
      state.id = event.pointerId; state.startX = event.clientX; state.startY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== state.id) return;
      const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
      if (Math.hypot(dx, dy) < 8 && !state.dragging) return;
      state.dragging = true;
      canvas.setPointerCapture(event.pointerId);
      const size = Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight));
      state.targetX = Math.max(-1.15, Math.min(1.15, dy / size * 2.8));
      state.targetY = Math.max(-1.15, Math.min(1.15, dx / size * 2.8));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    host.addEventListener('click', click, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('blur', release);
    return () => {
      release(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', release); canvas.removeEventListener('pointercancel', release);
      canvas.removeEventListener('lostpointercapture', release);
      host.removeEventListener('click', click, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('blur', release);
    };
  }, [gl, reduced]);
  useFrame((_, elapsed) => {
    if (!group.current) return;
    // Closed-form damping is stable even when Chromium throttles an inactive
    // window. Clamping to one 25-Hz frame made the return last many seconds.
    const s = motion.current, dt = Math.min(1, Math.max(0, elapsed)), omega = s.dragging ? 9 : 1.7;
    const decay = Math.exp(-omega * dt), ex = s.x - s.targetX, ey = s.y - s.targetY;
    const ax = s.vx + omega * ex, ay = s.vy + omega * ey;
    s.x = s.targetX + (ex + ax * dt) * decay; s.y = s.targetY + (ey + ay * dt) * decay;
    s.vx = (s.vx - omega * ax * dt) * decay; s.vy = (s.vy - omega * ay * dt) * decay;
    group.current.rotation.set(s.x, s.y, 0);
    gl.domElement.dataset.inspection = `${s.x.toFixed(3)},${s.y.toFixed(3)}`;
    gl.domElement.dataset.inspecting = String(s.dragging);
  });
  return <group ref={group}>{children}</group>;
}
// #endregion
