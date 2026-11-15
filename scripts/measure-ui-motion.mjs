/**
 * @module scripts/measure-ui-motion
 * @description Misura la fluidità reale della web app (web-dist) in Chrome con WebGPU: intervalli tra fotogrammi
 * (p50/p95/p99/max, quota oltre 1,5 e 2 intervalli di vsync), long task e long animation frame, durante il respiro
 * del nucleo, il cambio conversazione (View Transitions), fogli e palette e una risposta in streaming simulata.
 * Nessuna richiesta esce dalla macchina. Uso: npm run build:web && node scripts/measure-ui-motion.mjs
 * Risultato: qa-artifacts/ui-motion-frames.json
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #region 01 — Dipendenze e server statico con API simulate

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'web-dist');
const resolveModule = (relative) => [path.join(root, 'node_modules'), path.join(root, '..', '.SITE', 'node_modules')]
  .map((base) => path.join(base, relative)).find((candidate) => fs.existsSync(candidate));
const playwrightPath = resolveModule('playwright/index.mjs');
if (!playwrightPath) { console.error('Playwright non trovato: misura non eseguita.'); process.exit(2); }
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('web-dist assente: esegui prima npm run build:web.'); process.exit(2); }
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (['/favicon.ico', '/nexus-icon.png', '/manifest.webmanifest'].includes(pathname)) { response.writeHead(204).end(); return; }
  if (pathname === '/api/guest/bootstrap') { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token: 'misura', expiresAt: Date.now() + 3_600_000 })); return; }
  if (pathname === '/api/guest/messages/stream') {
    // 4 fasi + 160 token in ~5,6 s: ritmo di una risposta reale, con paragrafi.
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const events = [
      ...['Comprendo la richiesta…', 'Raccolgo le informazioni utili…', 'Genero la risposta…'].map((text) => ({ type: 'phase', activity: { text, phase: 'work' } })),
      ...Array.from({ length: 160 }, (_, i) => ({ type: 'token', token: i % 14 === 13 ? `parola ${i}.\n\n` : `parola ${i} ` })),
      { type: 'complete' }
    ];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= events.length || response.destroyed) { clearInterval(timer); response.end(); return; }
      response.write(`${JSON.stringify(events[index])}\n`); index += 1;
    }, 35);
    request.on('close', () => clearInterval(timer));
    return;
  }
  if (pathname === '/readyz' || pathname.startsWith('/api/')) { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'); return; }
  const target = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(dist + path.sep) || !fs.existsSync(target)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

// #endregion

// #region 02 — Registratore di fotogrammi nella pagina

/** Gira nella pagina: registra ogni intervallo rAF e i long task / long animation frame tra start e stop. */
function installRecorder() {
  const state = { recording: false, frames: [], longTasks: [], loaf: [], last: 0 };
  const tick = (now) => {
    if (state.recording && state.last) state.frames.push(now - state.last);
    state.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((list) => { if (state.recording) for (const entry of list.getEntries()) state.longTasks.push(entry.duration); }).observe({ type: 'longtask', buffered: false }); } catch { /* non supportato */ }
  try { new PerformanceObserver((list) => { if (state.recording) for (const entry of list.getEntries()) state.loaf.push({ duration: entry.duration, blocking: entry.blockingDuration }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch { /* non supportato */ }
  window.__frames = {
    start() { state.frames = []; state.longTasks = []; state.loaf = []; state.last = 0; state.recording = true; },
    stop() { state.recording = false; return { frames: state.frames, longTasks: state.longTasks, loaf: state.loaf }; }
  };
}

const now = Date.now();
const conversation = (id, title, question, answer) => ({ id, title, createdAt: now, updatedAt: now, messages: [
  { id: `${id}-u`, role: 'user', content: question, createdAt: now },
  { id: `${id}-a`, role: 'assistant', content: answer, createdAt: now }
] });
const longAnswer = Array.from({ length: 14 }, (_, i) => `Paragrafo ${i + 1}: il nucleo **fiorisce** e poi collassa in un cuore denso, mentre la UI respira con lui.\n\n- punto uno\n- punto due`).join('\n\n');
const seeded = { conversations: [conversation('m1', 'Misura A', 'Prima domanda di prova', longAnswer), conversation('m2', 'Misura B', 'Seconda domanda di prova', longAnswer)],
  pinned: [], projects: [], projectOf: {}, projectView: null, activeId: 'm1', mode: 'fast', preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' } };

// #endregion

// #region 03 — Scenari

function summarize(name, { frames, longTasks, loaf }, vsync) {
  const sorted = [...frames].sort((a, b) => a - b);
  const pick = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  const round = (value) => Math.round(value * 10) / 10;
  return {
    scenario: name, frames: frames.length, vsyncMs: round(vsync),
    p50: round(pick(0.5)), p95: round(pick(0.95)), p99: round(pick(0.99)), max: round(sorted.at(-1) || 0),
    over1_5Vsync: frames.filter((value) => value > vsync * 1.5).length,
    over2Vsync: frames.filter((value) => value > vsync * 2).length,
    longTasks: longTasks.length, longTaskMaxMs: round(Math.max(0, ...longTasks)),
    longAnimationFrames: loaf.length, loafMaxBlockingMs: round(Math.max(0, ...loaf.map((entry) => entry.blocking || 0)))
  };
}

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const results = [];
async function measure(name, { viewport = { width: 1440, height: 900 }, state = null, settle = 4500, run }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(installRecorder);
  if (state) await context.addInitScript((value) => localStorage.setItem('nxs.next.state.v1', value), JSON.stringify(state));
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('.composer, .live-panel');
  await page.waitForTimeout(settle); // avvio, chunk pigri e rampa del respiro (~4 s)
  const vsync = await page.evaluate(() => new Promise((resolve) => { const t = []; const f = (n) => { t.push(n); if (t.length < 61) requestAnimationFrame(f); else resolve((t[60] - t[0]) / 60); }; requestAnimationFrame(f); }));
  await page.evaluate(() => window.__frames.start());
  await run(page);
  const raw = await page.evaluate(() => window.__frames.stop());
  const backend = await page.evaluate(() => document.querySelector('.core canvas, canvas')?.dataset.backend || 'nessuno');
  results.push({ ...summarize(name, raw, vsync), backend, viewport: `${viewport.width}×${viewport.height}` });
  await context.close();
}

await measure('nucleo a riposo, respiro completo (14 s)', { run: (page) => page.waitForTimeout(14_000) });
await measure('nucleo su telefono 390×844 (8 s)', { viewport: { width: 390, height: 844 }, run: (page) => page.waitForTimeout(8_000) });
await measure('cambio conversazione ×8 (View Transitions)', { state: seeded, run: async (page) => {
  for (let i = 0; i < 8; i += 1) { await page.click(`.conversation > button:has-text("${i % 2 ? 'Misura A' : 'Misura B'}")`); await page.waitForTimeout(700); }
} });
await measure('fogli e palette ×5 (apri/chiudi)', { state: seeded, run: async (page) => {
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Control+k'); await page.waitForTimeout(450); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    await page.keyboard.press('Control+/'); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }
} });
await measure('invio e risposta in streaming (~6 s)', { run: async (page) => {
  await page.fill('textarea[aria-label="Messaggio"]', 'Spiegami il respiro del nucleo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7_000);
} });

await browser.close();
server.close();

// #endregion

// #region 04 — Rapporto

const report = { measuredAt: new Date().toISOString(), engine: 'Chrome (Playwright, headless, WebGPU)', note: 'Intervalli rAF del thread principale; headless non misura il compositor del sistema operativo.', results };
fs.mkdirSync(path.join(root, 'qa-artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'qa-artifacts', 'ui-motion-frames.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(results.map(({ scenario, backend, frames, vsyncMs, p50, p95, p99, max, over1_5Vsync, over2Vsync, longTasks, loafMaxBlockingMs }) =>
  ({ scenario, backend, frames, vsyncMs, p50, p95, p99, max, '>1.5v': over1_5Vsync, '>2v': over2Vsync, longTasks, loafBlock: loafMaxBlockingMs })));

// #endregion
