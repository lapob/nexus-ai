/** @module scripts/verify-public-voice-presentation Full/compact voice geometry without accessing a microphone. */
// #region Isolated browser fixture
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const output = path.resolve(__dirname, '../qa-artifacts');
// #endregion
// #region Actual application layout and presentation controls
(async () => {
  const browser = await chromium.launch({ headless: true }), report = [];
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) for (const [width, height] of [[320,568],[390,844],[844,390],[1440,900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
      await page.route('https://ai.nexusnxs.com/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
        if (url.pathname === '/api/guest/bootstrap') return route.fulfill({ json: { token: 'synthetic-qa', capabilities: { capabilities: [] } } });
        if (url.pathname === '/readyz') return route.fulfill({ json: { ready: true, status: 'ready' } });
        return route.continue();
      });
      await page.goto('https://ai.nexusnxs.com/');
      await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
      await page.locator('#core').click();
      await page.waitForSelector('body.voice-session');
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.locator('.voice-collapse').click();
        await page.waitForSelector('body.voice-minimized');
        await page.waitForTimeout(reducedMotion === 'reduce' ? 80 : 650);
        const layout = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
          return { core: rect('#core'), dock: rect('.dock'), close: rect('.voice-session-actions button:last-child'),
            inert: document.querySelector('.dock').inert, overflow: document.documentElement.scrollWidth > innerWidth,
            pointer: getComputedStyle(document.querySelector('#core')).pointerEvents,
            label: document.querySelector('#core').getAttribute('aria-label') };
        });
        assert.ok(!layout.inert && !layout.overflow, JSON.stringify(layout));
        assert.equal(layout.pointer, 'auto');
        assert.ok(layout.core.width >= 52 && layout.core.width <= 80.1, JSON.stringify(layout));
        assert.ok(layout.core.left >= 0 && layout.core.right <= width && layout.core.top >= 0 && layout.core.bottom <= layout.dock.top, JSON.stringify(layout));
        assert.ok(layout.close.left >= layout.core.right && layout.close.right <= width, JSON.stringify(layout));
        await page.locator('#core').click();
        await page.waitForSelector('body.voice-session');
        assert.equal(await page.locator('.dock').evaluate(el => el.inert), true);
      }
      // A touch gesture belongs to the Core, not the chat or the page.
      await page.waitForTimeout(600);
      const full = await page.locator('#core').boundingBox();
      const touch = await page.context().newCDPSession(page);
      const pointer = async (type, y) => touch.send('Input.dispatchTouchEvent', {
        type: { pointerdown: 'touchStart', pointermove: 'touchMove', pointerup: 'touchEnd', pointercancel: 'touchCancel' }[type],
        touchPoints: ['pointerup','pointercancel'].includes(type) ? [] : [{ x: full.x + full.width / 2, y: full.y + full.height / 2 + y - 50 }]
      });
      await pointer('pointerdown', 50);
      await pointer('pointermove', 85);
      await page.waitForTimeout(50);
      const held = await page.locator('#core').boundingBox();
      assert.ok(held.width < full.width, 'Core must shrink before release');
      assert.ok(Math.abs(held.y + held.height / 2 - (full.y + full.height / 2) - 35) < 2, 'Core must follow the finger without a tween');
      await pointer('pointermove', 100);
      await page.waitForTimeout(50);
      const moved = await page.locator('#core').boundingBox();
      assert.ok(Math.abs(moved.y + moved.height / 2 - (held.y + held.height / 2) - 15) < 2);
      if (width === 390 && reducedMotion === 'no-preference') await page.screenshot({ path: path.join(output, 'voice-drag-held.png') });
      await pointer('pointercancel', 100);
      await page.waitForTimeout(600);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-dragging') || el.classList.contains('voice-minimized')), false);
      const restored = await page.locator('#core').boundingBox();
      assert.ok(Math.abs(restored.width - full.width) < 2, 'Cancelled drag must return to full size');
      await pointer('pointerdown', 50); await pointer('pointermove', 160);
      await page.waitForTimeout(40);
      await pointer('pointermove', 70); await pointer('pointerup', 70);
      await page.waitForTimeout(600);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-minimized')), false, 'Reversed drag must not commit');
      await touch.detach();
      await page.locator('#core').evaluate(el => {
        el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 2, clientX: 50, clientY: 50 }));
        el.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 52, clientY: 160 }));
        el.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 52, clientY: 160 }));
        el.click();
      });
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-minimized')), true);
      await page.waitForTimeout(reducedMotion === 'reduce' ? 80 : 650);
      await page.screenshot({ path: path.join(output, `voice-compact-${width}-${reducedMotion}.png`) });
      await page.locator('.voice-session-actions button:last-child').click();
      assert.equal(await page.locator('.dock').evaluate(el => el.inert), false);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-minimized')), false);
      report.push({ width, height, reducedMotion, cycles: 3, interactiveDrag: true, cancellation: true, reversal: true, passed: true });
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'voice-presentation-report.json'), JSON.stringify(report, null, 2));
    console.log(`PASS ${report.length} voice layouts: repeated full/compact, hitboxes, chat access, reduced motion and downward swipe; no microphone opened.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
