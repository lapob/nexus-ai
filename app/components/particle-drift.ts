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

/** Distance to the whole hand stroke, including fast movements between frames. */
export function strokeDistance(x: number, y: number, fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX, dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - fromX - dx * t, y - fromY - dy * t);
}
