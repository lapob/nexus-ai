/**
 * @module web/core-breath
 * @description Respiro del nucleo (stesso linguaggio di movimento del sito): il nucleo si
 * scompone e si ricompone a onda, fiorendo verso l'esterno (zoom in) e collassando in un
 * cuore denso (zoom out). Funzione pura del tempo: identica a 30/60/120/144 Hz.
 * La versione WGSL qui sotto è la traduzione esatta delle funzioni JavaScript.
 */

/** Un respiro in tempo "ambiente" (0.8× il tempo reale): ≈13,75 s. */
export const CORE_BREATH_PERIOD = 11;
export const CORE_BREATH_RATE = 0.8;

const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * 0 = forma composta; verso +1 fiorisce (si disperde e si avvicina), verso −1 collassa.
 * I cicli alternano fioritura e collasso; `stagger` sfasa ogni particella. Vale 0 con
 * pendenza nulla a ogni confine di ciclo, quindi l'alternanza non salta mai.
 */
export function coreBreath(time: number, stagger: number) {
  const cycle = (time * CORE_BREATH_RATE) / CORE_BREATH_PERIOD - stagger;
  const index = Math.floor(cycle);
  const phase = cycle - index;
  const scatter = smoother((phase - 0.34) / 0.22) * (1 - smoother((phase - 0.66) / 0.3));
  return (index & 1) === 0 ? scatter : -scatter;
}

/** Sposta un punto (spazio unitario) lungo il respiro `b`: flusso coerente, mai rumore. */
export function breatheCorePoint(out: { x: number; y: number; z: number }, x: number, y: number, z: number, b: number, seed: number, time: number) {
  const s = Math.abs(b);
  if (s < 1e-4) { out.x = x; out.y = y; out.z = z; return out; }
  const t = time * CORE_BREATH_RATE;
  const flow = Math.sin(x * 4.1 + t * 0.21 + seed * 6.2831853) * 1.7 + Math.cos(y * 3.3 - t * 0.17) * 1.7;
  const fx = Math.cos(flow), fy = Math.sin(flow);
  if (b > 0) {
    const grow = 1 + 0.44 * s * (0.6 + 0.4 * seed);
    const c = Math.cos(0.38 * s), n = Math.sin(0.38 * s);
    out.x = (x * c - y * n) * grow + fx * 0.13 * s;
    out.y = (x * n + y * c) * grow + fy * 0.13 * s;
    out.z = z * grow + Math.sin(flow * 1.3 + seed * 6.2831853) * 0.1 * s;
  } else {
    const shrink = 1 - 0.58 * s * (0.55 + 0.45 * seed);
    const c = Math.cos(-1.05 * s), n = Math.sin(-1.05 * s);
    out.x = (x * c - y * n) * shrink + fx * 0.035 * s;
    out.y = (x * n + y * c) * shrink + fy * 0.035 * s;
    out.z = z * shrink;
  }
  return out;
}

/** Zoom dell'intero nucleo, leggermente in anticipo sui grani, con un'inspirazione morbida. */
export function coreZoom(time: number) {
  const t = time * CORE_BREATH_RATE;
  return 1 + 0.1 * coreBreath(time, -0.03) + 0.018 * Math.sin((t * Math.PI * 2) / (CORE_BREATH_PERIOD / 3));
}

/**
 * Traduzione WGSL di coreBreath (cb) / breatheCorePoint (bp) / coreZoom (cz), stesse costanti.
 * Scritta compatta di proposito: il testo dello shader non passa dal minificatore e
 * conta nel budget d'avvio del bundle.
 */
export const CORE_BREATH_WGSL = /* wgsl */ `
fn sm(t:f32)->f32{let x=clamp(t,0.,1.);return x*x*x*(x*(x*6.-15.)+10.);}
fn cb(t:f32,g:f32)->f32{let c=t*${CORE_BREATH_RATE}/${CORE_BREATH_PERIOD}.-g;let i=floor(c);let h=c-i;let s=sm((h-.34)/.22)*(1.-sm((h-.66)/.3));return select(-s,s,fract(i*.5)<.25);}
fn bp(p:vec3f,b:f32,e:f32,t0:f32)->vec3f{let s=abs(b);if(s<.0001){return p;}let t=t0*${CORE_BREATH_RATE};let w=sin(p.x*4.1+t*.21+e*6.2831853)*1.7+cos(p.y*3.3-t*.17)*1.7;let f=vec2f(cos(w),sin(w));let o=b>0.;let k=select(1.-.58*s*(.55+.45*e),1.+.44*s*(.6+.4*e),o);let a=select(-1.05,.38,o)*s;let c=cos(a);let n=sin(a);return vec3f(vec2f(p.x*c-p.y*n,p.x*n+p.y*c)*k+f*select(.035,.13,o)*s,p.z*k+select(0.,sin(w*1.3+e*6.2831853)*.1*s,o));}
fn cz(t:f32)->f32{return 1.+.1*cb(t,-.03)+.018*sin(t*${CORE_BREATH_RATE}*6.2831853/(${CORE_BREATH_PERIOD}./3.));}
`;
