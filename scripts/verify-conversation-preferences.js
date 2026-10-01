/** @module scripts/verify-conversation-preferences Browser profile, persistence, transport and responsive layout. */
// #region Responsive integration
const path = require('node:path');
const assert = require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, locale: 'it-IT', serviceWorkers: 'block' });
      const calls = [], errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
      await page.route('https://ai.nexusnxs.com/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
        if (pathname === '/readyz') return route.fulfill({ json: { status: 'ready' } });
        if (pathname.endsWith('/bootstrap')) return route.fulfill({ json: { token: 'qa-profile', capabilities: { capabilities: [] } } });
        if (pathname.endsWith('/messages/stream')) { calls.push(route.request().postDataJSON()); return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', message: 'Risposta sintetica.' }) + '\n' }); }
        return route.fulfill({ json: {} });
      });
      await page.goto('https://ai.nexusnxs.com/');
      await page.screenshot({ path: path.resolve(__dirname, `../../qa-artifacts/profile-oct01-header-${width}.png`) });
      await page.locator('#profileSettings').click();
      await page.locator('#profile-tone').selectOption('warm');
      await page.locator('#profile-responseStyle').selectOption('concise');
      await page.locator('#profile-responseLanguage').selectOption('en');
      const dialog = await page.locator('#profileSheet').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= width + 1 && dialog.y + dialog.height <= height + 1, 'Profile must fit viewport');
      await page.screenshot({ path: path.resolve(__dirname, `../../qa-artifacts/profile-oct01-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#profileSettings').evaluate(el => document.activeElement === el), true);
      await page.reload();
      await page.screenshot({ path: path.resolve(__dirname, `../../qa-artifacts/profile-oct01-reloaded-${width}.png`) });
      await page.locator('#profileSettings').click();
      assert.equal(await page.locator('#profile-tone').inputValue(), 'warm');
      await page.keyboard.press('Escape');
      await page.locator('#keyboard').click();
      await page.locator('#prompt').fill('Spiegami una cosa semplice');
      await page.locator('#send').click();
      await page.waitForFunction(() => document.getElementById('answer').textContent.includes('sintetica'));
      assert.deepEqual(calls[0].conversationPreferences, { responseStyle: 'concise', tone: 'warm', responseLanguage: 'en' });
      const boxes = await page.locator('.identity .brand-lockup,#profileSettings,#download').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
      if (boxes.length === 3) { assert.ok(boxes[0].right <= boxes[1].left + 1, 'Header actions cannot collide with brand'); assert.ok(boxes[1].right <= boxes[2].left + 1, 'Header buttons cannot collide'); }
      await page.locator('#profileSettings').click();
      await page.locator('#profileReset').click();
      assert.equal(await page.locator('#profile-tone').inputValue(), 'neutral');
      assert.equal(await page.locator('#profile-responseLanguage').inputValue(), 'auto');
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage();
    await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('storage unavailable'); }; Storage.prototype.setItem = () => { throw new Error('storage unavailable'); }; });
    await page.setContent(PUBLIC_AI_HTML);
    await page.locator('#profileSettings').click();
    await page.locator('#profile-tone').selectOption('direct');
    assert.equal(await page.locator('#profile-tone').inputValue(), 'direct');
    console.log('Conversation profile PASS: four viewports, persistence, request transport, reset, keyboard focus and unavailable storage.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
