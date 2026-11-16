/**
 * @module web/core-breath
 * @description Respiro del nucleo in secondi reali, per il motore dell'app: adatta il modulo condiviso
 * `nexus-core` (tempo ambiente) e ne porta la traduzione WGSL esatta. Funzione pura del tempo: identica a
 * 30/60/120/144 Hz.
 */
import { ambientTime, breatheCorePoint as breatheShared, coreBreath as breathShared, coreZoom as zoomShared, CORE_BREATH_PERIOD, CORE_BREATH_RATE } from './nexus-core.ts';

// Estensione esplicita: i test Node eseguono questo file direttamente (type stripping, nessun bundler).
export { CORE_BREATH_PERIOD, CORE_BREATH_RATE } from './nexus-core.ts';

/** Respiro a `time` secondi reali (vedi `coreBreath` del modulo condiviso). */
export const coreBreath = (time: number, stagger: number) => breathShared(ambientTime(time), stagger);

/** Un grano con il proprio `seed` 0..1: fase e profondità derivano dallo stesso seme, come nello shader. */
export const breatheCorePoint = (out: { x: number; y: number; z: number }, x: number, y: number, z: number, b: number, seed: number, time: number) =>
  breatheShared(out, x, y, z, b, seed * 6.2831853, seed, ambientTime(time));

export const coreZoom = (time: number) => zoomShared(ambientTime(time));

/**
 * Traduzione WGSL di coreBreath (cb) / breatheCorePoint (bp) / coreZoom (cz), stesse costanti, tempo reale.
 * Scritta compatta di proposito: il testo dello shader non passa dal minificatore e conta nel budget d'avvio.
 */
export const CORE_BREATH_WGSL = /* wgsl */ `
fn sm(t:f32)->f32{let x=clamp(t,0.,1.);return x*x*x*(x*(x*6.-15.)+10.);}
fn cb(t:f32,g:f32)->f32{let c=t*${CORE_BREATH_RATE}/${CORE_BREATH_PERIOD}.-g;let i=floor(c);let h=c-i;let s=sm((h-.34)/.22)*(1.-sm((h-.66)/.3));return select(-s,s,fract(i*.5)<.25);}
fn bp(p:vec3f,b:f32,e:f32,t0:f32)->vec3f{let s=abs(b);if(s<.0001){return p;}let t=t0*${CORE_BREATH_RATE};let w=sin(p.x*4.1+t*.21+e*6.2831853)*1.7+cos(p.y*3.3-t*.17)*1.7;let f=vec2f(cos(w),sin(w));let o=b>0.;let k=select(1.-.58*s*(.55+.45*e),1.+.44*s*(.6+.4*e),o);let a=select(-1.05,.38,o)*s;let c=cos(a);let n=sin(a);return vec3f(vec2f(p.x*c-p.y*n,p.x*n+p.y*c)*k+f*select(.035,.13,o)*s,p.z*k+select(0.,sin(w*1.3+e*6.2831853)*.1*s,o));}
fn cz(t:f32)->f32{return 1.+.1*cb(t,-.03)+.018*sin(t*${CORE_BREATH_RATE}*6.2831853/(${CORE_BREATH_PERIOD}./3.));}
`;
