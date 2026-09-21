/** @module scripts/verify-public-offline
 * Checks real service-worker offline navigation in an isolated browser profile.
 * Uses a synthetic unsent draft; never changes the workstation network.
 */
const path = require('node:path');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto('https://ai.nexusnxs.com/', { waitUntil: 'networkidle' });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      await page.locator('#keyboard').click();
      await page.locator('#prompt').fill('Bozza sintetica di collaudo offline');
      await context.setOffline(true);
      await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'offline');
      assert.equal(await page.locator('#send').isDisabled(), true);
      assert.equal(await page.locator('#prompt').inputValue(), 'Bozza sintetica di collaudo offline');
      await page.screenshot({ path: path.resolve(__dirname, `../qa-artifacts/offline-live-${viewport.width}.png`) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'offline');
      assert.equal(await page.locator('#keyboard').isVisible(), true, 'Cached shell remains usable');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const cachedPaths = await page.evaluate(async () => {
        const paths = [];
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
        }
        return paths;
      });
      assert.ok(cachedPaths.includes('/inter-latin.woff2'), 'Inter is available offline');
      assert.equal(cachedPaths.some(item => item.startsWith('/api/')), false, 'No conversation API data cached');
      await context.setOffline(false);
      await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'ready', null, { timeout: 30000 });
      console.log(`PASS ${viewport.width}x${viewport.height}: offline, draft, cached reload, font, reconnect`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
