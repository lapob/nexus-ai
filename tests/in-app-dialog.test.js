/**
 * @module tests/in-app-dialog
 * @description Conferme integrate: risposta solo dal mittente giusto, rifiuto su chiusura/scadenza, riserva nativa.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createInAppDialog } = require('../src/infrastructure/electron/in-app-dialog');
const { CHANNELS } = require('../src/application/ipc-contracts');

function setup({ readyMs = 60, timeoutMs = 2_000 } = {}) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const sent = [];
  const window = new EventEmitter();
  window.isDestroyed = () => false;
  window.webContents = { isDestroyed: () => false, send: (channel, payload) => sent.push({ channel, payload }) };
  const native = [];
  const nativeDialog = { showMessageBox: async (...args) => { native.push(args); return { response: 1 }; } };
  const dialog = createInAppDialog({ ipcMain, nativeDialog, channels: CHANNELS, readyMs, timeoutMs });
  const answer = (sender, payload) => handlers.get(CHANNELS.confirmAnswer)({ sender }, payload);
  return { dialog, window, sent, native, answer };
}

const options = { type: 'warning', title: 'Autorizzazione azione', message: 'NexusNXS vuole eseguire: x', detail: 'Rischio: alto', buttons: ['Rifiuta', 'Autorizza una volta'], cancelId: 0 };

test('il dialogo integrato riceve testo e pulsanti; «Autorizza» restituisce l\'indice di conferma', async () => {
  const { dialog, window, sent, answer, native } = setup();
  const pending = dialog.showMessageBox(window, options);
  const { channel, payload } = sent[0];
  assert.equal(channel, CHANNELS.confirmRequest);
  assert.match(payload.id, /^[a-f0-9]{32}$/);
  assert.equal(payload.tone, 'warning');
  assert.equal(payload.confirmLabel, 'Autorizza una volta');
  assert.equal(payload.cancelLabel, 'Rifiuta');
  await answer(window.webContents, { id: payload.id, answer: 'shown' });
  await new Promise((resolve) => setTimeout(resolve, 90)); // oltre readyMs: nessuna riserva nativa dopo «shown»
  await answer(window.webContents, { id: payload.id, answer: true });
  assert.deepEqual(await pending, { response: 1, checkboxChecked: false });
  assert.equal(native.length, 0);
  assert.equal(dialog.pendingCount(), 0);
});

test('risposte da un altro mittente o con id sconosciuto sono ignorate; una seconda risposta non conta', async () => {
  const { dialog, window, sent, answer } = setup();
  const pending = dialog.showMessageBox(window, options);
  const { id } = sent[0].payload;
  await answer(window.webContents, { id, answer: 'shown' });
  assert.deepEqual(await answer({ other: true }, { id, answer: true }), { status: 'ignored' });
  assert.deepEqual(await answer(window.webContents, { id: 'f'.repeat(32), answer: true }), { status: 'ignored' });
  await answer(window.webContents, { id, answer: false });
  assert.equal((await pending).response, 0);
  assert.deepEqual(await answer(window.webContents, { id, answer: true }), { status: 'ignored' });
});

test('finestra chiusa o scadenza = rifiuto, mai consenso implicito', async () => {
  const closed = setup();
  const first = closed.dialog.showMessageBox(closed.window, options);
  await closed.answer(closed.window.webContents, { id: closed.sent[0].payload.id, answer: 'shown' });
  closed.window.emit('closed');
  assert.equal((await first).response, 0);
  const late = setup({ timeoutMs: 80 });
  const second = late.dialog.showMessageBox(late.window, options);
  await late.answer(late.window.webContents, { id: late.sent[0].payload.id, answer: 'shown' });
  assert.equal((await second).response, 0);
});

test('interfaccia che non risponde: dialogo di sistema come riserva', async () => {
  const { dialog, window, native } = setup({ readyMs: 30 });
  const result = await dialog.showMessageBox(window, options);
  assert.equal(native.length, 1);
  assert.equal(result.response, 1);
});

test('dialoghi con più di due pulsanti restano nativi', async () => {
  const { dialog, window, native, sent } = setup();
  await dialog.showMessageBox(window, { ...options, buttons: ['A', 'B', 'C'] });
  assert.equal(native.length, 1);
  assert.equal(sent.length, 0);
});
