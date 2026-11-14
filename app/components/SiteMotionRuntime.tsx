"use client";

import { useEffect } from "react";
import { advanceSand, breatheCorePoint, coreBreath, coreZoom, strokeDistance } from "./particle-drift";

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
  vx: number;
  vy: number;
  calm: number;
};

// A reload must never freeze and then jump to the previous position once the page
// has loaded: the narrative restarts from its opening (anchors still work natively).
if (typeof window !== "undefined" && "scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

const MOTION_TIER_CLASSES =["nxs-motion-lite", "nxs-motion-balanced", "nxs-motion-ultra"];
// Forms that are a living core (hero sigil, ringed reactor): they breathe apart and back together.
const CORE_FORMS = new Set<string | undefined>(["sigil", "reactor"]);

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
    const pointer = { x: 0, y: 0, frameX: 0, frameY: 0, vx: 0, vy: 0, time: 0, active: 0 };
    const routeName = window.location.pathname.replace(/^\/+|\/+$/g, "") || "home";
    const quietPage = routeName !== "home";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section:not(.narrative-apps), main > .narrative-apps .app-card, main > footer"));
    let sectionAnchors: number[] = [];
    let mobileArtAnchors: number[] = [];
    let readingHalos: {left:number;right:number;top:number;bottom:number}[] = [];
    let heroCore: { x: number; y: number; size: number } | null = null;
    let heroLive: { x: number; y: number } | null = null;
    let heroHalos: {left:number;right:number;top:number;bottom:number}[] = [];
    let heroReadScroll = Number.NaN;
    let heroReadTime = 0;
    let travelScroll = window.scrollY;
    // The hero scene is sticky: its viewport geometry changes with scroll, so it
    // is sampled when scroll moves instead of forcing layout reads every frame.
    // Protect the actual words, not the full-width grid row: a row-sized
    // exclusion erased the stars into a dark horizontal band around the CTA.
    const readHeroLayout = (now: number) => {
      heroReadScroll = window.scrollY;
      heroReadTime = now;
      const bounds = heroCore ? document.querySelector('.home-neural-core')?.getBoundingClientRect() : undefined;
      heroLive = bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : null;
      heroHalos = [];
      if (!heroCore || window.scrollY > window.innerHeight * 1.6) return;
      for (const element of document.querySelectorAll('.hero-entry p,.hero-entry a')) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rect = range.getBoundingClientRect();
        heroHalos.push({left:rect.left,right:rect.right,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY});
      }
    };
    let sceneProgress = 0;
    let paintMs = 0;
    let drawCount = 0;
    const fieldStarted = performance.now();
    const arrivalDelay = 3.2;
    const arrivalDuration = 8.2;
    let initialSceneFinished = false;
    let breathRamp = 0;
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
      vx: 0,
      vy: 0,
      calm: 10,
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
      const pixelWidth = Math.round(cosmicWidth * ratio), pixelHeight = Math.round(cosmicHeight * ratio);
      // Setting a canvas dimension clears it, even when the value is unchanged.
      if (cosmicCanvas.width !== pixelWidth) cosmicCanvas.width = pixelWidth;
      if (cosmicCanvas.height !== pixelHeight) cosmicCanvas.height = pixelHeight;
      cosmicContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      const heroBounds = document.querySelector('.home-neural-core')?.getBoundingClientRect();
      heroCore = heroBounds ? { x: heroBounds.left + heroBounds.width / 2,
        y: heroBounds.top + window.scrollY + heroBounds.height / 2, size: Math.min(heroBounds.width, heroBounds.height) } : null;
      heroReadScroll = Number.NaN;
      sectionAnchors = sections.map(section => section.getBoundingClientRect().top + window.scrollY);
      mobileArtAnchors = sections.map((section, index) => sectionAnchors[index] + section.offsetHeight - cosmicHeight * .32);
      readingHalos = Array.from(document.querySelectorAll<HTMLElement>('.narrative-copy > h2,.narrative-copy > p,.narrative-app-copy,.presence-copy,.one-nexus-copy,.presence-grid,.inner-page h1,.inner-page h2,.inner-page p,.service-list,.legal-content,.legal-nav,.release-list,.security-summary')).map(element=>{
        const rect=element.getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY};
      });
      if (reducedMotion.matches && !document.hidden) {
        cancelAnimationFrame(cosmicFrame);
        cosmicFrame = requestAnimationFrame(drawCosmicField);
      }
    };

    let interactivePoints: {x:number;y:number}[] = [];
    const breathPoint = { x: 0, y: 0, z: 0 };
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
      const omega = dragging ? 14 : 1.8;
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
      if (window.scrollY < 4 && initialSceneFinished) sceneProgress = 0;
      const sectionPosition = sceneProgress;
      // Rotation follows a damped scroll; positions stay anchored to the page.
      travelScroll += (viewportAnchor - travelScroll) * (reduced ? 1 : 1 - Math.exp(-9 * delta));
      // Sticky hero geometry is read only when scroll changed (or twice a second while it settles).
      if (window.scrollY !== heroReadScroll || now - heroReadTime > 500) readHeroLayout(now);
      const age = Math.max(0, now - fieldStarted) / 1000;
      // The long entrance belongs only to opening the page. Once the visitor
      // leaves the hero, scrolling never waits for or restarts that entrance.
      initialSceneFinished ||= age >= arrivalDelay + arrivalDuration || window.scrollY > cosmicHeight * .65;
      const entranceTime = initialSceneFinished ? 1 : Math.min(1, Math.max(0, age - arrivalDelay) / arrivalDuration);
      // The breath grows in softly (~3 s) once the core has landed; reduced motion keeps it composed.
      breathRamp = reduced ? 0 : entranceTime < 1 ? 0 : Math.min(1, breathRamp + delta / 3);
      const breathAmount = breathRamp * breathRamp * (3 - 2 * breathRamp);
      const laneFor = (index: number) => {
        const scene = sections[index]?.dataset.cosmicScene;
        return scene === "center" ? .5 : scene === "left" ? .24 : scene === "right" ? .76 : index % 2 === 0 ? .76 : .24;
      };
      const responsiveLane = (index: number) => {
        const lane = laneFor(index);
        return cosmicWidth < 801 ? .5 : lane;
      };
      const topologyIndex = Math.floor(sectionPosition);
      const topologyMixRaw = sectionPosition - topologyIndex;
      // Per-frame geometry of a chapter's form: computed once per frame, not per grain.
      const frameFor = (shape: number) => {
        const section = sections[shape];
        const form = section?.dataset.cosmicForm;
        const ambient = quietPage || !form || form === 'ambient';
        if (ambient) return { form, ambient, centerX: cosmicWidth / 2, centerY: cosmicHeight / 2, unit: 0, cosYaw: 1, sinYaw: 0, cosPitch: 1, sinPitch: 0, breath: 0 };
        const isHero = shape === 0 && heroCore !== null;
        const centerX = isHero ? (heroLive ? heroLive.x : heroCore!.x) : cosmicWidth * responsiveLane(shape);
        const mobileReading = cosmicWidth < 801 && section!.matches('.narrative-copy,.app-card,.presence-system,.one-nexus');
        // On phones the artwork occupies real space after the copy, rather
        // than being clipped offscreen or projected behind readable text.
        const centerY = isHero ? (heroLive ? heroLive.y : heroCore!.y - window.scrollY) : mobileReading ? mobileArtAnchors[shape] - window.scrollY : cosmicHeight * .5;
        let unit = isHero ? heroCore!.size : Math.min(cosmicWidth, cosmicHeight) * (cosmicWidth < 801 ? .9 : laneFor(shape) === .5 ? .95 : .66);
        // Fit the projected artwork, not only its DOM anchor, inside safe edges.
        const horizontalSpace = Math.max(1, Math.min(centerX - 24, cosmicWidth - 24 - centerX));
        unit = Math.min(unit, horizontalSpace / .58, cosmicHeight * .42 / .58);
        // Orthographic 3D on a damped scroll: the form turns gently, never edge-on.
        const travel = reduced ? 0 : Math.min(1, Math.max(0, (travelScroll - (sectionAnchors[shape] || 0)) / cosmicHeight));
        const depth = shape === 0 ? travel : 1;
        const pitch = depth * .16 + travel * .62 + inspection.x;
        const yaw = depth * Math.sin(time * .025) * .06 + travel * .28 + inspection.y;
        // Living cores breathe: they dissolve and re-form, zooming in on a bloom and out
        // on a collapse. The breath fades in only after the opening entrance has landed.
        const breath = CORE_FORMS.has(form) ? breathAmount : 0;
        if (breath) unit *= 1 + (coreZoom(time) - 1) * breath;
        return { form, ambient, centerX, centerY, unit, cosYaw: Math.cos(yaw), sinYaw: Math.sin(yaw), cosPitch: Math.cos(pitch), sinPitch: Math.sin(pitch), breath };
      };
      type ShapeFrame = ReturnType<typeof frameFor>;
      const frameA = frameFor(topologyIndex);
      const frameB = frameFor(topologyIndex + 1);
      const minDimension = Math.min(cosmicWidth, cosmicHeight);
      const flightCenterX = (frameA.centerX + frameB.centerX) / 2;
      const flightCenterY = (frameA.centerY + frameB.centerY) / 2;
      const topologyPoint = (particle: CosmicParticle, index: number, frame: ShapeFrame): { x: number; y: number; scatter?: number } => {
        if (frame.ambient) return { x: particle.x * cosmicWidth, y: particle.y * cosmicHeight };
        const { form, centerX, centerY, unit, cosYaw, sinYaw, cosPitch, sinPitch } = frame;
        const project = (x: number, y: number, z: number) => {
          const rx = x * cosYaw + z * sinYaw;
          const rz = -x * sinYaw + z * cosYaw;
          return { x:centerX+rx*unit, y:centerY+(y*cosPitch-rz*sinPitch)*unit };
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
        // A breathing core point: each grain dissolves on its own stagger (inner grains
        // first, then a wave outwards), so the form decomposes and re-forms like smoke.
        const breathe = (x: number, y: number, z: number, reach: number) => {
          const b = frame.breath ? frame.breath * coreBreath(time, ((index * .7548776662) % 1) * .16 + reach * .14) : 0;
          if (b !== 0) { breatheCorePoint(breathPoint, x, y, z, b, particle.phase, particle.depth, time); x = breathPoint.x; y = breathPoint.y; z = breathPoint.z; }
          const rz = -x * sinYaw + z * cosYaw;
          return { x: centerX + (x * cosYaw + z * sinYaw) * unit, y: centerY + (y * cosPitch - rz * sinPitch) * unit, scatter: b < 0 ? -b : b };
        };
        if (form === 'reactor') {
          const ring = index % 7;
          const a = particle.phase + time * (ring % 2 ? .055 : -.04);
          const radius = ring === 0 ? Math.sqrt(particle.depth) * .09 : .12 + ring * .045;
          return breathe(Math.cos(a) * radius, Math.sin(a) * radius, Math.sin(particle.phase * 3) * .008, ring / 6);
        }
        if (form === 'saturn') {
          const a = index * 2.399963 + time * .015;
          if(index % 3 === 0) return project(Math.cos(a)*.46,Math.sin(a)*.14,Math.sin(a)*.35);
          const latitude = Math.acos(2 * (particle.depth-.25)/.75 - 1), r = .23;
          return project(Math.cos(a)*Math.sin(latitude)*r,Math.cos(latitude)*r,Math.sin(a)*Math.sin(latitude)*r);
        }
        if (form === 'sigil') {
          const reach = (Math.floor(index / 10) * .61803398875) % 1;
          const turn = index % 10 * Math.PI / 5 + reach * 2.3 + time * .03;
          // Softer arms: a slow living ripple widens each filament instead of a rigid line.
          const width = .008 + Math.sin(reach * Math.PI) * (.026 + Math.sin(time * .4 + reach * 6) * .006);
          const radius = .025 + reach * .42 + Math.sin(particle.phase + time * .12) * width;
          return breathe(Math.cos(turn)*radius, Math.sin(turn)*radius, Math.sin(turn*2)*reach*.12 + Math.cos(particle.phase)*width*2, reach);
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
      const visibleHalos=readingHalos.filter(rect=>rect.bottom-window.scrollY>-80&&rect.top-window.scrollY<cosmicHeight+80);
      // Sticky hero words, sampled by readHeroLayout (not every frame).
      visibleHalos.push(...heroHalos);
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
      cosmicContext.globalAlpha = reduced || initialSceneFinished ? 1 : Math.min(1, Math.max(0, age - 1.5) / 1.7);
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
      let breathPeak = 0;
      const footerIndex = sections.findIndex(section => section.tagName === 'FOOTER');
      const footerEntry = footerIndex < 0 ? 0 : Math.max(0, Math.min(1, (viewportAnchor - sectionAnchors[footerIndex] + cosmicHeight * .7) / (cosmicHeight * .7)));
      const footerQuiet = 1 - .88 * footerEntry * footerEntry * (3 - 2 * footerEntry);
      const points = particles.slice(0, activeParticles).map((particle, index) => {
        const sourceStar = !quietPage && index < backgroundStars.length && index % 4 === 0 ? backgroundStars[index] : undefined;
        const baseX = particle.x * cosmicWidth + (sourceStar ? Math.sin(time * .09 + sourceStar.phase) * 5 : 0);
        // Never wrap a grain across the viewport while a form is dissolving.
        let baseY = sourceStar ? ((sourceStar.y * cosmicHeight - window.scrollY * (.012 + sourceStar.depth * .025)) % cosmicHeight + cosmicHeight) % cosmicHeight : (particle.y + Math.sin(scroll * Math.PI) * particle.depth * .13) * cosmicHeight;
        let startX = baseX;
        // Low-discrepancy order: grains leave and arrive in a soft wave, never all at once.
        const order = (index * .7548776662) % 1;
        // Tra due capitoli la forma si scioglie verso l'esterno e i grani arrivano
        // nella forma seguente da fuori, lungo un arco: niente morph punto-punto.
        const local = Math.min(1, Math.max(0, (topologyMixRaw - order * .42) / .58));
        const mix = local ** 3 * (local * (local * 6 - 15) + 10);
        // A grain resting in one chapter needs only that chapter's geometry.
        const next = mix > 0 ? topologyPoint(particle, index, frameB) : undefined;
        const first = mix < 1 || !next ? topologyPoint(particle, index, frameA) : next;
        const second = next ?? first;
        const span = Math.hypot(second.x - first.x, second.y - first.y);
        const midX = (first.x + second.x) / 2, midY = (first.y + second.y) / 2;
        let outX = midX - flightCenterX, outY = midY - flightCenterY;
        const outLength = Math.hypot(outX, outY);
        if (outLength < 1) { outX = Math.cos(particle.phase); outY = Math.sin(particle.phase); } else { outX /= outLength; outY /= outLength; }
        // A slight common swirl turns the dispersal into one harmonious vortex.
        const swirlX = outX * .88 - outY * .48, swirlY = outX * .48 + outY * .88;
        const lift = minDimension * (.14 + particle.depth * .2) * Math.min(1, span / (minDimension * .3));
        const controlX = midX + swirlX * lift, controlY = midY + swirlY * lift;
        const rest = 1 - mix;
        const targetX = rest * rest * first.x + 2 * rest * mix * controlX + mix * mix * second.x;
        const targetY = rest * rest * first.y + 2 * rest * mix * controlY + mix * mix * second.y;
        const flight = 4 * mix * rest * Math.min(1, span / (minDimension * .2));
        // Loose grains of a breathing core glow a little softer than the composed form.
        const scatter = (first.scatter ?? 0) * rest + (second.scatter ?? 0) * mix;
        breathPeak = Math.max(breathPeak, scatter);
        // Reload starts with dispersed matter gathering from outside, in a staggered wave.
        if (!sourceStar && !initialSceneFinished) {
          startX = targetX + (baseX - targetX) * 1.45;
          baseY = targetY + (baseY - targetY) * 1.45;
        }
        const entryLocal = Math.min(1, Math.max(0, (entranceTime - order * .38) / .62));
        // Zero velocity at both ends: acceleration never snaps into the final form.
        const arrival = reduced ? 1 : entryLocal ** 3 * (entryLocal * (entryLocal * 6 - 15) + 10);
        const away = 1 - arrival;
        const curl = Math.hypot(targetX - startX, targetY - baseY) * .22 * (index % 2 ? 1 : -1);
        const entryLength = Math.max(1, Math.hypot(targetX - startX, targetY - baseY));
        const entryControlX = (startX + targetX) / 2 - (targetY - baseY) / entryLength * curl;
        const entryControlY = (baseY + targetY) / 2 + (targetX - startX) / entryLength * curl;
        const wobble = 1 + particle.depth * 2 + scatter * 3;
        const x = away * away * startX + 2 * away * arrival * entryControlX + arrival * arrival * targetX + Math.sin(time * particle.speed + particle.phase) * wobble;
        const y = away * away * baseY + 2 * away * arrival * entryControlY + arrival * arrival * targetY + Math.cos(time * particle.speed * .72 + particle.phase) * wobble;
        // Zero-gravity sand: only a moving hand pushes; every grain scatters on its own
        // heading, glides loose, then the form re-gathers in a staggered soft wave.
        const grainX = x + particle.offsetX, grainY = y + particle.offsetY;
        const distance = strokeDistance(grainX, grainY, pointer.frameX, pointer.frameY, pointer.x, pointer.y);
        const radius = Math.min(150, Math.max(85, cosmicWidth * .085));
        const proximity = Math.max(0, 1 - distance / radius);
        const handSpeed = Math.hypot(pointer.vx, pointer.vy);
        const strength = (reduced ? 0 : pointer.active) * proximity * proximity * (3 - 2 * proximity) * Math.min(1, handSpeed / 60);
        if (reduced) {
          particle.offsetX = particle.offsetY = particle.vx = particle.vy = 0;
        } else {
          let kickX = 0, kickY = 0;
          if (strength > .015) {
            const heading = Math.sin(particle.phase * 3.7) * .62;
            const carry = (.42 + particle.depth * .3) * (.7 + .6 * ((particle.phase * 1.3) % 1));
            const cos = Math.cos(heading), sin = Math.sin(heading);
            kickX = (pointer.vx * cos - pointer.vy * sin) * carry;
            kickY = (pointer.vx * sin + pointer.vy * cos) * carry;
            // The hand also parts the sand sideways, like a wake.
            const awayX = grainX - pointer.x, awayY = grainY - pointer.y, awayLength = Math.max(1, Math.hypot(awayX, awayY));
            kickX += awayX / awayLength * handSpeed * .28;
            kickY += awayY / awayLength * handSpeed * .28;
          }
          advanceSand(particle, kickX, kickY, strength, particle.depth, .5 + (1 - particle.depth) * .45 + order * .55, delta);
        }
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

        const visibility = edge * edge * (3 - 2 * edge) * (1-.94*readingFade) * footerQuiet * (1 - .32 * flight) * (1 - .26 * scatter) * (quietPage ? .12 : 1);
        return { x: px, y: py, depth: particle.depth, visibility };
      });
      interactivePoints = entranceTime < 1 || sections[Math.round(sceneProgress)]?.dataset.cosmicForm === 'ambient' ? [] : points.filter(point=>point.visibility>.1);
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
      pointer.frameX = pointer.x;
      pointer.frameY = pointer.y;
      paintMs += (performance.now() - paintStart - paintMs) * .1;
      cosmicCanvas.dataset.sceneProgress = sceneProgress.toFixed(3);
      cosmicCanvas.dataset.sceneTarget = destination.toFixed(3);
      cosmicCanvas.dataset.maxDrift = maxDrift.toFixed(2);
      cosmicCanvas.dataset.coreBreath = (frameA.breath ? frameA.breath * coreBreath(time, 0) : 0).toFixed(3);
      cosmicCanvas.dataset.coreScatter = breathPeak.toFixed(3);
      cosmicCanvas.dataset.arrival = (reduced ? 1 : entranceTime).toFixed(3);
      cosmicCanvas.dataset.paintMs = paintMs.toFixed(2);
      cosmicCanvas.dataset.draws = String(++drawCount);
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
    // Soft optical edges on all four sides: content melts into the frame, never cut.
    const edgeVeil = document.createElement("div");
    edgeVeil.className = "nxs-edge-veil";
    edgeVeil.setAttribute("aria-hidden", "true");
    for (const side of ["top", "bottom", "left", "right"]) {
      const band = document.createElement("span");
      band.dataset.edge = side;
      edgeVeil.append(band);
    }
    document.body.append(edgeVeil);
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
    reducedMotion.addEventListener("change", syncVisibility);

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
      // The wordmark dissolves with scroll.
      // Keep the particles alive; only the opening labels dissolve.
      if (hero) {
        const progress = Math.min(1, Math.max(0, (window.scrollY / Math.max(1, window.innerHeight) - .08) / .42));
        const opacity = 1 - progress * progress * (3 - 2 * progress);
        hero.style.setProperty("--hero-label-opacity", String(opacity));

      }
      if (reducedMotion.matches && !document.hidden) drawCosmicField(performance.now());
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === inspection.id) {
        const dx = event.clientX - inspection.startX, dy = event.clientY - inspection.startY;
        if (Math.hypot(dx, dy) > 8) root.classList.add('nxs-field-dragging');
        inspection.targetX = Math.max(-.8, Math.min(.8, dy / Math.min(cosmicWidth, cosmicHeight) * 5));
        inspection.targetY = Math.max(-1.2, Math.min(1.2, dx / Math.min(cosmicWidth, cosmicHeight) * 6));
      }
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      const now = performance.now(), seconds = Math.max(.008, (now - pointer.time) / 1000);
      pointer.vx = pointer.active ? Math.max(-650, Math.min(650, (event.clientX - pointer.x) / seconds)) : 0;
      pointer.vy = pointer.active ? Math.max(-650, Math.min(650, (event.clientY - pointer.y) / seconds)) : 0;
      pointer.time = now;
      if (!pointer.active) { pointer.frameX = event.clientX; pointer.frameY = event.clientY; }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = 1;
    };
    const releaseDrag = () => { inspection.id = -1; root.classList.remove('nxs-field-dragging'); };
    const startDrag = (event: PointerEvent) => {
      if (event.button !== 0 || reducedMotion.matches || !(event.target instanceof Element)) return;
      if (event.target.closest('a,button,input,textarea,select,[contenteditable],h1,h2,p,li')) return;
      if (!interactivePoints.some(point => Math.hypot(point.x-event.clientX,point.y-event.clientY)<24)) return;
      if (event.pointerType === 'touch') return;
      root.classList.add('nxs-field-dragging');
      inspection.id = event.pointerId;
      inspection.startX = event.clientX; inspection.startY = event.clientY;
      inspection.targetX = inspection.x; inspection.targetY = inspection.y;
    };
    const onPointerLeave = () => { pointer.active = 0; releaseDrag(); };
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
      revealTargets.forEach((target) => target.classList.remove("nxs-motion-candidate", "nxs-in-view"));
      ambientTargets.forEach((target) => target.classList.remove("nxs-ambient-active"));
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncVisibility);
      root.removeAttribute("data-motion-paused");
      root.classList.remove("nxs-motion-ready", "nxs-motion-preparing", ...MOTION_TIER_CLASSES);
      delete root.dataset.motionTier;
      delete root.dataset.nexusRoute;
      root.style.removeProperty("--nxs-scroll");
      cosmicCanvas.remove();
      edgeVeil.remove();
    };
  }, []);

  return null;
}
