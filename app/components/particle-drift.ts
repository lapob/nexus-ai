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

/** Distance to the whole hand stroke, including fast movements between frames. */
export function strokeDistance(x: number, y: number, fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX, dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - fromX - dx * t, y - fromY - dy * t);
}
