'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../web/src', file), 'utf8');

test('le feature di animazione restano fuori dal bundle di avvio', () => {
  const app = read('App.tsx');
  assert.match(app, /<LazyMotion features=\{loadMotionFeatures\} strict>/);
  assert.doesNotMatch(app, /\bdomAnimation\b/);
  assert.match(read('motion.ts'), /import\('\.\/motion-features'\)/);
  assert.match(read('motion-features.ts'), /export \{ domAnimation as default \} from 'framer-motion'/);
});

test('fogli, pannelli e messaggi usano lo stesso linguaggio di movimento', () => {
  for (const file of ['App.tsx', 'ControlCenter.tsx', 'Projects.tsx']) assert.match(read(file), /\{\.\.\.SHEET\}/, file);
  assert.match(read('Panel.tsx'), /\{\.\.\.SIDE_PANEL\}/);
  assert.match(read('App.tsx'), /\{\.\.\.MESSAGE\[message\.role\]\}/);
  // La sfocatura della risposta si toglie a fine corsa: testo nitido, nessun contesto di composizione permanente.
  assert.match(read('motion.ts'), /transitionEnd: \{ filter: 'none' \}/);
});

test('la UI respira con il nucleo solo dove marcato, e si ferma con movimento ridotto', () => {
  const core = read('Core.tsx');
  assert.match(core, /querySelectorAll<HTMLElement>\('\[data-core-breath\]'\)/);
  assert.match(core, /setProperty\('--core-breath', pulse\)/);
  const css = read('styles.css');
  assert.match(css, /@property --core-breath \{ syntax: '<number>'/);
  assert.match(css, /::view-transition-new\(thread\) \{ animation: vt-thread-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: \.001ms !important/);
  assert.match(read('App.tsx'), /startViewTransition && !window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
});
