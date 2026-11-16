import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDrift, advanceSand, breatheCorePoint, chapterChoreo, CORE_BREATH_PERIOD, coreBreath, coreZoom, horizonPoint, streamPoint, strokeDistance, vortexFlight } from '../app/components/particle-drift.ts';

test('inertial drift is independent of display refresh rate', () => {
  const simulate = (hz) => {
    let state = { offset: 0, velocity: 0 };
    for (let i = 0; i < hz; i++) state = advanceDrift(state.offset, state.velocity, 180, .6, 1 / hz);
    return state;
  };
  const reference = simulate(60);
  for (const hz of [30, 120, 144]) {
    const state = simulate(hz);
    assert.ok(Math.abs(state.offset - reference.offset) < 1e-9);
    assert.ok(Math.abs(state.velocity - reference.velocity) < 1e-9);
  }
});

test('released grains retain momentum and settle without crossing the form', () => {
  let state = advanceDrift(0, 0, 300, .6, .1);
  const released = advanceDrift(state.offset, state.velocity, 0, .6, 1 / 60);
  assert.ok(released.offset > state.offset);
  for (let i = 0; i < 600; i++) {
    state = advanceDrift(state.offset, state.velocity, 0, .6, 1 / 60);
    assert.ok(state.offset >= 0);
  }
  assert.ok(state.offset < .001);
  assert.deepEqual(advanceDrift(0, 0, 0, .6, .1), { offset: 0, velocity: 0 });
});

test('zero-gravity sand glides loose, rests, then re-gathers at any refresh rate', () => {
  const run = (hz) => {
    const grain = { offsetX: 0, offsetY: 0, vx: 0, vy: 0, calm: 10 };
    for (let i = 0; i < hz * .2; i++) advanceSand(grain, 420, -120, 1, .6, .8, 1 / hz);
    const pushed = Math.hypot(grain.offsetX, grain.offsetY);
    for (let i = 0; i < hz * .6; i++) advanceSand(grain, 0, 0, 0, .6, .8, 1 / hz);
    const loose = Math.hypot(grain.offsetX, grain.offsetY);
    let peak = loose;
    for (let i = 0; i < hz * 8; i++) { advanceSand(grain, 0, 0, 0, .6, .8, 1 / hz); peak = Math.max(peak, Math.hypot(grain.offsetX, grain.offsetY)); }
    return { pushed, loose, peak, settled: Math.hypot(grain.offsetX, grain.offsetY) };
  };
  const reference = run(60);
  assert.ok(reference.loose > reference.pushed * 1.5, 'after release grains keep gliding freely');
  assert.ok(reference.settled < .5, 'the form re-gathers');
  for (const hz of [30, 120, 144]) {
    const other = run(hz);
    assert.ok(Math.abs(other.loose - reference.loose) / reference.loose < .08, `glide stable at ${hz} Hz`);
    assert.ok(other.settled < .5);
  }
  const still = { offsetX: 0, offsetY: 0, vx: 0, vy: 0, calm: 10 };
  advanceSand(still, 0, 0, 0, .6, .8, .1);
  assert.deepEqual(still, { offsetX: 0, offsetY: 0, vx: 0, vy: 0, calm: 10.1 });
});

test('the core breathes apart and back together without jumps, alternating bloom and collapse', () => {
  const period = CORE_BREATH_PERIOD;
  // Composed at the start of every cycle, fully loose mid-cycle, opposite sign on the next cycle.
  assert.equal(coreBreath(0, 0), 0);
  assert.equal(coreBreath(period * .2, 0), 0);
  assert.ok(coreBreath(period * .6, 0) > .99);
  assert.ok(coreBreath(period * 1.6, 0) < -.99);
  // Smooth everywhere, including across the bloom/collapse boundary: tiny steps, tiny changes.
  let worst = 0;
  const step = period / 4000;
  for (let t = -period; t < period * 3; t += step) worst = Math.max(worst, Math.abs(coreBreath(t + step, .13) - coreBreath(t, .13)));
  assert.ok(worst < .004, `max step ${worst}`);
  // Stagger: grains reach the loose state at different moments (a wave, not a block).
  assert.notEqual(coreBreath(period * .4, 0), coreBreath(period * .4, .1));
  // Bloom expands and collapse contracts; zero breath leaves the form untouched.
  const out = { x: 0, y: 0, z: 0 };
  breatheCorePoint(out, .3, .1, .05, 0, 1, .6, 2);
  assert.deepEqual(out, { x: .3, y: .1, z: .05 });
  breatheCorePoint(out, .3, 0, 0, 1, 1, .6, 2);
  const bloom = Math.hypot(out.x, out.y);
  breatheCorePoint(out, .3, 0, 0, -1, 1, .6, 2);
  assert.ok(bloom > .36 && Math.hypot(out.x, out.y) < .2);
  // Zoom in on a bloom, out on a collapse, always gentle.
  assert.ok(coreZoom(period * .6) > 1.05 && coreZoom(period * 1.6) < .95);
  for (let t = 0; t < period * 2; t += .05) assert.ok(coreZoom(t) > .87 && coreZoom(t) < 1.13);
});

test('reading blocks enter and leave smoothly, reversibly, and rest fully readable', () => {
  const h = 900;
  assert.deepEqual(chapterChoreo(h, h + 300, h), { enter: 0, leave: 0 });
  assert.deepEqual(chapterChoreo(h * .4, h * .7, h), { enter: 1, leave: 0 });
  assert.deepEqual(chapterChoreo(-h * .5, -h * .05, h), { enter: 1, leave: 1 });
  let lastEnter = 0, lastLeave = 0, worst = 0;
  for (let top = h * 1.2; top > -h; top -= 2) {
    const { enter, leave } = chapterChoreo(top, top + 260, h);
    assert.ok(enter >= lastEnter && leave >= lastLeave, 'monotonic while scrolling down');
    worst = Math.max(worst, enter - lastEnter, leave - lastLeave);
    lastEnter = enter; lastLeave = leave;
  }
  assert.ok(worst < .02, `no jump: ${worst}`);
});

test('bridge current, closing galaxy and flight vortex stay bounded and continuous', () => {
  const p = { x: 0, y: 0 };
  let worst = 0;
  for (let t = 0; t < 400; t += .05) {
    streamPoint(p, 37, 1.3, .7, t, 1440, 900, .5);
    const { x, y } = p;
    streamPoint(p, 37, 1.3, .7, t + .05, 1440, 900, .5);
    worst = Math.max(worst, Math.hypot(p.x - x, p.y - y));
    assert.ok(p.x > -150 && p.x < 1600 && p.y > 0 && p.y < 900);
  }
  assert.ok(worst < 2, `stream never wraps: ${worst}`);
  const g = { x: 0, y: 0, z: 0, reach: 0 };
  for (let i = 0; i < 2400; i++) { horizonPoint(g, i, i * .37, (i % 13) / 13, 12); assert.ok(Math.hypot(g.x, g.y, g.z) < .58 && g.reach >= 0 && g.reach < 1); }
  // Resting forms are untouched; mid-flight grains turn around the centre.
  assert.deepEqual(vortexFlight(p, 300, 200, 100, 100, 0, .7, 1), { x: 300, y: 200 });
  vortexFlight(p, 300, 100, 100, 100, 1, .7, 1);
  assert.ok(p.y > 150 && Math.hypot(p.x - 100, p.y - 100) > 200);
});

test('fast strokes affect grains between samples, not distant grains', () => {
  assert.equal(strokeDistance(50, 3, 0, 0, 100, 0), 3);
  assert.equal(strokeDistance(50, 200, 0, 0, 100, 0), 200);
  assert.equal(strokeDistance(3, 4, 0, 0, 0, 0), 5);
});

test('the site breathes with the shared, versioned NexusNXS core (vendored copy is intact and current)', async () => {
  const { createHash } = await import('node:crypto');
  const { existsSync, readFileSync } = await import('node:fs');
  const vendored = readFileSync(new URL('../app/components/nexus-core.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const [, version, digest] = /^\/\/ Generated[^\n]*\n\/\/ nexus-core (\d+\.\d+\.\d+) sha256:([0-9a-f]{64})\n/.exec(vendored) ?? [];
  assert.ok(version && digest, 'versioned header');
  const body = vendored.slice(vendored.indexOf('\n', vendored.indexOf('sha256:')) + 1);
  assert.equal(createHash('sha256').update(body).digest('hex'), digest, 'vendored core edited by hand');
  assert.match(body, new RegExp(`NEXUS_CORE_VERSION = '${version.replace(/\./g, '\\.')}'`));
  const canonical = new URL('../../.AI/web/src/nexus-core.ts', import.meta.url);
  if (existsSync(canonical)) assert.equal(body, readFileSync(canonical, 'utf8').replace(/\r\n/g, '\n'), 'run node scripts/sync-nexus-core.mjs');
  const { qaTime } = await import('../app/components/nexus-core.ts');
  assert.equal(qaTime('?nxs-qa-time=2'), 2);
  assert.equal(qaTime('?nxs-still'), 0);
  assert.ok(coreBreath(CORE_BREATH_PERIOD * .6, 0) > .99);
  assert.equal(typeof breatheCorePoint, 'function');
  assert.ok(coreZoom(0) > .9);
});
