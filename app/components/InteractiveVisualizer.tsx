"use client";

import { useEffect, useRef } from "react";
import { createAstralCore } from "../lib/astral-core";

export type VisualizerVariant = "neural" | "saturn" | "reactor" | "android" | "sigil";

type Point = {
  seed: number;
  phase: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const LABELS: Record<VisualizerVariant, string> = {
  neural: "Neural",
  saturn: "Saturn",
  reactor: "Reactor",
  android: "Mobile Core",
  sigil: "NexusNXS astrale",
};

function seeded(index: number, salt: number) {
  const value = Math.sin((index + 1) * (91.733 + salt)) * 43758.5453;
  return value - Math.floor(value);
}

function targetFor(variant: VisualizerVariant, point: Point, index: number, count: number, time: number) {
  const progress = index / Math.max(1, count - 1);
  const angle = progress * Math.PI * 2 + point.phase;
  if (variant === "sigil") {
    const arm = index % 10;
    const reach = Math.floor(index / 10) / Math.max(1, Math.ceil(count / 10) - 1);
    const turn = arm * Math.PI / 5 + reach * 1.55;
    const radius = .065 + reach * .37;
    return { x: Math.cos(turn) * radius, y: Math.sin(turn) * radius };
  }
  if (variant === "neural") {
    const side = index % 2 === 0 ? -1 : 1;
    const local = angle * 2.15 + side * .45;
    const radius = .16 + point.seed * .25;
    return { x: side * .19 + Math.cos(local) * radius, y: Math.sin(local) * radius * 1.2 };
  }
  if (variant === "saturn") {
    if (index % 3 === 0) {
      const ring = .42 + point.seed * .12;
      return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring * .26 };
    }
    const radius = Math.sqrt(progress) * .26;
    return { x: Math.cos(angle * 3.1) * radius, y: Math.sin(angle * 3.1) * radius };
  }
  if (variant === "reactor") {
    const ring = .1 + (index % 4) * .09;
    const segmentedAngle = angle + Math.sin(time * .00022 + point.phase) * .035;
    return { x: Math.cos(segmentedAngle) * ring, y: Math.sin(segmentedAngle) * ring };
  }
  const spiral = .055 + progress * .37;
  const mobileAngle = angle * 2.7 + time * .00008;
  return { x: Math.cos(mobileAngle) * spiral, y: Math.sin(mobileAngle) * spiral * .92 };
}

export function InteractiveVisualizer({ variant, compact = false }: { variant: VisualizerVariant; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (variant === "android") {
      const renderer = createAstralCore(canvas, { efficient: document.documentElement.dataset.motionTier === "lite" });
      return () => renderer.dispose();
    }
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lite = document.documentElement.dataset.motionTier === "lite";
    const count = lite ? 40 : variant === "sigil" ? 160 : compact ? 48 : 72;
    // Rasterize glow once; per-particle shadowBlur forces repeated expensive
    // shadow passes on mobile/software renderers.
    const glow = document.createElement("canvas");
    glow.width = glow.height = 32;
    const glowContext = glow.getContext("2d");
    if (glowContext) {
      const gradient = glowContext.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, "rgba(110,248,249,.55)");
      gradient.addColorStop(.28, "rgba(82,238,240,.15)");
      gradient.addColorStop(1, "rgba(82,238,240,0)");
      glowContext.fillStyle = gradient;
      glowContext.fillRect(0, 0, 32, 32);
    }
    const points: Point[] = Array.from({ length: count }, (_, index) => ({
      seed: seeded(index, 2.7),
      phase: seeded(index, 8.1) * Math.PI * 2,
      x: (seeded(index, 13.4) - .5) * 1.2,
      y: (seeded(index, 18.9) - .5) * 1.2,
      vx: 0, vy: 0,
    }));
    const pointer = { x: .5, y: .5, active: 0, pressed: false };
    const inspection = { id: -1, startX: 0, startY: 0, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let frame = 0;
    let visible = true;
    let width = 1;
    let height = 1;
    let ratio = 1;
    let last = performance.now();
    let initialized = false;
    let documentTop = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      documentTop = rect.top + window.scrollY;
      ratio = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.6);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!initialized) {
        for (const point of points) {
          point.x = width * (.5 + (point.seed - .5) * 1.15);
          point.y = height * (.5 + (Math.sin(point.phase) * .56));
        }
        initialized = true;
      }
    };

    const draw = (now: number) => {
      if (!canvas.isConnected) return;
      const elapsed = Math.min(34, now - last) / 16.667;
      last = now;
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width, height) * (compact ? 1.02 : .9);
      const cx = width / 2;
      const cy = height / 2;
      const targetPointerX = (pointer.x - .5) * width;
      const targetPointerY = (pointer.y - .5) * height;
      const dt = elapsed / 60;
      const settle = 1 - Math.exp(-(pointer.pressed ? 7 : 1.25) * dt);
      const omega = inspection.id >= 0 ? 9 : 1.7, decay = Math.exp(-omega * dt);
      const goalX = inspection.id >= 0 ? inspection.tx : 0, goalY = inspection.id >= 0 ? inspection.ty : 0;
      const ex = inspection.x - goalX, ey = inspection.y - goalY;
      const ax = inspection.vx + omega * ex, ay = inspection.vy + omega * ey;
      inspection.x = goalX + (ex + ax * dt) * decay; inspection.y = goalY + (ey + ay * dt) * decay;
      inspection.vx = (inspection.vx - omega * ax * dt) * decay; inspection.vy = (inspection.vy - omega * ay * dt) * decay;
      // Scroll composes and releases the same points; it never restarts a clip.
      const top = documentTop - window.scrollY;
      const arrival = Math.min(1, Math.max(0, (window.innerHeight * .92 - top) / Math.max(1, height * .7)));
      const departure = Math.min(1, Math.max(0, (top + height) / Math.max(1, height * .55)));
      const reveal = variant === "sigil" && !reduceMotion.matches ? Math.min(arrival, departure) : 1;
      const composition = reveal * reveal * (3 - 2 * reveal);
      pointer.active += ((pointer.pressed ? 1 : 0) - pointer.active) * settle;
      const rendered = points.map((point, index) => {
        const target = targetFor(variant, point, index, count, reduceMotion.matches ? 0 : now);
        const scatterX = (point.seed - .5) * width * 1.35;
        const scatterY = Math.sin(point.phase) * height * .65;
        const z = Math.sin(point.phase) * .09;
        const rx = target.x * Math.cos(inspection.y) + z * Math.sin(inspection.y);
        const rz = -target.x * Math.sin(inspection.y) + z * Math.cos(inspection.y);
        const ry = target.y * Math.cos(inspection.x) - rz * Math.sin(inspection.x);
        const tx = cx + rx * scale * composition + scatterX * (1 - composition);
        const ty = cy + ry * scale * composition + scatterY * (1 - composition);
        const dx = tx - (cx + targetPointerX);
        const dy = ty - (cy + targetPointerY);
        const distance = Math.max(12, Math.hypot(dx, dy));
        const influence = Math.max(0, 1 - distance / (scale * .48)) * pointer.active;
        if (!reduceMotion.matches) {
          const gx = tx + dx / distance * influence * scale * .18;
          const gy = ty + dy / distance * influence * scale * .18;
          const omega = influence > .01 ? 4.5 : 1.7, decay = Math.exp(-omega * dt);
          const ex = point.x - gx, ey = point.y - gy;
          const ax = point.vx + omega * ex, ay = point.vy + omega * ey;
          point.x = gx + (ex + ax * dt) * decay; point.y = gy + (ey + ay * dt) * decay;
          point.vx = (point.vx - omega * ax * dt) * decay; point.vy = (point.vy - omega * ay * dt) * decay;
        } else {
          point.x = tx;
          point.y = ty;
        }
        return { x: point.x, y: point.y, depth: point.seed, influence };
      });

      context.globalCompositeOperation = "lighter";
      for (let index = 0; index < rendered.length; index += 3) {
        const point = rendered[index];
        const peer = rendered[(index + 7) % rendered.length];
        const distance = Math.hypot(point.x - peer.x, point.y - peer.y);
        if (distance > scale * .34) continue;
        context.beginPath();
        context.strokeStyle = `rgba(91,238,239,${.035 + point.influence * .07})`;
        context.lineWidth = .55;
        context.moveTo(point.x, point.y);
        context.lineTo(peer.x, peer.y);
        context.stroke();
      }
      for (const point of rendered) {
        const size = .65 + point.depth * 1.55 + point.influence * 1.7;
        context.beginPath();
        const glowSize = size * (5 + point.influence * 3);
        context.drawImage(glow, point.x - glowSize / 2, point.y - glowSize / 2, glowSize, glowSize);
        context.fillStyle = point.depth > .93 ? "rgba(161,137,250,.86)" : point.depth > .84 ? "rgba(225,249,255,.86)" : `rgba(125,245,250,${.38 + point.depth * .48})`;
        context.arc(point.x, point.y, size, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      context.globalCompositeOperation = "source-over";
      if (visible && !document.hidden && !reduceMotion.matches) frame = requestAnimationFrame(draw);
    };

    const resume = () => {
      cancelAnimationFrame(frame);
      if (!visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      pointer.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      pointer.pressed = true;
      if (inspection.id === event.pointerId && !reduceMotion.matches) {
        inspection.tx = Math.max(-1.15, Math.min(1.15, (event.clientY - inspection.startY) / Math.min(width,height) * 2.8));
        inspection.ty = Math.max(-1.15, Math.min(1.15, (event.clientX - inspection.startX) / Math.min(width,height) * 2.8));
      }
    };
    const down = (event: PointerEvent) => { if (event.button !== 0 || reduceMotion.matches) return; inspection.id = event.pointerId; inspection.startX = event.clientX; inspection.startY = event.clientY; canvas.setPointerCapture(event.pointerId); move(event); };
    const leave = () => { pointer.pressed = false; if (inspection.id >= 0 && canvas.hasPointerCapture(inspection.id)) canvas.releasePointerCapture(inspection.id); inspection.id = -1; };
    const observer = new IntersectionObserver(([entry]) => {
      const nextVisible = entry.isIntersecting;
      if (nextVisible && !visible) {
        visible = true;
        resume();
      } else if (!nextVisible) {
        visible = false;
        cancelAnimationFrame(frame);
      }
    }, { rootMargin: "120px" });
    const resizeObserver = new ResizeObserver(() => { resize(); resume(); });
    resizeObserver.observe(canvas);
    observer.observe(canvas);
    canvas.addEventListener("pointermove", move, { passive: true });
    canvas.addEventListener("pointerdown", down, { passive: true });
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerup", leave);
    canvas.addEventListener("pointercancel", leave);
    document.addEventListener("visibilitychange", resume);
    reduceMotion.addEventListener("change", resume);
    resize();
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerup", leave);
      canvas.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", resume);
      reduceMotion.removeEventListener("change", resume);
    };
  }, [compact, variant]);

  return <figure className={`interactive-visualizer interactive-visualizer--${variant}${compact ? " is-compact" : ""}`}>
    <canvas ref={canvasRef} aria-hidden="true" />
    <figcaption>{LABELS[variant]}</figcaption>
  </figure>;
}

export function VisualizerCollection({ mode, compact = false }: { mode: "all" | "desktop" | "android"; compact?: boolean }) {
  const variants: VisualizerVariant[] = mode === "desktop"
    ? ["neural", "saturn", "reactor"]
    : mode === "android"
      ? ["android"]
      : ["neural", "saturn", "reactor", "android"];
  return <div className={`visualizer-collection visualizer-collection--${mode}${compact ? " is-compact" : ""}`} role="group" aria-label="Visualizer NexusNXS interattivi">
    {variants.map((variant) => <InteractiveVisualizer key={variant} variant={variant} compact={compact} />)}
  </div>;
}
