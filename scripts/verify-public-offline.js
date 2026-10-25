/** @module scripts/verify-public-offline
 * Real service-worker navigation with synthetic local data in a disposable
 * browser context. Default uses current source; --live checks production.
 */
// #region Isolated source gateway and browser
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { RemoteSessionGateway, PUBLIC_AI_HTML, PUBLIC_AI_SERVICE_WORKER } = require('../src/remote/remote-session-gateway');
const { freePort, removeTemporaryPath } = require('./web-visual-regression');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../../.toolchains/playwright');
const { chromium } = require('../../.SITE/node_modules/@playwright/test');

async function main() {
  const live = process.argv.includes('--live');
  const output = path.resolve(__dirname, '../qa-artifacts');
  const reportPath = path.join(output, `offline-${live ? 'live' : 'source'}-report.json`);
  const report = { passed: false, checkedAt: new Date().toISOString(), mode: live ? 'live' : 'source', scenarios: [] };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  const temporary = live ? null : fs.mkdtempSync(path.join(output, 'offline-gateway-'));
  let gateway, browser, ready = true, messages = 0;
  try {
    let origin = 'https://ai.nexusnxs.com';
    if (!live) {
      const port = await freePort(), publicPort = await freePort();
      gateway = new RemoteSessionGateway({ statePath: path.join(temporary, 'gateway.json'), publicPort,
        readinessProvider: async () => ready,
        onMessage: async () => { messages++; throw new Error('Offline QA must not invoke inference'); },
        conversationStore: { list: () => [], save: value => value }, logger: { info() {}, warn() {} } });
      await gateway.configure({ enabled: true, allowLan: false, port });
      origin = `http://127.0.0.1:${publicPort}`;
      report.sourceSha256 = crypto.createHash('sha256').update(PUBLIC_AI_HTML + PUBLIC_AI_SERVICE_WORKER).digest('hex');
    }
    browser = await chromium.launch({ headless: true });
    // #endregion
    // #region Cache, local history, layout and reconnection
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      ready = true;
      const context = await browser.newContext({ viewport });
      let messageRequests = 0;
      context.on('request', request => { if (request.method() === 'POST' && /\/messages(?:\/stream)?$/.test(new URL(request.url()).pathname)) messageRequests++; });
      try {
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => navigator.serviceWorker.controller);
        await page.waitForFunction(() => ['ready', 'warming', 'offline'].includes(document.body.dataset.serviceReadiness));
        const before = await page.locator('body').getAttribute('data-service-readiness');
        await page.evaluate(() => new Promise((resolve, reject) => {
          const request = indexedDB.open('nexusnxs-demo', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result, tx = db.transaction('state', 'readwrite');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
            tx.objectStore('state').put([{ role: 'user', content: 'Domanda sintetica locale' },
              { role: 'assistant', content: 'Risposta sintetica locale' }], 'turns');
          };
        }));
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('#answer').textContent.includes('Risposta sintetica locale'));
        if (!await page.locator('#prompt').isVisible()) await page.locator('#keyboard').click();
        await page.locator('#prompt').fill('Bozza sintetica di collaudo offline');
        await context.setOffline(true);
        await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'offline');
        await page.locator('#attachmentInput').setInputFiles({ name: 'offline.txt', mimeType: 'text/plain', buffer: Buffer.from('Allegato sintetico locale') });
        await page.waitForFunction(() => document.querySelector('#attachment').dataset.count === '1');
        assert.equal(await page.locator('#send').isDisabled(), true);
        assert.equal(await page.locator('#core').isDisabled(), true);
        if (!live) assert.equal(await page.locator('#cognition').isVisible(), false, 'An attachment notification is not AI reasoning');
        assert.equal(await page.locator('#prompt').inputValue(), 'Bozza sintetica di collaudo offline');
        await page.locator('#profileSettings').click();
        const dataSectionAvailable = await page.locator('#profileData summary').count() === 1;
        if (!live) assert.equal(dataSectionAvailable, true, 'Current source includes offline data actions');
        if (dataSectionAvailable) {
          const dataTab = page.locator('#profileDataTab');
          if (await dataTab.count()) await dataTab.click();
          else await page.locator('#profileData summary').click();
          assert.equal(await page.locator('#profileExport').isEnabled(), true);
        }
        await page.locator('#profileSheet .sheet-top .sheet-close').click();
        await page.screenshot({ path: path.join(output, `offline-${live ? 'live' : 'source'}-${viewport.width}.png`) });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'offline' && document.querySelector('#answer').textContent.includes('Risposta sintetica locale'));
        assert.equal(await page.locator('#keyboard').isVisible(), true);
        assert.equal(await page.locator('#prompt').inputValue(), '', 'Unsent drafts intentionally remain tab-memory only');
        assert.equal(await page.locator('.attachment-chip').count(), 0, 'Raw attachments are not persisted');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('#memoryClear').click();
        await page.waitForFunction(() => document.querySelector('#phase').textContent === 'Memoria locale cancellata');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'offline' && document.documentElement.dataset.nxsBoot === 'ready');
        assert.equal(await page.locator('#answer').textContent(), '', 'Deleted history cannot return from cached navigation');
        const cachedPaths = await page.evaluate(async () => {
          const paths = [];
          for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
          return paths;
        });
        assert.ok(cachedPaths.includes('/inter-latin.woff2'), 'Inter remains available offline');
        assert.equal(cachedPaths.some(item => item.startsWith('/api/') || ['/readyz', '/healthz'].includes(item)), false);
        if (!live) { ready = false; gateway.readinessCache = { expiresAt: 0, ready: false }; }
        await context.setOffline(false);
        const expected = live ? before : 'warming';
        await page.waitForFunction(value => document.body.dataset.serviceReadiness === value, expected, { timeout: 30000 });
        if (expected !== 'ready') assert.equal(await page.locator('#send').isDisabled(), true);
        if (!live) {
          ready = true; gateway.readinessCache = { expiresAt: 0, ready: false };
          await page.evaluate(() => dispatchEvent(new Event('online')));
          await page.waitForFunction(() => document.body.dataset.serviceReadiness === 'ready');
        }
        assert.equal(messageRequests, 0, 'Reconnect never sends a draft automatically');
        report.scenarios.push({ ...viewport, passed: true, dataSectionAvailable, cachePaths: cachedPaths, reconnectedState: expected, messageRequests });
        console.log(`PASS ${viewport.width}x${viewport.height}: cached reload, local history/reset, draft/attachment, settings, font, reconnect`);
      } finally { await context.close(); }
    }
    assert.equal(messages, 0);
    report.passed = true;
  } catch (error) { report.error = error.message; throw error; }
  finally {
    await browser?.close(); await gateway?.stop();
    if (temporary) await removeTemporaryPath(temporary);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
