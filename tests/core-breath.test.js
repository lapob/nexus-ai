'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../web/src/core-breath.ts');

test('il nucleo respira: si scompone e si ricompone senza salti, alternando fioritura e collasso', async () => {
  const { coreBreath, coreZoom, breatheCorePoint, CORE_BREATH_PERIOD, CORE_BREATH_RATE } = await load();
  const cycle = CORE_BREATH_PERIOD / CORE_BREATH_RATE; // secondi reali
  assert.equal(coreBreath(0, 0), 0);
  assert.ok(coreBreath(cycle * 0.6, 0) > 0.99);
  assert.ok(coreBreath(cycle * 1.6, 0) < -0.99);
  let worst = 0;
  const step = cycle / 4000;
  for (let t = 0; t < cycle * 3; t += step) worst = Math.max(worst, Math.abs(coreBreath(t + step, 0.13) - coreBreath(t, 0.13)));
  assert.ok(worst < 0.004, `salto massimo ${worst}`);
  const out = { x: 0, y: 0, z: 0 };
  breatheCorePoint(out, 0.3, 0, 0, 1, 0.6, 2);
  const bloom = Math.hypot(out.x, out.y);
  breatheCorePoint(out, 0.3, 0, 0, -1, 0.6, 2);
  assert.ok(bloom > 0.36 && Math.hypot(out.x, out.y) < 0.2);
  for (let t = 0; t < cycle * 2; t += 0.05) assert.ok(coreZoom(t) > 0.87 && coreZoom(t) < 1.13);
});

test('WebGPU e Canvas usano lo stesso respiro, spento con movimento ridotto', () => {
  const core = fs.readFileSync(path.join(__dirname, '../web/src/Core.tsx'), 'utf8');
  assert.match(core, /\$\{CORE_BREATH_WGSL\}/);
  assert.match(core, /breatheCorePoint\(point,/);
  assert.match(core, /const ramp = reduced\.matches \? 0/);
});
