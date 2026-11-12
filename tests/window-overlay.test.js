/**
 * @module tests/window-overlay
 * @description La barra dell'app e i controlli di Windows sovrapposti restano allineati e senza collisioni.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const windowSource = fs.readFileSync(path.join(root, 'src/infrastructure/electron/create-main-window.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'web/src/styles.css'), 'utf8');

test('overlay trasparente alto quanto la barra, che riserva lo spazio dei controlli di sistema', () => {
  const overlay = windowSource.match(/titleBarOverlay:\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(overlay, /color:\s*'#00000000'/, 'nessun riquadro opaco dietro riduci/ingrandisci/chiudi');
  const height = Number(overlay.match(/height:\s*(\d+)/)?.[1]);
  const topbar = styles.match(/\.topbar \{[^}]*\}/)?.[0] || '';
  assert.match(topbar, /env\(titlebar-area-width/, 'la barra deve rientrare dall\'area dei controlli');
  assert.equal(Number(topbar.match(/min-height:\s*max\((\d+)px/)?.[1]), height, 'altezze diverse disallineano icone e controlli');
  assert.match(styles, /\.topbar, \.sidebar-head \{ -webkit-app-region: drag/);
  assert.match(styles, /app-region: no-drag/);
});
