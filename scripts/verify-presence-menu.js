/**
 * @module scripts/verify-presence-menu
 * @description Deterministic QA of the real Presence document with a mock action bridge.
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
  const result = spawnSync(require('electron'), [__filename], {
    cwd: root, env, windowsHide: true, stdio: 'inherit', timeout: 45_000
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = require('electron');
  const { systemPresenceDocument } = require('../src/infrastructure/electron/companion-window');
  fs.mkdirSync(output, { recursive: true });
  app.setPath('userData', fs.mkdtempSync(path.join(output, 'presence-menu-profile-')));
  app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  // #endregion
  // #region Geometry, interaction and screenshot assertions
  const mockBridge = `<script>
    window.presenceQA={actions:[],voice:0,interactive:[]};
    window.nexusPresence={onState(){},onConfiguration(){},
      setInteractive(value){presenceQA.interactive.push(value)},
      startVoice(){presenceQA.voice++},openMain(){presenceQA.actions.push('open-main')},
      menu(action){presenceQA.actions.push(action)}};
  </script>`;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const measurements = [];
  app.whenReady().then(async () => {
    for (const [size, locale] of [[128, 'it-IT'], [168, 'it-IT'], [300, 'it-IT'], [480, 'it-IT'], [128, 'en-US']]) {
      const window = new BrowserWindow({
        width: size, height: size, useContentSize: true, show: false,
        frame: false, transparent: true, backgroundColor: '#00000000',
        webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, offscreen: true }
      });
      try {
        const document = systemPresenceDocument({ interactive: true, locale })
          .replace('<head>', `<head>${mockBridge}`);
        const fixturePath = path.join(output, 'presence-menu-fixture.html');
        fs.writeFileSync(fixturePath, document);
        await window.loadFile(fixturePath);
        const run = (source) => window.webContents.executeJavaScript(source, true);
        const open = () => run("dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));true");
        await open();
        await delay(450);
        await run("document.querySelector('.presence-menu').getAnimations().forEach(animation=>animation.finish());true");
        const snapshot = await run(`(()=>{
          const menu=document.querySelector('.presence-menu');
          const box=menu.getBoundingClientRect(),style=getComputedStyle(menu);
          return {viewport:innerWidth,parent:menu.parentElement.tagName,
            width:box.width,height:box.height,left:box.left,top:box.top,
            background:style.backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,
            font:getComputedStyle(menu.querySelector('button')).fontSize,
            overflow:[...menu.querySelectorAll('button')].some(b=>b.scrollWidth>b.clientWidth||b.scrollHeight>b.clientHeight),
            focused:document.activeElement.dataset.action};
        })()`);
        assert.equal(snapshot.parent, 'BODY');
        assert.ok(snapshot.width <= 164.1 && snapshot.width >= 110);
        assert.ok(snapshot.left >= 5 && snapshot.top >= 1);
        assert.ok(snapshot.height < size);
        assert.equal(snapshot.background, 'rgba(0, 0, 0, 0)');
        assert.equal(snapshot.bodyBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(snapshot.font, '11px');
        assert.equal(snapshot.overflow, false);
        assert.equal(snapshot.focused, 'open-main');
        const screenshot = path.join(output, `presence-menu-${size}${locale === 'en-US' ? '-en' : ''}.png`);
        const capture = await window.webContents.capturePage();
        assert.equal(capture.toBitmap()[3], 0, 'The actual captured window corner must remain transparent.');
        fs.writeFileSync(screenshot, capture.toPNG());
        await run("dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));true");
        assert.equal(await run('document.activeElement.dataset.action'), 'minimize-main');
        await run("dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));true");
        assert.equal(await run('document.activeElement.dataset.action'), 'quit-desktop');
        await run("dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
        assert.equal(await run("document.querySelector('.presence-menu').hidden"), true);
        assert.equal(await run("document.activeElement.className"), 'core');
        for (const action of ['open-main', 'minimize-main', 'hide-presence', 'quit-desktop']) {
          await open();
          await run(`document.querySelector('[data-action="${action}"]').click();true`);
          assert.equal(await run("document.querySelector('.presence-menu').hidden"), true);
        }
        assert.deepEqual(await run('presenceQA.actions'), ['open-main', 'minimize-main', 'hide-presence', 'quit-desktop']);
        // Closing the menu by clicking its underlying core must not also start voice.
        await open();
        await run(`(()=>{const core=document.querySelector('.core');
          core.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
          core.click();return true})()`);
        await delay(400);
        assert.equal(await run('presenceQA.voice'), 0);
        // Opening a context menu cancels an already pending single-click voice action.
        await run("document.querySelector('.core').click();dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));true");
        await delay(250);
        assert.equal(await run('presenceQA.voice'), 0);
        measurements.push({ ...snapshot, locale, screenshot });
      } finally {
        window.destroy();
      }
    }
    fs.writeFileSync(path.join(output, 'presence-menu-verification.json'), JSON.stringify({ passed: true, measurements }, null, 2));
    console.log(JSON.stringify({ passed: true, measurements }, null, 2));
    app.quit();
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });
  // #endregion
}
