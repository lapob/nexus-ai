export const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (current, target, amount) => current + (target - current) * amount;

export function damp(current, target, smoothing, deltaSeconds) {
  if (motionQuery.matches) return target;
  return lerp(current, target, 1 - Math.exp(-smoothing * deltaSeconds));
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
