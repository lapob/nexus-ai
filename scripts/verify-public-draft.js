/** @module scripts/verify-public-draft
 * Verifies private defaults, explicit tab-only recovery and local diagnostics.
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname,'../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const assert = require('node:assert/strict');
(async () => {
  // #region Isolated browser and private draft defaults
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let messages = 0;
    await page.route('https://ai.nexusnxs.com/**', r => {
      const url = new URL(r.request().url());
      if (url.pathname === '/') return r.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
      if (url.pathname === '/inter-latin.woff2') return r.fulfill({ contentType: 'font/woff2', body: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../.SITE/public/fonts/inter-latin.woff2')) });
      if (url.pathname.includes('/messages')) messages++;
      return r.fulfill({ json: url.pathname === '/api/guest/bootstrap' ? {token:'synthetic-qa',capabilities:{capabilities:[]}} : url.pathname === '/readyz' ? {status:'ready'} : {} });
    });
    await page.goto('https://ai.nexusnxs.com/');
    await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
    await page.locator('#profileSettings').click();
    await page.waitForTimeout(150);
    const frozen = await page.evaluate(() => nexusCosmicMetrics.renderer());
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => nexusCosmicMetrics.renderer().draws), frozen.draws);
    await page.locator('#profileSheet .sheet-top .sheet-close').click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(draws => nexusCosmicMetrics.renderer().draws > draws, frozen.draws));
    assert.equal(await page.locator('.composer-box input[type=checkbox]').count(), 0);
    await page.locator('#keyboard').click();
    await page.locator('#prompt').fill('Bozza privata non persistente');
    await page.locator('#keyboard').click();
    await page.locator('#keyboard').click();
    assert.equal(await page.locator('#prompt').inputValue(), 'Bozza privata non persistente');
    await page.evaluate(() => sessionStorage.setItem('nxs.tab-draft.v1', JSON.stringify({text:'Legacy private draft',savedAt:Date.now()})));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
    assert.equal(await page.locator('#prompt').inputValue(), '');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('nxs.tab-draft.v1')), null);
    // #endregion
    // #region Opt-in recovery, diagnostics and native overlay pause
    await page.locator('#profileSettings').click(); await page.locator('#profileDataTab').click();
    await page.locator('#profile-recovery-draft').selectOption('session');
    await page.locator('#profileSheet .sheet-top .sheet-close').click();
    if (!await page.locator('#prompt').isVisible()) await page.locator('#keyboard').click();
    await page.locator('#prompt').fill('Bozza locale di ripresa');
    await page.locator('#attachmentInput').setInputFiles({name:'private-attachment-sentinel.txt',mimeType:'text/plain',buffer:Buffer.from('private-attachment-sentinel-content')});
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
    assert.equal(await page.locator('#prompt').inputValue(),'Bozza locale di ripresa');
    assert.equal(await page.locator('.attachment-chip').count(),0);
    assert.match(await page.locator('#phase').textContent(),/allegati|attachments/i);
    assert.ok(!(await page.evaluate(()=>sessionStorage.getItem('nxs.tab-draft.v1'))).includes('private-attachment-sentinel'));
    await page.locator('#profileSettings').click(); await page.locator('#profileDataTab').click();
    await page.evaluate(()=>dispatchEvent(new ErrorEvent('error',{message:'private-diagnostic-sentinel',filename:'private-diagnostic-sentinel'})));
    const downloading=page.waitForEvent('download'); await page.locator('#profileDiagnostics').click();
    const file=await downloading, diagnostic=require('node:fs').readFileSync(await file.path(),'utf8');
    assert.ok(!/private-diagnostic-sentinel|Bozza locale/.test(diagnostic));
    assert.equal(JSON.parse(diagnostic).observations.scriptErrors,1);
    assert.equal(JSON.parse(diagnostic).uploaded,false);
    await page.locator('#profile-recovery-draft').selectOption('off');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('nxs.tab-draft.v1')),null);
    await page.locator('#profile-recovery-draft').selectOption('session');
    await page.locator('#profileSheet .sheet-top .sheet-close').click();
    await page.locator('#prompt').fill('Bozza da eliminare');
    await page.waitForTimeout(300);
    await page.locator('#memoryClear').click();
    await page.waitForFunction(()=>document.querySelector('#phase').textContent==='Memoria locale cancellata');
    await page.reload(); await page.waitForFunction(()=>document.documentElement.dataset.nxsBoot==='ready');
    assert.equal(await page.locator('#prompt').inputValue(),'');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('nxs.tab-draft.v1')),null);
    assert.equal(messages,0,'Recovery must never submit a draft automatically');
    const native = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await native.route('https://visualizer.nexus.invalid/', r => r.fulfill({ contentType:'text/html', body:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../android/NexusRemote/app/src/main/assets/cosmic-visualizers.html'),'utf8') }));
    await native.goto('https://visualizer.nexus.invalid/');
    await native.evaluate(()=>updateNexusVisual({visible:true,paused:false,state:'listening',energy:.3,bounds:[80,200,230,230]}));
    await native.waitForTimeout(250);
    await native.evaluate(()=>updateNexusVisual({visible:true,paused:true,state:'listening',energy:0,bounds:[80,200,230,230]}));
    await native.waitForTimeout(150); const stopped = await native.evaluate(()=>nexusVisualizer.getMetrics());
    await native.waitForTimeout(250); assert.equal(await native.evaluate(()=>nexusVisualizer.getMetrics().draws),stopped.draws);
    await native.evaluate(()=>updateNexusVisual({visible:true,paused:false,state:'listening',energy:.3,bounds:[80,200,230,230]}));
    await native.waitForTimeout(250);
    const resumed = await native.evaluate(()=>nexusVisualizer.getMetrics());
    assert.ok(resumed.draws>stopped.draws);assert.equal(resumed.preset,stopped.preset);assert.ok(resumed.elapsed-stopped.elapsed<.4);
    await native.close();
    console.log('PASS: modal pause/resume, private defaults, explicit tab draft/attachment recovery, deletion and diagnostics without content or automatic requests.');
    // #endregion
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
