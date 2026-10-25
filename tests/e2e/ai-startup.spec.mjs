import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let server, origin;
const heldResponses = new Set();
test.beforeAll(async () => {
  const { default: worker } = await import('../../dist/server/index.js');
  const shell = await worker.fetch(new Request('https://ai.nexusnxs.com/', { headers: { accept: 'text/html' } }), {
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  const policy = shell.headers.get('content-security-policy');
  const html = await shell.text();
  const cut = html.search(/<script\b/);
  expect(cut).toBeGreaterThan(0);
  const font = await readFile(new URL('../../public/fonts/inter-latin.woff2', import.meta.url));
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/release') {
      for (const pending of heldResponses) pending.end(html.slice(cut));
      heldResponses.clear(); response.writeHead(204); response.end();
    } else if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': policy });
      response.write(html.slice(0, cut));
      if (url.searchParams.has('hold')) heldResponses.add(response);
      else response.end(html.slice(cut));
    } else if (request.url === '/inter-latin.woff2') {
      response.writeHead(200, { 'Content-Type': 'font/woff2' }); response.end(font);
    } else if (request.url === '/readyz') {
      response.writeHead(503, { 'Content-Type': 'application/json' }); response.end('{"status":"not_ready"}');
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  heldResponses.clear();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`streamed first paint has no temporary controls at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: viewport.width === 844 ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?hold=1`, { waitUntil: 'commit' });
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    await expect.poll(() => page.locator('.shell').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
    await page.request.post(`${origin}/release`);
    await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
    await expect(page.locator('.shell')).not.toHaveAttribute('inert');
    await expect(page.locator('#profileSettings')).toHaveCount(1);
    await expect(page.locator('#voiceStart')).toHaveCount(1);
    const iconIds = ['attachment', 'keyboard', 'profileSettings', 'download'];
    const icons = () => page.evaluate(ids => ids.map(id => document.getElementById(id).innerHTML), iconIds);
    const revealed = await icons();
    await page.waitForTimeout(900);
    expect(await icons()).toEqual(revealed);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('#profileSettings').click();
    await expect(page.locator('#profileSheet')).toBeVisible();
    const settingsAudit = await new AxeBuilder({ page }).include('#profileSheet').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(settingsAudit.violations).toEqual([]);
    await page.locator('#profileSheet .sheet-close').first().click();
    await page.locator('#keyboard').click();
    await expect(page.locator('#prompt')).toBeFocused();
    expect(await page.evaluate(async () => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGk0AAAAASUVORK5CYII='), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      const image = new Image();
      try { image.src = url; await image.decode(); return image.naturalWidth === 1; }
      finally { URL.revokeObjectURL(url); }
    })).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const section of [0, 1, 2, 3]) test(`AI settings panel ${section + 1} preserves readable controls and reachable close at 200 percent text`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.locator('#profileSettings').click();
  const sheet = page.locator('#profileSheet');
  await expect(sheet).toBeVisible();
  const tabs = sheet.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  const tab = tabs.nth(section);
  {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = sheet.getByRole('tabpanel');
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute('id', await tab.getAttribute('aria-controls'));
    const audit = await new AxeBuilder({ page }).include('#profileSheet').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const select of await panel.locator('select').all()) {
      await expect(select).toBeVisible();
      expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(48);
    }
  }
  await sheet.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await sheet.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.locator('#profileSettings')).toBeFocused();
});

test('draft recovery requires opt-in and diagnostics never include its text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
  await page.locator('#profileSettings').click(); await page.locator('#profileDataTab').click();
  await expect(page.locator('#profile-recovery-draft')).toHaveValue('off');
  await page.locator('#profile-recovery-draft').selectOption('session');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page.locator('#keyboard').click(); await page.locator('#prompt').fill('Private draft sentinel');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
  await expect(page.locator('#prompt')).toHaveValue('Private draft sentinel');
  await page.locator('#profileSettings').click(); await page.locator('#profileDataTab').click();
  const downloading = page.waitForEvent('download'); await page.locator('#profileDiagnostics').click();
  const file = await downloading, diagnostic = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(diagnostic.schema).toBe('nexusnxs.diagnostics.v1');
  expect(diagnostic.uploaded).toBe(false);
  expect(JSON.stringify(diagnostic)).not.toContain('Private draft sentinel');
  await page.locator('#profile-recovery-draft').selectOption('off');
  expect(await page.evaluate(() => sessionStorage.getItem('nxs.tab-draft.v1'))).toBeNull();
});

test('reload restores a slow local conversation before revealing its controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('nexusnxs-demo', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put([{ role: 'user', content: 'Domanda locale di prova' }, { role: 'assistant', content: 'Risposta ripristinata' }], 'turns');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.addInitScript(() => {
    // Hold the restoration completion signal explicitly: CI load must not
    // race a fixed sleep or make the database's own timeout the test clock.
    let restored;
    const held = new Promise(resolve => { globalThis.releaseRestoration = resolve; });
    Object.defineProperty(globalThis, 'nexusUiRestored', {
      configurable: true,
      set(value) { restored = Promise.all([value, held]); },
      get() { return restored; }
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'pending');
  await expect.poll(() => page.locator('.shell').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  await page.evaluate(() => globalThis.releaseRestoration());
  await expect(page.locator('html')).toHaveAttribute('data-nxs-boot', 'ready');
  await expect(page.locator('body')).toHaveClass(/conversation-active/);
  await expect(page.locator('#answer')).toContainText('Risposta ripristinata');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
