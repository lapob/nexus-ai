const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/shared/astral-core.js'), 'utf8');

function fixture(options = {}) {
  const callbacks = new Map();
  const listeners = new Set();
  const handlers = new Map();
  let next = 0, arcs = 0;
  const events = { addEventListener(name, fn) { listeners.add(fn); handlers.set(name,fn); }, removeEventListener(name, fn) { listeners.delete(fn); } };
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, setTransform() {}, clearRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {}, fill() {},
    arc(...args) { assert.ok(args.every(Number.isFinite), 'Every particle coordinate must stay finite'); arcs++; }
  };
  const canvas = { ...events, dataset: {}, getContext: () => context, getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 440 }) };
  const document = { ...events, hidden: false, createElement: () => ({ getContext: () => context }) };
  const media = { ...events, matches: false };
  const sandbox = {
    module: { exports: {} }, document, devicePixelRatio: 2, matchMedia: () => media,
    performance: { now: () => 0 },
    requestAnimationFrame(fn) { callbacks.set(++next, fn); return next; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    IntersectionObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} }
  };
  vm.runInNewContext(source, sandbox);
  const renderer = sandbox.module.exports.createAstralCore(canvas, options);
  return { renderer, canvas, document, media, listeners, callbacks, handlers, arcs: () => arcs,
    frame(time) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(time)); } };
}

test('all real interaction states preserve phase and use bounded finite geometry', () => {
  let energy = NaN;
  const f = fixture({ getEnergy: () => energy });
  let time = 1, phase = 0;
  for (const state of ['idle', 'listening', 'transcribing', 'thinking', 'responding', 'speaking', 'offline', 'error', '__proto__']) {
    f.renderer.setState(state);
    for (let i = 0; i < 12; i++) f.frame(time += 1000 / 120);
    const metrics = f.renderer.getMetrics();
    assert.ok(metrics.phase > phase); phase = metrics.phase;
    assert.ok(metrics.particles <= 900 && metrics.particles >= 210);
    energy = Infinity;
  }
  assert.equal(f.renderer.getMetrics().state, 'idle');
  assert.ok(f.arcs() > 1000);
  f.renderer.dispose();
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.listeners.size, 0);
});

test('motion stays slow and follows time at 20, 60, 120 and 240 Hz', () => {
  const phases = [20, 60, 120, 240].map(hz => {
    const f = fixture();
    for (let i = 0; i <= hz * 2; i++) f.frame(1 + i * 1000 / hz);
    const phase = f.renderer.getMetrics().phase; f.renderer.dispose(); return phase;
  });
  assert.ok(Math.max(...phases) - Math.min(...phases) < .001);
  assert.ok(phases.every(phase => phase > .6 && phase < .7), 'Decoration runs at 0.55x, not by skipping display frames');
});

test('reduced motion paints once, redraws a changed state, and never resets its geometry clock', () => {
  const f = fixture({ reduced: true });
  f.frame(1); const first = f.arcs();
  f.frame(18); f.frame(35); assert.equal(f.arcs(), first);
  f.renderer.setState('listening'); f.frame(52);
  assert.ok(f.arcs() > first);
  assert.equal(f.renderer.getMetrics().phase, 0);
  f.renderer.dispose();
});

test('a drag rotates the volume, suppresses voice clicks and settles without resetting phase', () => {
  const f = fixture(); let now = 1;
  f.handlers.get('pointerdown')({button:0,pointerId:7,clientX:180,clientY:210});
  f.handlers.get('pointermove')({pointerId:7,clientX:285,clientY:250});
  for(let i=0;i<90;i++) f.frame(now += 1000/120);
  assert.ok(Number(f.canvas.dataset.astralRotation.split(',')[1]) > .5);
  assert.ok(f.renderer.getMetrics().maxDrift > 1);
  f.handlers.get('pointerup')({type:'pointerup'});
  let suppressed = 0;
  f.handlers.get('click')({preventDefault(){suppressed++;},stopImmediatePropagation(){suppressed++;}});
  assert.equal(suppressed,2);
  const phase = f.renderer.getMetrics().phase;
  const releasedRotation = Math.abs(Number(f.canvas.dataset.astralRotation.split(',')[1]));
  for(let i=0;i<120;i++) f.frame(now += 1000/120);
  const floatingRotation = Math.abs(Number(f.canvas.dataset.astralRotation.split(',')[1]));
  assert.ok(floatingRotation > releasedRotation * .6 && floatingRotation < releasedRotation * .8, 'A released core floats back instead of snapping home');
  // The visible drift is already subpixel before this; wait through the full
  // longer wake tail before requiring the original 0.05px resting precision.
  for(let i=0;i<1560;i++) f.frame(now += 1000/120);
  assert.ok(f.canvas.dataset.astralRotation.split(',').every(v=>Math.abs(Number(v)) < .002));
  assert.ok(f.renderer.getMetrics().maxDrift < .05);
  assert.ok(f.renderer.getMetrics().phase > phase);
  f.renderer.dispose();
});

test('slow ambient motion does not delay voice feedback or simple core clicks', () => {
  const f = fixture({ getEnergy: () => 1 });
  f.renderer.setState('listening');
  f.frame(1);
  f.frame(101);
  assert.equal(f.renderer.getMetrics().state, 'listening');
  assert.ok(f.renderer.getMetrics().audio > .7);
  f.handlers.get('pointerdown')({button:0,pointerId:9,clientX:200,clientY:200});
  f.handlers.get('pointerup')({type:'pointerup'});
  let suppressed = false;
  f.handlers.get('click')({preventDefault(){suppressed = true;},stopImmediatePropagation(){suppressed = true;}});
  assert.equal(suppressed, false, 'A simple click is never delayed by decorative settling');
  f.renderer.dispose();
});

test('Android and all desktop visualizers share the same decorative motion rates', () => {
  const android = fs.readFileSync(path.join(__dirname, '../android/NexusRemote/app/src/main/java/local/nexus/remote/AstralCore.kt'), 'utf8');
  const animation = fs.readFileSync(path.join(__dirname, '../src/renderer/systems/AnimationController.ts'), 'utf8');
  for (const [name, value] of [['ambientScale', '.55'], ['returnOmega', '1.1']]) {
    assert.ok(source.includes(`${name}: ${value}`));
    assert.ok(animation.includes(`${name}: ${value}`));
    assert.ok(android.includes(`${name} = ${value}f`));
  }
  assert.ok(source.includes('pointerRelease: .8'));
  assert.ok(android.includes('pointerRelease = .8f'));
  assert.ok(animation.includes('release: .8'));
  for (const name of ['ParticleEngine', 'SaturnVisualizer', 'NexusCore']) {
    const visualizer = fs.readFileSync(path.join(__dirname, `../src/renderer/scene/${name}.tsx`), 'utf8');
    assert.match(visualizer, /clock\.elapsedTime \* VISUALIZER_MOTION\.ambientScale/);
    assert.match(visualizer, /VISUALIZER_POINTER_DAMPING\.release/);
  }
  const inspection = fs.readFileSync(path.join(__dirname, '../src/renderer/scene/VisualizerInspection.tsx'), 'utf8');
  assert.match(inspection, /dragging \? 9 : VISUALIZER_MOTION\.returnOmega/);
});

test('Android uses the same topology and keeps capture inline through recomposition', () => {
  const base = path.join(__dirname, '../android/NexusRemote/app/src/main/java/local/nexus/remote');
  const core = fs.readFileSync(path.join(base, 'AstralCore.kt'), 'utf8');
  const activity = fs.readFileSync(path.join(base, 'NexusMainActivity.kt'), 'utf8');
  for (const token of ['.61803398875', '91.733', '43758.5453']) { assert.ok(core.includes(token)); assert.ok(source.includes(token)); }
  assert.match(core, /LocalLifecycleOwner.current.lifecycle/);
  assert.match(core, /LaunchedEffect\(visible, reduceMotion\)/);
  assert.doesNotMatch(core, /LaunchedEffect\(state/);
  assert.match(activity, /if \(inlineState != null\) return/);
  assert.match(activity, /generation != speechGeneration/);
  assert.match(activity, /speechPlayback = "speaking"/);
});

test('quality sheds glow before particles and recovers with hysteresis', () => {
  const f = fixture(); let time = 1;
  f.frame(time); const initial = f.renderer.getMetrics().particles;
  for (let i = 0; i < 26; i++) f.frame(time += 50);
  assert.equal(f.renderer.getMetrics().quality, .75);
  assert.equal(f.renderer.getMetrics().particles, initial);
  for (let i = 0; i < 90; i++) f.frame(time += 50);
  assert.ok(f.renderer.getMetrics().particles < initial);
  for (let i = 0; i < 4500; i++) f.frame(time += 1000 / 120);
  assert.equal(f.renderer.getMetrics().quality, 1);
  assert.equal(f.renderer.getMetrics().particles, initial);
  f.renderer.dispose();
});

test('voice light ignores stale audio outside listening and speaking', () => {
  const f = fixture({ getEnergy: () => 1 }); let time = 1;
  for (let i = 0; i < 60; i++) f.frame(time += 1000 / 60);
  assert.equal(f.renderer.getMetrics().audio, 0);
  f.renderer.setState('speaking');
  for (let i = 0; i < 60; i++) f.frame(time += 1000 / 60);
  assert.ok(f.renderer.getMetrics().audio > .95);
  f.renderer.setState('idle');
  for (let i = 0; i < 90; i++) f.frame(time += 1000 / 60);
  assert.ok(f.renderer.getMetrics().audio < .001);
  f.renderer.dispose();
});
