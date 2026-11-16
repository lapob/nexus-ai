/** Damped advection: grains retain momentum without an oscillating spring. */
export function advanceDrift(offset: number, velocity: number, flow: number, depth: number, seconds: number) {
  const drag = 7 + depth * 4;
  const recovery = 1.8;
  const dt = Math.max(0, Math.min(seconds, .1));
  const friction = Math.exp(-drag * dt);
  const settling = Math.exp(-recovery * dt);
  const target = flow * (.48 + depth * .28);
  return {
    velocity: target + (velocity - target) * friction,
    offset: offset * settling + target * (1 - settling) / recovery
      + (velocity - target) * (settling - friction) / (drag - recovery),
  };
}

export type SandGrain = { offsetX: number; offsetY: number; vx: number; vy: number; calm: number };

/**
 * Zero-gravity sand: the hand pushes grains (each with its own scatter), they glide
 * freely with almost no friction, rest loose for a moment, then re-gather in a soft
 * critically damped wave. `hold` staggers the return per grain; nothing oscillates.
 */
export function advanceSand(grain: SandGrain, kickX: number, kickY: number, strength: number, depth: number, hold: number, seconds: number) {
  const dt = Math.max(0, Math.min(seconds, .1));
  if (strength > .015) {
    // The stroke drags touched grains towards its own (scattered) velocity.
    const grip = Math.exp(-9 * strength * dt);
    grain.vx = kickX + (grain.vx - kickX) * grip;
    grain.vy = kickY + (grain.vy - kickY) * grip;
    grain.calm = 0;
  } else grain.calm += dt;
  const glide = .9 + depth * .55;
  const ramp = Math.min(1, Math.max(0, (grain.calm - hold) / 1.4));
  const omega = 2.4 * ramp * ramp * (3 - 2 * ramp);
  if (omega * 2 <= glide) {
    // Free flight: velocity fades exponentially, the offset integrates it exactly.
    const fade = Math.exp(-glide * dt);
    const pull = omega * omega * dt;
    grain.offsetX += grain.vx * (1 - fade) / glide;
    grain.offsetY += grain.vy * (1 - fade) / glide;
    grain.vx = grain.vx * fade - grain.offsetX * pull;
    grain.vy = grain.vy * fade - grain.offsetY * pull;
  } else {
    // Re-gathering: exact critically damped return, no overshoot from rest.
    const decay = Math.exp(-omega * dt);
    for (const [o, v] of [['offsetX', 'vx'], ['offsetY', 'vy']] as const) {
      const x0 = grain[o], v0 = grain[v], b = v0 + omega * x0;
      grain[o] = (x0 + b * dt) * decay;
      grain[v] = (v0 - omega * b * dt) * decay;
    }
  }
  if (Math.abs(grain.offsetX) < .002 && Math.abs(grain.vx) < .002) grain.offsetX = grain.vx = 0;
  if (Math.abs(grain.offsetY) < .002 && Math.abs(grain.vy) < .002) grain.offsetY = grain.vy = 0;
  return grain;
}

/**
 * The core's breath (bloom, collapse, zoom) comes from the shared, versioned NexusNXS core — the same module the AI
 * app draws with — vendored by scripts/sync-nexus-core.mjs. Times here are ambient time (0.8× real time).
 */
export { breatheCorePoint, coreBreath, coreZoom, CORE_BREATH_PERIOD, NEXUS_CORE_VERSION } from "./nexus-core.ts";

const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * Scroll choreography of one reading block, from its viewport top/bottom: `enter`
 * rises 0→1 while the block climbs from the bottom edge to just above the middle,
 * `leave` rises 0→1 while its bottom slips out past the top. Both are C²-smooth
 * and depend only on position, so scrolling back plays the story in reverse.
 */
export function chapterChoreo(top: number, bottom: number, viewport: number) {
  return {
    enter: smoother((viewport * .96 - top) / (viewport * .4)),
    leave: smoother((viewport * .26 - bottom) / (viewport * .3)),
  };
}

/**
 * Bridge chapters (screens and copy, no artwork) carry a loose current of stars across
 * the page instead of an empty sky, so one form always flows into the next. Pixel
 * space; bounded bobbing (never wraps), the wave itself travels.
 */
export function streamPoint(out: { x: number; y: number }, index: number, phase: number, depth: number, time: number, width: number, height: number, lane: number) {
  const along = (index * .61803398875) % 1 + Math.sin(time * .021 + phase) * .025;
  const wave = Math.sin(along * Math.PI * 2.4 - time * .055 + lane) * .19 + Math.sin(along * Math.PI * 5.2 + time * .043) * .045;
  const spread = (Math.sin(phase * 7.3) + Math.cos(phase * 2.1)) * .5 * (.035 + depth * .075);
  out.x = (along * 1.12 - .06) * width;
  out.y = (.5 + wave + spread) * height;
  return out;
}

/**
 * The closing form above the footer: a slow inclined spiral galaxy, two arms around a
 * bright heart (unit space, like the other forms). `reach` is 0 at the heart, 1 at the rim.
 */
export function horizonPoint(out: { x: number; y: number; z: number; reach: number }, index: number, phase: number, depth: number, time: number) {
  const along = (index * .61803398875) % 1;
  if (index % 9 === 0) {
    const r = .015 + depth * depth * .07, a = phase + time * .06;
    out.x = Math.cos(a) * r; out.y = Math.sin(a) * r * .5 + Math.sin(phase * 3) * .012; out.z = Math.sin(a) * r; out.reach = 0;
    return out;
  }
  const r = .05 + along ** .8 * .5;
  const a = (index % 2) * Math.PI + along * 4.4 + Math.cos(phase) * .36 * (1 - along * .6) + time * .045;
  out.x = Math.cos(a) * r;
  out.y = Math.sin(a) * r * .36 + Math.sin(phase * 2.3) * .018 * (1 - along);
  out.z = Math.sin(a) * r * .9;
  out.reach = along;
  return out;
}

/**
 * In-flight vortex between two chapter forms: grains turn around the flight centre and
 * spread in depth (near grains swing wider, far grains tuck in). `flight` is 0 at both
 * ends of the transition, so the resting forms are untouched.
 */
export function vortexFlight(out: { x: number; y: number }, x: number, y: number, centerX: number, centerY: number, flight: number, depth: number, direction: number) {
  if (flight <= 1e-4) { out.x = x; out.y = y; return out; }
  const turn = flight * (.45 + depth * .45) * direction;
  const zoom = 1 + flight * (depth - .55) * .5;
  const c = Math.cos(turn), s = Math.sin(turn), dx = x - centerX, dy = y - centerY;
  out.x = centerX + (dx * c - dy * s) * zoom;
  out.y = centerY + (dx * s + dy * c) * zoom;
  return out;
}

/** Distance to the whole hand stroke, including fast movements between frames. */
export function strokeDistance(x: number, y: number, fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX, dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - fromX - dx * t, y - fromY - dy * t);
}
