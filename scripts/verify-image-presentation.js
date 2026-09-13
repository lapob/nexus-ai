/** @module scripts/verify-image-presentation Verifies the cosmic wait state and image lifecycle. */
// #region Image request, download and failure recovery
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname,'../../.toolchains/playwright');
const {chromium}=require('../../.SITE/node_modules/@playwright/test');
const {PUBLIC_AI_HTML}=require('../src/remote/remote-session-gateway');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const fixture=fs.readFileSync(require('node:path').resolve(__dirname,'../../.SITE/public/og.png'));
(async()=>{const browser=await chromium.launch();try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844},locale:'it-IT',serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let pendingImage, imageStatus=200;
  await page.route('https://ai.nexusnxs.com/**',r=>{
   const path=new URL(r.request().url()).pathname;
   if(path==='/')return r.fulfill({contentType:'text/html',body:PUBLIC_AI_HTML});
   if(path==='/nexus-icon.png')return r.fulfill({contentType:'image/png',body:fixture});
   if(path==='/readyz')return r.fulfill({json:{ready:true,status:'ready'}});
   if(path.includes('bootstrap'))return r.fulfill({json:{token:'qa',capabilities:{capabilities:[{id:'image-generation',state:'available'}]}}});
   if(path.includes('/images/generate'))return new Promise(resolve=>{pendingImage=async()=>{await r.fulfill(imageStatus===200?{contentType:'image/png',body:fixture}:{status:503,json:{error:'Servizio immagini non disponibile'}}).catch(()=>{});resolve();};});
   if(path.includes('/messages/stream'))return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'complete',message:'Puoi scaricarla dal pulsante sotto l’immagine.'})+'\n'});
   return r.fulfill({json:{}});
  });
  await page.goto('https://ai.nexusnxs.com/');await page.locator('#keyboard').click();await page.locator('#prompt').fill('Genera una immagine cosmica');await page.locator('#send').click();
  await page.waitForFunction(()=>document.body.classList.contains('image-generating'));
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('#send').getAttribute('data-mode'),'stop');
  assert.equal(await page.locator('#core').isVisible(),true);
  await page.screenshot({path:`qa-artifacts/image-pending-${width}.png`});
  await pendingImage();await page.locator('#imageResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('image-generating')),false);
  assert.equal(await page.locator('#imageResult').evaluate(el=>getComputedStyle(el).borderWidth),'0px');
  const download=page.waitForEvent('download');await page.locator('#imageDownload').click();assert.match((await download).suggestedFilename(),/^nexusnxs-\d+\.png$/);
  await page.screenshot({path:`qa-artifacts/image-ready-${width}.png`});
  await page.locator('#prompt').fill('Come posso scaricarla?');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#answer').textContent.includes('scaricarla'));
  assert.equal(await page.locator('#sessionHistory .generated-image img').count(),1);
  assert.ok(await page.locator('#sessionHistory .generated-image img').evaluate(el=>el.complete&&el.naturalWidth>0));
  imageStatus=503;await page.locator('#prompt').fill('Genera una immagine nuova');await page.locator('#send').click();await page.waitForFunction(()=>document.body.classList.contains('image-generating'));await pendingImage();
  await page.waitForFunction(()=>document.querySelector('#phase').textContent.includes('Servizio immagini non disponibile'));
  assert.equal(await page.evaluate(()=>document.body.classList.contains('image-generating')),false);
  assert.equal(await page.locator('#prompt').inputValue(),'Genera una immagine nuova');
  imageStatus=200;await page.locator('#send').click();await page.waitForFunction(()=>document.body.classList.contains('image-generating'));await page.locator('#send').click();await pendingImage();
  await page.waitForFunction(()=>document.querySelector('#phase').textContent.includes('Risposta interrotta'));
  assert.equal(await page.evaluate(()=>document.body.classList.contains('image-generating')),false);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: cosmic wait, borderless image, download, retained history, failure and cancellation recovery`);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
// #endregion
