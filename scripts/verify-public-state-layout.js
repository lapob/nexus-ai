/** @module scripts/verify-public-state-layout
 * Verifies narrow, landscape and enlarged-text layouts with synthetic conversations.
 */
const path=require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname,'../../.toolchains/playwright');
const {chromium}=require('../../.SITE/node_modules/@playwright/test');
const {PUBLIC_AI_HTML}=require('../src/remote/remote-session-gateway');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output=path.resolve(__dirname,'../qa-artifacts');
(async()=>{
 const browser=await chromium.launch({headless:true}); const report=[];
 try { for(const [width,height,font] of [[320,568,100],[390,844,200],[844,390,100],[1440,900,100]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
  await page.route('https://ai.nexusnxs.com/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:PUBLIC_AI_HTML});
   if(url.pathname==='/api/guest/bootstrap')return route.fulfill({json:{token:'synthetic-qa',capabilities:{capabilities:[]}}});
   if(url.pathname==='/api/guest/messages/stream'){const answer='Risposta di prova.\n\n'+('Un paragrafo lungo per controllare leggibilità, scorrimento e separazione dai comandi.\n\n').repeat(12);return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'token',token:answer})+'\n'+JSON.stringify({type:'complete',message:answer})+'\n'});}
   if(url.pathname!=='/readyz')return route.continue();
   return route.fulfill({json:{ready:true,status:'ready'}});
  });
  await page.goto('https://ai.nexusnxs.com/');
  if(font!==100)await page.addStyleTag({content:`html{font-size:${font}%!important}`});
  const capture=async state=>{await page.waitForTimeout(600);report.push({width,height,font,state,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>.1}).map(el=>({id:el.id,rect:el.getBoundingClientRect().toJSON()}))}))});await page.screenshot({path:path.join(output,`web-state-${width}-${font}-${state}.png`)});};
  await capture('idle');
  assert.equal(await page.locator('.identity').evaluate(el=>getComputedStyle(el,'::before').opacity),'0','Idle chrome must not tint the shared background');
  await page.locator('#download').click();await capture('download');await page.locator('#sheetClose').click();
  await page.locator('#keyboard').click();await page.locator('#prompt').fill('Prova sintetica della disposizione');await capture('compose');await page.locator('#send').click();await page.locator('#answer').filter({hasText:'Risposta di prova.'}).waitFor();await capture('answer');
  const brand=await page.locator('.brand-lockup').boundingBox(),state=await page.locator('.identity .state').boundingBox();
  assert.equal(brand.x<state.x+state.width&&brand.x+brand.width>state.x&&brand.y<state.y+state.height&&brand.y+brand.height>state.y,false,'Brand and service state must not overlap');
  assert.equal(report.some(item=>item.overflow),false,'No horizontal overflow');
  if(width<=560){const box=await page.locator('.composer-box').boundingBox(),composer=await page.locator('.composer').boundingBox();const inset=await page.locator('.composer').evaluate(el=>{const s=getComputedStyle(el);return parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+parseFloat(s.borderLeftWidth)+parseFloat(s.borderRightWidth)});assert.ok(Math.abs(box.width-(composer.width-inset))<=2,'Mobile text spans the composer content area');}
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture('answer-start');
  const glass=await page.evaluate(()=>{
   const top=getComputedStyle(document.querySelector('.identity'),'::before'),bottom=getComputedStyle(document.querySelector('.dock'),'::before');
   return {top:top.backgroundColor,bottom:bottom.backgroundColor,surface:getComputedStyle(document.body).backgroundColor,topWidth:parseFloat(top.width),bottomWidth:parseFloat(bottom.width),visible:top.opacity,topMask:top.maskImage,bottomMask:bottom.maskImage};
  });
  assert.equal(glass.top,glass.surface);assert.equal(glass.bottom,glass.surface);
  assert.equal(glass.visible,'1');assert.ok(glass.topWidth>=width&&glass.bottomWidth>=width);
  assert.ok(glass.topMask.includes('gradient')&&glass.bottomMask.includes('gradient'),'Both reading edges fade continuously');
  await page.locator('#prompt').fill('Bozza mantenuta durante il cambio rete');
  await page.context().setOffline(true);await page.evaluate(()=>dispatchEvent(new Event('offline')));
  await page.waitForFunction(()=>document.body.dataset.serviceReadiness==='offline');
  assert.equal(await page.locator('#send').isDisabled(),true,'Offline requests stay disabled');
  await capture('offline');
  const offlineState=await page.locator('.identity .state').boundingBox(),header=await page.locator('.identity').boundingBox();
  assert.ok(offlineState.y>=header.y&&offlineState.y+offlineState.height<=header.y+header.height,'Offline status stays inside the header');
  await page.context().setOffline(false);await page.evaluate(()=>dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.body.dataset.serviceReadiness==='ready');
  assert.equal(await page.locator('#prompt').inputValue(),'Bozza mantenuta durante il cambio rete');
  assert.equal(await page.locator('#send').isDisabled(),false,'Reconnect restores sending');
  await capture('reconnected');
  await page.evaluate(()=>{const phase=document.getElementById('phase');phase.textContent='Connessione interrotta. Il messaggio resta disponibile: riprova quando la rete torna attiva.';phase.className='phase error';document.body.classList.add('status-active');});
  await capture('notice');
  const notice=await page.locator('#phase').boundingBox();
  assert.ok(notice&&notice.width<=width&&notice.x>=0&&notice.x+notice.width<=width,'Long notices remain within the viewport');
  const dockWidth=await page.locator('.dock').evaluate(el=>el.getBoundingClientRect().width);
  assert.ok(dockWidth<=680,'Composer stays compact on large screens');
  await page.close();
 }}finally{fs.writeFileSync(path.join(output,'web-states-report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log('Captured '+report.length+' web states');
})().catch(e=>{console.error(e);process.exitCode=1});
