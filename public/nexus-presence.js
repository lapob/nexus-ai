(() => {
  "use strict";

  const PARTICLE_COUNT = 104;
  const REDUCED_PARTICLE_COUNT = 28;
  const PRESSURE_PARTICLE_COUNT = 52;
  const TAU = Math.PI * 2;
  const states = {
    online: { accent: "#4BE7E9", energy: 0.22 },
    loading: { accent: "#8EC8FF", energy: 0.68 },
    reconnecting: { accent: "#4BE7E9", energy: 0.22 },
    maintenance: { accent: "#F0CA68", energy: 0.82 },
    degraded: { accent: "#F0CA68", energy: 0.34 },
    offline: { accent: "#657879", energy: 0.22 },
    error: { accent: "#D69A58", energy: 0.42 },
    "not-found": { accent: "#4BE7E9", energy: 0.22 },
  };

  // java.util.Random, seed 73: the same deterministic field used by NexusRemote.
  function javaRandom(initialSeed) {
    const multiplier = 0x5deece66dn;
    const addend = 0xbn;
    const mask = (1n << 48n) - 1n;
    let seed = (BigInt(initialSeed) ^ multiplier) & mask;
    const next = (bits) => {
      seed = (seed * multiplier + addend) & mask;
      return Number(seed >> (48n - BigInt(bits)));
    };
    return () => next(24) / 16777216;
  }

  const random = javaRandom(73);
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: random(),
    y: random(),
    depth: random(),
    phase: random() * TAU,
    size: 0.65 + random() * 1.65,
  }));

  function rgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function rgba(color, alpha) {
    const [red, green, blue] = rgb(color);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function mount(root) {
    if (root.dataset.nexusMounted === "true") return;
    const canvas = root.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    root.dataset.nexusMounted = "true";

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const constrainedDevice = (navigator.deviceMemory || 8) <= 2;
    let width = 1;
    let height = 1;
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const bounds = root.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now) => {
      if (!root.isConnected) {
        cleanup();
        return;
      }
      const reducedMotion = motionQuery.matches;
      const state = states[root.dataset.state] || states.online;
      const count = reducedMotion
        ? REDUCED_PARTICLE_COUNT
        : constrainedDevice
          ? PRESSURE_PARTICLE_COUNT
          : PARTICLE_COUNT;
      const time = reducedMotion ? 0 : (now % 1800000) / 14000;
      const centerY = height * 0.44;
      const bandHeight = height * (root.dataset.state === "maintenance" ? 0.28 : 0.23);
      const points = particles.map((particle) => {
        const horizontalDrift = Math.sin(time * (0.16 + particle.depth * 0.12) + particle.phase)
          * (5 + particle.depth * 12);
        const x = Math.min(width, Math.max(0, particle.x * width + horizontalDrift));
        const normalizedX = particle.x * 2 - 1;
        const fold = Math.exp(-(normalizedX * normalizedX) * 2.3);
        const longWave = Math.sin(normalizedX * 5.2 + time * (0.32 + state.energy) + particle.phase);
        const cross = Math.cos(particle.y * 7.4 - time * 0.38 + particle.phase);
        const y = centerY + (particle.y - 0.5) * bandHeight
          + longWave * (8 + state.energy * 20)
          + cross * 5
          - fold * (18 + state.energy * 26);
        return { x, y };
      });

      context.clearRect(0, 0, width, height);
      if (!reducedMotion) {
        context.lineWidth = 0.7;
        context.strokeStyle = rgba(state.accent, 0.035 + state.energy * 0.025);
        for (let index = 1; index < count; index += 9) {
          const from = points[index - 1];
          const to = points[index];
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.quadraticCurveTo(
            (from.x + to.x) * 0.5,
            (from.y + to.y) * 0.5 - 8 * state.energy,
            to.x,
            to.y,
          );
          context.stroke();
        }
      }

      for (let index = 0; index < count; index += 1) {
        const particle = particles[index];
        const point = points[index];
        const focus = 1 - Math.abs(particle.x - 0.52);
        const alpha = Math.min(0.38, 0.06 + particle.depth * 0.2 + focus * state.energy * 0.12);
        context.beginPath();
        context.fillStyle = rgba(state.accent, alpha);
        context.arc(point.x, point.y, particle.size * (0.72 + state.energy * 0.34), 0, TAU);
        context.fill();
      }

      const glowRadius = Math.min(width, height) * 0.34;
      const glow = context.createRadialGradient(width * 0.54, centerY - 8, 0, width * 0.54, centerY - 8, glowRadius);
      glow.addColorStop(0, rgba(state.accent, 0.11 * state.energy));
      glow.addColorStop(1, rgba(state.accent, 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      if (!reducedMotion && !document.hidden) {
        frame = requestAnimationFrame(draw);
      }
    };

    const onVisibilityChange = () => restart();
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener?.("change", restart);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    const restart = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      root.dataset.motionPaused = document.hidden ? "true" : "false";
      draw(performance.now());
    };
    const observer = new ResizeObserver(() => {
      resize();
      restart();
    });
    observer.observe(root);
    motionQuery.addEventListener?.("change", restart);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resize();
    restart();
  }

  const mountAll = (scope = document) => {
    scope.querySelectorAll?.("[data-nexus-presence]").forEach(mount);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountAll(), { once: true });
  } else {
    mountAll();
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-nexus-retry]")) location.reload();
  });
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches?.("[data-nexus-presence]")) mount(node);
        mountAll(node);
      }
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
