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

/** One breath of the core, in ambient-time units (ambient time runs at 0.8× real time: ≈13.75 s). */
export const CORE_BREATH_PERIOD = 11;

const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * The core's breath: a pure function of time, so it is identical at 30/60/120/144 Hz.
 * Returns 0 while the form is composed, rising towards +1 when it blooms outwards
 * (disperses and zooms in) and towards −1 when it collapses into a dense heart
 * (zooms out). Cycles alternate bloom and collapse; each grain runs on its own
 * `stagger`, so the form dissolves and re-forms in a wave, never all at once.
 * The value is exactly 0 at every cycle boundary with zero slope (C²), so the
 * alternation never jumps.
 */
export function coreBreath(time: number, stagger: number) {
  const cycle = time / CORE_BREATH_PERIOD - stagger;
  const index = Math.floor(cycle);
  const phase = cycle - index;
  // Hold composed → dissolve (22%) → drift loose → re-form slowly (30%) → hold.
  const scatter = smoother((phase - .34) / .22) * (1 - smoother((phase - .66) / .3));
  return (index & 1) === 0 ? scatter : -scatter;
}

/**
 * Moves one point of a core form (unit space) along its breath `b` from
 * `coreBreath`: blooming grains expand on a coherent swirling flow (smoke, not
 * jitter); collapsing grains spiral into the heart. Writes into `out`.
 */
export function breatheCorePoint(out: { x: number; y: number; z: number }, x: number, y: number, z: number, b: number, phase: number, depth: number, time: number) {
  const s = Math.abs(b);
  if (s < 1e-4) { out.x = x; out.y = y; out.z = z; return out; }
  const flow = Math.sin(x * 4.1 + time * .21 + phase) * 1.7 + Math.cos(y * 3.3 - time * .17) * 1.7;
  const fx = Math.cos(flow), fy = Math.sin(flow);
  if (b > 0) {
    const grow = 1 + .44 * s * (.6 + .4 * depth);
    const twist = .38 * s, c = Math.cos(twist), n = Math.sin(twist);
    out.x = (x * c - y * n) * grow + fx * .13 * s;
    out.y = (x * n + y * c) * grow + fy * .13 * s;
    out.z = z * grow + Math.sin(flow * 1.3 + phase) * .1 * s;
  } else {
    const shrink = 1 - .58 * s * (.55 + .45 * depth);
    const twist = -1.05 * s, c = Math.cos(twist), n = Math.sin(twist);
    out.x = (x * c - y * n) * shrink + fx * .035 * s;
    out.y = (x * n + y * c) * shrink + fy * .035 * s;
    out.z = z * shrink;
  }
  return out;
}

/** Whole-core zoom that leads the grains slightly: in on a bloom, out on a collapse, with a soft inhale. */
export function coreZoom(time: number) {
  return 1 + .1 * coreBreath(time, -.03) + .018 * Math.sin(time * Math.PI * 2 / (CORE_BREATH_PERIOD / 3));
}

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
