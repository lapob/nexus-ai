/** @module scripts/verify-public-draft
 * Verifies private in-memory drafts and retirement of the old tab cache.
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname,'../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await page.route('https://ai.nexusnxs.com/', r => r.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML }));
    await page.goto('https://ai.nexusnxs.com/');
    assert.equal(await page.locator('.composer-box input[type=checkbox]').count(), 0);
    await page.locator('#keyboard').click();
    await page.locator('#prompt').fill('Bozza privata non persistente');
    await page.locator('#keyboard').click();
    await page.locator('#keyboard').click();
    assert.equal(await page.locator('#prompt').inputValue(), 'Bozza privata non persistente');
    await page.evaluate(() => sessionStorage.setItem('nxs.tab-draft.v1', JSON.stringify({text:'Legacy private draft',savedAt:Date.now()})));
    await page.reload();
    assert.equal(await page.locator('#prompt').inputValue(), '');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('nxs.tab-draft.v1')), null);
    console.log('PASS: draft survives keyboard toggles, remains private on reload; legacy cache removed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
