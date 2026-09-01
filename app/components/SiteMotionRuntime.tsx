"use client";

import { useLayoutEffect } from "react";

type MotionTier = "lite" | "balanced" | "ultra";

type RuntimeNavigator = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

type CosmicParticle = {
  x: number;
  y: number;
  depth: number;
  phase: number;
  speed: number;
};

const MOTION_TIER_CLASSES = ["nxs-motion-lite", "nxs-motion-balanced", "nxs-motion-ultra"];

function resolveMotionTier(runtime: RuntimeNavigator): MotionTier {
  const cores = runtime.hardwareConcurrency ?? 8;
  const memory = runtime.deviceMemory ?? 8;
  const connection = runtime.connection;
  const slowConnection = /^(slow-)?2g$|^3g$/.test(connection?.effectiveType ?? "");

  if (connection?.saveData === true || slowConnection || cores <= 4 || memory <= 4) return "lite";
  if (cores >= 12 && memory >= 8) return "ultra";
  return "balanced";
}

const REVEAL_SELECTOR = [
  ".reveal",
  ".product-hero",
  ".trust-hero",
  ".download-hero",
  ".status-hero",
  ".legal-hero",
  ".pricing-hero",
  ".product-facts > div",
  ".feature-grid > article",
  ".control-grid > article",
  ".release-list > article",
  ".service-list > div",
  ".verify-guide",
  ".report-band",
  ".release-notes > article",
  ".pricing-grid > article",
  ".founder-program",
  ".pricing-disclosure",
  ".uptime-panel",
  ".footer-links > div",
].join(",");

const AMBIENT_SELECTOR = [
  ".hero",
  ".app-grid",
  ".presence-system",
  ".trust-seal",
  "[data-nexus-presence]",
].join(",");

const IMMEDIATE_REVEAL_SELECTOR = [
  ".product-hero",
  ".trust-hero",
  ".download-hero",
  ".status-hero",
  ".legal-hero",
  ".pricing-hero",
].join(",");

export function SiteMotionRuntime() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const runtime = navigator as RuntimeNavigator;
    const tier = resolveMotionTier(runtime);
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const ambientTargets = Array.from(document.querySelectorAll<HTMLElement>(AMBIENT_SELECTOR));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scrollFrame = 0;
    let revealFrame = 0;
    let cosmicFrame = 0;
    let cosmicLastFrame = 0;
    let cosmicWidth = 1;
    let cosmicHeight = 1;
    const pointer = { x: 0, y: 0, active: 0 };

    const cosmicCanvas = document.createElement("canvas");
    cosmicCanvas.className = "nxs-cosmic-field";
    cosmicCanvas.setAttribute("aria-hidden", "true");
    const cosmicContext = cosmicCanvas.getContext("2d", { alpha: true });
    const particleCount = tier === "ultra" ? 74 : tier === "balanced" ? 48 : 24;
    let seed = 0x4e5853;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const particles: CosmicParticle[] = Array.from({ length: particleCount }, () => ({
      x: random(),
      y: random(),
      depth: .25 + random() * .75,
      phase: random() * Math.PI * 2,
      speed: .22 + random() * .42,
    }));

    const resizeCosmicField = () => {
      if (!cosmicContext) return;
      const ratio = Math.min(window.devicePixelRatio || 1, tier === "ultra" ? 1.75 : 1.35);
      cosmicWidth = Math.max(1, window.innerWidth);
      cosmicHeight = Math.max(1, window.innerHeight);
      cosmicCanvas.width = Math.round(cosmicWidth * ratio);
      cosmicCanvas.height = Math.round(cosmicHeight * ratio);
      cosmicContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawCosmicField = (now: number) => {
      if (!cosmicContext || !cosmicCanvas.isConnected) return;
      const reduced = reducedMotion.matches;
      const frameInterval = tier === "ultra" || tier === "balanced" ? 16.5 : 33;
      if (!reduced && now - cosmicLastFrame < frameInterval) {
        cosmicFrame = requestAnimationFrame(drawCosmicField);
        return;
      }
      cosmicLastFrame = now;
      const time = reduced ? 0 : now / 1000;
      const scroll = Number(root.style.getPropertyValue("--nxs-scroll")) || 0;
      cosmicContext.clearRect(0, 0, cosmicWidth, cosmicHeight);
      cosmicContext.globalCompositeOperation = "lighter";
      const points = particles.map((particle) => {
        const baseX = particle.x * cosmicWidth;
        const baseY = ((particle.y + scroll * particle.depth * .13) % 1) * cosmicHeight;
        const x = baseX + Math.sin(time * particle.speed + particle.phase) * (5 + particle.depth * 12);
        const y = baseY + Math.cos(time * particle.speed * .72 + particle.phase) * (4 + particle.depth * 9);
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const influence = pointer.active * Math.max(0, 1 - distance / 150);
        const angle = Math.atan2(y - pointer.y, x - pointer.x);
        return { x: x + Math.cos(angle) * influence * 8, y: y + Math.sin(angle) * influence * 8, depth: particle.depth };
      });
      cosmicContext.lineWidth = .55;
      for (let index = 0; index < points.length; index += 3) {
        const point = points[index];
        let nearest: (typeof points)[number] | undefined;
        let nearestDistance = 128;
        for (let peerIndex = index + 1; peerIndex < Math.min(points.length, index + 12); peerIndex += 1) {
          const peer = points[peerIndex];
          const distance = Math.hypot(point.x - peer.x, point.y - peer.y);
          if (distance < nearestDistance) { nearest = peer; nearestDistance = distance; }
        }
        if (!nearest) continue;
        cosmicContext.beginPath();
        cosmicContext.strokeStyle = `rgba(86, 232, 234, ${.026 * (1 - nearestDistance / 128)})`;
        cosmicContext.moveTo(point.x, point.y);
        cosmicContext.lineTo(nearest.x, nearest.y);
        cosmicContext.stroke();
      }
      for (const point of points) {
        cosmicContext.beginPath();
        cosmicContext.fillStyle = `rgba(101, 238, 239, ${.04 + point.depth * .12})`;
        cosmicContext.arc(point.x, point.y, .45 + point.depth * 1.15, 0, Math.PI * 2);
        cosmicContext.fill();
      }
      cosmicContext.globalCompositeOperation = "source-over";
      if (!reduced && !document.hidden) cosmicFrame = requestAnimationFrame(drawCosmicField);
    };

    root.classList.remove("nxs-motion-ready", "nxs-motion-preparing", ...MOTION_TIER_CLASSES);
    root.classList.add("nxs-motion-preparing", `nxs-motion-${tier}`);
    root.dataset.motionTier = tier;
    document.body.prepend(cosmicCanvas);
    resizeCosmicField();
    drawCosmicField(performance.now());

    const syncVisibility = () => {
      root.toggleAttribute("data-motion-paused", document.hidden);
      cancelAnimationFrame(cosmicFrame);
      if (!document.hidden) cosmicFrame = requestAnimationFrame(drawCosmicField);
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    const ambientObserver = typeof IntersectionObserver === "function" && !reducedMotion.matches && tier !== "lite"
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("nxs-ambient-active", entry.isIntersecting);
        }
      }, { rootMargin: "80px 0px", threshold: 0.01 })
      : null;
    ambientTargets.forEach((target) => {
      if (ambientObserver) ambientObserver.observe(target);
      else target.classList.toggle("nxs-ambient-active", !reducedMotion.matches && tier !== "lite");
    });

    const showTarget = (target: HTMLElement) => {
      target.classList.add("nxs-in-view");
    };
    const revealObserver = typeof IntersectionObserver === "function" && !reducedMotion.matches
      ? new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          showTarget(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      }, { rootMargin: "96px 0px -7%", threshold: 0.04 })
      : null;
    const initiallyVisible: HTMLElement[] = [];
    revealTargets.forEach((target) => {
      if (!revealObserver || target.matches(IMMEDIATE_REVEAL_SELECTOR)) {
        showTarget(target);
        return;
      }
      const entersInitialViewport = target.getBoundingClientRect().top <= window.innerHeight * 1.02;
      if (entersInitialViewport && !target.matches(".app-card")) {
        showTarget(target);
        return;
      }
      target.classList.add("nxs-motion-candidate");
      if (entersInitialViewport) initiallyVisible.push(target);
      else revealObserver.observe(target);
    });

    // Commit the hidden starting state before transitions are enabled. This
    // prevents the first hydration frame from animating content backwards.
    void root.offsetWidth;
    root.classList.remove("nxs-motion-preparing");
    root.classList.add("nxs-motion-ready");
    if (initiallyVisible.length > 0) {
      revealFrame = requestAnimationFrame(() => initiallyVisible.forEach(showTarget));
    }

    const updateScroll = () => {
      scrollFrame = 0;
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--nxs-scroll", String(Math.min(1, Math.max(0, window.scrollY / available))));
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || tier === "lite") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = 1;
    };
    const onPointerLeave = () => { pointer.active = 0; };

    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("resize", resizeCosmicField, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    return () => {
      revealObserver?.disconnect();
      ambientObserver?.disconnect();
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(revealFrame);
      cancelAnimationFrame(cosmicFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("resize", resizeCosmicField);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      revealTargets.forEach((target) => target.classList.remove("nxs-motion-candidate", "nxs-in-view"));
      ambientTargets.forEach((target) => target.classList.remove("nxs-ambient-active"));
      document.removeEventListener("visibilitychange", syncVisibility);
      root.removeAttribute("data-motion-paused");
      root.classList.remove("nxs-motion-ready", "nxs-motion-preparing", ...MOTION_TIER_CLASSES);
      delete root.dataset.motionTier;
      root.style.removeProperty("--nxs-scroll");
      cosmicCanvas.remove();
    };
  }, []);

  return null;
}
