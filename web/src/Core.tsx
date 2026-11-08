/**
 * @module web/Core
 * @description Nucleo di particelle NexusNXS: WebGPU nativo (posizioni calcolate nello shader WGSL), fallback Canvas 2D, pausa in background e movimento ridotto.
 */
import { useEffect, useRef } from 'react';

export type CoreState = 'idle' | 'listening' | 'thinking' | 'responding' | 'speaking' | 'error';

const PARTICLES = 6_000;
const FALLBACK_PARTICLES = 1_600;
const ENERGY: Record<CoreState, number> = { idle: 0.15, listening: 0.4, thinking: 0.6, responding: 1, speaking: 0.85, error: 0.35 };

// Ogni istanza è un quad; la posizione nasce da un hash dell'indice (distribuzione
// di Fibonacci sulla sfera) e da onde dipendenti da tempo ed energia.
const SHADER = /* wgsl */ `
struct Uniforms { time: f32, energy: f32, aspect: f32, scale: f32, tint: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out { @builtin(position) position: vec4f, @location(0) local: vec2f, @location(1) glow: f32 };

fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }

@vertex
fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let count = f32(${PARTICLES});
  let i = f32(instance);
  let golden = 2.39996323;
  let y = 1.0 - (i / (count - 1.0)) * 2.0;
  let ring = sqrt(max(0.0, 1.0 - y * y));
  let theta = golden * i;
  var p = vec3f(cos(theta) * ring, y, sin(theta) * ring);
  let seed = hash(i);
  let wave = sin(u.time * (0.6 + u.energy * 1.4) + seed * 6.2831 + y * 4.0);
  let radius = 0.62 + 0.05 * wave * (0.4 + u.energy) + 0.12 * (seed - 0.5) * u.energy;
  p = p * radius;
  let angle = u.time * (0.08 + 0.22 * u.energy);
  let c = cos(angle); let s = sin(angle);
  p = vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  let tilt = 0.35; let ct = cos(tilt); let st = sin(tilt);
  p = vec3f(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
  let depth = 1.0 / (2.2 - p.z);
  let corners = array<vec2f, 4>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
  let corner = corners[vertex];
  let size = (0.0035 + 0.006 * hash(i + 7.0)) * (1.0 + u.energy * 0.6) * u.scale;
  var out: Out;
  out.position = vec4f(vec2f(p.x * depth / u.aspect, p.y * depth) * 1.9 * u.scale + corner * vec2f(size / u.aspect, size), 0.0, 1.0);
  out.local = corner;
  out.glow = (0.35 + 0.65 * (p.z * 0.5 + 0.5)) * (0.55 + 0.45 * u.energy);
  return out;
}

@fragment
fn fs(input: Out) -> @location(0) vec4f {
  let d = dot(input.local, input.local);
  if (d > 1.0) { discard; }
  let falloff = exp(-d * 3.2);
  return vec4f(u.tint.rgb * falloff * input.glow, falloff * input.glow);
}
`;

type Renderer = { frame: (time: number, energy: number) => void; resize: (width: number, height: number) => void; destroy: () => void };

// Tipi WebGPU minimi e locali: niente dipendenza @webgpu/types da installare.
/* eslint-disable @typescript-eslint/no-explicit-any */
type GpuAny = any;
const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;

async function webgpuRenderer(canvas: HTMLCanvasElement, tint: [number, number, number]): Promise<Renderer | null> {
  const gpu: GpuAny = (navigator as unknown as { gpu?: GpuAny }).gpu;
  if (!gpu) return null;
  const adapter: GpuAny = await gpu.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
  if (!adapter) return null;
  const device: GpuAny = await adapter.requestDevice().catch(() => null);
  if (!device) return null;
  const context: GpuAny = canvas.getContext('webgpu' as '2d');
  if (!context) return null;
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
    primitive: { topology: 'triangle-strip' }
  });
  const uniforms = device.createBuffer({ size: 32, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] });
  const data = new Float32Array(8);
  let aspect = 1;
  let lost = false;
  device.lost.then(() => { lost = true; });
  return {
    resize: (width, height) => { aspect = width / Math.max(1, height); },
    frame: (time, energy) => {
      if (lost) return;
      data.set([time, energy, aspect, Math.min(1, aspect < 1 ? aspect * 1.25 : 1), tint[0], tint[1], tint[2], 1]);
      device.queue.writeBuffer(uniforms, 0, data);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, PARTICLES);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    destroy: () => { uniforms.destroy(); device.destroy(); }
  };
}

function canvasRenderer(canvas: HTMLCanvasElement, tint: [number, number, number]): Renderer | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const color = `rgb(${tint.map((value) => Math.round(value * 255)).join(' ')})`;
  let width = 1; let height = 1;
  return {
    resize: (w, h) => { width = w; height = h; },
    frame: (time, energy) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      context.globalCompositeOperation = 'lighter';
      const radius = Math.min(width, height) * 0.3;
      const angle = time * (0.08 + 0.22 * energy);
      for (let i = 0; i < FALLBACK_PARTICLES; i += 1) {
        const y = 1 - (i / (FALLBACK_PARTICLES - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = 2.39996323 * i + angle;
        const x = Math.cos(theta) * ring;
        const z = Math.sin(theta) * ring;
        const wave = 1 + 0.06 * Math.sin(time * (0.6 + energy * 1.4) + i + y * 4) * (0.4 + energy);
        const depth = 1 / (2.2 - z);
        // Stessa resa del percorso WebGPU: particelle vicine più grandi e luminose.
        const front = z * 0.5 + 0.5;
        const size = (1.2 + 2.4 * front) * (window.devicePixelRatio || 1) * (0.8 + 0.4 * energy);
        context.globalAlpha = Math.min(1, (0.35 + 0.65 * front) * (0.6 + 0.4 * energy));
        context.fillRect(width / 2 + x * radius * wave * depth * 1.7 - size / 2, height / 2 + y * radius * wave * depth * 1.7 - size / 2, size, size);
      }
      context.globalAlpha = 1;
    },
    destroy: () => {}
  };
}

/** Il nucleo si adatta allo stato con un'energia interpolata, mai con salti. */
export function Core({ state, className, level }: { state: CoreState; className?: string; level?: { current: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useRef(ENERGY[state]);
  base.current = ENERGY[state];
  // In ascolto l'entità respira con la voce dell'utente.
  const target = { get current() { return Math.min(1, base.current + (level?.current ?? 0) * 0.6); } };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: Renderer | null = null;
    let frame = 0;
    let disposed = false;
    let energy = target.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tint: [number, number, number] = [0.29, 0.9, 0.91];
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      renderer?.resize(canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    const started = performance.now();
    let tick = 0;
    const loop = () => {
      if (disposed || !renderer) return;
      energy += (target.current - energy) * 0.04;
      const time = reduced.matches ? 0 : (performance.now() - started) / 1000;
      // A riposo 30 fps bastano al respiro lento del nucleo: metà lavoro GPU e batteria.
      tick += 1;
      if (!(energy < 0.2 && tick % 2 === 1 && !reduced.matches)) renderer.frame(time, energy);
      if (!reduced.matches && document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };
    const wake = () => { cancelAnimationFrame(frame); if (document.visibilityState === 'visible') frame = requestAnimationFrame(loop); };
    (async () => {
      let backend = 'webgpu';
      renderer = await webgpuRenderer(canvas, tint).catch(() => null);
      if (!renderer) { backend = 'canvas'; renderer = canvasRenderer(canvas, tint); }
      if (disposed || !renderer) { renderer?.destroy(); return; }
      canvas.dataset.backend = backend;
      observer.observe(canvas);
      resize();
      wake();
    })();
    // Con movimento ridotto il loop è fermo: un cambio di stato ridisegna un frame.
    const redraw = () => { if (reduced.matches) { energy = target.current; wake(); } };
    document.addEventListener('visibilitychange', wake);
    reduced.addEventListener('change', wake);
    canvas.addEventListener('nxs-core-state', redraw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      reduced.removeEventListener('change', wake);
      canvas.removeEventListener('nxs-core-state', redraw);
      renderer?.destroy();
    };
  }, []);

  useEffect(() => { canvasRef.current?.dispatchEvent(new Event('nxs-core-state')); }, [state]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" data-state={state} />;
}
