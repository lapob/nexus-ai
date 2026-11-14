import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDrift, advanceSand, breatheCorePoint, CORE_BREATH_PERIOD, coreBreath, coreZoom, strokeDistance } from '../app/components/particle-drift.ts';

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

test('fast strokes affect grains between samples, not distant grains', () => {
  assert.equal(strokeDistance(50, 3, 0, 0, 100, 0), 3);
  assert.equal(strokeDistance(50, 200, 0, 0, 100, 0), 200);
  assert.equal(strokeDistance(3, 4, 0, 0, 0, 0), 5);
});
