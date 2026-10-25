/** @module scripts/verify-daily-polish Real streamed DOM continuity, settings and downloads with synthetic data. */
// #region Local fixture without inference, microphone or external requests
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');
const { PUBLIC_AI_HTML } = require('../src/remote/remote-session-gateway');
const font = fs.readFileSync(path.resolve(__dirname, '../../.SITE/public/fonts/inter-latin.woff2'));
const prefix = '# Risultato\n\n```javascript\nconst answer = 42;\n```\n\n';
let release = null, payload = null;
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(PUBLIC_AI_HTML); }
  else if (pathname === '/inter-latin.woff2') { response.setHeader('Content-Type', 'font/woff2'); response.end(font); }
  else if (pathname === '/api/guest/messages/stream') {
    let body = ''; for await (const chunk of request) body += chunk; payload = JSON.parse(body);
    response.setHeader('Content-Type', 'application/x-ndjson');
    response.write(JSON.stringify({ type: 'token', token: prefix }) + '\n');
    await new Promise(resolve => { release = resolve; }); release = null;
    const tail = 'Paragrafo successivo con **risultato verificabile** e <script>testo inerte</script>.';
    if (!response.destroyed) response.end(JSON.stringify({ type: 'token', token: tail }) + '\n' + JSON.stringify({ type: 'complete', message: prefix + tail }) + '\n');
  } else {
    response.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/guest/bootstrap') response.end(JSON.stringify({ token: 'synthetic-qa', capabilities: { capabilities: [] } }));
    else if (pathname === '/readyz') response.end('{"status":"ready"}');
    else response.end('{"capabilities":[]}');
  }
});
// #endregion
// #region State, geometry, local privacy and stable streaming
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ headless: true }), report = [];
  try {
    for (const [width, height, fontScale] of [[320,568,100],[390,844,200],[844,390,100],[1440,900,100]]) {
      const page = await browser.newPage({ viewport: { width, height }, locale: 'it-IT', serviceWorkers: 'block' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => { Object.defineProperty(navigator.clipboard, 'writeText', { value: async text => { window.qaCopied = text; } }); });
      await page.goto(origin); await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
      if (fontScale !== 100) await page.evaluate(value => { document.documentElement.style.fontSize = value + '%'; }, fontScale);
      await page.locator('#profileSettings').click(); await page.locator('#profileAppearanceTab').click();
      await page.waitForTimeout(200);
      const covered = await page.evaluate(() => nexusCosmicMetrics.renderer());
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => nexusCosmicMetrics.renderer().draws), covered.draws, 'An open modal must pause the covered renderer');
      await page.locator('#profile-appearance-motion').selectOption('reduce');
      await page.locator('#profile-appearance-reading').selectOption('large');
      await page.waitForFunction(() => document.documentElement.dataset.nxsMotion === 'reduce');
      await page.waitForTimeout(150);
      const reducedDraws = await page.evaluate(() => nexusCosmicMetrics.renderer().draws);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => nexusCosmicMetrics.renderer().draws), reducedDraws, 'Reduced motion must stop continuous Core painting');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `qa-artifacts/daily-settings-${width}.png` });
      await page.locator('#profileConversationTab').click(); await page.locator('#profile-tone').selectOption('warm');
      await page.locator('#profileSheet .sheet-close').first().click();
      await page.waitForTimeout(150);
      const reducedUncovered = await page.evaluate(() => nexusCosmicMetrics.renderer().draws);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => nexusCosmicMetrics.renderer().draws), reducedUncovered, 'Reduced motion must also stop continuous painting after closing settings');
      await page.locator('#keyboard').click(); await page.locator('#prompt').fill('Prova sintetica'); await page.locator('#send').click();
      await page.locator('.web-code-card').waitFor();
      await page.evaluate(() => { window.qaCode = document.querySelector('.web-code-card'); });
      await page.locator('.web-code-card button').first().click();
      assert.equal(await page.evaluate(() => qaCopied), 'const answer = 42;');
      assert.equal(await page.locator('.web-code-card button').first().innerText(), '');
      release(); await page.locator('#answer').filter({ hasText: 'Paragrafo successivo' }).waitFor();
      await page.waitForFunction(() => !document.querySelector('#answer').classList.contains('streaming'));
      assert.equal(await page.evaluate(() => qaCode === document.querySelector('.web-code-card')), true, 'Streaming must retain completed code and its controls');
      assert.equal(await page.locator('#answer script,#answer [onerror]').count(), 0);
      assert.ok(!JSON.stringify(payload).includes('appearance'), 'Appearance preferences never accompany AI requests');
      const downloading = page.waitForEvent('download'); await page.locator('.web-code-card button').nth(1).click();
      const download = await downloading; assert.equal(download.suggestedFilename(), 'NexusNXS.js');
      assert.equal(fs.readFileSync(await download.path(), 'utf8'), 'const answer = 42;');
      const metrics = await page.evaluate(() => nexusInteractionMetrics.snapshot());
      assert.equal(metrics.persisted, false); assert.equal(metrics.uploaded, false); assert.ok(metrics.maximumRecords <= 200);
      await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.nxsBoot === 'ready');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.nxsMotion), 'reduce');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.nxsReading), 'large');
      await page.locator('#profileSettings').click(); await page.locator('#profileDataTab').click();
      await page.locator('#profileDelete').click(); await page.locator('#profileDeleteConfirm').click();
      await page.waitForFunction(() => document.documentElement.dataset.nxsMotion === 'system');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.nxsReading), 'standard');
      assert.deepEqual(errors, []); report.push({ width, height, fontScale, passed: true }); await page.close();
    }
    fs.writeFileSync('qa-artifacts/daily-polish-report.json', JSON.stringify(report, null, 2));
    console.log(`PASS ${report.length} layouts: stable streamed code, icon actions, exact download, appearance persistence/reset and local-only metrics.`);
  } finally { release?.(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
