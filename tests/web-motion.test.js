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
  // La risposta entra con opacità, corsa e scala: niente filtro blur, che costava fotogrammi al cambio conversazione.
  const assistant = read('motion.ts').slice(read('motion.ts').indexOf('assistant: {'));
  assert.doesNotMatch(assistant.slice(0, assistant.indexOf('transition:')), /blur\(/);
  assert.match(assistant, /scale: 0\.985/);
});

test('la UI respira con il nucleo solo dove marcato, e si ferma con movimento ridotto', () => {
  const core = read('Core.tsx');
  assert.match(core, /querySelectorAll<HTMLElement>\('\[data-core-breath\]'\)/);
  assert.match(core, /coreBreath\(time, 0\)/);
  assert.match(core, /setProperty\('--core-breath', pulse\)/);
  const css = read('styles.css');
  assert.match(css, /@property --core-breath \{ syntax: '<number>'/);
  // Cambio conversazione senza View Transitions (la cattura fermava il nucleo): la lista e il titolo,
  // con chiave sulla conversazione, entrano con animazioni sul compositor; i messaggi non rientrano uno a uno.
  const app = read('App.tsx');
  assert.doesNotMatch(app, /startViewTransition/);
  assert.doesNotMatch(css, /view-transition/);
  assert.match(app, /<ol className="thread" key=\{conversation!\.id\}/);
  assert.match(css, /\.thread \{ animation: thread-in/);
  assert.match(css, /\.topbar \.title \{ animation: title-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation-duration: \.001ms !important/);
});

test('il nucleo disegna in un worker e non si ferma con la pagina; se manca, torna sul thread principale', () => {
  const host = read('Core.tsx');
  assert.match(host, /new Worker\(new URL\('\.\/core-worker\.ts', import\.meta\.url\), \{ type: 'module'/);
  // Il canvas si trasferisce solo a modulo caricato: un errore prima di allora lascia il disegno alla pagina.
  assert.match(host, /if \(message\.type !== 'loaded'\) \{ receive\(message\); return; \}[\s\S]*transferControlToOffscreen\(\)/);
  assert.match(host, /addEventListener\('error', failed/);
  assert.match(read('core-worker.ts'), /startCoreEngine\(message\.canvas/);
  // Il respiro della UI parte dallo stesso istante assoluto del motore.
  assert.match(host, /const startedAt = performance\.timeOrigin \+ performance\.now\(\)/);
  assert.match(read('core-render.ts'), /const now = \(\) => performance\.timeOrigin \+ performance\.now\(\)/);
  for (const config of ['../../vite.config.ts', '../vite.config.ts']) assert.match(read(config), /worker: \{ format: 'es' \}/);
});

test('il nucleo non è chiuso in un box: canvas ampio e particelle che sfumano a vuoto', () => {
  const core = read('core-render.ts');
  assert.match(core, /const SPREAD = 2;/);
  assert.match(read('styles.css'), /\.core-layer \.core \{[^}]*width: calc\(min\(80vmin, 760px\) \* 2\)/);
  // Dissolvenza radiale e verso i bordi visibili del contenitore, in WebGPU e nel fallback Canvas.
  assert.match(core, /smoothstep\(\.56,\.97,length\(/);
  assert.match(core, /ed=min\(c-u\.clip\.xy,u\.clip\.zw-c\)\/u\.feather\.xy/);
  assert.match(core, /smooth\(0\.56, 0\.97, Math\.hypot\(/);
  assert.match(core, /size: 80, usage/);
});
