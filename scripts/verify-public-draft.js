/** @module scripts/verify-public-draft
 * Verifies explicit, tab-scoped draft persistence without retaining conversations.
 */
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await page.route('https://ai.nexusnxs.com/', r => r.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML }));
    await page.goto('https://ai.nexusnxs.com/');
    await page.locator('#keyboard').click();
    await page.locator('#prompt').fill('Bozza privata non persistente');
    await page.reload();
    assert.equal(await page.locator('#prompt').inputValue(), '');
    await page.locator('#keyboard').click();
    await page.getByLabel('Conserva la bozza in questa scheda').check();
    await page.locator('#prompt').fill('Bozza esplicitamente conservata');
    await page.reload();
    assert.equal(await page.locator('#prompt').inputValue(), 'Bozza esplicitamente conservata');
    await page.locator('#keyboard').click();
    await page.getByLabel('Conserva la bozza in questa scheda').uncheck();
    await page.reload();
    assert.equal(await page.locator('#prompt').inputValue(), '');
    console.log('PASS: default private, opt-in draft survives reload, opt-out removes it.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
