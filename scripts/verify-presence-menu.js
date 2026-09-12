/**
 * @module scripts/verify-presence-menu
 * @description Verifica menu nativo, comandi e confine IPC in Electron reale.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa-artifacts');

// #region Isolated Electron runner
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const profile = require('./qa-profile').createQaProfile(output, 'presence-menu-profile-');
  env.NEXUS_PRESENCE_QA_PROFILE = profile.path;
  const result = spawnSync(require('electron'), [__filename], {
    cwd: root, env, windowsHide: true, stdio: 'inherit', timeout: 45_000
  });
  if (result.error) throw result.error;
  profile.dispose();
  process.exitCode = result.status ?? 1;
 } else {
  const { app, BrowserWindow, Menu, protocol, ipcMain } = require('electron');
  const { createSystemPresenceManager } = require('../src/infrastructure/electron/companion-window');
  const { registerRendererProtocol } = require('../src/infrastructure/electron/renderer-protocol');
  app.setPath('userData', process.env.NEXUS_PRESENCE_QA_PROFILE);
  protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, stream: true } }]);
  app.on('window-all-closed', () => {});
  // #endregion
  // #region Native menu and trusted IPC assertions
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    registerRendererProtocol(path.join(root, 'renderer-dist'));
    const actions = [];
    const manager = createSystemPresenceManager({ defaultSystemPresence: true,
      openPrimaryWindow: () => actions.push('open'), closePrimaryWindow: () => actions.push('minimize'),
      quitApplication: () => actions.push('quit'), activateVoice: () => actions.push('voice') });
    manager.startSystemPresence();
    const window = BrowserWindow.getAllWindows()[0];
    while (window.webContents.isLoadingMainFrame()) await delay(50);
    const run = source => window.webContents.executeJavaScript(source, true);
    let popup, nativeMenu, calls = 0;
    const originalPopup = Menu.prototype.popup;
    Menu.prototype.popup = function(options) { nativeMenu = this; popup = options; calls++; };
    try {
      await run(`(()=>{const box=document.querySelector('.drag-ring').getBoundingClientRect();
        dispatchEvent(new MouseEvent('mousemove',{clientX:box.left+box.width/2,clientY:box.top+box.height/2}));return true})()`);
      await delay(50);
      await run("dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));true");
      await delay(100);
      assert.equal(calls, 1);
      assert.equal(nativeMenu.items.length, 6);
      assert.equal(popup.window, window);
      assert.equal(await run("document.querySelector('[role=menu]') === null"), true);
      await run('window.nexusPresence.showMenu();true');
      await delay(50);
      assert.equal(calls, 1, 'Duplicate open must be ignored');
      for (const index of [0, 1, 5]) nativeMenu.items[index].click();
      await delay(50);
      assert.deepEqual(actions, ['open', 'minimize', 'quit']);
      const pointerUpdates = [];
      const trackPointer = (event, enabled) => { if (event.sender === window.webContents) pointerUpdates.push(enabled); };
      ipcMain.on('nexus:system-presence-pointer', trackPointer);
      popup.callback();
      await delay(50);
      await run("document.querySelector('.core').click();true");
      await delay(400);
      assert.equal(actions.includes('voice'), false, 'Menu dismissal must not activate voice');
      await run(`(()=>{const box=document.querySelector('.drag-ring').getBoundingClientRect();
        dispatchEvent(new MouseEvent('mousemove',{clientX:box.left+box.width/2,clientY:box.top+box.height/2}));return true})()`);
      await delay(50);
      assert.equal(pointerUpdates.at(-1), true, 'Pet must regain input without leaving the hotspot');
      ipcMain.removeListener('nexus:system-presence-pointer', trackPointer);
      const untrusted = new BrowserWindow({ show: false, webPreferences: {
        preload: path.join(root, 'src/infrastructure/electron/system-presence-preload.js'), contextIsolation: true, sandbox: true } });
      await untrusted.loadURL('about:blank');
      await untrusted.webContents.executeJavaScript('window.nexusPresence.showMenu();true');
      await delay(50);
      assert.equal(calls, 1, 'Untrusted window must not open the pet menu');
      untrusted.destroy();
      Menu.prototype.popup = function(options) { nativeMenu = this; calls++; return originalPopup.call(this, options); };
      await run("dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true}));true");
      await delay(150);
      assert.equal(calls, 2, 'Keyboard context menu must reach the OS popup');
      // The real OS popup is dismissed before disposal; native rendering owns its geometry.
      nativeMenu.closePopup(window);
      await delay(100);
      assert.equal(await run("document.querySelector('.presence').dataset.menuOpen"), 'false');
      nativeMenu.items[3].click();
      await delay(50);
      assert.equal(manager.getSystemPresenceStatus().nucleusVisible, false);
      const report = { passed: true, platform: process.platform, nativeMenu: true, trustedIpc: true, actions };
      fs.writeFileSync(path.join(output, 'presence-menu-verification.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
    } finally { Menu.prototype.popup = originalPopup; manager.dispose(); }
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
  // #endregion
}
