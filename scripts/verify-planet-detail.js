/** @module scripts/verify-planet-detail Checks planet detail and state consistency. */
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname,'../../.toolchains/playwright');
const {chromium}=require('../../.SITE/node_modules/@playwright/test');
const {PUBLIC_AI_HTML}=require('../src/remote/remote-session-gateway');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,serviceWorkers:'block'});
  page.on('pageerror', error=>console.error('Browser:',error.message));
  await page.route('https://ai.nexusnxs.com/',r=>r.fulfill({contentType:'text/html',body:PUBLIC_AI_HTML}));
  await page.goto('https://ai.nexusnxs.com/');
  await page.waitForFunction(()=>nexusCosmicMetrics.renderer().arrival===1);
  for(const state of ['idle','listening','thinking','speaking']){
   await page.evaluate(state=>{document.getElementById('core').dataset.state=state;globalThis.nexusAiState.voiceEnergy=.45;},state);
   await page.waitForTimeout(800);
   const metrics=await page.evaluate(()=>nexusCosmicMetrics.renderer());
   assert.equal(metrics.preset,'saturn-experimental');assert.equal(metrics.planetOnly,true);assert.equal(metrics.ringVisibility,0);
   assert.ok(metrics.pixelRatio>=2.25,'Planet retains high density while adapting particle count');
   await page.screenshot({path:`qa-artifacts/planet-detail-${state}.png`});
  }
  console.log('PASS: single planet, no rings in all voice states, high-density backing surface.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
