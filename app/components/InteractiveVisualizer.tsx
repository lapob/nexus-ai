"use client";

import { useEffect, useRef } from "react";

export type VisualizerVariant = "neural" | "saturn" | "reactor" | "android";

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
};

function seeded(index: number, salt: number) {
  const value = Math.sin((index + 1) * (91.733 + salt)) * 43758.5453;
  return value - Math.floor(value);
}

function targetFor(variant: VisualizerVariant, point: Point, index: number, count: number, time: number) {
  const progress = index / Math.max(1, count - 1);
  const angle = progress * Math.PI * 2 + point.phase;
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
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lite = document.documentElement.dataset.motionTier === "lite";
    const count = lite ? 34 : compact ? 48 : 72;
    const points: Point[] = Array.from({ length: count }, (_, index) => ({
      seed: seeded(index, 2.7),
      phase: seeded(index, 8.1) * Math.PI * 2,
      x: (seeded(index, 13.4) - .5) * 1.2,
      y: (seeded(index, 18.9) - .5) * 1.2,
      vx: 0,
      vy: 0,
    }));
    const pointer = { x: .5, y: .5, active: 0, pressed: false };
    let frame = 0;
    let visible = true;
    let width = 1;
    let height = 1;
    let ratio = 1;
    let last = performance.now();
    let initialized = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
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
      pointer.active += ((pointer.pressed ? 1 : 0) - pointer.active) * (pointer.pressed ? .2 : .07) * elapsed;
      const rendered = points.map((point, index) => {
        const target = targetFor(variant, point, index, count, reduceMotion.matches ? 0 : now);
        const tx = cx + target.x * scale;
        const ty = cy + target.y * scale;
        const dx = point.x - (cx + targetPointerX);
        const dy = point.y - (cy + targetPointerY);
        const distance = Math.max(12, Math.hypot(dx, dy));
        const influence = Math.max(0, 1 - distance / (scale * .48)) * (pointer.pressed ? 1 : .4);
        if (!reduceMotion.matches) {
          const spring = .022 * elapsed;
          point.vx += (tx - point.x) * spring;
          point.vy += (ty - point.y) * spring;
          point.vx += (dx / distance) * influence * 1.6 * elapsed;
          point.vy += (dy / distance) * influence * 1.6 * elapsed;
          point.vx *= Math.pow(.86, elapsed);
          point.vy *= Math.pow(.86, elapsed);
          point.x += point.vx * elapsed;
          point.y += point.vy * elapsed;
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
        context.shadowColor = "rgba(82,238,240,.78)";
        context.shadowBlur = 5 + point.influence * 14;
        context.fillStyle = point.depth > .84 ? "rgba(241,210,126,.86)" : `rgba(102,239,240,${.38 + point.depth * .48})`;
        context.arc(point.x, point.y, size, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      context.globalCompositeOperation = "source-over";
      if (visible && !document.hidden) frame = requestAnimationFrame(draw);
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      pointer.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      pointer.pressed = true;
    };
    const leave = () => { pointer.pressed = false; };
    const observer = new IntersectionObserver(([entry]) => {
      const nextVisible = entry.isIntersecting;
      if (nextVisible && !visible) {
        visible = true;
        last = performance.now();
        frame = requestAnimationFrame(draw);
      } else if (!nextVisible) {
        visible = false;
        cancelAnimationFrame(frame);
      }
    }, { rootMargin: "120px" });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    observer.observe(canvas);
    canvas.addEventListener("pointermove", move, { passive: true });
    canvas.addEventListener("pointerdown", move, { passive: true });
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerup", leave);
    canvas.addEventListener("pointercancel", leave);
    resize();
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerup", leave);
      canvas.removeEventListener("pointercancel", leave);
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
