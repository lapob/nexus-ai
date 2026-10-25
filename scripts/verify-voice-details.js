/** @module scripts/verify-voice-details Verifies voice stays with the Core until returning to text. */
// #region Browser and shared media fixture
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const { mediaFixture } = require('./verify-voice-session');
const assert = require('node:assert/strict');
// #endregion

// #region Voice, unavailable service and recovery
(async () => {
  const browser = await chromium.launch();
  try {
    let page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'it-IT', serviceWorkers: 'block' });
    page.setDefaultTimeout(20000);
    let voiceAvailable = true, transcriptions = 0, bootstraps = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mediaFixture);
    const fixtureResponse = route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
      if (path === '/readyz') return route.fulfill({ json: { ready: true, status: 'ready' } });
      if (path.includes('bootstrap')) { bootstraps++; return route.fulfill({ json: { token: 'qa', capabilities: { capabilities: [
        { id: 'voice-input', state: voiceAvailable ? 'available' : 'unavailable' },
        { id: 'voice-output', state: 'unavailable' }
      ] } } }); }
      if (path.includes('transcrib')) {
        transcriptions++;
        return route.fulfill({ json: { text: 'Prova vocale sintetica' } });
      }
      if (path.includes('/messages/stream')) return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', message: 'Dettagli della prova vocale.' }) + '\n' });
      if (path.includes('synthesize')) return route.fulfill({ status: 503, json: { error: 'Synthetic audio disabled' } });
      return route.fulfill({ json: {} });
    };
    await page.route('https://ai.nexusnxs.com/**', fixtureResponse);
    await page.goto('https://ai.nexusnxs.com/');
    await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 1);
    await page.locator('#core').click();
    await page.waitForFunction(() => document.body.dataset.voiceState === 'listening');
    await page.waitForTimeout(350);
    await page.evaluate(() => { speechLevel = true; });
    await page.waitForTimeout(220);
    await page.locator('#core').click();
    await page.evaluate(() => { speechLevel = false; });
    await page.waitForFunction(() => document.querySelector('#answer').textContent.includes('Dettagli della prova vocale.'));
    assert.equal(transcriptions, 1, 'The controlled utterance must reach transcription once');
    assert.equal(await page.evaluate(() => document.body.classList.contains('conversation-active')), false);
    assert.equal(await page.locator('.exchange').evaluate(element => element.inert), true);
    await page.locator('.voice-session-actions button:last-child').click();
    await page.waitForFunction(() => document.body.classList.contains('conversation-active'));
    assert.equal(await page.locator('#answer').isVisible(), true);
    assert.equal(await page.locator('.exchange').evaluate(element => element.inert), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'qa-artifacts/voice-details.png' });
    console.log('PASS: controlled speech, response on Core, return control reveals text and releases background.');

    voiceAvailable = false;
    // A separate browser context starts at the idle Core, without restored chat
    // intentionally pausing its renderer in the background.
    await page.close();
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'it-IT', serviceWorkers: 'block' });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mediaFixture);
    await page.route('https://ai.nexusnxs.com/**', fixtureResponse);
    await page.goto('https://ai.nexusnxs.com/');
    await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 1);
    const before = await page.locator('#core').boundingBox();
    assert.ok(Math.abs(before.x + before.width / 2 - 195) < 2, 'Idle Core is centered');
    await page.locator('#core').click();
    await page.waitForFunction(() => document.body.dataset.voiceState === 'error');
    await page.waitForTimeout(1200);
    const after = await page.locator('#core').boundingBox();
    assert.ok(Math.abs(after.x + after.width / 2 - 195) < 2, 'Unavailable voice Core stays centered');
    assert.equal(await page.evaluate(() => document.body.classList.contains('keyboard-open')), false);
    assert.ok(Math.abs(after.width - before.width) < 2, JSON.stringify({ before, after }));
    assert.equal(transcriptions, 1, 'Unavailable voice must not transcribe another recording');
    assert.equal(await page.evaluate(() => mediaRequested), 0, 'Unavailable recognition must not request the microphone');
    assert.deepEqual(errors, []);
    console.log('PASS: unavailable voice retains Core size without opening keyboard or transcribing.');
    const previousBootstraps = bootstraps;
    voiceAvailable = true;
    await page.locator('#core').click();
    await page.waitForFunction(() => document.body.dataset.voiceState === 'listening');
    assert.equal(bootstraps, previousBootstraps + 1, 'Retry refreshes an unavailable capability');
    assert.equal(await page.evaluate(() => mediaRequested), 1);
    await page.locator('.voice-session-actions button:last-child').click();
    assert.equal(transcriptions, 1, 'Leaving recovery discards the unfinished recording');
    assert.deepEqual(errors, []);
    console.log('PASS: voice recovers in the same page after capability becomes available.');
    voiceAvailable = false;
    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload();
    await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival === 1);
    await page.evaluate(() => { document.documentElement.style.fontSize = '30px'; });
    await page.locator('#core').click();
    await page.waitForFunction(() => document.body.dataset.voiceState === 'error');
    await page.waitForTimeout(350);
    const enlargedCore = await page.locator('#core').boundingBox();
    const enlargedControls = await page.locator('.voice-session-controls').boundingBox();
    assert.ok(enlargedCore.y >= 8 && enlargedCore.y + enlargedCore.height <= enlargedControls.y - 8, 'Long voice status at 200% text does not collide with the Core');
    assert.ok(Math.abs(enlargedCore.x + enlargedCore.width / 2 - 160) < 2);
    assert.ok(enlargedCore.width >= 200, 'The Core stays prominent on a compact screen');
    assert.ok(enlargedControls.y + enlargedControls.height <= 568);
    assert.equal(await page.evaluate(() => mediaRequested), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'qa-artifacts/voice-unavailable-320-text200.png' });
    console.log('PASS: compact screen and 200% text keep the Core and voice controls separate.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
