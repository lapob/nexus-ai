/** @module scripts/verify-public-personalization CSP-enforced profile layout and preference persistence. */
// #region Dependencies and isolated browser tools
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { PUBLIC_PROFILE_STYLE } = require('../src/remote/public-conversation-preferences');
const { colors } = require('../config/nexus-design-tokens.json');
const { browserExecutable, Cdp, evaluateWhenReady, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');
// #endregion

// #region CSP, responsive layout and preference scenarios
async function main() {
  const live = process.argv.includes('--live');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-profile-'));
  const output = path.resolve(__dirname, '../qa-artifacts');
  const port = await freePort(), publicPort = await freePort(), debugPort = await freePort();
  const gateway = new RemoteSessionGateway({ statePath: path.join(profile, 'gateway.json'), publicPort,
    conversationStore: { list: () => [], save: value => value }, logger: { info() {}, warn() {} } });
  let client, child;
  try {
    if (!live) await gateway.configure({ enabled: true, allowLan: false, port });
    const url = live ? 'https://ai.nexusnxs.com/' : `http://127.0.0.1:${publicPort}/`;
    const response = await fetch(url);
    const nonce = response.headers.get('content-security-policy').match(/style-src 'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, 'Public styles require a CSP nonce');
    assert.ok((await response.text()).includes(PUBLIC_PROFILE_STYLE.replace('<style>', `<style nonce="${nonce}">`)), 'Profile CSS must carry the response nonce');
    child = spawn(browserExecutable(), ['--headless=new', '--lang=en-US', `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', url], { stdio: 'ignore', windowsHide: true });
    client = await new Cdp((await waitForTarget(debugPort, url)).webSocketDebuggerUrl).open();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !await client.evaluate("Boolean(document.querySelector('#profileSettings')&&document.querySelector('#profileSheet'))")) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await client.evaluate("Boolean(document.querySelector('#profileSettings')&&document.querySelector('#profileSheet'))"), true,
      JSON.stringify(await client.evaluate("({title:document.title,url:location.href,core:!!document.querySelector('#core'),ready:document.readyState})")));
    const report = [];
    const rgb = hex => `rgb(${hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ')})`;
    for (const [width, height, textScale = 1] of [[320, 568], [390, 844], [844, 390], [390, 844, 2], [1440, 900]]) {
      await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await client.evaluate(`document.documentElement.style.fontSize=${JSON.stringify(`${textScale * 100}%`)};true`);
      const geometry = await evaluateWhenReady(client, `new Promise(resolve=>{
        const trigger=document.querySelector('#profileSettings'),dialog=document.querySelector('#profileSheet');
        if(dialog.open)dialog.close(); trigger.click();
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const fields=document.querySelector('.profile-fields'),download=document.querySelector('#download'),
            rows=[...fields.querySelectorAll('label')],selects=[...fields.querySelectorAll('select')],box=dialog.getBoundingClientRect();
          const rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
          resolve({title:document.querySelector('#profileTitle').textContent,layout:getComputedStyle(fields).display,
            selectHeight:Math.min(...selects.map(s=>s.getBoundingClientRect().height)),
            surface:getComputedStyle(dialog).backgroundColor,fieldSurface:getComputedStyle(selects[0]).backgroundColor,
            foreground:getComputedStyle(selects[0]).color,font:getComputedStyle(selects[0]).fontFamily,
            closeSize:rect(dialog.querySelector('.sheet-close')),titleBox:rect(document.querySelector('#profileTitle')),
            visibleIcon:getComputedStyle(trigger.querySelector('svg')).display!=='none'&&trigger.querySelector('svg').getBoundingClientRect().width>=19,
            downloadIcon:getComputedStyle(download.querySelector('svg')).display!=='none',
            downloadTextHidden:getComputedStyle(download.querySelector('span')).display==='none',
            horizontalOverflow:box.left<0||box.right>innerWidth||dialog.scrollWidth>dialog.clientWidth,rows:rows.map(rect),box:rect(dialog)});
        }));
      })`);
      assert.equal(geometry.title, 'Personalizzazione');
      assert.equal(geometry.layout, 'grid');
      assert.ok(geometry.selectHeight >= 46);
      assert.equal(geometry.surface, rgb(colors.surface));
      assert.equal(geometry.fieldSurface, rgb(colors.surfaceRaised));
      assert.equal(geometry.foreground, rgb(colors.ice));
      assert.match(geometry.font, /Inter/i);
      assert.ok(geometry.closeSize.width >= 48 && geometry.closeSize.height >= 48);
      assert.ok(geometry.titleBox.right + 12 <= geometry.closeSize.left, 'title and close action must not collide');
      assert.ok(geometry.closeSize.right <= geometry.box.right, 'close action must remain inside the dialog');
      assert.ok(geometry.visibleIcon && geometry.downloadIcon && geometry.downloadTextHidden);
      assert.equal(geometry.horizontalOverflow, false);
      for (let i = 1; i < geometry.rows.length; i++) assert.ok(geometry.rows[i].top >= geometry.rows[i - 1].bottom + 12);
      const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `public-personalization-${width}${textScale === 1 ? '' : '-text200'}.png`), Buffer.from(screenshot.data, 'base64'));
      report.push({ width, height, textScale, ...geometry });
    }
    assert.equal(await client.evaluate(`(()=>{
      const choice=document.querySelector('#profile-tone');choice.value='warm';choice.dispatchEvent(new Event('change'));
      document.querySelector('#profileSheet').close();document.querySelector('#profileSettings').click();
      return choice.value==='warm'&&JSON.parse(localStorage.getItem('nexusnxs.conversation.preferences.v1')).tone==='warm';
    })()`), true);
    assert.equal(await client.evaluate(`(()=>{document.querySelector('#profileReset').click();return document.querySelector('#profile-tone').value==='neutral'})()`), true);
    await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluateWhenReady(client, `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(!document.querySelector('#profileSheet').open&&document.activeElement===document.querySelector('#profileSettings')))))`), true);
    const actions = await client.evaluate(`(()=>{const a=document.querySelector('#profileSettings').getBoundingClientRect(),b=document.querySelector('#download').getBoundingClientRect();return {overlap:Math.min(a.right,b.right)-Math.max(a.left,b.left)>0,width:a.width,downloadWidth:b.width}})()`);
    assert.equal(actions.overlap, false);
    fs.writeFileSync(path.join(output, 'public-personalization-report.json'), JSON.stringify({ passed: true, live, cspEnforced: true, saveResetPassed: true, actions, report }, null, 2));
    console.log('PASS: CSP profile styles, 5 viewport/text scenarios, shared neutral tokens, keyboard focus, save/reset.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close(); if (child && child.exitCode === null) child.kill();
    await gateway.stop(); await removeTemporaryPath(profile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
