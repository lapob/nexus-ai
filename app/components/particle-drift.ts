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

/** Distance to the whole hand stroke, including fast movements between frames. */
export function strokeDistance(x: number, y: number, fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX, dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - fromX - dx * t, y - fromY - dy * t);
}
