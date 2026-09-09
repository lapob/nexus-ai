/** @module scripts/verify-cosmic-layout
 * Browser checks using the workspace site's Playwright toolchain.
 */
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const { createCosmicVisualizers } = require('../src/shared/cosmic-visualizers');
const { createDesktopRecipes } = require('../src/shared/desktop-recipes');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const [width, height] of [[320,568],[390,568],[844,390],[1440,900],[1920,1080]]) for (const seed of [.1,.5,.99]) {
      const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('https://ai.nexusnxs.com/', r => r.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML.replace('{ host: button, efficient,', `{ host: button, efficient, random:()=>${seed},`) }));
      await page.goto('https://ai.nexusnxs.com/');
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 1);
      const framing = await page.evaluate(() => {
        const core = document.getElementById('core').getBoundingClientRect();
        const title = document.querySelector('h1').getBoundingClientRect();
        const controls = ['keyboard','attachment'].map(id => document.getElementById(id).getBoundingClientRect().toJSON());
        return { core: core.toJSON(), title: title.toJSON(), controls, overflow: document.documentElement.scrollWidth > innerWidth, ...nexusCosmicMetrics.renderer() };
      });
      assert.equal(framing.overflow, false);
      assert.equal(framing.backend, 'webgl');
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.equal(overlaps(framing.core, framing.title), false, 'Idle Core must not overlap its title');
      for (const control of framing.controls) {
        assert.equal(overlaps(control, framing.title), false, 'Controls must not overlap the title');
        assert.ok(control.bottom <= height && control.top >= 0, 'Controls fit the viewport');
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `qa-artifacts/core-framing-${width}-${framing.preset}.png` });
      await page.locator('#keyboard').click();
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 0);
      await page.locator('#prompt').fill('Prova di una bozza lunga. '.repeat(30));
      const composer = await page.locator('.composer').boundingBox();
      assert.ok(composer.x >= 0 && composer.x + composer.width <= width, 'Composer fits horizontally');
      assert.ok(composer.y >= 0 && composer.y + composer.height <= height, 'Composer fits vertically');
      await page.locator('#keyboard').click();
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      report.push({ width, height, framing }); await page.close();
    }
    const page = await browser.newPage({ viewport: { width:390, height:568 } });
    await page.setContent(`<style>body{margin:0}canvas{width:390px;height:568px}#host{position:absolute;left:45px;top:100px;width:300px;height:300px}</style><canvas></canvas><div id="host"></div>`);
    await page.evaluate(({runtime, recipes}) => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl' ? null : original.call(this,type,...args); };
      window.shown=true;
      window.core=eval(`(${runtime})`)(document.querySelector('canvas'), {host:document.getElementById('host'),getVisible:()=>shown,getReduced:()=>true},eval(`(${recipes})`));
    }, {runtime:String(createCosmicVisualizers),recipes:String(createDesktopRecipes)});
    await page.waitForTimeout(150);
    const painted = await page.evaluate(() => document.querySelector('canvas').getContext('2d').getImageData(0,0,390,568).data.some((value,index)=>index%4===3&&value>0));
    assert.equal(painted,true);
    await page.evaluate(()=>{shown=false;core.refresh();});
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.querySelector('canvas').getContext('2d').getImageData(0,0,390,568).data.some((value,index)=>index%4===3&&value>0)),false);
    report.push({ fallbackHiddenClearsCanvas:true });
    fs.writeFileSync('qa-artifacts/core-framing-report.json',JSON.stringify(report,null,2));
    console.log('PASS 15 layouts, Core/title/control separation, composer bounds, gather/release and reduced motion; software fallback clears hidden Core.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
