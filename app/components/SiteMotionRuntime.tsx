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
    const routePhase = Array.from(routeName).reduce((total, character) => total + character.charCodeAt(0), 0) % 5;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section:not(.narrative-apps), main > .narrative-apps .app-card, main > footer"));
    let sectionAnchors: number[] = [];
    let mobileArtAnchors: number[] = [];
    let readingHalos: {left:number;right:number;top:number;bottom:number}[] = [];
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
    const particleCount = tier === "ultra" ? 1800 : tier === "balanced" ? 1200 : 480;
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

    const resizeCosmicField = () => {
      if (!cosmicContext) return;
      const ratio = Math.min(window.devicePixelRatio || 1, tier === "ultra" ? 1.75 : 1.35);
      cosmicWidth = Math.max(1, window.innerWidth);
      cosmicHeight = Math.max(1, window.innerHeight);
      cosmicCanvas.width = Math.round(cosmicWidth * ratio);
      cosmicCanvas.height = Math.round(cosmicHeight * ratio);
      cosmicContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      sectionAnchors = sections.map(section => section.getBoundingClientRect().top + window.scrollY);
      mobileArtAnchors = sections.map((section, index) => sectionAnchors[index] + section.offsetHeight - cosmicHeight * .32);
      readingHalos = Array.from(document.querySelectorAll<HTMLElement>('.narrative-copy > h2,.narrative-copy > p,.narrative-app-copy,.presence-copy,.one-nexus-copy,.product-narrative h1,.product-narrative h2,.product-narrative p')).map(element=>{
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
      if (!reduced) ambientTime += delta * .55;
      const time = reduced ? 0 : ambientTime;
      if (now - pointer.time > 80) { pointer.vx *= Math.exp(-delta * 5); pointer.vy *= Math.exp(-delta * 5); }
      const scroll = Number(root.style.getPropertyValue("--nxs-scroll")) || 0;
      const viewportAnchor = window.scrollY;
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
      const catchup = 2.2 + Math.min(14, Math.abs(sceneDistance) * 7);
      sceneProgress += sceneDistance * (reduced ? 1 : 1 - Math.exp(-catchup * delta));
      const sectionPosition = sceneProgress;
      const sectionIndex = Math.floor(sectionPosition);
      const sectionMixRaw = sectionPosition - sectionIndex;
      const sectionMix = sectionMixRaw * sectionMixRaw * (3 - 2 * sectionMixRaw);
      const laneFor = (index: number) => {
        const scene = sections[index]?.dataset.cosmicScene;
        return scene === "center" ? .5 : scene === "left" ? .13 : scene === "right" ? .87 : index % 2 === 0 ? .87 : .13;
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
        const kind = (((shape + routePhase) % 5) + 5) % 5;
        const angle = (index / particles.length) * Math.PI * 2 + particle.phase * .18;
        const centerX = cosmicWidth * responsiveLane(shape);
        const mobileReading = cosmicWidth < 801 && sections[shape]?.matches('.narrative-copy,.app-card,.presence-system,.one-nexus');
        // On phones the artwork occupies real space after the copy, rather
        // than being clipped offscreen or projected behind readable text.
        const centerY = mobileReading ? mobileArtAnchors[shape] - window.scrollY : cosmicHeight * .5;
        const unit = Math.min(cosmicWidth, cosmicHeight) * (cosmicWidth < 801 ? .9 : laneFor(shape) === .5 ? .95 : .66);
        // Orthographic 3D: rotation adds depth without a cursor-driven zoom.
        const depth = shape === 0 ? Math.min(1, sectionPosition * 3) : 1;
        const pitch = depth * (.22 + Math.sin(time * .04) * .08) + inspection.x;
        const yaw = depth * Math.sin(time * .03) * .22 + inspection.y;
        const project = (x: number, y: number, z: number) => {
          const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
          const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
          return { x:centerX+rx*unit, y:centerY+(y*Math.cos(pitch)-rz*Math.sin(pitch))*unit };
        };
        if (form === 'sigil') {
          const reach = (Math.floor(index / 10) * .61803398875) % 1;
          const turn = index % 10 * Math.PI / 5 + reach * 1.55 + time * .015;
          const width = .009 + Math.sin(reach * Math.PI) * .022;
          const radius = .025 + reach * .42 + Math.sin(particle.phase) * width;
          return project(Math.cos(turn)*radius, Math.sin(turn)*radius, Math.cos(particle.phase)*width*2);
        }
        if (form === 'cursor') {
          const vertices = [[-.27,-.38],[-.23,.31],[-.07,.14],[.05,.39],[.18,.33],[.05,.09],[.29,.07],[-.27,-.38]];
          const along = index / particles.length * 7, edge = Math.floor(along), t = along - edge;
          const a = vertices[edge], b = vertices[edge + 1];
          const thickness = Math.sin(particle.phase) * .006;
          return project(a[0]+(b[0]-a[0])*t+thickness,a[1]+(b[1]-a[1])*t+thickness,(index%2-.5)*.025);
        }
        if (form === 'saturn') {
          const a = index * 2.399963 + time * .015;
          if(index % 3 === 0) return project(Math.cos(a)*.46,Math.sin(a)*.14,Math.sin(a)*.35);
          const latitude = Math.acos(2 * (particle.depth-.25)/.75 - 1), r = .23;
          return project(Math.cos(a)*Math.sin(latitude)*r,Math.cos(latitude)*r,Math.sin(a)*Math.sin(latitude)*r);
        }
        if (form === 'neural') {
          const ribbon = index % 3;
          const a = ((Math.floor(index / 3) * .61803398875) % 1) * Math.PI * 2 + time * .1 + ribbon * 2.094;
          const radius = .28 + .024 * Math.sin(a * 3 + time * .3 + ribbon);
          const tube = .018 + particle.depth * .038;
          const x = (radius + tube * Math.cos(particle.phase)) * Math.cos(a);
          const y = (radius + tube * Math.cos(particle.phase)) * Math.sin(a);
          const z = tube * Math.sin(particle.phase);
          const tilt = (ribbon - 1) * 1.04 + .28;
          const ry = y * Math.cos(tilt) - z * Math.sin(tilt);
          const roll = ribbon * .85;
          return project(x * Math.cos(roll) - ry * Math.sin(roll), x * Math.sin(roll) + ry * Math.cos(roll), y * Math.sin(tilt) + z * Math.cos(tilt));
        }
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
      const age = Math.max(0, now - fieldStarted) / 1000;
      cosmicContext.globalAlpha = reduced ? 1 : Math.min(1, age / .9);
      let maxDrift = 0;
      const visibleHalos=readingHalos.filter(rect=>rect.bottom-window.scrollY>-80&&rect.top-window.scrollY<cosmicHeight+80);
      const points = particles.slice(0, activeParticles).map((particle, index) => {
        const baseX = particle.x * cosmicWidth;
        // Never wrap a grain across the viewport while a form is dissolving.
        const baseY = (particle.y + Math.sin(scroll * Math.PI) * particle.depth * .13) * cosmicHeight;
        const first = topologyPoint(particle, index, topologyIndex);
        const second = topologyPoint(particle, index, topologyIndex + 1);
        const targetX = first.x + (second.x - first.x) * topologyMix;
        const targetY = first.y + (second.y - first.y) * topologyMix;
        // Tra due capitoli la forma si apre nello spazio, attraversa la pagina
        // e si ricompone nella topologia seguente. Il campo resta continuo:
        // non ci sono cambi di scena o salti di corsia a meta scroll.
        const transitionScatter = Math.sin(sectionMix * Math.PI) * .48;
        // Reload starts with dispersed matter, not a blank canvas followed
        // by a finished diagram. The same particles keep moving on scroll.
        const arrivalTime = Math.min(1, Math.max(0, age - .4) / 5);
        // Zero velocity at both ends: acceleration never snaps into the final form.
        const arrival = reduced ? 1 : arrivalTime ** 3 * (arrivalTime * (arrivalTime * 6 - 15) + 10);
        const compose = (1 - transitionScatter) * arrival;
        const x = baseX * (1 - compose) + targetX * compose + Math.sin(time * particle.speed + particle.phase) * (4 + particle.depth * 9);
        const y = baseY * (1 - compose) + targetY * compose + Math.cos(time * particle.speed * .72 + particle.phase) * (3 + particle.depth * 7);
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const influence = (reduced ? 0 : pointer.active) * Math.max(0, 1 - distance / 240) * (index % 9 < 3 ? .3 : 1);
        const angle = Math.atan2(y - pointer.y, x - pointer.x);
        const goalX = (Math.cos(angle) * 85 + pointer.vx * .14) * influence;
        const goalY = (Math.sin(angle) * 85 + pointer.vy * .14) * influence;
        const omega = influence > .01 ? 4.5 : 1.1, decay = Math.exp(-omega * delta);
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
        const visibility = edge * edge * (3 - 2 * edge) * (1-.94*readingFade);
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
        if (point.depth > .93) {
          const glowSize = 8 + point.depth * 7;
          cosmicContext.save();
          cosmicContext.globalAlpha *= point.visibility;
          cosmicContext.drawImage(glow,point.x-glowSize/2,point.y-glowSize/2,glowSize,glowSize);
          cosmicContext.restore();
        }
        cosmicContext.beginPath();
        cosmicContext.fillStyle = `rgba(${point.depth > .96 ? '161,137,250' : point.depth > .8 ? '225,249,255' : '125,245,250'}, ${(.4 + point.depth * .6) * point.visibility})`;
        cosmicContext.arc(point.x, point.y, .55 + point.depth ** 4 * 1.55, 0, Math.PI * 2);
        cosmicContext.fill();
      }
      cosmicContext.globalCompositeOperation = "source-over";
      cosmicContext.globalAlpha = 1;
      paintMs += (performance.now() - paintStart - paintMs) * .1;
      cosmicCanvas.dataset.sceneProgress = sceneProgress.toFixed(3);
      cosmicCanvas.dataset.sceneTarget = destination.toFixed(3);
      cosmicCanvas.dataset.maxDrift = maxDrift.toFixed(2);
      cosmicCanvas.dataset.arrival = Math.min(1, Math.max(0, age - .4) / 5).toFixed(3);
      cosmicCanvas.dataset.paintMs = paintMs.toFixed(2);
      cosmicCanvas.dataset.particles = String(activeParticles);
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
    const replayButton = hero?.querySelector<HTMLButtonElement>(".astral-hero__replay");
    const updateScroll = () => {
      scrollFrame = 0;
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--nxs-scroll", String(Math.min(1, Math.max(0, window.scrollY / available))));
      // One reversible scroll envelope for the wordmark and replay control.
      // Keep the particles alive; only the opening labels dissolve.
      if (hero) {
        const progress = Math.min(1, Math.max(0, (window.scrollY / Math.max(1, window.innerHeight) - .08) / .42));
        const opacity = 1 - progress * progress * (3 - 2 * progress);
        hero.style.setProperty("--hero-label-opacity", String(opacity));
        if (replayButton) {
          replayButton.disabled = progress >= 1;
          replayButton.tabIndex = progress >= 1 ? -1 : 0;
        }
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
      if (event.pointerType === "touch" || tier === "lite") return;
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
      if (event.pointerType === 'touch') return;
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
    window.addEventListener('blur', releaseDrag);
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("nxs:replay-composition", replayComposition);

    return () => {
      releaseDrag();
      window.removeEventListener('pointerdown', startDrag);
      window.removeEventListener('pointerup', releaseDrag);
      window.removeEventListener('pointercancel', releaseDrag);
      window.removeEventListener('blur', releaseDrag);
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
