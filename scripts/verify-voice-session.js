/** @module scripts/verify-voice-session Continuous voice, shared history and cancellation races. */
// #region Synthetic browser media
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const assert = require('node:assert/strict');
async function mediaFixture() {
  globalThis.mediaStopped = 0; globalThis.spoken = 0; globalThis.speechLevel = false;
  navigator.mediaDevices.getUserMedia = async () => {
    if (globalThis.delayPermission) await new Promise(resolve => { globalThis.allowPermission = resolve; });
    if (globalThis.denyPermission) throw new DOMException('denied', 'NotAllowedError');
    return { getTracks: () => [{ stop() { globalThis.mediaStopped++; } }] };
  };
  globalThis.MediaRecorder = class {
    state = 'inactive'; mimeType = 'audio/webm';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic']) }); queueMicrotask(() => this.onstop?.()); }
  };
  globalThis.AudioContext = class {
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { disconnect() {}, getByteTimeDomainData(array) { array.fill(globalThis.speechLevel ? 156 : 128); } }; }
    decodeAudioData() { return Promise.resolve({ sampleRate: 16000, length: 1600, numberOfChannels: 1, getChannelData: () => new Float32Array(1600) }); }
  };
  globalThis.Audio = class {
    play() { globalThis.spoken++; globalThis.finishAudio = () => this.onended?.(); return Promise.resolve(); }
    pause() { this.onpause?.(); }
  };
}
// #endregion
// #region Session integration
(async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, locale: 'it-IT', serviceWorkers: 'block' });
      const requests = [], errors = []; let transcriptions = 0;
      let holdSynthesis = false, releaseSynthesis = null;
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(mediaFixture);
      await page.route('https://ai.nexusnxs.com/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: PUBLIC_AI_HTML });
        if (path === '/readyz') return route.fulfill({ json: { ready: true, status: 'ready' } });
        if (path.includes('bootstrap')) return route.fulfill({ json: { token: 'qa', capabilities: { capabilities: [{ id: 'voice-input', state: 'available' }] } } });
        if (path.endsWith('/transcribe')) { transcriptions++; return route.fulfill({ json: { text: 'Frase sintetica ' + transcriptions } }); }
        if (path.endsWith('/synthesize')) {
          if (holdSynthesis) await new Promise(resolve => { releaseSynthesis = resolve; });
          return route.fulfill({ contentType: 'audio/wav', body: 'synthetic' }).catch(() => {});
        }
        if (path.endsWith('/messages/stream')) { requests.push(route.request().postDataJSON()); return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', message: 'Risposta sintetica.' }) + '\n' }); }
        return route.fulfill({ json: {} });
      });
      await page.goto('https://ai.nexusnxs.com/');
      await page.locator('#core').click();
      await page.waitForFunction(() => nexusAiState.voiceState === 'listening');
      const say = async () => { await page.waitForTimeout(350); await page.evaluate(() => { speechLevel = true; }); await page.waitForTimeout(220); await page.locator('#core').click(); await page.evaluate(() => { speechLevel = false; }); };
      await say(); await page.waitForFunction(() => spoken === 1);
      await page.waitForFunction(() => nexusCosmicMetrics.renderer().arrival > .98);
      await page.screenshot({ path: `qa-artifacts/voice-session-${width}.png` });
      const core = await page.locator('#core').boundingBox();
      assert.ok(Math.abs(core.x + core.width / 2 - width / 2) < 2, 'Core remains centered');
      const controls = await page.locator('.voice-session-controls').boundingBox();
      assert.ok(core.y + core.height <= controls.y, 'Core must not collide with voice controls');
      assert.equal(await page.locator('.exchange').evaluate(el => getComputedStyle(el).visibility), 'hidden');
      await page.locator('#core').click(); // interrupt playback, resume listening
      await page.waitForFunction(() => nexusAiState.voiceState === 'listening');
      await say(); await page.waitForFunction(() => spoken === 2);
      assert.equal(requests.length, 2); assert.equal(requests[1].history.length, 2);
      await page.evaluate(() => finishAudio());
      await page.waitForFunction(() => nexusAiState.voiceState === 'listening');
      await page.locator('.voice-session-controls button').click();
      assert.ok(await page.evaluate(() => mediaStopped > 0));
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-session')), false);
      assert.equal(await page.locator('#answer').textContent(), 'Risposta sintetica.');
      assert.equal(transcriptions, 2, 'Exit must discard unfinished recording');
      await page.evaluate(() => { delayPermission = true; });
      await page.locator('#voiceStart').click(); await page.waitForFunction(() => typeof allowPermission === 'function');
      await page.locator('.voice-session-controls button').click();
      const stops = await page.evaluate(() => mediaStopped);
      await page.evaluate(() => allowPermission());
      await page.waitForFunction(previous => mediaStopped > previous, stops);
      assert.equal(transcriptions, 2, 'Late permission must not restart recording');
      await page.evaluate(() => { delayPermission = false; denyPermission = true; });
      await page.locator('#voiceStart').click();
      await page.waitForFunction(() => nexusAiState.voiceState === 'error');
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('voice-session')), true, 'Errors retain the Core');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#prompt').evaluate(el => el === document.activeElement), true);
      await page.evaluate(() => { denyPermission = false; });
      await page.locator('#prompt').fill('Bozza da conservare');
      holdSynthesis = true;
      await page.locator('#voiceStart').click();
      await page.waitForFunction(() => nexusAiState.voiceState === 'listening');
      await say();
      for (let n = 0; n < 100 && !releaseSynthesis; n++) await page.waitForTimeout(25);
      assert.ok(releaseSynthesis, 'Synthesis request started');
      await page.locator('.voice-session-controls button').click();
      releaseSynthesis(); await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => spoken), 2, 'Late audio must not play after exit');
      assert.equal(await page.locator('#prompt').inputValue(), 'Bozza da conservare');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: two hands-free turns, interruption, shared history, exit cleanup, late permission, denied permission, late synthesis, saved draft`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
