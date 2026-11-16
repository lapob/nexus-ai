/**
 * @module web/core-render
 * @description Motore del nucleo di particelle: WebGPU nativo (posizioni calcolate nello shader WGSL), fallback
 * Canvas 2D, ritmo e risoluzione adattivi. Gira identico in un worker (OffscreenCanvas, indipendente dal
 * thread della pagina: il nucleo non si ferma quando la UI rende, scorre o compone) o sul thread principale.
 * Nessun accesso al DOM: dimensioni, area visibile, movimento ridotto e visibilità arrivano dall'host (Core.tsx).
 */
import { breatheCorePoint, coreBreath, coreZoom, CORE_BREATH_WGSL } from './core-breath';
import { CORE_ENERGY, coreMood, pointerInfluence, pointerTilt, POINTER_TILT } from './nexus-core';

export type { CoreState } from './nexus-core';
/** Energie degli stati: dal modulo condiviso `nexus-core` (stesse del sito e di Control). */
export const ENERGY = CORE_ENERGY;

// Tre popolazioni: guscio sferico, due anelli orbitali "HUD" a segmenti, nucleo interno.
const SPHERE = 5_200;
const RING = 900;
const INNER = 500;
const PARTICLES = SPHERE + RING * 2 + INNER;
const FALLBACK_PARTICLES = 1_600;
// Il canvas è SPREAD volte il riquadro del nucleo (styles.css): nella fioritura le particelle arrivano
// a ~2,7× il raggio e prima venivano tagliate di netto dal bordo del canvas ("chiuso in un box").
export const SPREAD = 2;
// Sfumatura (px CSS) verso i bordi del contenitore che ritaglia il canvas (lo stage, overflow: clip).
export const FEATHER = 64;

// Ogni istanza è un quad; la posizione nasce da un hash dell'indice (distribuzione
// di Fibonacci sulla sfera, oppure orbite inclinate) e da onde dipendenti da tempo ed energia.
// Popolazioni: sfera di Fibonacci; anelli orbitali su piani inclinati opposti, segmenti
// luminosi che scorrono come dati; nucleo interno denso e più bianco che pulsa con l'energia.
// Respiro: tint.w è l'ampiezza (0 con movimento ridotto, sale piano all'avvio); `g` sfasa
// ogni particella, così il nucleo si scompone a onda (fiorisce o collassa) e si ricompone.
// Frammento: punto nitido con bordo antialias più un alone leggero, mai una macchia.
// Dissolvenza: oltre ~0,6 del canvas (cerchio) e a FEATHER px dai bordi visibili (u.clip, in NDC)
// la particella perde luce e dimensione fino a sparire nel vuoto; mai un taglio netto.
// Reazione (u.pointer): xy = puntatore in NDC, z = influenza che svanisce dopo l'ultimo movimento, w = luce
// (più bassa con il server non raggiungibile). Il nucleo s'inclina verso il puntatore e i grani vicini si accendono.
// (I commenti stanno fuori dalla stringa: il testo WGSL entra intero nel bundle.)
const SHADER = /* wgsl */ `
struct U{time:f32,energy:f32,aspect:f32,scale:f32,tint:vec4f,clip:vec4f,feather:vec4f,pointer:vec4f};
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
}else if(instance<${SPHERE + RING * 2}u){
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
let k=i-f32(${SPHERE + RING * 2});
let y=1.-(k/f32(${INNER - 1}))*2.;
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
let ta=clamp(u.pointer.xy,vec2f(-1.),vec2f(1.))*${POINTER_TILT}*u.pointer.z;
p=rotX(rotY(p,ta.x),-ta.y);
p=rotX(p,.35);
let dp=1./(2.2-p.z);
let cs=array<vec2f,4>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(1.,1.));
let cn=cs[vertex];
let c=vec2f(p.x*dp/u.aspect,p.y*dp)*${(1.9 / SPREAD).toFixed(3)}*u.scale;
let ed=min(c-u.clip.xy,u.clip.zw-c)/u.feather.xy;
let fd=(1.-smoothstep(.56,.97,length(c*vec2f(u.aspect,1.))))*smoothstep(0.,1.,min(ed.x,ed.y));
let size=(.0035+.006*hash(i+7.))*(1.+u.energy*.6)*u.scale*sb*${(1 / SPREAD).toFixed(3)}*(.35+.65*fd);
var out:Out;
out.position=select(vec4f(c+cn*vec2f(size/u.aspect,size),0.,1.),vec4f(0.,0.,2.,1.),fd<.002);
out.local=cn;
let hd=length((c-u.pointer.xy)*vec2f(u.aspect,1.));
out.glow=(.35+.65*(p.z*.5+.5))*(.55+.45*u.energy)*br*fd*u.pointer.w*(1.+.55*u.pointer.z*exp(-hd*hd*18.));
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

/** Area visibile del canvas in NDC [sinistra, basso, destra, alto] e sfumatura in NDC [x, y]. */
export type Clip = { rect: [number, number, number, number]; feather: [number, number] };
type Surface = HTMLCanvasElement | OffscreenCanvas;
/** Reazione del nucleo in un fotogramma: puntatore (NDC), sua influenza, tinta e luce secondo lo stato del server. */
type Reaction = { x: number; y: number; influence: number; tint: [number, number, number]; glow: number };
type Renderer = { frame: (time: number, energy: number, breath: number, clip: Clip, react: Reaction) => void; resize: (width: number, height: number) => void; destroy: () => void };

// Tipi WebGPU minimi e locali: niente dipendenza @webgpu/types da installare.
/* eslint-disable @typescript-eslint/no-explicit-any */
type GpuAny = any;
const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;

async function webgpuRenderer(canvas: Surface): Promise<Renderer | null> {
  const gpu: GpuAny = (navigator as unknown as { gpu?: GpuAny }).gpu;
  if (!gpu) return null;
  const adapter: GpuAny = await gpu.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
  if (!adapter) return null;
  const device: GpuAny = await adapter.requestDevice().catch(() => null);
  if (!device) return null;
  const context: GpuAny = (canvas as HTMLCanvasElement).getContext('webgpu' as '2d');
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
  const uniforms = device.createBuffer({ size: 80, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniforms } }] });
  const data = new Float32Array(20);
  let aspect = 1;
  let lost = false;
  device.lost.then(() => { lost = true; });
  return {
    resize: (width, height) => { aspect = width / Math.max(1, height); },
    frame: (time, energy, breath, clip, react) => {
      if (lost) return;
      const { tint } = react;
      data.set([time, energy, aspect, Math.min(1, aspect < 1 ? aspect * 1.25 : 1), tint[0], tint[1], tint[2], breath, ...clip.rect, ...clip.feather, 0, 0,
        react.x, react.y, react.influence, react.glow]);
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

function canvasRenderer(canvas: Surface, density: () => number): Renderer | null {
  const context = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D | null;
  if (!context) return null;
  let width = 1; let height = 1;
  const point = { x: 0, y: 0, z: 0 };
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    resize: (w, h) => { width = w; height = h; },
    frame: (time, energy, breath, clip, react) => {
      const color = `rgb(${react.tint.map((value) => Math.round(value * 255)).join(' ')})`;
      // Stessa inclinazione verso il puntatore e stessa accensione locale dello shader.
      const [tiltY, tiltX] = pointerTilt(react.x, react.y, react.influence);
      const cy = Math.cos(tiltY), sy0 = Math.sin(tiltY), cx = Math.cos(tiltX), sx0 = Math.sin(tiltX);
      const pointerX = (react.x + 1) * width / 2, pointerY = (1 - react.y) * height / 2;
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      context.globalCompositeOperation = 'lighter';
      const zoom = 1 + (coreZoom(time) - 1) * breath;
      const half = Math.min(width, height) / 2;
      const radius = half * 0.6 / SPREAD * zoom;
      const dpr = density();
      // Stessa dissolvenza dello shader, in pixel del canvas.
      const [left, bottom, right, top] = clip.rect;
      const edgeX = clip.feather[0] * width / 2, edgeY = clip.feather[1] * height / 2;
      const fade = (x: number, y: number) => (1 - smooth(0.56, 0.97, Math.hypot(x - width / 2, y - height / 2) / half))
        * smooth(0, 1, Math.min((x - (left + 1) * width / 2) / edgeX, ((right + 1) * width / 2 - x) / edgeX, (y - (1 - top) * height / 2) / edgeY, ((1 - bottom) * height / 2 - y) / edgeY));
      const angle = time * (0.08 + 0.22 * energy);
      for (let i = 0; i < FALLBACK_PARTICLES; i += 1) {
        const y = 1 - (i / (FALLBACK_PARTICLES - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = 2.39996323 * i + angle;
        const seed = (i * 0.7548776662) % 1;
        // Stesso respiro del percorso WebGPU: scomposizione a onda dall'alto verso il basso.
        const b = breath * coreBreath(time, seed * 0.16 + 0.04 + (1 - y) * 0.07);
        const p = breatheCorePoint(point, Math.cos(theta) * ring, y, Math.sin(theta) * ring, b, seed, time);
        if (react.influence > 0) {
          const x1 = cy * p.x + sy0 * p.z, z1 = -sy0 * p.x + cy * p.z;
          const y2 = cx * p.y - sx0 * z1;
          p.z = sx0 * p.y + cx * z1; p.x = x1; p.y = y2;
        }
        const wave = 1 + 0.06 * Math.sin(time * (0.6 + energy * 1.4) + i + y * 4) * (0.4 + energy);
        const depth = 1 / (2.2 - p.z);
        // Stessa resa del percorso WebGPU: particelle vicine più grandi e luminose.
        const front = Math.min(1, Math.max(0, p.z * 0.5 + 0.5));
        const sx = width / 2 + p.x * radius * wave * depth * 1.7, sy = height / 2 + p.y * radius * wave * depth * 1.7;
        const f = fade(sx, sy);
        if (f < 0.002) continue;
        const size = (1.2 + 2.4 * front) * dpr * (0.8 + 0.4 * energy) * (0.35 + 0.65 * f);
        const near = react.influence > 0 ? Math.hypot((sx - pointerX) / (height / 2), (sy - pointerY) / (height / 2)) : 9;
        const lift = react.glow * (1 + 0.55 * react.influence * Math.exp(-near * near * 18));
        context.globalAlpha = Math.min(1, (0.35 + 0.65 * front) * (0.6 + 0.4 * energy) * (1 - 0.26 * Math.abs(b)) * f * lift);
        context.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
      // Anelli orbitali a segmenti, come nel percorso WebGPU.
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, dpr * 1.2);
      for (const [index, [scale, tilt, dash]] of ([[1.42, 0.42, 9], [1.56, -0.55, 14]] as const).entries()) {
        const direction = index ? -1 : 1;
        const circumference = Math.PI * 2 * radius * scale;
        context.globalAlpha = (0.35 + 0.35 * energy) * react.glow;
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

/** Messaggi dall'host al motore (uguali per worker e thread principale). */
export type CoreInput =
  | { type: 'size'; width: number; height: number; dpr: number }
  | { type: 'clip'; clip: Clip }
  | { type: 'energy'; target: number }
  | { type: 'reduced'; reduced: boolean }
  | { type: 'visible'; visible: boolean }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'mood'; offline: boolean }
  | { type: 'stats' };
/** Notizie dal motore all'host: backend scelto, qualità adattiva, istante QA disegnato, intervalli tra fotogrammi. */
export type CoreOutput = { type: 'info'; backend?: string; quality?: string; qa?: 'ready' } | { type: 'stats'; intervals: number[] };

/**
 * Avvia il motore su `canvas`. `startedAt` è un tempo assoluto (timeOrigin + now) condiviso con l'host,
 * così il respiro del nucleo e quello della UI (--core-breath) restano allineati anche tra thread.
 * `still` (secondi reali, da `?nxs-qa-time`): un solo istante fisso, energia assestata, nessuna reazione al puntatore.
 */
export function startCoreEngine(canvas: Surface, startedAt: number, energy0: number, reduced0: boolean, emit: (message: CoreOutput) => void, still: number | null = null) {
  const now = () => performance.timeOrigin + performance.now();
  let renderer: Renderer | null = null;
  // Puntatore: ultima posizione nota (resta) e istante dell'ultimo movimento (l'influenza svanisce da lì).
  const pointer = { x: 0, y: 0, at: -Infinity };
  let offlineTarget = 0, offline = 0, lastMood = 0;
  const react: Reaction = { x: 0, y: 0, influence: 0, tint: coreMood(0).tint, glow: 1 };
  let backend = 'webgpu';
  let disposed = false;
  let frame = 0;
  let energy = energy0, target = energy0;
  let reduced = reduced0, visible = true;
  let clip: Clip = { rect: [-1, -1, 1, 1], feather: [0.08, 0.08] };
  let size = { width: 1, height: 1, dpr: 1 };
  // Risoluzione adattiva: densità reale dello schermo (fino a 3× in WebGPU, 2× in Canvas),
  // al massimo ~4K di pixel; se i fotogrammi rallentano scende, quando torna fluido risale.
  let quality = 1;
  let throttle = false; // con la GPU impegnata (es. dal modello) si dimezzano i fotogrammi, non la nitidezza
  const apply = () => {
    const cap = backend === 'canvas' ? 2 : 3;
    // Mai sotto la densità nativa (almeno 1 pixel reale per pixel CSS).
    let ratio = Math.max(Math.min(size.dpr, cap) * quality, Math.min(size.dpr, 1.5));
    const budget = 3840 * 2160;
    if (size.width * size.height * ratio * ratio > budget) ratio = Math.sqrt(budget / Math.max(1, size.width * size.height));
    const width = Math.max(1, Math.round(size.width * ratio)), height = Math.max(1, Math.round(size.height * ratio));
    // Assegnare width/height rialloca la superficie anche a valori invariati: solo se cambiano davvero.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    renderer?.resize(canvas.width, canvas.height);
    emit({ type: 'info', quality: quality.toFixed(2) });
  };
  let last = 0, spent = 0, samples = 0;
  let previous = 0;
  const intervals: number[] = [];
  const adapt = (at: number) => {
    if (previous && intervals.length < 40_000) intervals.push(at - previous);
    previous = at;
    if (last && at - last < 250) { spent += at - last; samples += 1; } // salta pause e cambi scheda
    last = at;
    if (samples < 90) return;
    const average = spent / samples;
    spent = 0; samples = 0;
    // Prima si riduce il ritmo (30 fps), poi — solo sugli schermi ad altissima densità — la risoluzione.
    if (average > 24 && !throttle) { throttle = true; return; }
    if (average < 15 && throttle && quality >= 1) { throttle = false; return; }
    const next = average > 30 ? Math.max(0.6, quality * 0.9) : average < 18.5 && quality < 1 ? Math.min(1, quality * 1.12) : quality;
    if (Math.abs(next - quality) > 0.01) { quality = next; apply(); }
  };
  let tick = 0;
  // Fermo: movimento ridotto o istante QA. Il loop non gira, ogni cambiamento ridisegna un fotogramma.
  const halted = () => reduced || still !== null;
  let qaAnnounced = false;
  const loop = (at: number) => {
    if (disposed || !renderer) return;
    adapt(at);
    const clock = now();
    // Stato del server: transizione a tempo (~0,6 s), istantanea quando il nucleo è fermo.
    const moodStep = halted() || !lastMood ? 1 : 1 - Math.exp(-Math.min(0.25, (clock - lastMood) / 1000) * 3.5);
    lastMood = clock;
    offline += (offlineTarget - offline) * moodStep;
    const mood = coreMood(offline);
    energy = still !== null ? target : energy + (target - energy) * 0.04;
    const time = still ?? (reduced ? 0 : (clock - startedAt) / 1000);
    // Il respiro entra piano (~3 s) dopo l'avvio; con movimento ridotto il nucleo resta composto.
    const ramp = reduced ? 0 : Math.min(1, Math.max(0, (time - 1.2) / 3));
    const breath = ramp * ramp * (3 - 2 * ramp);
    react.x = pointer.x; react.y = pointer.y;
    react.influence = halted() ? 0 : pointerInfluence((clock - pointer.at) / 1000);
    react.tint = mood.tint; react.glow = mood.glow;
    // Il nucleo respira sempre: fotogrammi pieni (60/120/144/240 Hz). Solo con la GPU
    // impegnata (es. dal modello) si dimezza il ritmo, mai la nitidezza.
    tick += 1;
    if (!(throttle && tick % 2 === 1 && !halted())) renderer.frame(time, Math.min(energy, mood.energyCap), breath, clip, react);
    if (still !== null && !qaAnnounced) { qaAnnounced = true; emit({ type: 'info', qa: 'ready' }); }
    if (!halted() && visible) frame = requestAnimationFrame(loop);
  };
  const wake = () => { cancelAnimationFrame(frame); last = 0; previous = 0; if (visible) frame = requestAnimationFrame(loop); };
  (async () => {
    renderer = await webgpuRenderer(canvas).catch(() => null);
    if (!renderer) { backend = 'canvas'; renderer = canvasRenderer(canvas, () => size.dpr); }
    if (disposed || !renderer) { renderer?.destroy(); return; }
    emit({ type: 'info', backend });
    apply();
    wake();
  })();
  return {
    send(message: CoreInput) {
      switch (message.type) {
        case 'size': size = message; apply(); if (halted()) wake(); break;
        case 'clip': clip = message.clip; if (halted()) wake(); break;
        // A nucleo fermo un cambio di stato ridisegna un frame.
        case 'energy': target = message.target; if (halted()) { energy = target; wake(); } break;
        case 'reduced': reduced = message.reduced; wake(); break;
        case 'visible': visible = message.visible; wake(); break;
        case 'pointer': if (!halted()) { pointer.x = message.x; pointer.y = message.y; pointer.at = now(); } break;
        case 'mood': offlineTarget = message.offline ? 1 : 0; if (halted()) wake(); break;
        case 'stats': emit({ type: 'stats', intervals: intervals.splice(0) }); break;
      }
    },
    destroy() { disposed = true; cancelAnimationFrame(frame); renderer?.destroy(); }
  };
}
