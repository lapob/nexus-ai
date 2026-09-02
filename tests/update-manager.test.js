/**
 * @module tests/update-manager
 * @description Verifica il confine pubblico dell'aggiornamento desktop.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// electron-updater carica Electron; in Node puro verifichiamo le primitive
// esportate senza inizializzare il lifecycle di rete.
test('l updater accetta soltanto una origine HTTPS pulita', () => {
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { getVersion: () => '1.0.0' }, ipcMain: { handle() {} } };
    if (request === 'electron-updater') return { NsisUpdater: class {} };
    return original.call(this, request, parent, isMain);
  };
  try {
    const modulePath = require.resolve('../src/infrastructure/electron/update-manager');
    delete require.cache[modulePath];
    const { cleanUpdateUrl, publicUpdateInfo } = require(modulePath);
    assert.equal(cleanUpdateUrl('https://updates.example.test/stable/'), 'https://updates.example.test/stable');
    assert.throws(() => cleanUpdateUrl('http://updates.example.test'));
    assert.throws(() => cleanUpdateUrl('https://user:secret@updates.example.test'));
    assert.deepEqual(publicUpdateInfo({ version: '2.0.0', releaseName: 'Stabile', releaseNotes: '<b>Più veloce</b>', files: ['private'] }), { version: '2.0.0', releaseName: 'Stabile', releaseNotes: 'Più veloce' });
  } finally {
    Module._load = original;
  }
});
