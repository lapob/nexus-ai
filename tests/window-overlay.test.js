/**
 * @module tests/window-overlay
 * @description Riduci, ingrandisci/ripristina e chiudi sono controlli integrati, chiari e sicuri.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHANNELS } = require('../src/application/ipc-contracts');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const windowSource = read('src/infrastructure/electron/create-main-window.js');
const ipc = read('src/application/register-ipc.js');
const preload = read('src/preload.js');
const controls = read('web/src/WindowControls.tsx');
const styles = read('web/src/styles.css');

test('nessun pulsante di sistema sovrapposto: la barra resta trascinabile e i controlli cliccabili', () => {
  assert.doesNotMatch(windowSource, /titleBarOverlay/);
  assert.match(windowSource, /titleBarStyle: 'hidden'/);
  assert.match(styles, /\.topbar, \.sidebar-head \{ -webkit-app-region: drag/);
  assert.match(styles, /app-region: no-drag/);
});

test('lo stato reale della finestra arriva al renderer sullo stesso canale del contratto', () => {
  assert.equal(CHANNELS.windowState, 'nexus:window-state');
  assert.match(windowSource, new RegExp(`send\\('${CHANNELS.windowState}'`));
  for (const name of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur']) assert.match(windowSource, new RegExp(`'${name}'`));
});

test('solo tre azioni note, mittente verificato, schermo intero ripristinabile', () => {
  const handler = ipc.slice(ipc.indexOf('CHANNELS.windowAction'), ipc.indexOf('CHANNELS.windowCompact'));
  assert.match(handler, /assertTrustedSender\(event\)/);
  assert.match(handler, /setFullScreen\(false\)/);
  assert.match(handler, /Azione finestra non valida/);
  assert.match(preload, /\['minimize', 'toggle-maximize', 'close', 'state'\]\.includes\(action\)/);
});

test('etichette italiane chiare e icona che segue lo stato', () => {
  for (const label of ['Riduci a icona', 'Ingrandisci', 'Ripristina finestra', 'Esci da schermo intero', 'Chiudi']) assert.ok(controls.includes(label), label);
  assert.match(controls, /data-expanded=\{expanded\}/);
  assert.match(styles, /\.window-controls\[data-expanded='true'\] \.window-glyph-back \{ opacity: 1/);
});
