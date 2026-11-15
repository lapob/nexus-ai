/**
 * @module scripts/visual/lib/browser
 * @description Browser e tempo deterministici per la regressione visiva.
 *  - Playwright dal repository o dal sito vicino; browser dal toolchain portabile `.toolchains/playwright`
 *    (versione fissata: le baseline non cambiano con gli aggiornamenti di Chrome). Chrome di sistema solo per WebGPU.
 *  - Tempo congelato con `page.clock`: Date, performance.now, timer e requestAnimationFrame avanzano solo quando
 *    il test lo chiede. Il Core gira sul thread principale (niente OffscreenCanvas) così anche lui segue l'orologio.
 *    Se la pagina espone l'aggancio `?nxs-qa-time=<s>` lo si usa al posto dell'orologio finto.
 *  - Rete chiusa: solo l'origine locale, API simulate; nessuna richiesta raggiunge servizi di produzione.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const FROZEN_EPOCH = Date.UTC(2026, 0, 15, 9, 30, 0);
export const QA_TIME_PARAM = 'nxs-qa-time';

// #region 01 — Playwright e browser

export async function loadPlaywright(root) {
  const toolchain = path.resolve(root, '..', '.toolchains', 'playwright');
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(toolchain)) process.env.PLAYWRIGHT_BROWSERS_PATH = toolchain;
  for (const base of [path.join(root, 'node_modules'), path.resolve(root, '..', '.SITE', 'node_modules'), path.resolve(root, '..', '.AI', 'node_modules')]) {
    const candidate = path.join(base, 'playwright', 'index.mjs');
    if (fs.existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }
  throw new Error('Playwright non trovato (né nel repository né in ../.SITE): regressione visiva non eseguibile.');
}

/** `webgpu: true` usa Chrome di sistema con WebGPU; altrimenti il Chromium fissato del toolchain (Canvas 2D). */
export async function launch(playwright, { webgpu = false } = {}) {
  const args = ['--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'];
  if (webgpu) return playwright.chromium.launch({ channel: 'chrome', args: [...args, '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  return playwright.chromium.launch({ args });
}

// #endregion
// #region 02 — Tempo deterministico

/** Da chiamare prima di `goto`: orologio fermo a FROZEN_EPOCH e Core sul thread principale. */
export async function freezeTime(context, page, { canvas2d = false } = {}) {
  await context.addInitScript(({ canvas2d: forceCanvas }) => {
    // Il worker del Core avrebbe un orologio proprio, non controllabile dal test.
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
    // Casualità con seed fisso (mulberry32): proposte, ordini e varianti uguali a ogni esecuzione.
    let seed = 0x6e7873;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    if (forceCanvas) Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
  }, { canvas2d });
  await page.clock.install({ time: FROZEN_EPOCH });
  await page.clock.pauseAt(FROZEN_EPOCH + 1000);
}

/** Fa avanzare l'orologio fino a `seconds` di vita della pagina, poi qualche fotogramma per disegnare. */
export async function advanceTo(page, seconds, frames = 4) {
  const now = await page.evaluate(() => performance.now());
  const target = seconds * 1000;
  if (target > now + 1) await page.clock.fastForward(Math.round(target - now));
  await page.clock.runFor(Math.max(1, frames) * 16);
}

/** Fa scorrere timer e fotogrammi per `ms` (animazioni d'ingresso, debounce, transizioni). */
export async function settle(page, ms = 800) { await page.clock.runFor(ms); }

// #endregion
// #region 03 — Rete chiusa e API simulate

export async function closeNetwork(context, origin, mocks = {}) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    const mock = mocks[url.pathname] ?? (url.pathname.startsWith('/api/') || url.pathname === '/readyz' ? '{}' : null);
    if (mock === null) return route.continue();
    if (typeof mock === 'function') return mock(route);
    if (typeof mock === 'number') return route.fulfill({ status: mock, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: typeof mock === 'string' ? mock : JSON.stringify(mock) });
  });
}

// #endregion
// #region 04 — Server locale

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** `vite preview` della web app su 4180 (o una porta libera se 4180 è già in uso da un'altra verifica). */
export async function startVitePreview(root, preferredPort = 4180, outDir = '') {
  const port = await portBusy(preferredPort) ? await freePort() : preferredPort;
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const extra = outDir ? ['--outDir', path.resolve(outDir)] : [];
  const child = spawn(process.execPath, [vite, 'preview', '--config', 'web/vite.config.ts', '--port', String(port), '--strictPort', ...extra],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview terminato: ${log.slice(-400)}`);
    try { if ((await fetch(`${origin}/`)).ok) return { origin, port, stop: () => stopProcess(child) }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  stopProcess(child);
  throw new Error(`vite preview non risponde su ${origin}`);
}

export function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill();
}

// #endregion
// #region 05 — Cattura del solo Core (alpha = luce delle particelle)

const ISOLATE_CSS = `*,*::before,*::after{visibility:hidden!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important;caret-color:transparent!important}
html,body{background:transparent!important}canvas.core,canvas[data-qa-core]{visibility:visible!important}`;

/**
 * Cattura il canvas del Core su sfondo trasparente: ogni altro elemento è nascosto (ma i contenitori continuano a
 * ritagliare come nella pagina vera). Restituisce PNG e geometria (canvas, contenitore che ritaglia, finestra).
 */
export async function captureCoreAlpha(page, selector = 'canvas.core') {
  const geometry = await page.evaluate((query) => {
    const canvas = document.querySelector(query);
    if (!canvas) return null;
    const box = (rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    let host = canvas.parentElement;
    let clip = null;
    for (; host && host !== document.documentElement; host = host.parentElement) {
      const style = getComputedStyle(host);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') { clip = box(host.getBoundingClientRect()); break; }
    }
    return { canvas: box(canvas.getBoundingClientRect()), clip, viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
      backend: canvas.dataset.backend || '', host: host && host !== document.documentElement ? `${host.tagName.toLowerCase()}.${String(host.className).split(' ')[0]}` : 'viewport' };
  }, selector);
  if (!geometry) throw new Error(`canvas ${selector} assente`);
  const style = await page.addStyleTag({ content: ISOLATE_CSS });
  await page.clock.runFor(32);
  // Le transizioni CSS seguono il tempo reale, non l'orologio finto: si portano allo stato finale.
  const png = await page.screenshot({ omitBackground: true, animations: 'disabled', caret: 'hide' });
  await style.evaluate((node) => node.remove());
  await page.clock.runFor(32);
  return { png, geometry };
}

// #endregion
