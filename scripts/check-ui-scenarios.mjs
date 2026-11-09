/**
 * @module scripts/check-ui-scenarios
 * @description Scenari visivi reali della web app (web-dist) in Chrome: nessun errore, nessuno scorrimento orizzontale,
 * target tattili ≥ 32 px, axe senza violazioni gravi, elementi chiave presenti. Catture in qa-artifacts/ui-scenarios.
 * Uso: npm run build:web && npm run check:ui
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'web-dist');
const out = path.join(root, 'qa-artifacts', 'ui-scenarios');

// #region 01 — Dipendenze (Playwright e axe del repository o del sito vicino; Chrome di sistema)

function resolveModule(relative) {
  for (const base of [path.join(root, 'node_modules'), path.join(root, '..', '.SITE', 'node_modules')]) {
    const candidate = path.join(base, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
const playwrightPath = resolveModule('playwright/index.mjs');
const axePath = resolveModule('axe-core/axe.min.js');
if (!playwrightPath) { console.error('Playwright non trovato (né qui né in ../.SITE): scenari non eseguiti.'); process.exit(2); }
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('web-dist assente: esegui prima npm run build:web.'); process.exit(2); }
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const axeSource = axePath ? fs.readFileSync(axePath, 'utf8') : '';

// #endregion

// #region 02 — Server statico confinato a web-dist

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  // API simulate: il servizio risulta pronto, senza voce; nessuna richiesta esce dalla macchina.
  // Icona e manifest li serve il gateway, non web-dist.
  if (['/favicon.ico', '/nexus-icon.png', '/manifest.webmanifest'].includes(pathname)) { response.writeHead(204).end(); return; }
  if (pathname === '/readyz' || pathname.startsWith('/api/')) { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'); return; }
  const target = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(dist + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

// #endregion

// #region 03 — Dati sintetici (nessun contenuto reale)

const now = Date.now();
const day = 86_400_000;
const msg = (id, role, content, at, extra = {}) => ({ id, role, content, createdAt: at, ...extra });
const thread = {
  activeId: 'c1', mode: 'fast', pinned: ['c3'], preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' },
  conversations: [
    { id: 'c1', title: 'Piano della settimana', createdAt: now - 60_000, updatedAt: now - 30_000, messages: [
      msg('m1', 'user', 'Organizza la mia settimana: palestra tre volte e consegna venerdì.', now - 60_000),
      msg('m2', 'assistant', 'Settimana bilanciata:\n\n| Giorno | Mattina |\n|---|---|\n| Lunedì | Struttura |\n| Venerdì | Consegna |', now - 50_000, { requestId: 'r1' }),
      msg('m3', 'user', 'Rendila più leggera il mercoledì', now - 40_000),
      msg('m4', 'assistant', 'Certo: il mercoledì diventa', now - 30_000, { interrupted: true })
    ] },
    { id: 'c2', title: 'Ricetta', createdAt: now - day, updatedAt: now - day, messages: [msg('a', 'user', 'ricetta?', now - day)] },
    { id: 'c3', title: 'Idee regalo', createdAt: now - 3 * day, updatedAt: now - 3 * day, messages: [msg('b', 'user', 'idee?', now - 3 * day)] },
    { id: 'c4', title: 'Script di backup', createdAt: now - 12 * day, updatedAt: now - 12 * day, messages: [msg('c', 'user', 'backup', now - 12 * day)] }
  ]
};
const projects = { ...thread, projectView: 'p1', projectOf: { c1: 'p1', c4: 'p1' }, projects: [
  { id: 'p1', name: 'Tesi di laurea', instructions: 'Rispondi come relatore.', files: [{ id: 'f1', name: 'indice.md', size: 2048, text: '# Indice' }], createdAt: now, updatedAt: now },
  { id: 'p2', name: 'Casa nuova', instructions: '', files: [], createdAt: now, updatedAt: now }
] };
const longCode = Array.from({ length: 16 }, (_, i) => `  const valore${i} = calcola(${i}); // passo ${i} di una funzione lunga`).join('\n');
const artifacts = { ...thread, activeId: 'c9', conversations: [{ id: 'c9', title: 'Artefatti', createdAt: now, updatedAt: now, messages: [
  msg('p1', 'user', 'Codice, SVG e CSV', now - 9000),
  msg('p2', 'assistant', `Codice:\n\n\`\`\`ts\nfunction lunga() {\n${longCode}\n}\n\`\`\`\n\nLogo:\n\n\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#5ee7df"/></svg>\n\`\`\`\n\nDati:\n\n\`\`\`csv\nmese,vendite\ngennaio,120\nfebbraio,"1.400"\n\`\`\``, now - 8000, { requestId: 'rq' })
] }, ...thread.conversations] };

const desktop = { width: 1366, height: 860 };
const mobile = { width: 390, height: 844 };
const scenarios = [
  { name: 'home-desktop', viewport: desktop, expect: ['.welcome h2', '.suggestions .chip'] },
  { name: 'home-short', viewport: { width: 1024, height: 640 }, expect: ['.welcome h2'] },
  { name: 'home-mobile', viewport: mobile, mobile: true, expect: ['.welcome h2'] },
  { name: 'home-landscape', viewport: { width: 844, height: 390 }, reducedMotion: 'reduce', expect: ['.welcome h2'] },
  { name: 'slash-menu', viewport: desktop, run: async (page) => { await page.click('textarea[aria-label="Messaggio"]'); await page.keyboard.type('/r'); }, expect: ['.slash-menu li'] },
  { name: 'thread', viewport: desktop, state: thread, run: async (page) => { await page.hover('.message.user >> nth=0'); }, expect: ['.thread .message.assistant', '.inline-action'] },
  { name: 'thread-mobile', viewport: mobile, mobile: true, state: thread, expect: ['.thread'] },
  { name: 'edit-message', viewport: desktop, state: thread, run: async (page) => { await page.hover('.message.user >> nth=0'); await page.click('[aria-label="Modifica e reinvia"] >> nth=0'); }, expect: ['.edit-box textarea'] },
  { name: 'palette', viewport: desktop, state: thread, run: async (page) => { await page.keyboard.press('Control+k'); }, expect: ['.palette li'] },
  { name: 'shortcuts', viewport: desktop, run: async (page) => { await page.keyboard.press('Control+/'); }, expect: ['.shortcuts dt'] },
  { name: 'project-thread', viewport: desktop, state: projects, expect: ['.project-banner', '.project-chip', '.project-row[data-active="true"]'] },
  { name: 'project-home', viewport: desktop, state: { ...projects, activeId: null }, expect: ['.project-eyebrow'] },
  { name: 'project-sheet', viewport: desktop, state: projects, run: async (page) => { await page.click('[aria-label="Impostazioni di Tesi di laurea"]'); }, expect: ['.project-sheet #project-instructions'] },
  { name: 'panel-code', viewport: { width: 1440, height: 860 }, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=0'); }, expect: ['.panel .panel-code .line'] },
  { name: 'panel-svg', viewport: { width: 1440, height: 860 }, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=1'); }, expect: ['.panel-svg img'] },
  { name: 'panel-csv', viewport: { width: 1180, height: 760 }, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=2'); }, expect: ['.panel-table td'] },
  { name: 'panel-mobile', viewport: mobile, mobile: true, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=0'); }, expect: ['.panel'] },
  { name: 'tooltip', viewport: desktop, run: async (page) => {
    await page.hover('button[title="Preferenze"]'); await page.waitForTimeout(650);
    if (await page.locator('button[title="Preferenze"]').count()) throw new Error('il title nativo resta attivo');
    if ((await page.locator('.tooltip').textContent()) !== 'Preferenze') throw new Error('tooltip con testo errato');
  }, expect: ['.tooltip[role="tooltip"]'] },
  { name: 'new-chat-idempotent', viewport: desktop, state: thread, run: async (page) => {
    const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('nxs.next.state.v1')).conversations.length);
    for (let i = 0; i < 4; i += 1) { await page.click('.new-chat'); await page.waitForTimeout(450); }
    const before = (thread.conversations || []).length;
    if (await count() !== before + 1) throw new Error(`"+" ripetuto: ${await count()} chat invece di ${before + 1}`);
  }, expect: ['.welcome h2'] },
  { name: 'swipe-sidebar', viewport: mobile, mobile: true, state: thread, run: async (page) => {
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (from, to) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 400 }] });
      for (let step = 1; step <= 6; step += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * step) / 6, y: 402 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
    };
    await swipe(70, 300);
    if (!page.url().startsWith(base)) throw new Error(`lo swipe ha fatto navigare il browser (${page.url()})`);
    if (await page.locator('.app[data-sidebar="open"]').count() !== 1) throw new Error('lo swipe a destra non apre la cronologia');
    await swipe(300, 60);
    if (await page.locator('.app[data-sidebar="closed"]').count() !== 1) throw new Error('lo swipe a sinistra non chiude la cronologia');
  }, expect: ['.thread'] },
  { name: 'soft-edges', viewport: desktop, state: { ...thread, activeId: 'cl', conversations: [{ id: 'cl', title: 'Lunga', createdAt: now, updatedAt: now,
    messages: Array.from({ length: 24 }, (_, i) => msg(`l${i}`, i % 2 ? 'assistant' : 'user', `Messaggio ${i}: ${'testo di prova '.repeat(i % 2 ? 18 : 3)}`, now - (30 - i) * 1000)) }, ...thread.conversations] },
  run: async (page) => {
    const fades = () => page.$eval('.scroll', (element) => { const style = getComputedStyle(element); return [parseFloat(style.getPropertyValue('--fade-start')), parseFloat(style.getPropertyValue('--fade-end'))]; });
    await page.$eval('.scroll', (element) => { element.scrollTop = element.scrollHeight / 2 - element.clientHeight / 2; });
    await page.waitForTimeout(300);
    const [top, bottom] = await fades();
    if (!(top > 30 && bottom > 30)) throw new Error(`bordi non sfumati a metà conversazione: ${top}/${bottom}`);
    await page.$eval('.scroll', (element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(300);
    const [, end] = await fades();
    if (end > 2) throw new Error(`in fondo il bordo inferiore resta sfumato: ${end}`);
  }, expect: ['.thread'] },
  { name: 'reduced-motion', viewport: desktop, reducedMotion: 'reduce', state: thread, expect: ['.thread'] }
];

// #endregion

// #region 04 — Esecuzione e verifiche

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const failures = [];
for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: scenario.reducedMotion || 'no-preference',
    isMobile: Boolean(scenario.mobile), hasTouch: Boolean(scenario.mobile) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  if (scenario.state) await context.addInitScript((value) => localStorage.setItem('nxs.next.state.v1', JSON.stringify(value)), scenario.state);
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('canvas.core[data-backend]', { timeout: 15_000 });
    await page.waitForTimeout(1_200);
    if (scenario.run) await scenario.run(page);
    await page.waitForTimeout(800);
    const missing = [];
    for (const selector of scenario.expect || []) if (!(await page.locator(selector).count())) missing.push(selector);
    const metrics = await page.evaluate(() => {
      const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && !element.closest('[inert]'); };
      // Il campo di ricerca è dentro un'etichetta alta 40 px: il bersaglio è l'etichetta.
      const small = [...document.querySelectorAll('button, a[href], [role="option"]')].filter(visible)
        .filter((element) => { const box = element.getBoundingClientRect(); return box.width < 32 || box.height < 32; })
        .map((element) => `${element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 24) || element.className}:${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`);
      return { overflowX: document.documentElement.scrollWidth - innerWidth, small };
    });
    let axe = [];
    if (axeSource) {
      await page.addScriptTag({ content: axeSource });
      axe = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return result.violations.filter((item) => ['serious', 'critical'].includes(item.impact)).map((item) => `${item.id}(${item.nodes.length})`);
      });
    }
    await page.screenshot({ path: path.join(out, `${scenario.name}.png`) });
    const problems = [...errors.map((error) => `errore: ${error}`), ...missing.map((selector) => `manca ${selector}`),
      ...(metrics.overflowX > 0 ? [`scorrimento orizzontale ${metrics.overflowX}px`] : []), ...metrics.small.map((item) => `target piccolo ${item}`), ...axe.map((item) => `axe ${item}`)];
    console.log(`${problems.length ? '✖' : '✔'} ${scenario.name}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
    if (problems.length) failures.push(scenario.name);
  } catch (error) {
    console.log(`✖ ${scenario.name}\n    ${error.message.split('\n')[0]}`);
    failures.push(scenario.name);
  } finally { await context.close(); }
}
await browser.close();
server.close();
console.log(`\n${scenarios.length - failures.length}/${scenarios.length} scenari puliti · catture in ${path.relative(root, out)}${axeSource ? '' : ' · axe non disponibile'}`);
process.exit(failures.length ? 1 : 0);

// #endregion
