import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDrift, advanceSand, strokeDistance } from '../app/components/particle-drift.ts';

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

test('fast strokes affect grains between samples, not distant grains', () => {
  assert.equal(strokeDistance(50, 3, 0, 0, 100, 0), 3);
  assert.equal(strokeDistance(50, 200, 0, 0, 100, 0), 200);
  assert.equal(strokeDistance(3, 4, 0, 0, 0, 0), 5);
});
