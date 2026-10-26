/** @module scripts/verify-cosmic-zoom Real pinch, wheel and GPU framing without microphones or inference. */
// #region Isolated application and browser
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
// #endregion
// #region Particle inspection and gesture ownership
(async () => {
  const browser = await chromium.launch(), report = [];
  try {
    for (const [width, height, dpr] of [[390,844,3],[844,390,2],[1440,900,1]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, serviceWorkers: 'block' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Synthetic QA denial', 'NotAllowedError'); } }));
      await page.route('https://ai.nexusnxs.com/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
        if (url.pathname === '/inter-latin.woff2') return route.fulfill({ body: fs.readFileSync(path.resolve(__dirname, '../../.SITE/public/fonts/inter-latin.woff2')), contentType: 'font/woff2' });
        return route.fulfill({ json: url.pathname === '/readyz' ? { status: 'ready' } : { token: 'synthetic-qa', capabilities: { capabilities: [] } } });
      });
      await page.goto('https://ai.nexusnxs.com/');
      await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready' && globalThis.nexusCosmicMetrics?.renderer().draws > 0);
      const before = await page.evaluate(() => nexusCosmicMetrics.renderer());
      assert.equal(before.backend, 'webgl');
      await page.locator('#core').hover(); await page.mouse.wheel(0, -600);
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().zoom > 1.2);
      await page.locator('#core').focus(); await page.keyboard.press('0');
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().zoom === 1);
      await page.locator('#core').click(); await page.waitForSelector('body.voice-session'); await page.waitForTimeout(650);
      const full = await page.locator('#core').boundingBox(), cdp = await page.context().newCDPSession(page);
      const points = span => [{ x: full.x + full.width / 2 - span, y: full.y + full.height / 2 }, { x: full.x + full.width / 2 + span, y: full.y + full.height / 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points(20)[0]] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(20) });
      for (const span of [25,30,40,50]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(span) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().zoom > 1.8); await page.waitForTimeout(600);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-minimized') || el.classList.contains('voice-dragging')), false);
      const zoomed = await page.evaluate(() => nexusCosmicMetrics.renderer());
      assert.equal(zoomed.particles, before.particles); assert.equal(zoomed.preset, before.preset);
      assert.ok(zoomed.elapsed >= before.elapsed);
      assert.equal(zoomed.renderWidth, Math.round(width * zoomed.pixelRatio));
      assert.equal(await page.locator('#coreCanvas').evaluate(el => getComputedStyle(el).transform), 'none');
      assert.equal(await page.locator('#coreCanvas').evaluate(el => el.getContext('webgl').getError()), 0);
      await page.screenshot({ path: path.resolve(__dirname, `../qa-artifacts/cosmic-zoom-${width}.png`) });
      // A fresh one-finger gesture must still minimize, without inheriting pinch state.
      const start = { x: full.x + full.width / 2, y: full.y + full.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y + 100 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForSelector('body.voice-minimized');
      assert.deepEqual(errors, []); report.push({ width, height, dpr, backend: zoomed.backend, zoom: zoomed.zoom, particlesRetained: true, swipeAfterPinch: true });
      await page.close();
    }
    fs.writeFileSync(path.resolve(__dirname, '../qa-artifacts/cosmic-zoom-report.json'), JSON.stringify(report, null, 2));
    console.log('PASS: three real DPR/viewport profiles, wheel/pinch GPU zoom, retained geometry and one-finger voice swipe after pinch; no microphone or inference.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
