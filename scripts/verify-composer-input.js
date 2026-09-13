/** @module scripts/verify-composer-input Verifies file selection and resumable requests in the public composer. */
// #region Composer regression coverage
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname,'../../.toolchains/playwright');
const {chromium}=require('../../.SITE/node_modules/@playwright/test');
const {PUBLIC_AI_HTML}=require('../src/remote/remote-session-gateway');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:844},serviceWorkers:'block',locale:'it-IT'});
   const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://ai.nexusnxs.com/**',r=>{
    const path=new URL(r.request().url()).pathname;
    if(path==='/')return r.fulfill({contentType:'text/html',body:PUBLIC_AI_HTML});
    if(path==='/readyz')return r.fulfill({json:{ready:true,status:'ready'}});
    if(path.includes('bootstrap'))return r.fulfill({json:{token:'qa',capabilities:{capabilities:[]}}});
    if(path.includes('/messages/stream')){
     requests.push(r.request().postDataJSON());
     return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify(requests.length===1?{type:'token',token:'Ecco ',cursor:5}:{type:'complete',message:'Ecco il documento.',cursor:18})+'\n'});
    }
    return r.fulfill({json:{}});
   });
   await page.goto('https://ai.nexusnxs.com/');
   await page.locator('#attachmentInput').setInputFiles({name:'prova.md',mimeType:'',buffer:Buffer.from('# Verifica\nDocumento sintetico.')});
   await page.waitForFunction(()=>document.querySelector('#attachment').dataset.count==='1');
   await page.locator('#attachmentInput').setInputFiles({name:'non-supportato.exe',mimeType:'application/x-msdownload',buffer:Buffer.from('invalid')});
   await page.waitForFunction(()=>document.querySelector('#phase').textContent.includes('Formato'));
   assert.equal(await page.locator('.attachment-chip').count(),1,'Invalid selection must retain the existing file');
   await page.locator('#reasoningToggle').click();
   await page.locator('#prompt').fill('Riassumi questo documento');
   await page.screenshot({path:`qa-artifacts/composer-${width}.png`});
   const layout=await page.evaluate(()=>{
    const ids=['attachment','keyboard','reasoningToggle','send'];
    const rects=ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
    return {overflow:document.documentElement.scrollWidth>innerWidth,rects};
   });
   assert.equal(layout.overflow,false);
   for(let i=0;i<layout.rects.length;i++)for(let j=i+1;j<layout.rects.length;j++){
    const a=layout.rects[i],b=layout.rects[j];
    assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,`Collision ${a.id}/${b.id}: ${JSON.stringify(layout)}`);
   }
   await page.locator('#send').click();
   await page.waitForFunction(()=>document.querySelector('#answer').textContent.includes('Ecco il documento.'));
   assert.equal(requests.length,2);
   assert.equal(requests[0].mode,'deep');
   assert.equal(requests[0].attachments[0].mime,'text/markdown');
   assert.deepEqual(requests[1].attachments,requests[0].attachments);
   assert.equal(requests[1].clientMessageId,requests[0].clientMessageId);
   assert.equal(requests[1].cursor,5);
   assert.equal(requests[1].mode,'deep');
   assert.equal(await page.locator('.attachment-chip').count(),0);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: MIME fallback, invalid-file recovery, unified toolbar, reasoning and attachment-preserving stream retry`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
// #endregion
