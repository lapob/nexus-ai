/**
 * @module web/Core
 * @description Nucleo di particelle NexusNXS: WebGPU nativo (posizioni calcolate nello shader WGSL), fallback Canvas 2D, pausa in background e movimento ridotto.
 */
import { useEffect, useRef } from 'react';
import { breatheCorePoint, coreBreath, coreZoom, CORE_BREATH_WGSL } from './core-breath';

export type CoreState = 'idle' | 'listening' | 'thinking' | 'responding' | 'speaking' | 'error';

// Tre popolazioni: guscio sferico, due anelli orbitali "HUD" a segmenti, nucleo interno.
const SPHERE = 5_200;
const RING = 900;
const INNER = 500;
const PARTICLES = SPHERE + RING * 2 + INNER;
const FALLBACK_PARTICLES = 1_600;
const ENERGY: Record<CoreState, number> = { idle: 0.15, listening: 0.4, thinking: 0.6, responding: 1, speaking: 0.85, error: 0.35 };

// Ogni istanza è un quad; la posizione nasce da un hash dell'indice (distribuzione
// di Fibonacci sulla sfera, oppure orbite inclinate) e da onde dipendenti da tempo ed energia.
// Popolazioni: sfera di Fibonacci; anelli orbitali su piani inclinati opposti, segmenti
// luminosi che scorrono come dati; nucleo interno denso e più bianco che pulsa con l'energia.
// Respiro: tint.w è l'ampiezza (0 con movimento ridotto, sale piano all'avvio); `g` sfasa
// ogni particella, così il nucleo si scompone a onda (fiorisce o collassa) e si ricompone.
// Frammento: punto nitido con bordo antialias più un alone leggero, mai una macchia.
// (I commenti stanno fuori dalla stringa: il testo WGSL entra intero nel bundle d'avvio.)
const SHADER = /* wgsl */ `
struct U{time:f32,energy:f32,aspect:f32,scale:f32,tint:vec4f};
@group(0)@binding(0)var<uniform>u:U;
${CORE_BREATH_WGSL}
struct Out{@builtin(position)position:vec4f,@location(0)local:vec2f,@location(1)glow:f32,@location(2)white:f32};
fn hash(n:f32)->f32{return fract(sin(n*12.9898)*43758.5453);}
fn rotY(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
fn rotX(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
fn rotZ(p:vec3f,a:f32)->vec3f{let c=cos(a);let s=sin(a);return vec3f(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
@vertex
fn vs(@builtin(vertex_index)vertex:u32,@builtin(instance_index)instance:u32)->Out{
let i=f32(instance);
let e0=hash(i);
var p:vec3f;
var br=1.;
var white=0.;
var sb=1.;
var g=0.;
if(instance<${SPHERE}u){
let ct=f32(${SPHERE});
let y=1.-(i/(ct-1.))*2.;
let ring=sqrt(max(0.,1.-y*y));
let th=2.39996323*i;
let wave=sin(u.time*(.6+u.energy*1.4)+e0*6.2831+y*4.);
let rd=.62+.05*wave*(.4+u.energy)+.12*(e0-.5)*u.energy;
p=rotY(vec3f(cos(th)*ring,y,sin(th)*ring)*rd,u.time*(.08+.22*u.energy));
g=.04+(1.-y)*.07;
}else if(instance<${SPHERE+RING*2}u){
let k=i-f32(${SPHERE});
let sd=k>=f32(${RING});
let j=select(k,k-f32(${RING}),sd);
let a=j/f32(${RING})*6.2831853;
let dir=select(1.,-1.,sd);
let sp=u.time*dir*(.12+.35*u.energy);
let rd=select(.88,.97,sd)+.012*(e0-.5);
p=vec3f(cos(a+sp)*rd,.006*(e0-.5),sin(a+sp)*rd);
p=rotX(p,select(.22,-.3,sd));
p=rotZ(p,select(.38,-.5,sd));
let da=fract(a*select(9.,14.,sd)/6.2831853-u.time*.15*dir);
br=select(.25,1.7,da<select(.55,.35,sd))*(.6+.4*u.energy);
white=.4;
sb=1.1;
g=.17+j/f32(${RING})*.1;
}else{
let k=i-f32(${SPHERE+RING*2});
let y=1.-(k/f32(${INNER-1}))*2.;
let ring=sqrt(max(0.,1.-y*y));
let th=2.39996323*k;
let pu=1.+.18*sin(u.time*(1.2+2.4*u.energy)+e0*3.)*(.3+u.energy);
p=rotY(vec3f(cos(th)*ring,y,sin(th)*ring)*(.14+.1*e0)*pu,-u.time*.4);
white=.7;
br=.8+.6*u.energy;
sb=1.3;
}
let b=u.tint.w*cb(u.time,e0*.16+g);
p=bp(p,b,hash(i+3.),u.time)*mix(1.,cz(u.time),u.tint.w);
br*=1.-.26*abs(b);
p=rotX(p,.35);
let dp=1./(2.2-p.z);
let cs=array<vec2f,4>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(1.,1.));
let cn=cs[vertex];
let size=(.0035+.006*hash(i+7.))*(1.+u.energy*.6)*u.scale*sb;
var out:Out;
out.position=vec4f(vec2f(p.x*dp/u.aspect,p.y*dp)*1.9*u.scale+cn*vec2f(size/u.aspect,size),0.,1.);
out.local=cn;
out.glow=(.35+.65*(p.z*.5+.5))*(.55+.45*u.energy)*br;
out.white=white;
return out;
}
@fragment
fn fs(ip:Out)->@location(0)vec4f{
let d=dot(ip.local,ip.local);
if(d>1.){discard;}
let fo=(1.-smoothstep(.2,.55,d))*.85+exp(-d*5.)*.35;
let co=mix(u.tint.rgb,vec3f(.92,1.,1.),ip.white);
return vec4f(co*fo*ip.glow,fo*ip.glow);
}
`;

type Renderer = { frame: (time: number, energy: number, breath: number) => void; resize: (width: number, height: number) => void; destroy: () => void };

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
    frame: (time, energy, breath) => {
      if (lost) return;
      data.set([time, energy, aspect, Math.min(1, aspect < 1 ? aspect * 1.25 : 1), tint[0], tint[1], tint[2], breath]);
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
  const point = { x: 0, y: 0, z: 0 };
  return {
    resize: (w, h) => { width = w; height = h; },
    frame: (time, energy, breath) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      context.globalCompositeOperation = 'lighter';
      const zoom = 1 + (coreZoom(time) - 1) * breath;
      const radius = Math.min(width, height) * 0.3 * zoom;
      const angle = time * (0.08 + 0.22 * energy);
      for (let i = 0; i < FALLBACK_PARTICLES; i += 1) {
        const y = 1 - (i / (FALLBACK_PARTICLES - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = 2.39996323 * i + angle;
        const seed = (i * 0.7548776662) % 1;
        // Stesso respiro del percorso WebGPU: scomposizione a onda dall'alto verso il basso.
        const b = breath * coreBreath(time, seed * 0.16 + 0.04 + (1 - y) * 0.07);
        const p = breatheCorePoint(point, Math.cos(theta) * ring, y, Math.sin(theta) * ring, b, seed, time);
        const wave = 1 + 0.06 * Math.sin(time * (0.6 + energy * 1.4) + i + y * 4) * (0.4 + energy);
        const depth = 1 / (2.2 - p.z);
        // Stessa resa del percorso WebGPU: particelle vicine più grandi e luminose.
        const front = Math.min(1, Math.max(0, p.z * 0.5 + 0.5));
        const size = (1.2 + 2.4 * front) * (window.devicePixelRatio || 1) * (0.8 + 0.4 * energy);
        context.globalAlpha = Math.min(1, (0.35 + 0.65 * front) * (0.6 + 0.4 * energy) * (1 - 0.26 * Math.abs(b)));
        context.fillRect(width / 2 + p.x * radius * wave * depth * 1.7 - size / 2, height / 2 + p.y * radius * wave * depth * 1.7 - size / 2, size, size);
      }
      // Anelli orbitali a segmenti, come nel percorso WebGPU.
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.2);
      for (const [index, [scale, tilt, dash]] of ([[1.42, 0.42, 9], [1.56, -0.55, 14]] as const).entries()) {
        const direction = index ? -1 : 1;
        const circumference = Math.PI * 2 * radius * scale;
        context.globalAlpha = 0.35 + 0.35 * energy;
        context.setLineDash([circumference / dash * 0.5, circumference / dash * 0.5]);
        context.lineDashOffset = -direction * time * 40 * (0.3 + energy);
        context.beginPath();
        context.ellipse(width / 2, height / 2, radius * scale, radius * scale * 0.34, tilt, 0, Math.PI * 2);
        context.stroke();
      }
      context.setLineDash([]);
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
    // Risoluzione adattiva: densità reale dello schermo (fino a 3× in WebGPU, 2× in Canvas),
    // al massimo ~4K di pixel; se i fotogrammi rallentano scende, quando torna fluido risale.
    let quality = 1;
    let throttle = false; // con la GPU impegnata (es. dal modello) si dimezzano i fotogrammi, non la nitidezza
    const resize = () => {
      const cap = canvas.dataset.backend === 'canvas' ? 2 : 3;
      // Dimensione di layout × scala CSS effettiva: il ResizeObserver non vede le trasformazioni
      // (hero 0.82 → ambiente 1.25) e senza questo il bitmap veniva ingrandito e sfocato.
      const layoutWidth = canvas.clientWidth || 1;
      const layoutHeight = canvas.clientHeight || 1;
      const box = canvas.getBoundingClientRect();
      const scale = Math.max(1, box.width / layoutWidth, box.height / layoutHeight);
      const width = layoutWidth * scale;
      const height = layoutHeight * scale;
      const dpr = window.devicePixelRatio || 1;
      // Mai sotto la densità nativa (almeno 1 pixel reale per pixel CSS).
      let ratio = Math.max(Math.min(dpr, cap) * quality, Math.min(dpr, 1.5));
      const budget = 3840 * 2160;
      if (width * height * ratio * ratio > budget) ratio = Math.sqrt(budget / Math.max(1, width * height));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.dataset.quality = quality.toFixed(2);
      renderer?.resize(canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    const started = performance.now();
    let tick = 0;
    let breathing: NodeListOf<HTMLElement> | HTMLElement[] = [];
    let lastPulse = '';
    let last = 0, spent = 0, samples = 0;
    const adapt = (now: number) => {
      if (last && now - last < 250) { spent += now - last; samples += 1; } // salta pause e cambi scheda
      last = now;
      if (samples < 90) return;
      const average = spent / samples;
      spent = 0; samples = 0;
      // Prima si riduce il ritmo (30 fps), poi — solo sugli schermi ad altissima densità — la risoluzione.
      if (average > 24 && !throttle) { throttle = true; return; }
      if (average < 15 && throttle && quality >= 1) { throttle = false; return; }
      const next = average > 30 ? Math.max(0.6, quality * 0.9) : average < 18.5 && quality < 1 ? Math.min(1, quality * 1.12) : quality;
      if (Math.abs(next - quality) > 0.01) { quality = next; resize(); }
    };
    const loop = () => {
      if (disposed || !renderer) return;
      adapt(performance.now());
      energy += (target.current - energy) * 0.04;
      const time = reduced.matches ? 0 : (performance.now() - started) / 1000;
      // Il respiro entra piano (~3 s) dopo l'avvio; con movimento ridotto il nucleo resta composto.
      const ramp = reduced.matches ? 0 : Math.min(1, Math.max(0, (time - 1.2) / 3));
      const breath = ramp * ramp * (3 - 2 * ramp);
      // Il nucleo respira sempre: fotogrammi pieni (60/120/144 Hz). Solo con la GPU
      // impegnata (es. dal modello) si dimezza il ritmo, mai la nitidezza.
      tick += 1;
      if (!(throttle && tick % 2 === 1 && !reduced.matches)) renderer.frame(time, energy, breath);
      const pulse = (breath * coreBreath(time, 0)).toFixed(3);
      canvas.dataset.breath = pulse;
      // La UI respira con il nucleo: --core-breath solo sugli elementi [data-core-breath] (pochi, ricercati ogni 10 fotogrammi:
      // un elemento appena montato si aggancia in una frazione di secondo, mentre il respiro è ancora vicino a dove era).
      if (tick % 10 === 1) { breathing = document.querySelectorAll<HTMLElement>('[data-core-breath]'); lastPulse = ''; }
      if (pulse !== lastPulse) { lastPulse = pulse; breathing.forEach((element) => element.style.setProperty('--core-breath', pulse)); }
      if (!reduced.matches && document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };
    const wake = () => { cancelAnimationFrame(frame); last = 0; if (document.visibilityState === 'visible') frame = requestAnimationFrame(loop); };
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
    // Fine di una transizione di scala del contenitore: ricalcola il bitmap alla nuova dimensione reale.
    const layer = canvas.parentElement;
    const settle = (event: TransitionEvent) => { if (event.propertyName === 'transform' || event.propertyName === 'scale') resize(); };
    layer?.addEventListener('transitionend', settle);
    // Zoom del browser o finestra spostata su un monitor diverso: la densità cambia, il bitmap si rifà nitido.
    let density: MediaQueryList | null = null;
    const watchDensity = () => {
      density?.removeEventListener('change', onDensity);
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      density.addEventListener('change', onDensity);
    };
    function onDensity() { resize(); watchDensity(); }
    watchDensity();
    return () => {
      density?.removeEventListener('change', onDensity);
      layer?.removeEventListener('transitionend', settle);
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
