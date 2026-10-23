/** @module scripts/verify-public-personalization CSP-enforced profile layout and preference persistence. */
// #region Dependencies and isolated browser tools
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway, PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const { createPublicLocalMemory } = require('../src/remote/public-local-memory');
const { PUBLIC_PROFILE_STYLE } = require('../src/remote/public-conversation-preferences');
const { colors } = require('../config/nexus-design-tokens.json');
const { browserExecutable, Cdp, evaluateWhenReady, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');
// #endregion

// #region CSP, responsive layout and preference scenarios
async function main() {
  const live = process.argv.includes('--live');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-profile-'));
  const output = path.resolve(__dirname, '../qa-artifacts');
  const reportPath = path.join(output, 'public-personalization-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ passed: false, startedAt: new Date().toISOString() }));
  const port = await freePort(), publicPort = await freePort(), debugPort = await freePort();
  const gateway = new RemoteSessionGateway({ statePath: path.join(profile, 'gateway.json'), publicPort,
    conversationStore: { list: () => [], save: value => value },
    // Configuration is available while inference is deliberately not ready.
    voiceTranscriber: async () => ({ text: 'unused fixture' }), voiceSynthesizer: async () => ({ audio: Buffer.alloc(0) }),
    logger: { info() {}, warn() {} } });
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
      const header = await client.evaluate(`(()=>{
        const body=document.body,saved=body.dataset.serviceReadiness,active=body.classList.contains('request-active');
        body.classList.remove('request-active','conversation-active');body.dataset.serviceReadiness='ready';
        const state=document.querySelector('.identity .state'),settings=document.querySelector('#profileSettings'),download=document.querySelector('#download');
        const a=settings.getBoundingClientRect(),b=download.getBoundingClientRect();
        const result={stateHidden:getComputedStyle(state).display==='none',gap:b.left-a.right,
          sharedIcons:[settings,download].every(button=>button.querySelector('svg.nxs-symbol path[fill="currentColor"]'))};
        body.dataset.serviceReadiness=saved;if(active)body.classList.add('request-active');return result;
      })()`);
      assert.equal(header.stateHidden, true, 'Idle service status must not leave a vacant header slot');
      assert.ok(header.gap >= 0 && header.gap <= 16, 'Settings and download remain adjacent');
      assert.equal(header.sharedIcons, true, 'Header symbols match the shared native catalog');
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
            sectionLabels:[...dialog.querySelectorAll('summary>span')].map(label=>({text:label.textContent,overflow:label.scrollWidth>label.clientWidth,wrap:getComputedStyle(label.parentElement).overflowWrap})),
            horizontalOverflow:box.left<0||box.right>innerWidth||dialog.scrollWidth>dialog.clientWidth,rows:rows.map(rect),box:rect(dialog)});
        }));
      })`);
      assert.equal(geometry.title, 'Impostazioni');
      assert.equal(geometry.layout, 'grid');
      assert.ok(geometry.selectHeight >= 46);
      assert.equal(geometry.surface, rgb(colors.surface));
      assert.equal(geometry.fieldSurface, rgb(colors.surfaceRaised));
      assert.equal(geometry.foreground, rgb(colors.ice));
      assert.match(geometry.font, /Inter/i);
      assert.ok(geometry.closeSize.width >= 48 && geometry.closeSize.height >= 48, JSON.stringify({ width, height, textScale, close: geometry.closeSize }));
      assert.ok(geometry.titleBox.right + 12 <= geometry.closeSize.left, 'title and close action must not collide');
      assert.ok(geometry.closeSize.right <= geometry.box.right, 'close action must remain inside the dialog');
      assert.ok(geometry.visibleIcon && geometry.downloadIcon && geometry.downloadTextHidden);
      assert.equal(geometry.horizontalOverflow, false);
      assert.ok(geometry.sectionLabels.every(label => !label.overflow && label.wrap === 'normal'), 'Section titles retain whole words without horizontal overflow at enlarged text sizes');
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
    await client.evaluate(`document.querySelector('#profileSettings').click();document.querySelector('#profile-tone').focus();true`);
    let nativePicker = false;
    if (await client.evaluate(`CSS.supports('appearance','base-select')`)) {
      const field = await client.evaluate(`(()=>{const b=document.querySelector('#profile-tone').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
      await client.command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...field });
      await client.command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...field });
      nativePicker = await evaluateWhenReady(client, `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector('#profile-tone').matches(':open')))))`);
      const openImage = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, 'public-personalization-open-picker.png'), Buffer.from(openImage.data, 'base64'));
      assert.equal(nativePicker, true, 'the actual native picker must open: ' + JSON.stringify(await client.evaluate(`({appearance:getComputedStyle(document.querySelector('#profile-tone')).appearance,active:document.activeElement?.id,dialog:document.querySelector('#profileSheet').open})`)));
      assert.equal(await client.evaluate(`getComputedStyle(document.querySelector('#profile-tone'),'::picker(select)').backgroundColor`), rgb(colors.surfaceRaised));
      for (const [key, code, virtual] of [['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13]]) {
        await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtual });
        await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtual });
      }
      assert.equal(await client.evaluate(`document.querySelector('#profile-tone').value`), 'warm');
      assert.equal(await client.evaluate(`JSON.parse(localStorage.getItem('nexusnxs.conversation.preferences.v1')).tone`), 'warm');
      assert.equal(await client.evaluate(`document.querySelector('#profileSheet').open`), true);
    }
    await client.evaluate(`document.querySelector('#profileServices').open=true;true`);
    await evaluateWhenReady(client, `new Promise(resolve=>{const check=()=>document.querySelector('#profileServices').getAttribute('aria-busy')==='true'||document.querySelector('#profile-service-engine').textContent==='Da verificare'?setTimeout(check,30):resolve(true);check();})`);
    if (!live) {
      assert.equal(await client.evaluate(`document.querySelector('#profile-service-engine').textContent`), 'Non disponibile');
      assert.equal(await client.evaluate(`document.querySelector('#profile-service-voice-input').textContent`), 'Disponibile');
      assert.equal(await client.evaluate(`document.querySelector('#profile-service-voice-output').textContent`), 'Disponibile');
    }
    const expandedImage = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, 'public-personalization-services.png'), Buffer.from(expandedImage.data, 'base64'));
    // A deliberately late mock response must not mutate a dismissed sheet.
    assert.equal(await client.evaluate(`(async()=>{
      const original=fetch,releases=[];globalThis.fetch=(url,options)=>['/readyz','/api/capabilities'].includes(url)?new Promise(resolve=>releases.push(()=>resolve(new Response(JSON.stringify(url==='/readyz'?{status:'ready'}:{capabilities:[]}),{status:200})))):original(url,options);
      document.querySelector('#profileServiceRetry').click();
      const before=[...document.querySelectorAll('.profile-service-row output')].map(node=>node.textContent).join('|');
      document.querySelector('#profileSheet').close();for(const release of releases)release();
      await new Promise(resolve=>setTimeout(resolve,80));globalThis.fetch=original;
      return !document.querySelector('#profileSheet').open&&before===[...document.querySelectorAll('.profile-service-row output')].map(node=>node.textContent).join('|');
    })()`), true);
    for (const [width, height, scale] of [[320, 568, 1], [390, 844, 2], [844, 390, 1], [1440, 900, 1]]) {
      await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      const expanded = await client.evaluate(`new Promise(resolve=>{
        document.documentElement.style.fontSize='${scale * 100}%';document.querySelector('#profileSettings').click();
        document.querySelector('#profileConversation').open=false;document.querySelector('#profileServices').open=true;document.querySelector('#profileData').open=true;
        document.querySelector('#profileDelete').click();const dialog=document.querySelector('#profileSheet');dialog.scrollTop=dialog.scrollHeight;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{const box=dialog.getBoundingClientRect(),close=dialog.querySelector('.sheet-top .sheet-close').getBoundingClientRect();resolve({overflow:dialog.scrollWidth>dialog.clientWidth,closeVisible:close.top>=box.top&&close.bottom<=box.bottom&&close.right<=box.right});}));
      })`);
      assert.equal(expanded.overflow, false); assert.equal(expanded.closeVisible, true, 'close must remain reachable while scrolling expanded settings');
      const picture = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `public-settings-expanded-${width}-${scale}.png`), Buffer.from(picture.data, 'base64'));
      await client.evaluate(`document.querySelector('#profileDeleteCancel').click();document.querySelector('#profileConversation').open=true;document.querySelector('#profileServices').open=false;document.querySelector('#profileData').open=false;document.querySelector('#profileSheet').close();true`);
    }
    if (!live) {
      await client.evaluate(`(async()=>{const memory=(${createPublicLocalMemory.toString()})(()=>{});await memory.read();await memory.write([{role:'user',content:'Synthetic settings question'},{role:'assistant',content:'Synthetic settings answer'}]);return true})()`);
      const timeOrigin = await client.evaluate('performance.timeOrigin');
      await client.command('Page.reload', { ignoreCache: true });
      await evaluateWhenReady(client, `new Promise(resolve=>{const check=()=>performance.timeOrigin===${timeOrigin}||document.documentElement.dataset.nxsBoot!=='ready'?setTimeout(check,30):resolve(true);check();})`);
      const data = await client.evaluate(`(async()=>{
        document.querySelector('#profileSettings').click();document.querySelector('#profileData').open=true;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let exported;
        URL.createObjectURL=blob=>{exported=blob;return create(blob)};HTMLAnchorElement.prototype.click=function(){if(this.download!=='nexusnxs-conversazione.json')click.call(this)};
        document.querySelector('#profileExport').click();const payload=JSON.parse(await exported.text());
        URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;
        document.querySelector('#profileDelete').click();const confirmationShown=!document.querySelector('.profile-confirm').hidden;
        document.querySelector('#profileDeleteCancel').click();
        const memory=(${createPublicLocalMemory.toString()})(()=>{});const retained=(await memory.read()).length;
        document.querySelector('#profileDelete').click();document.querySelector('#profileDeleteConfirm').click();
        let remaining=2;for(let i=0;i<40&&remaining;i++){remaining=(await memory.read()).length;if(remaining)await new Promise(resolve=>setTimeout(resolve,30));}
        return {schema:payload.schema,turns:payload.turns,confirmationShown,retained,remaining,closed:!document.querySelector('#profileSheet').open,preferencesCleared:!localStorage.getItem('nexusnxs.conversation.preferences.v1')};
      })()`);
      assert.equal(data.schema, 'nexusnxs.conversation.export.v1');
      assert.deepEqual(data.turns, [{ role: 'user', content: 'Synthetic settings question' }, { role: 'assistant', content: 'Synthetic settings answer' }]);
      assert.equal(data.confirmationShown, true); assert.equal(data.retained, 2); assert.equal(data.remaining, 0);
      assert.equal(data.closed && data.preferencesCleared, true);
    }
    fs.writeFileSync(reportPath, JSON.stringify({ passed: true, live, sourceSha256: require('node:crypto').createHash('sha256').update(PUBLIC_AI_HTML).digest('hex'), cspEnforced: true, saveResetPassed: true, nativePicker, lateStatusIgnored: true, syntheticHistoryExportDeletePassed: !live, actions, report }, null, 2));
    console.log('PASS: neutral sections/native picker, status/readiness, late responses, synthetic history export/delete, 5 viewport/text scenarios, CSP and keyboard.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close(); if (child && child.exitCode === null) child.kill();
    await gateway.stop(); await removeTemporaryPath(profile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
