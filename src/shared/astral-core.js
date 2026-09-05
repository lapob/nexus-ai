/** @module shared/astral-core
 * Nexus Astral Continuum — canonical Canvas renderer shared by web and Presence.
 * Native Android implements the same three fluid ribbons and state parameters.
 * No model/voice state is simulated: callers supply the real interaction state.
 */
function createAstralCore(canvas, options = {}) {
  // #region Geometry and lifecycle state
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) return { dispose() {}, setState() {}, getMetrics: () => ({ state: 'unavailable', phase: 0, energy: 0, particles: 0, draws: 0, drawMs: 0 }) };
  const host = options.host || canvas;
  // Decorative time is slower, not the display clock or interaction feedback.
  // Keep these physical rates aligned with Android and desktop visualizers.
  const motion = { ambientScale: .55, returnOmega: 1.1, pointerRelease: .8 };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const capacity = 900;
  const x = new Float32Array(capacity), y = new Float32Array(capacity), z = new Float32Array(capacity);
  const driftX = new Float32Array(capacity), driftY = new Float32Array(capacity);
  const velocityX = new Float32Array(capacity), velocityY = new Float32Array(capacity);
  const seed = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) { const n = Math.sin((i + 1) * 91.733) * 43758.5453; seed[i] = n - Math.floor(n); }
  const colors = [[125, 245, 250], [225, 249, 255], [161, 137, 250]];
  const glows = colors.map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
    const paint = sprite.getContext('2d');
    const gradient = paint.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, `rgba(${color},.75)`); gradient.addColorStop(.15, `rgba(${color},.3)`); gradient.addColorStop(1, `rgba(${color},0)`);
    paint.fillStyle = gradient; paint.fillRect(0, 0, 32, 32); return sprite;
  });
  const states = { idle: .15, ready: .2, listening: .57, transcribing: .7, thinking: .74, responding: .85, speaking: .9, executing: .82, permission: .32, offline: .03, error: .1, booting: .3 };
  let state = 'idle', energy = .15, offline = 0, phase = 0, emergence = 0, audio = 0;
  let width = 1, height = 1, size = 1, count = 360, frame = 0, last = 0, visible = true, disposed = false;
  let px = 0, py = 0, touched = false, pointer = 0, reducedPainted = false, draws = 0, drawMs = 0;
  let pointerVX = 0, pointerVY = 0, pointerTime = 0, maxDrift = 0;
  let budget = 360, quality = 1, strainedSeconds = 0, healthySeconds = 0;
  const rotation = [0, 0], rotationVelocity = [0, 0], rotationTarget = [0, 0];
  let dragId = null, dragX = 0, dragY = 0, dragging = false, suppressClickUntil = 0;
  const reduced = () => media.matches || (options.getReduced?.() ?? options.reduced) === true;
  const setState = value => { const next = Object.hasOwn(states, value) ? value : 'idle'; if (next !== state) { state = next; reducedPainted = false; } };
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); size = Math.min(width, height);
    const ratio = Math.min(devicePixelRatio || 1, options.efficient ? 1 : 1.65);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0);
    budget = Math.min(capacity, options.efficient ? 210 : size < 200 ? 300 : size < 420 ? 540 : 840);
    count = Math.min(count === 360 && draws === 0 ? budget : count, budget);
    count -= count % 3; reducedPainted = false;
  };
  const draw = now => {
    if (disposed || !visible || document.hidden) return;
    frame = requestAnimationFrame(draw);
    const elapsed = last ? now - last : 16.667; last = now;
    if (options.getState) setState(options.getState());
    if (reduced() && reducedPainted) return;
    const paintStarted = performance.now();
    const dt = Math.min(.25, elapsed / 1000);
    const strained = elapsed > 30 || drawMs > 8;
    strainedSeconds = strained ? strainedSeconds + dt : Math.max(0, strainedSeconds - dt * .5);
    healthySeconds = !strained && elapsed < 20 && drawMs < 5 ? healthySeconds + dt : 0;
    if (strainedSeconds > 1.2) { quality = Math.max(0, quality - .25); strainedSeconds = 0; }
    if (healthySeconds > 8) { quality = Math.min(1, quality + .25); healthySeconds = 0; }
    const targetCount = Math.max(210, Math.floor(budget * (quality >= .5 ? 1 : .55 + quality * .9) / 3) * 3);
    count += Math.sign(targetCount - count) * Math.min(3, Math.abs(targetCount - count));
    const target = states[state]; energy += (target - energy) * (1 - Math.exp(-dt * 4.5));
    offline += ((state === 'offline' || state === 'error' ? 1 : 0) - offline) * (1 - Math.exp(-dt * 3));
    const requestedEnergy = Number(options.getEnergy?.() || 0);
    const audioTarget = (state === 'listening' || state === 'speaking') && Number.isFinite(requestedEnergy) ? Math.min(1, Math.max(0, requestedEnergy)) : 0;
    audio += (audioTarget - audio) * (1 - Math.exp(-dt * 12));
    if (!reduced()) { phase += dt * (.55 + energy * .35) * motion.ambientScale; emergence = Math.min(1, emergence + dt / 2.4); }
    else { emergence = 1; energy = target; }
    pointer += ((touched && !reduced() ? 1 : 0) - pointer) * (1 - Math.exp(-dt * (touched ? 7 : motion.pointerRelease)));
    if (now - pointerTime > 80) { pointerVX *= Math.exp(-dt * 5); pointerVY *= Math.exp(-dt * 5); }
    maxDrift = 0;
    for (let axis = 0; axis < 2; axis++) {
      const goal = dragId !== null && !reduced() ? rotationTarget[axis] : 0;
      const omega = dragging ? 9 : motion.returnOmega, decay = Math.exp(-omega * dt);
      const error = rotation[axis] - goal, acceleration = rotationVelocity[axis] + omega * error;
      rotation[axis] = goal + (error + acceleration * dt) * decay;
      rotationVelocity[axis] = (rotationVelocity[axis] - omega * acceleration * dt) * decay;
    }
    const reveal = 1 - Math.pow(1 - emergence, 3), cx = width / 2, cy = height / 2, unit = size * 1.15;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    const flow = phase, scale = 1 + Math.sin(flow * .67) * .026 + audio * .055;
    for (let i = 0; i < count; i++) {
      // Stable sample positions: lowering the budget removes detail without
      // moving every remaining particle to a different part of the ribbon.
      const ribbon = i % 3, progress = (Math.floor(i / 3) * .61803398875) % 1;
      const a = progress * Math.PI * 2 + flow * .17 + ribbon * 2.094;
      const phi = i * 2.399963 + Math.sin(flow * .6 + i * .13) * .3;
      const radius = .28 + .024 * Math.sin(a * 3 + flow * .55 + ribbon);
      const tube = .018 + seed[i] * .038 + energy * .008;
      let xx = (radius + tube * Math.cos(phi)) * Math.cos(a);
      let yy = (radius + tube * Math.cos(phi)) * Math.sin(a);
      let zz = tube * Math.sin(phi) + .036 * Math.sin(a * 2 - flow * .5);
      if (i % 11 === 0) { const reach = .22 + seed[i] * .72; xx *= reach; yy *= reach; zz += Math.sin(phi) * .13; }
      const tilt = (ribbon - 1) * 1.04 + .28;
      const ry = yy * Math.cos(tilt) - zz * Math.sin(tilt); zz = yy * Math.sin(tilt) + zz * Math.cos(tilt); yy = ry;
      const yaw = flow * .09 + ribbon * .16;
      const rx = xx * Math.cos(yaw) + zz * Math.sin(yaw); zz = -xx * Math.sin(yaw) + zz * Math.cos(yaw); xx = rx;
      const roll = ribbon * .85 + Math.sin(flow * .2) * .17;
      const rotatedX = xx * Math.cos(roll) - yy * Math.sin(roll); yy = xx * Math.sin(roll) + yy * Math.cos(roll); xx = rotatedX;
      const inspectX = xx * Math.cos(rotation[1]) + zz * Math.sin(rotation[1]);
      zz = -xx * Math.sin(rotation[1]) + zz * Math.cos(rotation[1]); xx = inspectX;
      const inspectY = yy * Math.cos(rotation[0]) - zz * Math.sin(rotation[0]);
      zz = yy * Math.sin(rotation[0]) + zz * Math.cos(rotation[0]); yy = inspectY;
      const perspective = 1 / (1 - zz * .75);
      const scatter = (1 - reveal) * (.28 + seed[i] * .28);
      const tx = cx + (xx * perspective * scale + Math.cos(phi) * scatter) * unit;
      const ty = cy + (yy * perspective * scale + Math.sin(phi) * scatter) * unit;
      const dx = tx - px, dy = ty - py, distance = Math.max(1, Math.hypot(dx, dy));
      const structural = i % 9 < 3;
      const influence = Math.max(0, 1 - distance / (size * .38)) * pointer * (structural ? .22 : 1);
      // A bounded wake carries grains along the gesture, then a critically
      // damped spring reassembles them without bouncing or frame-rate drift.
      const goalX = (dx / distance * size * .20 + pointerVX * .14) * influence;
      const goalY = (dy / distance * size * .20 + pointerVY * .14) * influence;
      const omega = influence > .01 ? 4.5 : motion.returnOmega, decay = Math.exp(-omega * dt);
      const ex = driftX[i] - goalX, ey = driftY[i] - goalY;
      const ax = velocityX[i] + omega * ex, ay = velocityY[i] + omega * ey;
      driftX[i] = goalX + (ex + ax * dt) * decay;
      driftY[i] = goalY + (ey + ay * dt) * decay;
      velocityX[i] = (velocityX[i] - omega * ax * dt) * decay;
      velocityY[i] = (velocityY[i] - omega * ay * dt) * decay;
      const displacement = Math.hypot(driftX[i], driftY[i]), limit = size * (structural ? .025 : .09);
      if (displacement > limit) { const ratio = limit / displacement; driftX[i] *= ratio; driftY[i] *= ratio; velocityX[i] *= ratio; velocityY[i] *= ratio; }
      maxDrift = Math.max(maxDrift, Math.hypot(driftX[i], driftY[i]));
      x[i] = tx + driftX[i]; y[i] = ty + driftY[i]; z[i] = zz;
    }
    for (let i = 0; i < count; i += 3) {
      const peer = (i + (i % 11 === 0 ? 33 : 9)) % count;
      const distance = Math.hypot(x[i] - x[peer], y[i] - y[peer]);
      if (distance > size * .25) continue;
      context.strokeStyle = `rgba(136,218,238,${(.05 + energy * .1) * reveal * (1 - offline * .7)})`;
      context.lineWidth = Math.max(.4, size * .0011);
      context.beginPath(); context.moveTo(x[i], y[i]); context.lineTo(x[peer], y[peer]); context.stroke();
    }
    for (let i = 0; i < count; i++) {
      const depth = Math.min(1, Math.max(.15, .55 + z[i] * 1.3));
      const colorIndex = i % 19 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      const dot = Math.max(.55, size * (.0017 + seed[i] * .0015)) * (.65 + depth * .7);
      context.globalAlpha = reveal * (.36 + depth * .52 + audio * .08) * (1 - offline * .65);
      if (quality > .25 && i % (quality < .75 ? 26 : 13) === 0) { const glowSize = dot * (8 + energy * 3 + audio * 2); context.drawImage(glows[colorIndex], x[i] - glowSize / 2, y[i] - glowSize / 2, glowSize, glowSize); }
      context.fillStyle = `rgb(${colors[colorIndex]})`; context.beginPath(); context.arc(x[i], y[i], dot, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = reveal * (.6 + energy * .2 + audio * .15) * (1 - offline * .65);
    const nucleus = size * (.16 + audio * .025);
    context.drawImage(glows[0], cx - nucleus / 2, cy - nucleus / 2, nucleus, nucleus);
    context.fillStyle = '#e9ffff'; context.beginPath(); context.arc(cx, cy, Math.max(1, size * .006), 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; reducedPainted = reduced();
    canvas.dataset.astralState = state; canvas.dataset.astralParticles = String(count);
    canvas.dataset.astralRotation = rotation.map(value => value.toFixed(3)).join(',');
    draws++; drawMs += (performance.now() - paintStarted - drawMs) * .1;
  };
  // #endregion
  // #region Input and observer ownership
  const resume = () => { cancelAnimationFrame(frame); last = 0; reducedPainted = false; if (visible && !document.hidden && !disposed) frame = requestAnimationFrame(draw); };
  const move = event => {
    const rect = canvas.getBoundingClientRect(), now = performance.now();
    const nx = event.clientX - rect.left, ny = event.clientY - rect.top;
    const seconds = Math.max(.008, (now - pointerTime) / 1000);
    const limit = size * 1.5;
    pointerVX = touched ? Math.max(-limit, Math.min(limit, (nx - px) / seconds)) : 0;
    pointerVY = touched ? Math.max(-limit, Math.min(limit, (ny - py) / seconds)) : 0;
    px = nx; py = ny; pointerTime = now; touched = true;
    if (dragId === event.pointerId && !reduced()) {
      const dx = event.clientX - dragX, dy = event.clientY - dragY;
      if (Math.hypot(dx, dy) > 8) dragging = true;
      if (dragging) {
        rotationTarget[0] = Math.max(-1.15, Math.min(1.15, dy / size * 2.8));
        rotationTarget[1] = Math.max(-1.15, Math.min(1.15, dx / size * 2.8));
        host.setPointerCapture?.(event.pointerId);
      }
    }
  };
  const down = event => { if (event.button !== 0 || reduced()) return; dragId = event.pointerId; dragX = event.clientX; dragY = event.clientY; dragging = false; rotationTarget[0] = rotation[0]; rotationTarget[1] = rotation[1]; };
  const leave = event => {
    touched = false;
    if (event?.type === 'pointerleave' && dragging) return;
    if (dragging) suppressClickUntil = performance.now() + 350;
    if (dragId !== null && host.hasPointerCapture?.(dragId)) host.releasePointerCapture(dragId);
    dragId = null; dragging = false;
  };
  const click = event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
  const resizeObserver = new ResizeObserver(() => { resize(); resume(); });
  resizeObserver.observe(canvas); observer.observe(canvas);
  host.addEventListener('pointermove', move, {passive:true}); host.addEventListener('pointerleave', leave); host.addEventListener('pointerup', leave); host.addEventListener('pointercancel', leave);
  host.addEventListener('pointerdown', down); host.addEventListener('click', click, true);
  document.addEventListener('visibilitychange', resume); media.addEventListener('change', resume); resize(); resume();
  return { setState, getMetrics: () => ({ state, phase, energy, audio, quality, particles: count, draws, drawMs, maxDrift }), dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect(); host.removeEventListener('pointermove', move); host.removeEventListener('pointerdown', down); host.removeEventListener('click', click, true); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointerup', leave); host.removeEventListener('pointercancel', leave); document.removeEventListener('visibilitychange', resume); media.removeEventListener('change', resume); } };
  // #endregion
}

module.exports = { createAstralCore };
