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
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
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
  ".product-facts > div",
  ".feature-grid > article",
  ".control-grid > article",
  ".release-list > article",
  ".service-list > div",
  ".verify-guide",
  ".report-band",
  ".release-notes > article",
  ".uptime-panel",
  ".footer-links > div",
].join(",");

const AMBIENT_SELECTOR = [
  ".hero",
  ".app-grid",
  ".presence-system",
  ".trust-seal",
  "[data-nexus-presence]",
  ".interactive-visualizer",
].join(",");

const IMMEDIATE_REVEAL_SELECTOR = [
  ".product-hero",
  ".trust-hero",
  ".download-hero",
  ".status-hero",
  ".legal-hero",
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
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0, active: 0 };
    const routeName = window.location.pathname.replace(/^\/+|\/+$/g, "") || "home";
    const routePhase = Array.from(routeName).reduce((total, character) => total + character.charCodeAt(0), 0) % 5;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    let sectionAnchors: number[] = [];
    let readingZones: { left: number; right: number; top: number; bottom: number }[] = [];
    let sceneProgress = 0;
    let paintMs = 0;

    const cosmicCanvas = document.createElement("canvas");
    cosmicCanvas.className = "nxs-cosmic-field";
    cosmicCanvas.setAttribute("aria-hidden", "true");
    const cosmicContext = cosmicCanvas.getContext("2d", { alpha: true });
    const particleCount = tier === "ultra" ? 600 : tier === "balanced" ? 360 : 120;
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
      offsetX: 0,
      offsetY: 0,
      velocityX: 0,
      velocityY: 0,
    }));

    const resizeCosmicField = () => {
      if (!cosmicContext) return;
      const ratio = Math.min(window.devicePixelRatio || 1, tier === "ultra" ? 1.75 : 1.35);
      cosmicWidth = Math.max(1, window.innerWidth);
      cosmicHeight = Math.max(1, window.innerHeight);
      cosmicCanvas.width = Math.round(cosmicWidth * ratio);
      cosmicCanvas.height = Math.round(cosmicHeight * ratio);
      cosmicContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      sectionAnchors = sections.map(section => section.getBoundingClientRect().top + window.scrollY);
      readingZones = Array.from(document.querySelectorAll<HTMLElement>("main h1,main h2,main p,main li,main .app-grid,main .nexus-stage,main .presence-grid,main .security-panel,main .interactive-visualizer")).map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left - 24, right: rect.right + 24, top: rect.top + window.scrollY - 20, bottom: rect.bottom + window.scrollY + 20 };
      });
    };

    const drawCosmicField = (now: number) => {
      if (!cosmicContext || !cosmicCanvas.isConnected) return;
      const paintStart = performance.now();
      const reduced = reducedMotion.matches;
      const delta = Math.min(.25, Math.max(.001, (now - cosmicLastFrame) / 1000));
      cosmicLastFrame = now;
      const time = reduced ? 0 : now / 1000;
      if (now - pointer.time > 80) { pointer.vx *= Math.exp(-delta * 5); pointer.vy *= Math.exp(-delta * 5); }
      const scroll = Number(root.style.getPropertyValue("--nxs-scroll")) || 0;
      const viewportAnchor = window.scrollY + cosmicHeight * .3;
      let currentSection = Math.max(0, sectionAnchors.findLastIndex(top => top <= viewportAnchor));
      currentSection = Math.min(currentSection, Math.max(0, sections.length - 1));
      const sectionStart = sectionAnchors[currentSection] || 0;
      const sectionEnd = sectionAnchors[currentSection + 1] || sectionStart + cosmicHeight;
      const destination = currentSection + Math.min(1, Math.max(0, (viewportAnchor - sectionStart) / Math.max(1, sectionEnd - sectionStart)));
      sceneProgress += (destination - sceneProgress) * (reduced ? 1 : 1 - Math.exp(-2.4 * delta));
      const sectionPosition = sceneProgress;
      const sectionIndex = Math.floor(sectionPosition);
      const sectionMixRaw = sectionPosition - sectionIndex;
      const sectionMix = sectionMixRaw * sectionMixRaw * (3 - 2 * sectionMixRaw);
      const laneFor = (index: number) => {
        const scene = sections[index]?.dataset.cosmicScene;
        return scene === "center" ? .5 : scene === "left" ? .13 : scene === "right" ? .87 : index % 2 === 0 ? .87 : .13;
      };
      const visualLane = cosmicWidth < 760
        ? (sectionIndex % 2 ? .04 : .96)
        : laneFor(sectionIndex) + (laneFor(sectionIndex + 1) - laneFor(sectionIndex)) * sectionMix;
      const topology = sectionPosition + routePhase;
      const topologyIndex = Math.floor(topology);
      const topologyMixRaw = topology - topologyIndex;
      const topologyMix = topologyMixRaw * topologyMixRaw * (3 - 2 * topologyMixRaw);
      const topologyPoint = (particle: CosmicParticle, index: number, shape: number) => {
        const kind = ((shape % 5) + 5) % 5;
        const angle = (index / particles.length) * Math.PI * 2 + particle.phase * .18;
        const centerX = cosmicWidth * visualLane;
        const centerY = cosmicHeight * .5;
        if (kind === 0) {
          const radius = Math.min(cosmicWidth, cosmicHeight) * (.19 + (index % 3) * .052);
          return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
        }
        if (kind === 1) {
          const side = index % 2 === 0 ? -1 : 1;
          const lobeAngle = angle * 1.45;
          const radius = Math.min(cosmicWidth, cosmicHeight) * (.11 + particle.depth * .12);
          return { x: centerX + side * cosmicWidth * .105 + Math.cos(lobeAngle) * radius, y: centerY + Math.sin(lobeAngle) * radius * 1.18 };
        }
        if (kind === 2) {
          const radius = Math.min(cosmicWidth, cosmicHeight) * (.035 + index / particles.length * .38);
          return { x: centerX + Math.cos(angle * 2.35) * radius, y: centerY + Math.sin(angle * 2.35) * radius };
        }
        if (kind === 3) {
          const column = index / Math.max(1, particles.length - 1);
          return { x: cosmicWidth * (.12 + column * .76), y: centerY + Math.sin(column * Math.PI * 4 + routePhase) * cosmicHeight * .19 };
        }
        const orbit = index % 4;
        const radiusX = cosmicWidth * (.12 + orbit * .055);
        const radiusY = cosmicHeight * (.09 + orbit * .04);
        return { x: centerX + Math.cos(angle + orbit * .42) * radiusX, y: centerY + Math.sin(angle + orbit * .42) * radiusY };
      };
      cosmicContext.clearRect(0, 0, cosmicWidth, cosmicHeight);
      cosmicContext.globalCompositeOperation = "lighter";
      const points = particles.map((particle, index) => {
        const baseX = particle.x * cosmicWidth;
        const baseY = ((particle.y + scroll * particle.depth * .13) % 1) * cosmicHeight;
        const first = topologyPoint(particle, index, topologyIndex);
        const second = topologyPoint(particle, index, topologyIndex + 1);
        const targetX = first.x + (second.x - first.x) * topologyMix;
        const targetY = first.y + (second.y - first.y) * topologyMix;
        // Tra due capitoli la forma si apre nello spazio, attraversa la pagina
        // e si ricompone nella topologia seguente. Il campo resta continuo:
        // non ci sono cambi di scena o salti di corsia a meta scroll.
        const transitionScatter = Math.sin(sectionMix * Math.PI) * .24;
        const compose = (.82 + particle.depth * .16) * (1 - transitionScatter);
        const x = baseX * (1 - compose) + targetX * compose + Math.sin(time * particle.speed + particle.phase) * (4 + particle.depth * 9);
        const y = baseY * (1 - compose) + targetY * compose + Math.cos(time * particle.speed * .72 + particle.phase) * (3 + particle.depth * 7);
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const influence = (reduced ? 0 : pointer.active) * Math.max(0, 1 - distance / 190);
        const angle = Math.atan2(y - pointer.y, x - pointer.x);
        const goalX = (Math.cos(angle) * 46 + pointer.vx * .1) * influence;
        const goalY = (Math.sin(angle) * 46 + pointer.vy * .1) * influence;
        const omega = influence > .01 ? 4.5 : 1.7, decay = Math.exp(-omega * delta);
        const ex = particle.offsetX - goalX, ey = particle.offsetY - goalY;
        const ax = particle.velocityX + omega * ex, ay = particle.velocityY + omega * ey;
        particle.offsetX = goalX + (ex + ax * delta) * decay;
        particle.offsetY = goalY + (ey + ay * delta) * decay;
        particle.velocityX = (particle.velocityX - omega * ax * delta) * decay;
        particle.velocityY = (particle.velocityY - omega * ay * delta) * decay;
        const px = x + particle.offsetX, py = y + particle.offsetY;
        let visibility = 1;
        for (const rect of readingZones) {
          const dx = Math.max(rect.left - px, 0, px - rect.right);
          const dy = Math.max(rect.top - py - window.scrollY, 0, py + window.scrollY - rect.bottom);
          const edge = Math.min(1, Math.hypot(dx, dy) / 44);
          visibility = Math.min(visibility, .05 + .95 * edge * edge * (3 - 2 * edge));
        }
        return { x: px, y: py, depth: particle.depth, visibility };
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
        cosmicContext.strokeStyle = `rgba(86, 232, 234, ${.1 * point.visibility * nearest.visibility * (1 - nearestDistance / 128)})`;
        cosmicContext.moveTo(point.x, point.y);
        cosmicContext.lineTo(nearest.x, nearest.y);
        cosmicContext.stroke();
      }
      for (const point of points) {
        cosmicContext.beginPath();
        cosmicContext.fillStyle = `rgba(${point.depth > .93 ? '161,137,250' : point.depth > .8 ? '225,249,255' : '125,245,250'}, ${(.2 + point.depth * .45) * point.visibility})`;
        cosmicContext.arc(point.x, point.y, .45 + point.depth * 1.15, 0, Math.PI * 2);
        cosmicContext.fill();
      }
      cosmicContext.globalCompositeOperation = "source-over";
      paintMs += (performance.now() - paintStart - paintMs) * .1;
      cosmicCanvas.dataset.sceneProgress = sceneProgress.toFixed(3);
      cosmicCanvas.dataset.paintMs = paintMs.toFixed(2);
      cosmicCanvas.dataset.particles = String(particleCount);
      if (!reduced && !document.hidden) cosmicFrame = requestAnimationFrame(drawCosmicField);
    };

    root.classList.remove("nxs-motion-ready", "nxs-motion-preparing", ...MOTION_TIER_CLASSES);
    root.classList.add("nxs-motion-preparing", `nxs-motion-${tier}`);
    root.dataset.motionTier = tier;
    root.dataset.nexusRoute = routeName;
    document.body.prepend(cosmicCanvas);
    resizeCosmicField();
    drawCosmicField(performance.now());
    // Images and fonts can change the reading lanes without resizing the window.
    const layoutObserver = new ResizeObserver(resizeCosmicField);
    const content = document.getElementById("site-content");
    if (content) layoutObserver.observe(content);

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
      const now = performance.now(), seconds = Math.max(.008, (now - pointer.time) / 1000);
      pointer.vx = pointer.active ? Math.max(-650, Math.min(650, (event.clientX - pointer.x) / seconds)) : 0;
      pointer.vy = pointer.active ? Math.max(-650, Math.min(650, (event.clientY - pointer.y) / seconds)) : 0;
      pointer.time = now;
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
      layoutObserver.disconnect();
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
      delete root.dataset.nexusRoute;
      root.style.removeProperty("--nxs-scroll");
      cosmicCanvas.remove();
    };
  }, []);

  return null;
}
