import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let server, origin;
const timers = new Set();
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
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': policy });
      response.write(html.slice(0, cut));
      const timer = setTimeout(() => { timers.delete(timer); response.end(html.slice(cut)); }, 700);
      timers.add(timer);
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
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`streamed first paint has no temporary controls at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: viewport.width === 844 ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'commit' });
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    await expect.poll(() => page.locator('.shell').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
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
