"use client";

import { useEffect } from "react";

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
].join(",");

const IMMEDIATE_REVEAL_SELECTOR = [
  ".product-hero",
  ".trust-hero",
  ".download-hero",
  ".status-hero",
  ".legal-hero",
].join(",");

export function SiteMotionRuntime() {
  useEffect(() => {
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
    const quietPage = routeName !== "home";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section:not(.narrative-apps), main > .narrative-apps .app-card, main > footer"));
    let sectionAnchors: number[] = [];
    let mobileArtAnchors: number[] = [];
    let readingHalos: {left:number;right:number;top:number;bottom:number}[] = [];
    let heroCore: { x: number; y: number; size: number } | null = null;
    let sceneProgress = 0;
    let paintMs = 0;
    let fieldStarted = performance.now();
    let ambientTime = 0;
    const inspection = { id: -1, startX: 0, startY: 0, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 };
    let strainedSeconds = 0;
    let healthySeconds = 0;

    const cosmicCanvas = document.createElement("canvas");
    cosmicCanvas.className = "nxs-cosmic-field";
    cosmicCanvas.setAttribute("aria-hidden", "true");
    const cosmicContext = cosmicCanvas.getContext("2d", { alpha: true });
    const glow = document.createElement('canvas');
    glow.width = glow.height = 32;
    const glowContext = glow.getContext('2d');
    if (glowContext) {
      const gradient = glowContext.createRadialGradient(16,16,0,16,16,16);
      gradient.addColorStop(0,'rgba(220,250,255,.7)');
      gradient.addColorStop(.2,'rgba(120,225,245,.24)');
      gradient.addColorStop(1,'rgba(120,225,245,0)');
      glowContext.fillStyle = gradient; glowContext.fillRect(0,0,32,32);
    }
    const particleCount = tier === "ultra" ? 2400 : tier === "balanced" ? 1600 : 720;
    let activeParticles = particleCount;
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
    // Independent persistent stars: composing a shape never empties the sky.
    const backgroundStars = Array.from({ length: tier === "lite" ? 180 : 520 }, () => ({
      x: random(), y: random(), depth: random(), phase: random() * Math.PI * 2,
    }));
    // A visible subset of the persistent field becomes the shape; other stars stay.
    backgroundStars.forEach((star, index) => {
      if (index % 4 === 0) Object.assign(particles[index], { x: star.x, y: star.y, phase: star.phase });
    });

    const resizeCosmicField = () => {
      if (!cosmicContext) return;
      const ratio = Math.min(window.devicePixelRatio || 1, tier === "lite" ? 1.5 : 2.5, Math.sqrt(6_000_000 / Math.max(1, innerWidth * innerHeight)));
      cosmicWidth = Math.max(1, window.innerWidth);
      cosmicHeight = Math.max(1, window.innerHeight);
      cosmicCanvas.width = Math.round(cosmicWidth * ratio);
      cosmicCanvas.height = Math.round(cosmicHeight * ratio);
      cosmicContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      const heroBounds = document.querySelector('.home-neural-core')?.getBoundingClientRect();
      heroCore = heroBounds ? { x: heroBounds.left + heroBounds.width / 2,
        y: heroBounds.top + window.scrollY + heroBounds.height / 2, size: Math.min(heroBounds.width, heroBounds.height) } : null;
      sectionAnchors = sections.map(section => section.getBoundingClientRect().top + window.scrollY);
      mobileArtAnchors = sections.map((section, index) => sectionAnchors[index] + section.offsetHeight - cosmicHeight * .32);
      readingHalos = Array.from(document.querySelectorAll<HTMLElement>('.narrative-copy > h2,.narrative-copy > p,.narrative-app-copy,.presence-copy,.one-nexus-copy,.presence-grid,.inner-page h1,.inner-page h2,.inner-page p,.service-list,.legal-content,.legal-nav,.release-list,.security-summary')).map(element=>{
        const rect=element.getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY};
      });
    };

    const drawCosmicField = (now: number) => {
      if (!cosmicContext || !cosmicCanvas.isConnected) return;
      const paintStart = performance.now();
      const reduced = reducedMotion.matches;
      const delta = Math.min(.25, Math.max(.001, (now - cosmicLastFrame) / 1000));
      cosmicLastFrame = now;
      strainedSeconds = paintMs > 9 || delta > .035 ? strainedSeconds + delta : Math.max(0, strainedSeconds - delta);
      healthySeconds = paintMs < 5 && delta < .022 ? healthySeconds + delta : 0;
      if (strainedSeconds > 2) { activeParticles = Math.max(300, activeParticles - 60); strainedSeconds = 0; }
      if (healthySeconds > 8) { activeParticles = Math.min(particleCount, activeParticles + 30); healthySeconds = 0; }
      const dragging = inspection.id !== -1 && !reduced;
      const omega = dragging ? 5 : 1.1;
      const decay = Math.exp(-omega * delta);
      for (const axis of ['x', 'y'] as const) {
        const velocity = axis === 'x' ? 'vx' : 'vy';
        const target = dragging ? (axis === 'x' ? inspection.targetX : inspection.targetY) : 0;
        const error = inspection[axis] - target;
        const acceleration = inspection[velocity] + omega * error;
        inspection[axis] = target + (error + acceleration * delta) * decay;
        inspection[velocity] = (inspection[velocity] - omega * acceleration * delta) * decay;
      }
      if (!reduced) ambientTime += delta * .8;
      const time = reduced ? 0 : ambientTime;
      if (now - pointer.time > 80) { pointer.vx *= Math.exp(-delta * 5); pointer.vy *= Math.exp(-delta * 5); }
      const scroll = Number(root.style.getPropertyValue("--nxs-scroll")) || 0;
      const viewportAnchor = window.scrollY;
      const liveHeroBounds = heroCore ? document.querySelector('.home-neural-core')?.getBoundingClientRect() : null;
      let currentSection = Math.max(0, sectionAnchors.findLastIndex(top => top <= viewportAnchor));
      currentSection = Math.min(currentSection, Math.max(0, sections.length - 1));
      const sectionStart = sectionAnchors[currentSection] || 0;
      const sectionEnd = sectionAnchors[currentSection + 1] || sectionStart + cosmicHeight;
      const fraction = (viewportAnchor - sectionStart) / Math.max(1, sectionEnd - sectionStart);
      const hold = sections[currentSection]?.classList.contains('astral-interlude') ? .65 : .35;
      const destination = currentSection + Math.min(1, Math.max(0, (fraction - hold) / (1 - hold)));
      // A fast fling must not leave old chapter geometry chasing new copy.
      // Keep slow local inertia, but converge faster when several scenes were crossed.
      const sceneDistance = destination - sceneProgress;
      const catchup = 5 + Math.min(14, Math.abs(sceneDistance) * 7);
      sceneProgress += sceneDistance * (reduced ? 1 : 1 - Math.exp(-catchup * delta));
      const sectionPosition = sceneProgress;
      const sectionIndex = Math.floor(sectionPosition);
      const sectionMixRaw = sectionPosition - sectionIndex;
      const sectionMix = sectionMixRaw * sectionMixRaw * (3 - 2 * sectionMixRaw);
      const laneFor = (index: number) => {
        const scene = sections[index]?.dataset.cosmicScene;
        return scene === "center" ? .5 : scene === "left" ? .24 : scene === "right" ? .76 : index % 2 === 0 ? .76 : .24;
      };
      const responsiveLane = (index: number) => {
        const lane = laneFor(index);
        return cosmicWidth < 801 ? .5 : lane;
      };
      const topology = sectionPosition;
      const topologyIndex = Math.floor(topology);
      const topologyMixRaw = topology - topologyIndex;
      const topologyMix = topologyMixRaw * topologyMixRaw * (3 - 2 * topologyMixRaw);
      const topologyPoint = (particle: CosmicParticle, index: number, shape: number) => {
        const form = sections[shape]?.dataset.cosmicForm;
        if (form === 'ambient' || quietPage) return { x: particle.x * cosmicWidth, y: particle.y * cosmicHeight };
        const isHero = shape === 0 && heroCore !== null;
        const centerX = isHero ? heroCore!.x : cosmicWidth * responsiveLane(shape);
        const mobileReading = cosmicWidth < 801 && sections[shape]?.matches('.narrative-copy,.app-card,.presence-system,.one-nexus');
        // On phones the artwork occupies real space after the copy, rather
        // than being clipped offscreen or projected behind readable text.
        const centerY = isHero ? (liveHeroBounds ? liveHeroBounds.top + liveHeroBounds.height / 2 : heroCore!.y - window.scrollY) : mobileReading ? mobileArtAnchors[shape] - window.scrollY : cosmicHeight * .5;
        let unit = isHero ? heroCore!.size : Math.min(cosmicWidth, cosmicHeight) * (cosmicWidth < 801 ? .9 : laneFor(shape) === .5 ? .95 : .66);
        // Fit the projected artwork, not only its DOM anchor, inside safe edges.
        const horizontalSpace = Math.max(1, Math.min(centerX - 24, cosmicWidth - 24 - centerX));
        unit = Math.min(unit, horizontalSpace / .58, cosmicHeight * .42 / .58);
        // Orthographic 3D: rotation adds depth without a cursor-driven zoom.
        const travel = reduced ? 0 : Math.min(1, Math.max(0, (viewportAnchor - (sectionAnchors[shape] || 0)) / cosmicHeight));
        const depth = shape === 0 ? travel : 1;
        const pitch = depth * .16 + travel * 1.15 + inspection.x;
        const yaw = depth * Math.sin(time * .025) * .06 + travel * .28 + inspection.y;
        const project = (x: number, y: number, z: number) => {
          const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
          const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
          const perspective = 1;
          return { x:centerX+rx*unit*perspective, y:centerY+(y*Math.cos(pitch)-rz*Math.sin(pitch))*unit*perspective };
        };
        if (form === 'helix') {
          const along = (index * .61803398875) % 1;
          const angle = along * Math.PI * 5 + (index % 2) * Math.PI + time * .16;
          const radius = .16 + Math.sin(particle.phase) * .018;
          return project(Math.cos(angle) * radius, (along - .5) * .82, Math.sin(angle) * radius);
        }
        if (form === 'torus') {
          const angle = particle.phase + time * .07;
          const tube = index * 2.399963 + time * .11;
          const radius = .29 + Math.cos(tube) * .085;
          return project(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(tube) * .085);
        }
        if (form === 'reactor') {
          const ring = index % 7;
          const a = particle.phase + time * (ring % 2 ? .055 : -.04);
          const radius = ring === 0 ? Math.sqrt(particle.depth) * .09 : .12 + ring * .045;
          return project(Math.cos(a) * radius, Math.sin(a) * radius, Math.sin(particle.phase * 3) * .008);
        }
        if (form === 'saturn') {
          const a = index * 2.399963 + time * .015;
          if(index % 3 === 0) return project(Math.cos(a)*.46,Math.sin(a)*.14,Math.sin(a)*.35);
          const latitude = Math.acos(2 * (particle.depth-.25)/.75 - 1), r = .23;
          return project(Math.cos(a)*Math.sin(latitude)*r,Math.cos(latitude)*r,Math.sin(a)*Math.sin(latitude)*r);
        }
        if (form === 'sigil') {
          const reach = (Math.floor(index / 10) * .61803398875) % 1;
          const turn = index % 10 * Math.PI / 5 + reach * 2.3 + time * .015;
          const width = .006 + Math.sin(reach * Math.PI) * .023;
          const radius = .025 + reach * .42 + Math.sin(particle.phase) * width;
          return project(Math.cos(turn)*radius, Math.sin(turn)*radius, Math.sin(turn*2)*reach*.12 + Math.cos(particle.phase)*width*2);
        }
        if (form === 'neural') {
          const along = ((index + 1) * .61803398875) % 1;
          const x = (along - .5) * .92;
          const envelope = Math.sin(along * Math.PI);
          const wave = Math.sin(along * Math.PI * 2.6 + time * .35) * .07;
          const radius = .018 + envelope * .045 * particle.depth;
          return project(x, wave + Math.cos(particle.phase) * radius, Math.sin(particle.phase) * radius);
        }
        return { x: particle.x * cosmicWidth, y: particle.y * cosmicHeight };
      };
      cosmicContext.clearRect(0, 0, cosmicWidth, cosmicHeight);
      cosmicContext.globalCompositeOperation = "lighter";
      const age = Math.max(0, now - fieldStarted) / 1000;
      const visibleHalos=readingHalos.filter(rect=>rect.bottom-window.scrollY>-80&&rect.top-window.scrollY<cosmicHeight+80);
      const readingOpacity = (x: number, y: number) => {
        let fade = 0;
        for (const rect of visibleHalos) {
          const dx = Math.max(rect.left-x,0,x-rect.right);
          const dy = Math.max(rect.top-window.scrollY-y,0,y-(rect.bottom-window.scrollY));
          const weight = Math.max(0,1-Math.hypot(dx,dy)/80);
          fade = Math.max(fade,weight*weight*(3-2*weight));
        }
        return 1-.94*fade;
      };
      cosmicContext.globalAlpha = reduced ? 1 : Math.min(1, age / .9);
      for (const [index, star] of backgroundStars.entries()) {
        // These grains are rendered below and travel into the current form.
        if (!quietPage && index % 4 === 0) continue;
        const x = star.x * cosmicWidth + Math.sin(time * .09 + star.phase) * 5;
        const y = ((star.y * cosmicHeight - window.scrollY * (.012 + star.depth * .025)) % cosmicHeight + cosmicHeight) % cosmicHeight;
        const twinkle = .8 + Math.sin(time * .45 + star.phase) * .2;
        cosmicContext.fillStyle = `rgba(185,225,236,${(.16 + star.depth * .42) * twinkle * readingOpacity(x,y) * (quietPage ? .3 : 1)})`;
        cosmicContext.beginPath();
        cosmicContext.arc(x, y, .4 + star.depth ** 4 * 1.1, 0, Math.PI * 2);
        cosmicContext.fill();
      }
      let maxDrift = 0;
      const footerIndex = sections.findIndex(section => section.tagName === 'FOOTER');
      const footerEntry = footerIndex < 0 ? 0 : Math.max(0, Math.min(1, (viewportAnchor - sectionAnchors[footerIndex] + cosmicHeight * .7) / (cosmicHeight * .7)));
      const footerQuiet = 1 - .88 * footerEntry * footerEntry * (3 - 2 * footerEntry);
      const points = particles.slice(0, activeParticles).map((particle, index) => {
        const sourceStar = !quietPage && index < backgroundStars.length && index % 4 === 0 ? backgroundStars[index] : undefined;
        const baseX = particle.x * cosmicWidth + (sourceStar ? Math.sin(time * .09 + sourceStar.phase) * 5 : 0);
        // Never wrap a grain across the viewport while a form is dissolving.
        const baseY = sourceStar ? ((sourceStar.y * cosmicHeight - window.scrollY * (.012 + sourceStar.depth * .025)) % cosmicHeight + cosmicHeight) % cosmicHeight : (particle.y + Math.sin(scroll * Math.PI) * particle.depth * .13) * cosmicHeight;
        const first = topologyPoint(particle, index, topologyIndex);
        const second = topologyPoint(particle, index, topologyIndex + 1);
        const targetX = first.x + (second.x - first.x) * topologyMix;
        const targetY = first.y + (second.y - first.y) * topologyMix;
        // Tra due capitoli la forma si apre nello spazio, attraversa la pagina
        // e si ricompone nella topologia seguente. Il campo resta continuo:
        // non ci sono cambi di scena o salti di corsia a meta scroll.
        const transitionScatter = Math.sin(sectionMix * Math.PI) * .025;
        // Reload starts with dispersed matter, not a blank canvas followed
        // by a finished diagram. The same particles keep moving on scroll.
        const arrivalTime = Math.min(1, Math.max(0, age - .4) / 5);
        // Zero velocity at both ends: acceleration never snaps into the final form.
        const arrival = reduced ? 1 : arrivalTime ** 3 * (arrivalTime * (arrivalTime * 6 - 15) + 10);
        const compose = (1 - transitionScatter) * arrival;
        const x = baseX * (1 - compose) + targetX * compose + Math.sin(time * particle.speed + particle.phase) * (1 + particle.depth * 2);
        const y = baseY * (1 - compose) + targetY * compose + Math.cos(time * particle.speed * .72 + particle.phase) * (1 + particle.depth * 2);
        // A passing hand transfers momentum locally. A resting pointer stops
        // applying force, allowing the grains to return without inflating the form.
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const radius = Math.min(150, Math.max(85, cosmicWidth * .085));
        const proximity = Math.max(0, 1 - distance / radius);
        const speed = Math.hypot(pointer.vx, pointer.vy);
        const influence = (reduced ? 0 : pointer.active) * proximity * proximity;
        const movement = Math.min(1, speed / 180);
        const angle = Math.atan2(y - pointer.y, x - pointer.x);
        const goalX = (Math.cos(angle) * 24 * movement + pointer.vx * .22) * influence;
        const goalY = (Math.sin(angle) * 24 * movement + pointer.vy * .22) * influence;
        const omega = influence * movement > .01 ? 12 : 2.8, decay = Math.exp(-omega * delta);
        const ex = particle.offsetX - goalX, ey = particle.offsetY - goalY;
        const ax = particle.velocityX + omega * ex, ay = particle.velocityY + omega * ey;
        particle.offsetX = goalX + (ex + ax * delta) * decay;
        particle.offsetY = goalY + (ey + ay * delta) * decay;
        particle.velocityX = (particle.velocityX - omega * ax * delta) * decay;
        particle.velocityY = (particle.velocityY - omega * ay * delta) * decay;
        maxDrift = Math.max(maxDrift, Math.hypot(particle.offsetX, particle.offsetY));
        const px = x + particle.offsetX, py = y + particle.offsetY;
        // One uninterrupted field: text must not punch rectangular holes in it.
        const edge = Math.max(0, Math.min(1, Math.min(px, py, cosmicWidth - px, cosmicHeight - py) / 48));
        // Attenuate the grains themselves, not a black panel over the scene.
        // This also keeps copy clear while CSS reveal creates a backdrop root.
        let readingFade=0;
        for(const rect of visibleHalos){
          const dx=Math.max(rect.left-px,0,px-rect.right);
          const dy=Math.max(rect.top-window.scrollY-py,0,py-(rect.bottom-window.scrollY));
          const weight=Math.max(0,1-Math.hypot(dx,dy)/80);
          readingFade=Math.max(readingFade,weight*weight*(3-2*weight));
        }

        const visibility = edge * edge * (3 - 2 * edge) * (1-.94*readingFade) * footerQuiet * (quietPage ? .12 : 1);
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
        cosmicContext.strokeStyle = `rgba(86, 232, 234, ${.025 * point.visibility * nearest.visibility * (1 - nearestDistance / 128)})`;
        cosmicContext.moveTo(point.x, point.y);
        cosmicContext.lineTo(nearest.x, nearest.y);
        cosmicContext.stroke();
      }
      for (const point of points) {
        if (point.depth > .985) {
          const glowSize = 8 + point.depth ** 12 * 10;
          cosmicContext.save();
          cosmicContext.globalAlpha *= point.visibility;
          cosmicContext.drawImage(glow,point.x-glowSize/2,point.y-glowSize/2,glowSize,glowSize);
          cosmicContext.restore();
        }
        cosmicContext.beginPath();
        cosmicContext.fillStyle = `rgba(${point.depth > .8 ? '225,249,255' : '125,245,250'}, ${(.4 + point.depth * .6) * point.visibility})`;
        cosmicContext.arc(point.x, point.y, .45 + point.depth ** 8 * 1.65, 0, Math.PI * 2);
        cosmicContext.fill();
      }
      cosmicContext.globalCompositeOperation = "source-over";
      cosmicContext.globalAlpha = 1;
      paintMs += (performance.now() - paintStart - paintMs) * .1;
      cosmicCanvas.dataset.sceneProgress = sceneProgress.toFixed(3);
      cosmicCanvas.dataset.sceneTarget = destination.toFixed(3);
      cosmicCanvas.dataset.maxDrift = maxDrift.toFixed(2);
      cosmicCanvas.dataset.arrival = (reduced ? 1 : Math.min(1, Math.max(0, age - .4) / 5)).toFixed(3);
      cosmicCanvas.dataset.paintMs = paintMs.toFixed(2);
      cosmicCanvas.dataset.particles = String(activeParticles);
      cosmicCanvas.dataset.backgroundParticles = String(backgroundStars.length);
      cosmicCanvas.dataset.rotation = `${inspection.x.toFixed(3)},${inspection.y.toFixed(3)}`;
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

    const hero = document.querySelector<HTMLElement>(".astral-hero");
    const updateScroll = () => {
      scrollFrame = 0;
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--nxs-scroll", String(Math.min(1, Math.max(0, window.scrollY / available))));
      // The wordmark dissolves with scroll; replay stays anchored to its scene.
      // Keep the particles alive; only the opening labels dissolve.
      if (hero) {
        const progress = Math.min(1, Math.max(0, (window.scrollY / Math.max(1, window.innerHeight) - .08) / .42));
        const opacity = 1 - progress * progress * (3 - 2 * progress);
        hero.style.setProperty("--hero-label-opacity", String(opacity));

      }
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === inspection.id) {
        const dx = event.clientX - inspection.startX, dy = event.clientY - inspection.startY;
        if (Math.hypot(dx, dy) > 8) root.classList.add('nxs-field-dragging');
        inspection.targetX = Math.max(-.8, Math.min(.8, dy / cosmicHeight * 2));
        inspection.targetY = Math.max(-1.2, Math.min(1.2, dx / cosmicWidth * 2.5));
      }
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      const now = performance.now(), seconds = Math.max(.008, (now - pointer.time) / 1000);
      pointer.vx = pointer.active ? Math.max(-650, Math.min(650, (event.clientX - pointer.x) / seconds)) : 0;
      pointer.vy = pointer.active ? Math.max(-650, Math.min(650, (event.clientY - pointer.y) / seconds)) : 0;
      pointer.time = now;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = 1;
    };
    const releaseDrag = () => { inspection.id = -1; root.classList.remove('nxs-field-dragging'); };
    const startDrag = (event: PointerEvent) => {
      if (event.button !== 0 || reducedMotion.matches || !(event.target instanceof Element)) return;
      if (event.target.closest('a,button,input,textarea,select,[contenteditable],h1,h2,p,li')) return;
      if (!event.target.closest('.astral-interlude,.home-neural-core')) return;
      if (event.pointerType === 'touch') return;
      root.classList.add('nxs-field-dragging');
      inspection.id = event.pointerId;
      inspection.startX = event.clientX; inspection.startY = event.clientY;
      inspection.targetX = inspection.x; inspection.targetY = inspection.y;
    };
    const onPointerLeave = () => { pointer.active = 0; releaseDrag(); };
    const replayComposition = () => {
      fieldStarted = performance.now();
      if (reducedMotion.matches) drawCosmicField(fieldStarted);
    };
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("resize", resizeCosmicField, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener('pointerdown', startDrag, {passive:true});
    window.addEventListener('pointerup', releaseDrag);
    window.addEventListener('pointercancel', releaseDrag);
    window.addEventListener('blur', onPointerLeave);
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("nxs:replay-composition", replayComposition);

    return () => {
      releaseDrag();
      window.removeEventListener('pointerdown', startDrag);
      window.removeEventListener('pointerup', releaseDrag);
      window.removeEventListener('pointercancel', releaseDrag);
      window.removeEventListener('blur', onPointerLeave);
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
      window.removeEventListener("nxs:replay-composition", replayComposition);
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
