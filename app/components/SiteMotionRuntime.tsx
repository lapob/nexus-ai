"use client";

import { useEffect } from "react";
import { advanceSand, breatheCorePoint, chapterChoreo, coreBreath, coreZoom, horizonPoint, streamPoint, strokeDistance, vortexFlight } from "./particle-drift";

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
const CORE_FORMS = new Set<string | undefined>(["sigil", "reactor", "horizon"]);
// Reading blocks of the home narrative: their words enter and leave with the scroll.
const CHOREO_SELECTOR = ".narrative-copy,.narrative-app-copy,.app-card-visual,.presence-copy,.presence-grid,.one-nexus-copy,.nexus-stage,.footer-callout,.footer-links,.footer-bottom";
// Blocks that move as one piece (their children own hover transforms).
const CHOREO_SELF = ".app-card-visual,.nexus-stage,.footer-links,.footer-callout,.presence-grid";
const documentTop = (element: HTMLElement) => {
  let top = 0;
  // offsetTop ignores the choreography's own transforms, so reading never feeds back.
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
};

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
    // Visual regression: ?nxs-still[=seconds] / ?nxs-qa-time=<seconds> (or html[data-nxs-still])
    // renders one fixed, deterministic state: seeded field, entrance complete, clock frozen,
    // CSS motion off; the canvas gets data-qa="ready" once that frame is painted.
    const query = new URLSearchParams(window.location.search);
    const stillValue = query.get("nxs-qa-time") ?? query.get("nxs-still") ?? root.dataset.nxsStill;
    const still = stillValue != null;
    const stillTime = Math.max(0, Number(stillValue) || 0);
    if (still) root.classList.add("nxs-still");
    const calm = () => still || reducedMotion.matches;
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
    let maxScroll = 1;
    let scrollProgress = 0;
    let scrollPublish = 0;
    let storyAnchors: number[] = [];
    const choreoBlocks = quietPage ? [] : Array.from(document.querySelectorAll<HTMLElement>(CHOREO_SELECTOR)).map(element => {
      // Blocks with their own hover transforms move as one piece; copy blocks stagger their lines.
      const targets = (element.matches(CHOREO_SELF) ? [element] : Array.from(element.children) as HTMLElement[])
        .map((target, index) => ({ target, order: Math.min(index, 4), state: "" }));
      return { element, targets, top: 0, bottom: 0 };
    });
    // Words enter and leave with the scroll itself (reversible, no timers). Opacity and
    // transform are written inline on the moving elements only: no inherited custom
    // property, so a scroll frame never restyles whole subtrees. At rest the inline
    // style is removed entirely (opacity 1, no transform, no filter), which also keeps
    // the feathered reading blur on its real backdrop.
    const updateChoreo = () => {
      if (!choreoBlocks.length) return;
      const active = !calm();
      const y = window.scrollY, h = window.innerHeight;
      // Soft focus in transit on larger screens; phones keep the cheaper fade + glide.
      const blurScale = tier === "lite" || window.innerWidth < 801 ? 0 : 1;
      for (const block of choreoBlocks) {
        // Far away blocks are settled (hidden below or gone above): one write, then skipped.
        const { enter, leave } = active ? chapterChoreo(block.top - y, block.bottom - y, h) : { enter: 1, leave: 0 };
        for (const item of block.targets) {
          const a = Math.min(1, Math.max(0, enter * 1.5 - item.order * .12));
          const b = Math.min(1, Math.max(0, leave * 1.5 - item.order * .12));
          let state = "";
          if (a < 1 || b > 0) {
            const opacity = Math.min(a, 1 - b);
            const blur = opacity > .01 ? ((1 - a) * 6 + b * 5) * blurScale : 0;
            state = `${opacity.toFixed(3)}|translate3d(0,${((1 - a) * 46 - b * 38).toFixed(1)}px,0) scale(${(1 - (1 - a) * .025 - b * .02).toFixed(4)})|${blur > .05 ? `blur(${blur.toFixed(2)}px)` : ""}`;
          }
          if (state === item.state) continue;
          item.state = state;
          const [opacity = "", transform = "", filter = ""] = state ? state.split("|") : [];
          item.target.style.opacity = opacity;
          item.target.style.transform = transform;
          item.target.style.filter = filter;
        }
      }
    };
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
    let entranceProgress = 0;
    let entranceRate = 0;
    let entranceRush = false;
    let skyFade = 0;
    const entranceRushSeconds = 1.6;
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
    // Pre-rendered round grains: one drawImage per larger grain instead of building,
    // tessellating and filling an arc path with a fresh rgba() string every frame.
    const makeDot = (color: string) => {
      const dot = document.createElement('canvas');
      dot.width = dot.height = 16;
      const context = dot.getContext('2d');
      if (context) { context.fillStyle = `rgb(${color})`; context.beginPath(); context.arc(8, 8, 7.5, 0, Math.PI * 2); context.fill(); }
      return dot;
    };
    const DOT_BRIGHT = '225,249,255', DOT_CYAN = '125,245,250', DOT_STAR = '185,225,236';
    const dotBright = makeDot(DOT_BRIGHT), dotCyan = makeDot(DOT_CYAN), dotStar = makeDot(DOT_STAR);
    const particleCount = tier === "ultra" ? 2400 : tier === "balanced" ? 1600 : 720;
    // Density follows the screen: a phone shows smaller forms and needs fewer grains
    // for the same look (≈55% at 390x844), a large desktop keeps the full field.
    const fieldCap = Math.round(particleCount * Math.min(1, Math.max(.55, Math.sqrt(window.innerWidth * window.innerHeight / 1_300_000))));
    let activeParticles = fieldCap;
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
      // Grains are points of light: beyond 2x density (and ~4 MP) the extra backing
      // pixels cost fill rate on phones without a visible gain.
      const ratio = Math.min(window.devicePixelRatio || 1, tier === "lite" ? 1.5 : 2, Math.sqrt(4_000_000 / Math.max(1, innerWidth * innerHeight)));
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
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      // The last chapters (the footer above all) can start below the deepest reachable
      // scroll position, which left their form half-composed forever. Story anchors are
      // pulled inside the reachable range, so the narrative lands complete at the bottom.
      storyAnchors = sectionAnchors.slice();
      for (let index = storyAnchors.length - 1, limit = maxScroll; index >= 0; index--) {
        storyAnchors[index] = Math.min(storyAnchors[index], limit);
        limit = storyAnchors[index] - cosmicHeight * .25;
      }
      for (const block of choreoBlocks) { block.top = documentTop(block.element); block.bottom = block.top + block.element.offsetHeight; }
      updateChoreo();
      readingHalos = Array.from(document.querySelectorAll<HTMLElement>('.narrative-copy > h2,.narrative-copy > p,.narrative-app-copy,.presence-copy,.one-nexus-copy,.presence-grid,.inner-page h1,.inner-page h2,.inner-page p,.service-list,.legal-content,.legal-nav,.release-list,.security-summary,.footer-callout,.footer-links,.footer-bottom')).map(element=>{
        const rect=element.getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top+window.scrollY,bottom:rect.bottom+window.scrollY};
      });
      if (calm() && !document.hidden) {
        cancelAnimationFrame(cosmicFrame);
        cosmicFrame = requestAnimationFrame(drawCosmicField);
      }
    };

    const pointX = new Float32Array(particleCount), pointY = new Float32Array(particleCount), pointVisibility = new Float32Array(particleCount);
    // Grains that can be grabbed this frame (0 while a bridge current or the sky rests).
    let interactiveCount = 0;
    const nearGrain = (x: number, y: number) => {
      for (let index = 0; index < interactiveCount; index++) if (pointVisibility[index] > .1 && Math.hypot(pointX[index] - x, pointY[index] - y) < 24) return true;
      return false;
    };
    const breathPoint = { x: 0, y: 0, z: 0 };
    const streamPosition = { x: 0, y: 0 };
    const horizonPosition = { x: 0, y: 0, z: 0, reach: 0 };
    const flightPosition = { x: 0, y: 0 };
    const MAX_HALOS = 64;
    const halos = new Float32Array(MAX_HALOS * 4), haloBounds = new Float32Array(MAX_HALOS * 4);
    let haloCount = 0;
    const LINE_LEVELS = 6;
    const linePaths: number[][] = Array.from({ length: LINE_LEVELS }, () => []);
    const drawCosmicField = (now: number) => {
      if (!cosmicContext || !cosmicCanvas.isConnected) return;
      const paintStart = performance.now();
      const reduced = calm();
      const delta = Math.min(.25, Math.max(.001, (now - cosmicLastFrame) / 1000));
      cosmicLastFrame = now;
      // Calm mode only redraws on scroll/resize: the long gaps between those frames are
      // not strain, so the density budget must not shrink (and stays deterministic).
      if (!reduced) {
        strainedSeconds = paintMs > 9 || delta > .035 ? strainedSeconds + delta : Math.max(0, strainedSeconds - delta);
        healthySeconds = paintMs < 5 && delta < .022 ? healthySeconds + delta : 0;
      }
      if (strainedSeconds > 2) { activeParticles = Math.max(300, activeParticles - 60); strainedSeconds = 0; }
      if (healthySeconds > 8) { activeParticles = Math.min(fieldCap, activeParticles + 30); healthySeconds = 0; }
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
      const time = still ? stillTime : reduced ? 0 : ambientTime;
      if (now - pointer.time > 80) { pointer.vx *= Math.exp(-delta * 5); pointer.vy *= Math.exp(-delta * 5); }
      const scroll = scrollProgress;
      const viewportAnchor = window.scrollY;
      let currentSection = Math.max(0, storyAnchors.findLastIndex(top => top <= viewportAnchor));
      currentSection = Math.min(currentSection, Math.max(0, sections.length - 1));
      const sectionStart = storyAnchors[currentSection] || 0;
      const sectionEnd = storyAnchors[currentSection + 1] || sectionStart + cosmicHeight;
      const fraction = (viewportAnchor - sectionStart) / Math.max(1, sectionEnd - sectionStart);
      const hold = sections[currentSection]?.classList.contains('astral-interlude') ? .65 : .35;
      const destination = currentSection + Math.min(1, Math.max(0, (fraction - hold) / (1 - hold)));
      const footerIndex = sections.findIndex(section => section.tagName === 'FOOTER');
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
      // The long entrance belongs only to opening the page. If the visitor scrolls
      // away while it runs, it must never snap complete in one frame: the entrance
      // hurries (its speed ramps up smoothly) and the grains keep flying on their
      // arcs straight into the current chapter's form, in the same staggered wave.
      entranceRush ||= window.scrollY > cosmicHeight * .2;
      if (reduced) { entranceProgress = 1; skyFade = 1; }
      else {
        const targetRate = entranceRush ? 1 / entranceRushSeconds : age > arrivalDelay ? 1 / arrivalDuration : 0;
        entranceRate += (targetRate - entranceRate) * (1 - Math.exp(-5 * delta));
        entranceProgress = Math.min(1, entranceProgress + entranceRate * delta);
        if (age > 1.5 || entranceRush) skyFade = Math.min(1, skyFade + delta / (entranceRush ? .8 : 1.7));
      }
      initialSceneFinished = entranceProgress >= 1;
      const entranceTime = entranceProgress;
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
        if (ambient || form === 'stream') return { shape, form, ambient, centerX: cosmicWidth / 2, centerY: cosmicHeight / 2, unit: 0, cosYaw: 1, sinYaw: 0, cosPitch: 1, sinPitch: 0, breath: 0 };
        const isHero = shape === 0 && heroCore !== null;
        const centerX = isHero ? (heroLive ? heroLive.x : heroCore!.x) : cosmicWidth * responsiveLane(shape);
        const mobileReading = cosmicWidth < 801 && section!.matches('.narrative-copy,.app-card,.presence-system,.one-nexus');
        // On phones the artwork occupies real space after the copy, rather
        // than being clipped offscreen or projected behind readable text.
        // The closing galaxy floats in the open sky above the footer copy.
        const centerY = isHero ? (heroLive ? heroLive.y : heroCore!.y - window.scrollY)
          : form === 'horizon' ? Math.min(cosmicHeight * .46, Math.max(cosmicHeight * .26, ((sectionAnchors[shape] || 0) - window.scrollY) * .5))
          : mobileReading ? mobileArtAnchors[shape] - window.scrollY : cosmicHeight * .5;
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
        return { shape, form, ambient, centerX, centerY, unit, cosYaw: Math.cos(yaw), sinYaw: Math.sin(yaw), cosPitch: Math.cos(pitch), sinPitch: Math.sin(pitch), breath };
      };
      type ShapeFrame = ReturnType<typeof frameFor>;
      const frameA = frameFor(topologyIndex);
      const frameB = frameFor(topologyIndex + 1);
      const minDimension = Math.min(cosmicWidth, cosmicHeight);
      const flightCenterX = (frameA.centerX + frameB.centerX) / 2;
      const flightCenterY = (frameA.centerY + frameB.centerY) / 2;
      const topologyPoint = (particle: CosmicParticle, index: number, frame: ShapeFrame): { x: number; y: number; scatter?: number; veil?: number } => {
        if (frame.ambient) return { x: particle.x * cosmicWidth, y: particle.y * cosmicHeight };
        const { form, centerX, centerY, unit, cosYaw, sinYaw, cosPitch, sinPitch } = frame;
        // Bridge chapters: a soft current of stars behind screens and copy, never an empty sky.
        if (form === 'stream') {
          streamPoint(streamPosition, index, particle.phase, particle.depth, time, cosmicWidth, cosmicHeight, frame.shape * 1.7);
          return { x: streamPosition.x, y: streamPosition.y, veil: 1 };
        }
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
        if (form === 'horizon') {
          horizonPoint(horizonPosition, index, particle.phase, particle.depth, time);
          return breathe(horizonPosition.x, horizonPosition.y, horizonPosition.z, horizonPosition.reach);
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
      // Reading halos in viewport coordinates, converted once per frame (not per grain).
      haloCount = 0;
      const pushHalo = (rect: { left: number; right: number; top: number; bottom: number }) => {
        const top = rect.top - window.scrollY, bottom = rect.bottom - window.scrollY;
        if (bottom < -80 || top > cosmicHeight + 80) return;
        const base = haloCount * 4;
        halos[base] = rect.left - 80; halos[base + 1] = rect.right + 80; halos[base + 2] = top - 80; halos[base + 3] = bottom + 80;
        haloBounds[base] = rect.left; haloBounds[base + 1] = rect.right; haloBounds[base + 2] = top; haloBounds[base + 3] = bottom;
        haloCount++;
      };
      for (const rect of readingHalos) if (haloCount < MAX_HALOS) pushHalo(rect);
      // Sticky hero words, sampled by readHeroLayout (not every frame).
      for (const rect of heroHalos) if (haloCount < MAX_HALOS) pushHalo(rect);
      const readingOpacity = (x: number, y: number) => {
        let fade = 0;
        for (let h = 0; h < haloCount * 4; h += 4) {
          // Cheap reject first: most grains are nowhere near a line of text.
          if (x < halos[h] || x > halos[h + 1] || y < halos[h + 2] || y > halos[h + 3]) continue;
          const dx = Math.max(haloBounds[h] - x, 0, x - haloBounds[h + 1]);
          const dy = Math.max(haloBounds[h + 2] - y, 0, y - haloBounds[h + 3]);
          const weight = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 80);
          fade = Math.max(fade, weight * weight * (3 - 2 * weight));
        }
        return 1 - .94 * fade;
      };
      const skyAlpha = skyFade * skyFade * (3 - 2 * skyFade);
      cosmicContext.fillStyle = `rgb(${DOT_STAR})`;
      for (let index = 0; index < backgroundStars.length; index++) {
        // These grains are rendered below and travel into the current form.
        if (!quietPage && index % 4 === 0) continue;
        const star = backgroundStars[index];
        const x = star.x * cosmicWidth + Math.sin(time * .09 + star.phase) * 5;
        const y = ((star.y * cosmicHeight - window.scrollY * (.012 + star.depth * .025)) % cosmicHeight + cosmicHeight) % cosmicHeight;
        const twinkle = .8 + Math.sin(time * .45 + star.phase) * .2;
        const alpha = skyAlpha * (.16 + star.depth * .42) * twinkle * readingOpacity(x,y) * (quietPage ? .3 : 1);
        if (alpha < .004) continue;
        cosmicContext.globalAlpha = alpha;
        const radius = .4 + star.depth ** 4 * 1.1;
        // Sub-pixel stars are indistinguishable from squares; larger ones use the round sprite.
        if (radius < .8) cosmicContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        else cosmicContext.drawImage(dotStar, x - radius, y - radius, radius * 2, radius * 2);
      }
      cosmicContext.globalAlpha = skyAlpha;
      let maxDrift = 0;
      let breathPeak = 0;
      const footerEntry = footerIndex < 0 ? 0 : Math.max(0, Math.min(1, (viewportAnchor - sectionAnchors[footerIndex] + cosmicHeight * .7) / (cosmicHeight * .7)));
      // The home story ends on its closing galaxy, softened rather than switched off.
      const footerQuiet = 1 - (quietPage ? .88 : .3) * footerEntry * footerEntry * (3 - 2 * footerEntry);
      // Alternate the vortex direction chapter by chapter; flight is 0 where it flips.
      const vortexDirection = topologyIndex % 2 ? -1 : 1;
      // Grain positions go into reused typed arrays: no per-grain objects every frame.
      const pointCount = activeParticles;
      const computePoint = (particle: CosmicParticle, index: number) => {
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
        const flight = 4 * mix * rest * Math.min(1, span / (minDimension * .2));
        // Mid-flight the whole cloud turns as one galaxy around the flight centre, with
        // depth parallax: a spectacular hand-over that still lands exactly on each form.
        vortexFlight(flightPosition, rest * rest * first.x + 2 * rest * mix * controlX + mix * mix * second.x,
          rest * rest * first.y + 2 * rest * mix * controlY + mix * mix * second.y, flightCenterX, flightCenterY, flight, particle.depth, vortexDirection);
        const targetX = flightPosition.x, targetY = flightPosition.y;
        // Bridge currents glow softer than the chapter artworks.
        const veil = (first.veil ?? 0) * rest + (second.veil ?? 0) * mix;
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
        const visibility = edge * edge * (3 - 2 * edge) * readingOpacity(px, py) * footerQuiet * (1 - .2 * flight) * (1 - .26 * scatter) * (1 - .42 * veil) * (quietPage ? .12 : 1);
        pointX[index] = px; pointY[index] = py; pointVisibility[index] = visibility;
      };
      for (let index = 0; index < pointCount; index++) computePoint(particles[index], index);
      const restingForm = sections[Math.round(sceneProgress)]?.dataset.cosmicForm;
      interactiveCount = entranceTime < 1 || restingForm === 'ambient' || restingForm === 'stream' ? 0 : pointCount;
      // Faint constellation threads, grouped into a few opacity levels: six strokes
      // per frame instead of one stroke (and one colour string) per thread.
      for (const path of linePaths) path.length = 0;
      for (let index = 0; index < pointCount; index += 3) {
        const visibility = pointVisibility[index];
        if (visibility < .02) continue;
        const x = pointX[index], y = pointY[index];
        let nearest = -1;
        let nearestSquared = 128 * 128;
        for (let peer = index + 1; peer < Math.min(pointCount, index + 12); peer += 1) {
          const dx = x - pointX[peer], dy = y - pointY[peer], squared = dx * dx + dy * dy;
          if (squared < nearestSquared) { nearest = peer; nearestSquared = squared; }
        }
        if (nearest < 0) continue;
        const strength = visibility * pointVisibility[nearest] * (1 - Math.sqrt(nearestSquared) / 128);
        if (strength < .04) continue;
        linePaths[Math.min(LINE_LEVELS - 1, Math.floor(strength * LINE_LEVELS))].push(x, y, pointX[nearest], pointY[nearest]);
      }
      cosmicContext.lineWidth = .55;
      cosmicContext.strokeStyle = 'rgb(86,232,234)';
      for (let level = 0; level < LINE_LEVELS; level++) {
        const path = linePaths[level];
        if (!path.length) continue;
        cosmicContext.globalAlpha = skyAlpha * .025 * (level + .5) / LINE_LEVELS;
        cosmicContext.beginPath();
        for (let i = 0; i < path.length; i += 4) { cosmicContext.moveTo(path[i], path[i + 1]); cosmicContext.lineTo(path[i + 2], path[i + 3]); }
        cosmicContext.stroke();
      }
      // Grains: sub-pixel ones as tiny squares under one fill colour, the bright larger
      // ones as a pre-rendered round sprite; opacity rides on globalAlpha.
      cosmicContext.fillStyle = `rgb(${DOT_CYAN})`;
      for (let index = 0; index < pointCount; index++) {
        const depth = particles[index].depth, visibility = pointVisibility[index];
        const alpha = skyAlpha * (.4 + depth * .6) * visibility;
        if (alpha < .004) continue;
        const x = pointX[index], y = pointY[index];
        if (depth > .985) {
          const glowSize = 8 + depth ** 12 * 10;
          cosmicContext.globalAlpha = skyAlpha * visibility;
          cosmicContext.drawImage(glow, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
        }
        const radius = .45 + depth ** 8 * 1.65;
        cosmicContext.globalAlpha = alpha;
        if (depth > .8) cosmicContext.drawImage(dotBright, x - radius, y - radius, radius * 2, radius * 2);
        else if (radius < .8) cosmicContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        else cosmicContext.drawImage(dotCyan, x - radius, y - radius, radius * 2, radius * 2);
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
      if (still) cosmicCanvas.dataset.qa = "ready";
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
    const syncChoreo = () => updateChoreo();
    reducedMotion.addEventListener("change", syncChoreo);

    const ambientObserver = typeof IntersectionObserver === "function" && !calm() && tier !== "lite"
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("nxs-ambient-active", entry.isIntersecting);
        }
      }, { rootMargin: "80px 0px", threshold: 0.01 })
      : null;
    ambientTargets.forEach((target) => {
      if (ambientObserver) ambientObserver.observe(target);
      else target.classList.toggle("nxs-ambient-active", !calm() && tier !== "lite");
    });

    const showTarget = (target: HTMLElement) => {
      target.classList.add("nxs-in-view");
    };
    const revealObserver = typeof IntersectionObserver === "function" && !calm()
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

    const heroTitle = document.querySelector<HTMLElement>(".astral-hero .hero-product-name");
    let heroTitleOpacity = "";
    const updateScroll = () => {
      scrollFrame = 0;
      // Cached range (refreshed by layout observation): no forced layout per scroll frame.
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      // Measured: rewriting a custom property on the root every frame restyled the whole
      // document (~1 s of style work per 4.5 s fling on a 4x-throttled phone). The field
      // reads the JS value; the public --nxs-scroll is published once scrolling rests.
      clearTimeout(scrollPublish);
      scrollPublish = window.setTimeout(() => root.style.setProperty("--nxs-scroll", scrollProgress.toFixed(4)), 140);
      // The wordmark dissolves with scroll.
      // Keep the particles alive; only the opening labels dissolve.
      if (heroTitle) {
        const progress = Math.min(1, Math.max(0, (window.scrollY / Math.max(1, window.innerHeight) - .08) / .42));
        const opacity = (1 - progress * progress * (3 - 2 * progress)).toFixed(3);
        if (opacity !== heroTitleOpacity) { heroTitleOpacity = opacity; heroTitle.style.opacity = opacity === "1.000" ? "" : opacity; }
      }
      updateChoreo();
      if (calm() && !document.hidden) drawCosmicField(performance.now());
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
      if (event.pointerType === "touch" || calm()) return;
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
      if (event.button !== 0 || calm() || !(event.target instanceof Element)) return;
      if (event.target.closest('a,button,input,textarea,select,[contenteditable],h1,h2,p,li')) return;
      if (!nearGrain(event.clientX, event.clientY)) return;
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
      clearTimeout(scrollPublish);
      cancelAnimationFrame(revealFrame);
      cancelAnimationFrame(cosmicFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("resize", resizeCosmicField);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      revealTargets.forEach((target) => target.classList.remove("nxs-motion-candidate", "nxs-in-view"));
      ambientTargets.forEach((target) => target.classList.remove("nxs-ambient-active"));
      root.classList.remove("nxs-still");
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncVisibility);
      reducedMotion.removeEventListener("change", syncChoreo);
      for (const { targets } of choreoBlocks) for (const { target } of targets) { target.style.opacity = ""; target.style.transform = ""; target.style.filter = ""; }
      if (heroTitle) heroTitle.style.opacity = "";
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
