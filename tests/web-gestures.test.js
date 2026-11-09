/**
 * @module tests/web-gestures
 * @description Gesti rapidi touch della web app: apertura dal bordo, chiusura, pannello, scroll orizzontale preservato.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'web', 'src', 'gestures.ts')).href);
const at = (x, y = 300, t = 0, extra = {}) => ({ x, y, t, inPanel: false, inScroller: false, ...extra });
const closed = { sidebarOpen: false, panelOpen: false };

test('verso destra si apre la cronologia, solo su schermi compatti e fuori dal gesto Indietro di Android', async () => {
  const { swipeIntent } = await load();
  assert.equal(swipeIntent(at(80), { x: 220, y: 310, t: 200 }, closed, true), 'openSidebar');
  assert.equal(swipeIntent(at(80), { x: 220, y: 310, t: 200 }, closed, false), null, 'su desktop la barra è già visibile');
  assert.equal(swipeIntent(at(8), { x: 160, y: 300, t: 200 }, closed, true), null, 'il bordo resta al sistema');
  assert.equal(swipeIntent(at(80, 300, 0, { inScroller: true }), { x: 240, y: 300, t: 200 }, closed, true), null, 'il codice scorre, non apre');
});

test('verso sinistra chiude la cronologia; gesti lenti, corti o verticali vengono ignorati', async () => {
  const { swipeIntent } = await load();
  const open = { sidebarOpen: true, panelOpen: false };
  assert.equal(swipeIntent(at(250), { x: 100, y: 300, t: 180 }, open, true), 'closeSidebar');
  assert.equal(swipeIntent(at(250), { x: 100, y: 300, t: 1200 }, open, true), null, 'trascinamento lento');
  assert.equal(swipeIntent(at(250), { x: 220, y: 300, t: 100 }, open, true), null, 'troppo corto');
  assert.equal(swipeIntent(at(250, 100), { x: 150, y: 400, t: 150 }, open, true), null, 'scroll verticale');
});

test('il pannello si chiude scorrendo a destra, ma non quando si scorre codice o tabelle', async () => {
  const { swipeIntent } = await load();
  const panel = { sidebarOpen: false, panelOpen: true };
  assert.equal(swipeIntent(at(80, 300, 0, { inPanel: true }), { x: 260, y: 305, t: 160 }, panel, true), 'closePanel');
  assert.equal(swipeIntent(at(80, 300, 0, { inPanel: true, inScroller: true }), { x: 260, y: 305, t: 160 }, panel, true), null);
  assert.equal(swipeIntent(at(80), { x: 260, y: 300, t: 160 }, panel, true), null, 'col pannello aperto non si apre la cronologia');
});
