/** @module scripts/verify-mobile-keyboard
 * Local real-renderer regression for resized Android browser viewports.
 * Emulates keyboard geometry; does not claim to exercise a physical IME.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { browserExecutable, Cdp, freePort, waitForTarget, evaluateWhenReady } = require('./web-visual-regression');
async function main() {
  const output = path.resolve(__dirname, '../qa-artifacts/mobile-keyboard');
  fs.mkdirSync(output, {recursive:true});
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const gateway = new RemoteSessionGateway({statePath:path.join(profile,'gateway.json'),conversationStore:{list:()=>[]},logger:{info(){},warn(){}}});
  const server = http.createServer((req,res)=>gateway.handle(req,res,{publicIngress:true}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const port = await freePort();
  const child = spawn(browserExecutable(),['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,url],{windowsHide:true,stdio:'ignore'});
  let client;
  try {
    client = await new Cdp((await waitForTarget(port,url)).webSocketDebuggerUrl).open();
    for(const width of [360,390,412]) {
      const resize = height=>client.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
      await resize(844);
      await client.command('Page.reload',{ignoreCache:true});
      await evaluateWhenReady(client,`new Promise(resolve=>{const timer=setInterval(()=>{if(document.querySelector('#keyboard')){clearInterval(timer);resolve(true)}},30)})`,10000);
      await evaluateWhenReady(client,`document.querySelector('#keyboard').click(); true`);
      await resize(380);
      const result=await evaluateWhenReady(client,`new Promise(resolve=>setTimeout(()=>{
        document.querySelector('#prompt').focus();
        setTimeout(()=>{const node=document.querySelector('.dock'),dock=node.getBoundingClientRect(),input=document.querySelector('.composer-box').getBoundingClientRect(),style=getComputedStyle(node);resolve({ime:document.body.classList.contains('ime-visible'),top:dock.top,bottom:dock.bottom,width:input.width,viewport:visualViewport.height,transform:style.transform,cssTop:style.top,dockHeight:getComputedStyle(document.documentElement).getPropertyValue('--nxs-dock-height'),ghost:getComputedStyle(document.querySelector('.copy')).visibility,overflow:document.documentElement.scrollWidth>innerWidth})},120);
      },240))`);
      assert.equal(result.ime,true,JSON.stringify(result));
      assert.ok(result.top>=70&&result.bottom<=result.viewport&&result.bottom>=result.viewport-25,JSON.stringify(result));
      assert.ok(result.width>=width-30,JSON.stringify(result));
      assert.equal(result.ghost,'hidden'); assert.equal(result.overflow,false);
      const screenshot=await client.command('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,`keyboard-${width}.png`),Buffer.from(screenshot.data,'base64'));
      for(const state of ['conversation-active','request-active']) {
        const active=await evaluateWhenReady(client,`new Promise(resolve=>{document.body.classList.add('${state}');setTimeout(()=>{const r=document.querySelector('.dock').getBoundingClientRect();resolve({top:r.top,bottom:r.bottom,height:visualViewport.height})},120)})`);
        assert.ok(active.top>=70&&active.bottom<=active.height,JSON.stringify(active));
      }
      await resize(844);
      const closed=await evaluateWhenReady(client,`new Promise(resolve=>setTimeout(()=>{document.querySelector('#prompt').blur();resolve(!document.body.classList.contains('ime-visible'))},120))`);
      assert.equal(closed,true);
      console.log(`PASS ${width}px: keyboard viewport, full-width input, idle/conversation/generating dock bounds, no ghost title, restore.`);
    }
  } finally {
    try{await client?.command('Browser.close')}catch{}
    client?.close(); if(child.exitCode===null)child.kill();
    await gateway.stop(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>setTimeout(resolve,500));
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
