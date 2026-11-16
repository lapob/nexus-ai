'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../web/src/nexus-core.ts');
const adapter = () => import('../web/src/core-breath.ts');

// Formule del respiro com'erano nell'app prima del modulo condiviso (tempo reale): il refactoring non deve
// spostare nemmeno un grano.
const smoother = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10); };
const legacyBreath = (time, stagger) => {
  const cycle = (time * 0.8) / 11 - stagger; const index = Math.floor(cycle); const phase = cycle - index;
  const scatter = smoother((phase - 0.34) / 0.22) * (1 - smoother((phase - 0.66) / 0.3));
  return (index & 1) === 0 ? scatter : -scatter;
};
const legacyZoom = (time) => 1 + 0.1 * legacyBreath(time, -0.03) + 0.018 * Math.sin((time * 0.8 * Math.PI * 2) / (11 / 3));

test('il modulo condiviso è versionato e riproduce esattamente il respiro dell app', async () => {
  const core = await load();
  const app = await adapter();
  assert.match(core.NEXUS_CORE_VERSION, /^\d+\.\d+\.\d+$/);
  for (let t = 0; t < 60; t += 0.137) {
    assert.ok(Math.abs(app.coreBreath(t, 0.11) - legacyBreath(t, 0.11)) < 1e-12);
    assert.ok(Math.abs(app.coreZoom(t) - legacyZoom(t)) < 1e-12);
  }
  const shared = { x: 0, y: 0, z: 0 }, local = { x: 0, y: 0, z: 0 };
  core.breatheCorePoint(shared, 0.3, -0.2, 0.5, 0.8, 0.42 * 6.2831853, 0.42, core.ambientTime(7.5));
  app.breatheCorePoint(local, 0.3, -0.2, 0.5, 0.8, 0.42, 7.5);
  assert.deepEqual(local, shared);
});

test('reazione: il puntatore inclina e svanisce senza salti, il server offline spegne e raffredda il nucleo', async () => {
  const { pointerInfluence, pointerTilt, POINTER_FADE, POINTER_TILT, coreMood, CORE_TINT_ONLINE } = await load();
  assert.equal(pointerInfluence(0), 1);
  assert.equal(pointerInfluence(POINTER_FADE), 0);
  assert.equal(pointerInfluence(-Infinity), 0);
  assert.equal(pointerInfluence(Number.NaN), 0);
  let previous = 1;
  for (let t = 0; t <= POINTER_FADE; t += POINTER_FADE / 200) { const value = pointerInfluence(t); assert.ok(value <= previous + 1e-12 && previous - value < 0.02); previous = value; }
  assert.deepEqual(pointerTilt(5, -5, 1), [POINTER_TILT, POINTER_TILT]);
  assert.deepEqual(pointerTilt(0.5, 0.5, 0), [0, -0]);
  assert.deepEqual(coreMood(0), { tint: [...CORE_TINT_ONLINE], glow: 1, energyCap: 1 });
  const off = coreMood(1);
  assert.ok(off.glow < 0.6 && off.energyCap < 0.5 && off.tint[1] < CORE_TINT_ONLINE[1]);
  assert.deepEqual(coreMood(7), off);
});

test('?nxs-qa-time: solo numeri finiti non negativi, alias nxs-still come sul sito', async () => {
  const { qaTime } = await load();
  assert.equal(qaTime(''), null);
  assert.equal(qaTime('?nxs-qa-time=9.5'), 9.5);
  assert.equal(qaTime('?nxs-still'), 0);
  assert.equal(qaTime('?nxs-still=4'), 4);
  assert.equal(qaTime('?nxs-qa-time=-1'), null);
  assert.equal(qaTime('?nxs-qa-time=abc'), null);
  assert.equal(qaTime('?nxs-qa-time=Infinity'), null);
});

test('il motore usa il modulo condiviso: stati, reazione e istante QA in WebGPU e Canvas 2D', () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, '../web/src', name), 'utf8');
  const render = read('core-render.ts');
  assert.match(render, /export const ENERGY = CORE_ENERGY;/);
  assert.match(render, /pointer:vec4f\};/);
  assert.match(render, /p=rotX\(rotY\(p,ta\.x\),-ta\.y\);/);
  assert.match(render, /pointerTilt\(react\.x, react\.y, react\.influence\)/);
  assert.match(render, /react\.influence = halted\(\) \? 0 : pointerInfluence/);
  assert.match(render, /emit\(\{ type: 'info', qa: 'ready' \}\)/);
  const host = read('Core.tsx');
  assert.match(host, /const still = qaTime\(window\.location\.search\);/);
  assert.match(host, /canvas\.dataset\.coreVersion = NEXUS_CORE_VERSION;/);
  assert.match(host, /addEventListener\('pointermove', onPointer, \{ passive: true \}\)/);
  assert.match(read('App.tsx'), /<Core state=\{coreState\} className="core" level=\{voiceLevel\} offline=\{offline\} \/>/);
  assert.match(read('nexus-core.ts'), /^import|^\/\*\*/m);
  assert.doesNotMatch(read('nexus-core.ts'), /^import /m, 'il modulo condiviso non ha dipendenze');
});
