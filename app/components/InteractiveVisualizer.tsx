"use client";

import { useEffect, useRef } from "react";

export type VisualizerVariant = "neural" | "saturn" | "reactor" | "android" | "sigil";

type Point = {
  seed: number;
  phase: number;
  x: number;
  y: number;
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
      const settle = 1 - Math.exp(-(pointer.pressed ? 7 : 1.25) * elapsed / 60);
      pointer.active += ((pointer.pressed ? 1 : 0) - pointer.active) * settle;
      const rendered = points.map((point, index) => {
        const target = targetFor(variant, point, index, count, reduceMotion.matches ? 0 : now);
        const tx = cx + target.x * scale;
        const ty = cy + target.y * scale;
        const dx = tx - (cx + targetPointerX);
        const dy = ty - (cy + targetPointerY);
        const distance = Math.max(12, Math.hypot(dx, dy));
        const influence = Math.max(0, 1 - distance / (scale * .48)) * pointer.active;
        if (!reduceMotion.matches) {
          // Same time-based relaxation as the desktop shaders: the field
          // responds promptly, then recomposes slowly without frame-rate jumps.
          point.x += (tx + dx / distance * influence * scale * .18 - point.x) * settle;
          point.y += (ty + dy / distance * influence * scale * .18 - point.y) * settle;
        } else {
          point.x = tx;
          point.y = ty;
        }
        return { x: point.x, y: point.y, depth: point.seed, influence };
      });

      context.globalCompositeOperation = "lighter";
      if (variant === "android") {
        const outerAura = context.createRadialGradient(cx, cy, 0, cx, cy, scale * .34);
        outerAura.addColorStop(0, "rgba(137,255,252,.16)");
        outerAura.addColorStop(.24, "rgba(67,226,226,.075)");
        outerAura.addColorStop(1, "rgba(34,160,166,0)");
        context.fillStyle = outerAura;
        context.fillRect(cx - scale * .4, cy - scale * .4, scale * .8, scale * .8);
        for (let orbit = 0; orbit < 4; orbit += 1) {
          context.save();
          context.translate(cx, cy);
          context.rotate((reduceMotion.matches ? 0 : now * .000015) * (orbit % 2 ? -1 : 1) + orbit * .47);
          context.scale(1, orbit % 2 ? .83 : .96);
          context.beginPath();
          context.setLineDash(orbit % 2 ? [scale * .018, scale * .038] : [scale * .07, scale * .028]);
          context.strokeStyle = `rgba(91,238,239,${.045 + orbit * .008})`;
          context.lineWidth = .55;
          context.arc(0, 0, scale * (.13 + orbit * .085), 0, Math.PI * 2);
          context.stroke();
          context.restore();
        }
      }
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
        context.fillStyle = point.depth > .84 ? "rgba(241,210,126,.86)" : `rgba(102,239,240,${.38 + point.depth * .48})`;
        context.arc(point.x, point.y, size, 0, Math.PI * 2);
        context.fill();
      }
      if (variant === "android") {
        for (let index = 0; index < rendered.length; index += 7) {
          const point = rendered[index];
          context.beginPath();
          context.strokeStyle = `rgba(101,240,238,${.035 + point.influence * .08})`;
          context.lineWidth = .45;
          context.moveTo(cx, cy);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
        const nucleus = context.createRadialGradient(cx - scale * .018, cy - scale * .022, 0, cx, cy, scale * .115);
        nucleus.addColorStop(0, "rgba(245,255,255,.98)");
        nucleus.addColorStop(.08, "rgba(141,255,253,.95)");
        nucleus.addColorStop(.3, "rgba(49,211,215,.68)");
        nucleus.addColorStop(.68, "rgba(22,105,111,.18)");
        nucleus.addColorStop(1, "rgba(22,105,111,0)");
        context.fillStyle = nucleus;
        context.beginPath();
        context.arc(cx, cy, scale * .115, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.strokeStyle = "rgba(174,255,252,.34)";
        context.lineWidth = .7;
        context.arc(cx, cy, scale * .052, 0, Math.PI * 2);
        context.stroke();
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
    };
    const leave = () => { pointer.pressed = false; };
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
    canvas.addEventListener("pointerdown", move, { passive: true });
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
      canvas.removeEventListener("pointerdown", move);
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
