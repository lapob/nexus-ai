const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CHANNELS } = require('../src/application/ipc-contracts');

function loadPreloadBridge() {
  const calls = [];
  let exposed;
  const electron = {
    contextBridge: { exposeInMainWorld: (name, value) => { exposed = { name, value }; } },
    ipcRenderer: { invoke: (channel, ...args) => { calls.push({ channel, args }); return Promise.resolve(); } }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  vm.runInNewContext(source, { require: (name) => {
    assert.equal(name, 'electron', 'Il preload sandboxed non deve importare moduli locali');
    return electron;
  }, Object });
  return { ...exposed, calls };
}

test('il preload espone il bridge Nexus completo nel namespace ufficiale', () => {
  const { name, value } = loadPreloadBridge();
  assert.equal(name, 'nexus');
  assert.deepEqual(Object.keys(value).sort(), [
    'bootstrap', 'cancel', 'chat', 'copyText', 'listModels', 'openNote', 'reindex', 'saveSettings'
  ]);
  for (const method of Object.values(value)) assert.equal(typeof method, 'function');
});

test('ogni metodo preload usa esattamente il canale IPC autoritativo', async () => {
  const { value, calls } = loadPreloadBridge();
  await value.bootstrap(); await value.saveSettings({}); await value.reindex(); await value.listModels();
  await value.cancel(); await value.copyText('test'); await value.openNote('note.md'); await value.chat({ question: 'test' });
  assert.deepEqual(calls.map(({ channel }) => channel), [
    CHANNELS.bootstrap, CHANNELS.settings, CHANNELS.reindex, CHANNELS.listModels,
    CHANNELS.cancel, CHANNELS.copy, CHANNELS.openNote, CHANNELS.chat
  ]);
  assert.equal(new Set(calls.map(({ channel }) => channel)).size, Object.keys(CHANNELS).length);
});
