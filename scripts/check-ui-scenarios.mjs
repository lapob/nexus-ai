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
const { SANDBOX_HOST_HTML, sandboxHostPolicy } = (await import(pathToFileURL(path.join(root, 'src', 'shared', 'sandbox-host.js')).href)).default;
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
  if (pathname === '/api/guest/bootstrap') { response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token: 'scenario-token', expiresAt: Date.now() + 3_600_000 })); return; }
  // Risposta in streaming lenta (fasi + 120 token in ~4 s) per provare lo scorrimento durante la generazione.
  if (pathname === '/api/guest/messages/stream') {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const events = [
      ...['Comprendo la richiesta…', 'Comprendo la richiesta e preparo il contesto…', 'Raccolgo le informazioni utili…', 'Genero la risposta…'].map((text) => ({ type: 'phase', activity: { text, phase: 'work' } })),
      ...Array.from({ length: 120 }, (_, i) => ({ type: 'token', token: i % 12 === 11 ? `parola ${i}.\n\n` : `parola ${i} ` })),
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
  { name: 'panel-html', viewport: { width: 1440, height: 860 }, sandbox: true, state: { ...thread, activeId: 'h1', conversations: [{ id: 'h1', title: 'Pagina', createdAt: now, updatedAt: now, messages: [
    msg('h1a', 'user', 'Fammi una pagina', now - 3000),
    msg('h1b', 'assistant', 'Ecco:\n\n```html\n<!doctype html><html><body><h1 id="t">…</h1><p id="n">…</p><p id="p">…</p><script>\ndocument.getElementById("t").textContent = "Eseguito";\nfetch("https://example.com/").then(() => n.textContent = "rete aperta", () => n.textContent = "rete bloccata");\ntry { p.textContent = parent.document.title ? "madre esposta" : "?"; } catch { p.textContent = "madre protetta"; }\n</script></body></html>\n```', now - 2000)] }, ...thread.conversations] },
  run: async (page) => {
    await page.click('.open-panel');
    await page.waitForSelector('.panel-html[data-state="ready"]', { timeout: 8000 });
    const frame = page.frameLocator('.panel-html iframe');
    await frame.locator('#t', { hasText: 'Eseguito' }).waitFor({ timeout: 5000 });
    await frame.locator('#n', { hasText: /rete/ }).waitFor({ timeout: 5000 });
    const [network, parentAccess] = [await frame.locator('#n').textContent(), await frame.locator('#p').textContent()];
    if (network !== 'rete bloccata') throw new Error(`la sandbox ha accesso alla rete (${network})`);
    if (parentAccess !== 'madre protetta') throw new Error(`la sandbox vede la pagina madre (${parentAccess})`);
  }, expect: ['.panel-html iframe[sandbox="allow-scripts allow-modals"]'] },
  { name: 'panel-csv', viewport: { width: 1180, height: 760 }, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=2'); }, expect: ['.panel-table td'] },
  { name: 'panel-mobile', viewport: mobile, mobile: true, state: artifacts, run: async (page) => { await page.click('.open-panel >> nth=0'); }, expect: ['.panel'] },
  { name: 'tooltip', viewport: desktop, run: async (page) => {
    await page.hover('button[title="Altre idee"]'); await page.waitForTimeout(650);
    if (await page.locator('button[title="Altre idee"]').count()) throw new Error('il title nativo resta attivo');
    if ((await page.locator('.tooltip').textContent()) !== 'Altre idee') throw new Error('tooltip con testo errato');
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
  { name: 'sidebar-rail', viewport: desktop, state: thread, run: async (page) => {
    await page.click('[aria-label="Nascondi barra laterale (Ctrl+B)"]'); await page.waitForTimeout(500);
    const width = await page.$eval('.sidebar', (element) => Math.round(element.getBoundingClientRect().width));
    if (width < 56 || width > 72) throw new Error(`colonna icone larga ${width}px`);
    await page.click('.sidebar-rail [aria-label="Cerca nelle conversazioni"]'); await page.waitForTimeout(600);
    if (!(await page.evaluate(() => document.activeElement?.matches('.sidebar-full input[type="search"]')))) throw new Error('Cerca dalla colonna non porta alla ricerca');
  }, expect: ['.sidebar-full .search'] },
  { name: 'sidebar-rail-closed', viewport: desktop, state: thread, run: async (page) => {
    await page.click('[aria-label="Nascondi barra laterale (Ctrl+B)"]'); await page.waitForTimeout(500);
  }, expect: ['.sidebar-rail .rail-new', '.sidebar-rail .avatar'] },
  { name: 'profile-menu', viewport: desktop, state: thread, run: async (page) => {
    await page.click('.sidebar-foot .profile-button'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (await page.locator('.profile-menu').count()) throw new Error('Esc non chiude il menu profilo');
    await page.click('.sidebar-foot .profile-button');
  }, expect: ['.profile-menu [role="menuitem"]'] },
  { name: 'profile-menu-rail', viewport: desktop, state: thread, run: async (page) => {
    await page.click('[aria-label="Nascondi barra laterale (Ctrl+B)"]'); await page.waitForTimeout(500);
    await page.click('.sidebar-rail .profile-button'); await page.waitForTimeout(350);
    // Il menu non deve essere ritagliato dalla colonna da 64px: ogni voce deve essere davvero visibile e cliccabile.
    const clipped = await page.$$eval('.profile-menu [role="menuitem"]', (items) => items.filter((item) => {
      const box = item.getBoundingClientRect();
      const hit = document.elementFromPoint(box.right - 6, box.top + box.height / 2);
      return box.right > innerWidth || !(hit && item.contains(hit));
    }).map((item) => item.textContent?.trim()));
    if (clipped.length) throw new Error(`menu profilo tagliato nella barra a icone: ${clipped.join(', ')}`);
  }, expect: ['.profile-menu [role="menuitem"]'] },
  { name: 'reasoning-trail', viewport: desktop, state: { ...thread, activeId: 'rt', conversations: [{ id: 'rt', title: 'Ragionamento', createdAt: now, updatedAt: now, messages: [
    msg('rt1', 'user', 'Come risparmio energia?', now - 4000),
    msg('rt3', 'user', 'Ricorda che preferisco risposte brevi', now - 3000),
    { ...msg('rt4', 'assistant', 'Fatto, lo ricorderò.', now - 2500), memory: { action: 'remember', id: 7, content: 'Preferisce risposte brevi e dirette, con esempi pratici quando servono', count: 1 } },
    { ...msg('rt2', 'assistant', '### **2. Pannelli solari**\n\n**Descrizione:** produrre energia da fonti rinnovabili [1]. Un impianto domestico copre gran parte dei consumi [1, 2].', now - 2000),
      sources: [{ title: 'Guida al fotovoltaico', url: 'https://example.org/fotovoltaico' }, { title: 'Consumi domestici', url: 'https://example.com/consumi' }], steps: ['Comprendo la richiesta e preparo il contesto…', 'Raccolgo le informazioni utili…', 'Genero la risposta…'] }] }, ...thread.conversations] },
  run: async (page) => {
    if (await page.$eval('.trail-body', (element) => element.dataset.open) !== 'false') throw new Error('ragionamento aperto a risposta finita');
    await page.click('.trail-toggle'); await page.waitForTimeout(450);
    if (await page.$eval('.trail-body', (element) => element.dataset.open) !== 'true') throw new Error('il ragionamento non si apre');
    const weight = await page.$eval('.markdown :is(h2, h3, h4)', (element) => Math.max(...[element, ...element.querySelectorAll('*')].map((node) => Number(getComputedStyle(node).fontWeight))));
    if (Number(weight) > 700) throw new Error(`titolo in grassetto doppio (${weight})`);
    const cites = await page.$$eval('.markdown a.cite', (links) => links.map((link) => `${link.textContent}:${link.getAttribute('href')}`));
    if (cites.join(' ') !== '1:https://example.org/fotovoltaico 1:https://example.org/fotovoltaico 2:https://example.com/consumi') throw new Error(`citazioni in linea errate: ${cites.join(' ')}`);
  }, expect: ['.trail-toggle[aria-expanded="true"]', '.memory-chip', '.sources'] },
  { name: 'agent-plan', viewport: desktop, state: { ...thread, activeId: 'ap', conversations: [{ id: 'ap', title: 'Piano', createdAt: now, updatedAt: now, messages: [
    msg('ap1', 'user', 'Prepara il viaggio a Lisbona: voli, hotel e itinerario di tre giorni', now - 9000),
    { ...msg('ap2', 'assistant', 'Ecco il piano completo con voli, hotel e itinerario.', now - 5000), plan: [
      { title: 'Cerco i voli più convenienti', status: 'done' }, { title: 'Confronto tre hotel in centro', status: 'done' },
      { title: 'Costruisco l’itinerario di tre giorni', status: 'done' }, { title: 'Riassumo costi e prenotazioni', status: 'skipped' }] },
    msg('ap3', 'user', 'Ora organizza anche il budget', now - 3000),
    { ...msg('ap4', 'assistant', 'Il budget totale stimato è di 840 €.', now - 1000), plan: [
      { title: 'Raccolgo i costi già noti', status: 'done' }, { title: 'Stimo pasti e trasporti', status: 'in_progress' }, { title: 'Preparo la tabella finale', status: 'pending' }] }] }, ...thread.conversations] },
  run: async (page) => {
    const cards = await page.$$eval('.plan-card', (items) => items.map((card) => ({ complete: card.dataset.complete, open: card.querySelector('.trail-body')?.dataset.open, label: card.querySelector('.plan-head span')?.textContent })));
    if (cards.length !== 2) throw new Error(`schede piano attese 2, trovate ${cards.length}`);
    if (cards[0].complete !== 'true' || cards[0].open !== 'false' || !/completato · 4 passi/.test(cards[0].label)) throw new Error(`piano finito non compatto: ${JSON.stringify(cards[0])}`);
    if (cards[1].complete !== 'false' || cards[1].open !== 'true' || cards[1].label !== 'Piano · 1/3') throw new Error(`piano in corso non visibile: ${JSON.stringify(cards[1])}`);
    const progress = await page.$eval('.plan-card[data-complete="false"] [role="progressbar"]', (bar) => bar.getAttribute('aria-valuenow'));
    if (progress !== '1') throw new Error(`avanzamento errato: ${progress}`);
    await page.click('.plan-card[data-complete="true"] .plan-head'); await page.waitForTimeout(450);
    if (await page.$eval('.plan-card[data-complete="true"] .trail-body', (element) => element.dataset.open) !== 'true') throw new Error('il piano completato non si riapre');
  }, expect: ['.plan-steps li[data-status="in_progress"]', '.plan-steps li[data-status="skipped"]'] },
  { name: 'smart-search', viewport: desktop, state: { ...thread, activeId: null, conversations: [
    { id: 'q1', title: 'Viaggio in Portogallo', createdAt: now, updatedAt: now - 1000, messages: [msg('q1a', 'user', 'Organizza tre giorni tra Lisbona e Porto con treni e musei', now - 1000)] },
    { id: 'q2', title: 'Città da visitare', createdAt: now, updatedAt: now - 2000, messages: [msg('q2a', 'assistant', 'Le città più belle: Siviglia, Lisbona e Valencia, perfette in primavera.', now - 2000)] },
    { id: 'q3', title: 'Ricetta veloce', createdAt: now, updatedAt: now - 3000, messages: [msg('q3a', 'user', 'Pasta al pomodoro', now - 3000)] }] },
  run: async (page) => {
    await page.fill('.sidebar-full input[type="search"]', 'LISBONA');
    await page.waitForTimeout(350);
    const hits = await page.$$eval('.search-hit-button', (items) => items.map((item) => ({ title: item.querySelector('.hit-title')?.textContent, snippet: item.querySelector('.snippet')?.textContent })));
    if (hits.length !== 2 || !hits.every((hit) => /lisbona/i.test(hit.snippet || ''))) throw new Error(`risultati di ricerca errati: ${JSON.stringify(hits)}`);
    await page.fill('.sidebar-full input[type="search"]', 'citta');
    await page.waitForTimeout(350);
    const accent = await page.$$eval('.search-hit-button .hit-title', (items) => items.map((item) => item.textContent));
    if (accent.length !== 1 || !/Città/.test(accent[0] || '')) throw new Error(`ricerca senza accenti non trova «Città»: ${accent.join(', ')}`);
    await page.fill('.sidebar-full input[type="search"]', 'zzzz nessuno');
    await page.waitForTimeout(250);
    if (!(await page.$('.empty-list'))) throw new Error('nessun messaggio «Nessun risultato»');
    await page.fill('.sidebar-full input[type="search"]', 'treni');
  }, expect: ['.search-hit-button .snippet'] },
  { name: 'focus-contained', viewport: desktop, state: thread,
  run: async (page) => {
    await page.focus('.conversation-list .conversation button');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(260);
    const ring = await page.evaluate(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      const row = element.closest('.conversation');
      return { inList: Boolean(element.closest('.conversation-list')), outline: style.outlineStyle, rowRing: row ? getComputedStyle(row).boxShadow : '', radius: row ? getComputedStyle(row).borderRadius : '' };
    });
    if (!ring.inList || ring.outline !== 'none' || !/inset/.test(ring.rowRing) || ring.radius === '0px') throw new Error(`anello di focus non integrato nella riga: ${JSON.stringify(ring)}`);
    // Pulsanti senza raggio dichiarato: l'anello resta comunque arrotondato.
    const bare = await page.evaluate(() => getComputedStyle(document.createElement('button')).borderRadius);
    const probe = await page.evaluate(() => { const b = document.createElement('button'); document.body.append(b); const r = getComputedStyle(b).borderRadius; b.remove(); return r; });
    if (probe === '0px') throw new Error(`pulsante senza raggio: ${bare}/${probe}`);
  }, expect: ['.conversation-list'] },
  { name: 'custom-select', viewport: { width: 1280, height: 560 }, state: thread,
  run: async (page) => {
    await page.evaluate(() => {
      const fake = [1, 2, 3, 4, 5].map((n) => ({ kind: 'audioinput', deviceId: `mic-${n}`, label: `Microfono studio ${n}`, groupId: 'g' }));
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => fake } });
    });
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Preferenze di risposta');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#microphone');
    if (await page.$('select')) throw new Error('resta un <select> nativo');
    await page.click('#microphone');
    await page.waitForSelector('.select-panel li');
    await page.waitForTimeout(260);
    const box = await page.$eval('.select-panel', (panel) => { const r = panel.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight, side: panel.dataset.side }; });
    if (box.top < 0 || box.bottom > box.h || box.left < 0 || box.right > box.w) throw new Error(`pannello fuori schermo: ${JSON.stringify(box)}`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(220);
    if (await page.$('.select-panel')) throw new Error('il pannello non si chiude dopo la scelta');
    const value = await page.$eval('#microphone .select-value', (node) => node.textContent);
    if (value !== 'Microfono studio 2') throw new Error(`scelta da tastiera errata: ${value}`);
    if (!(await page.evaluate(() => document.activeElement?.id === 'microphone'))) throw new Error('il fuoco non torna al selettore');
    await page.keyboard.press('Space');
    await page.waitForSelector('.select-panel li[aria-selected="true"]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);
    if (await page.$('.select-panel')) throw new Error('Esc non chiude il pannello');
    if (!(await page.$('.sheet'))) throw new Error('Esc ha chiuso anche il foglio');
    await page.click('#microphone');
  }, expect: ['.select-panel li[aria-selected="true"] .select-check'] },
  { name: 'stream-scroll-up', viewport: desktop, state: { ...thread, activeId: 'ss', conversations: [{ id: 'ss', title: 'Lunga', createdAt: now, updatedAt: now,
    messages: Array.from({ length: 16 }, (_, i) => msg(`s${i}`, i % 2 ? 'assistant' : 'user', `Messaggio ${i}: ${'testo di prova '.repeat(i % 2 ? 18 : 3)}`, now - (30 - i) * 1000)) }, ...thread.conversations] },
  run: async (page) => {
    await page.fill('textarea[aria-label="Messaggio"]', 'Scrivi una risposta lunga');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.trail-toggle'); await page.waitForTimeout(900);
    // Durante la generazione l'utente risale di poco: non deve essere riportato giù al token successivo.
    await page.hover('.scroll'); await page.mouse.wheel(0, -60); await page.waitForTimeout(900);
    const distance = await page.$eval('.scroll', (element) => element.scrollHeight - element.scrollTop - element.clientHeight);
    if (distance < 40) throw new Error(`scorrimento verso l'alto annullato durante la risposta (distanza ${Math.round(distance)}px)`);
    if (await page.$eval('.trail-body', (element) => element.dataset.open) !== 'false') throw new Error('il ragionamento resta aperto mentre la risposta viene scritta');
    await page.waitForFunction(() => !document.querySelector('.composer[data-generating="true"]'), null, { timeout: 15_000 });
  }, expect: ['.thread .message.user'] },
  { name: 'offline', viewport: desktop, offline: true, run: async (page) => {
    await page.fill('textarea[aria-label="Messaggio"]', 'Ciao');
    if (!(await page.locator('button.send').isDisabled())) throw new Error('invio attivo da offline');
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    if (await page.locator('.thread .message.user').count()) throw new Error('messaggio inviato da offline');
  }, expect: ['.composer[data-offline="true"]'] },
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
  // I blocchi della sandbox (rete, storage) sono il comportamento atteso: contano solo gli errori della app.
  page.on('console', (message) => { if (message.type() === 'error' && !(scenario.offline && /status of 503/.test(message.text())) && !String(message.location()?.url || '').startsWith('https://nexusnxs.com/sandbox/') && !(scenario.sandbox && /connect-src 'none'|Refused to connect because it violates/.test(message.text()))) errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400 && !scenario.offline) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
  // PC irraggiungibile: readyz e API rispondono come il gateway quando il servizio è spento.
  if (scenario.offline) await context.route(/\/(readyz|api\/)/, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"offline","retryAfter":8}' }));
  // Ospite della sandbox servito come in produzione (stessa pagina e CSP di src/shared/sandbox-host.js).
  await context.route('https://nexusnxs.com/sandbox/v1', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
    headers: { 'Content-Security-Policy': sandboxHostPolicy('http://127.0.0.1:*') }, body: SANDBOX_HOST_HTML }));
  if (scenario.state) await context.addInitScript((value) => { if (window === window.top) localStorage.setItem('nxs.next.state.v1', JSON.stringify(value)); }, scenario.state);
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
      // Le citazioni [n] stanno dentro una frase: eccezione «inline» di WCAG 2.5.8 (hanno comunque un'area di tocco estesa).
      const small = [...document.querySelectorAll('button, a[href], [role="option"]')].filter(visible).filter((element) => !element.matches('.cite'))
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
// #endregion

// #region 05 — Matrice di risoluzioni: niente tagli durante le animazioni, al passaggio e dopo

// Un elemento è "tagliato" se esce da un antenato che ritaglia (overflow o maschera) lungo un
// asse in cui quell'antenato non scorre, o dallo schermo. Campionato mentre i riquadri entrano.
const RESOLUTIONS = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [568, 320], [768, 1024], [844, 390],
  [1024, 640], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160]];
const WATCHED = '.chip, .category, .welcome h2, .composer, .topbar .icon-button, .new-chat';
const clipProbe = (selector) => {
  const issues = [];
  for (const element of document.querySelectorAll(selector)) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width < 1 || style.visibility === 'hidden' || element.closest('[inert],[aria-hidden="true"]')) continue;
    let scrollsX = false, scrollsY = false;
    for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      const masked = css.maskImage && css.maskImage !== 'none';
      const clipsX = masked || css.overflowX !== 'visible', clipsY = masked || css.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const area = parent.getBoundingClientRect();
      const ownX = ['auto', 'scroll'].includes(css.overflowX) && parent.scrollWidth > parent.clientWidth + 1;
      const ownY = ['auto', 'scroll'].includes(css.overflowY) && parent.scrollHeight > parent.clientHeight + 1;
      const name = `${parent.tagName.toLowerCase()}.${String(parent.className).split(' ')[0]}`;
      // Dentro un contenitore che scorre su quell'asse, uscire dai bordi è scorrimento, non un taglio.
      if (clipsY && !ownY && !scrollsY && (box.top < area.top - 0.5 || box.bottom > area.bottom + 0.5)) issues.push(`taglio verticale da ${name}`);
      if (clipsX && !ownX && !scrollsX && (box.left < area.left - 0.5 || box.right > area.right + 0.5)) issues.push(`taglio orizzontale da ${name}`);
      scrollsX ||= ownX; scrollsY ||= ownY;
    }
    if (!scrollsX && (box.left < -0.5 || box.right > innerWidth + 0.5)) issues.push('fuori schermo in orizzontale');
    if (!scrollsY && (box.top < -0.5 || box.bottom > innerHeight + 0.5)) issues.push('fuori schermo in verticale');
    if (issues.length) return issues.map((issue) => `${element.className.split(' ')[0] || element.tagName}: ${issue}`);
  }
  return issues;
};
let matrixFailures = 0;
for (const [width, height] of RESOLUTIONS) {
  const mobileDevice = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark', isMobile: mobileDevice, hasTouch: mobileDevice });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const problems = new Set();
  try {
    await page.goto(base, { waitUntil: 'load' });
    const sample = async (moment) => { for (const issue of await page.evaluate(clipProbe, WATCHED)) problems.add(`${moment}: ${issue}`); };
    for (const delay of [60, 180, 320, 520, 900, 1600]) { await page.waitForTimeout(delay === 60 ? 60 : 140); await sample(`ingresso ${delay}ms`); }
    await page.click('.category.shuffle');
    for (const delay of [80, 220, 420, 800]) { await page.waitForTimeout(120); await sample(`rimescolo ${delay}ms`); }
    if (!mobileDevice) for (const chip of await page.locator('.chip:visible').all()) { await chip.hover(); await page.waitForTimeout(260); await sample('passaggio'); }
    for (const error of errors) problems.add(`errore: ${error}`);
  } catch (error) { problems.add(error.message.split('\n')[0]); }
  if (problems.size) { matrixFailures += 1; await page.screenshot({ path: path.join(out, `matrix-${width}x${height}.png`) }); }
  console.log(`${problems.size ? '✖' : '✔'} ${width}×${height}${problems.size ? `\n    ${[...problems].slice(0, 6).join('\n    ')}` : ''}`);
  await context.close();
}
if (matrixFailures) failures.push(`matrice (${matrixFailures})`);

await browser.close();
server.close();
console.log(`\n${scenarios.length - failures.length}/${scenarios.length} scenari puliti · matrice ${RESOLUTIONS.length - matrixFailures}/${RESOLUTIONS.length} risoluzioni · catture in ${path.relative(root, out)}${axeSource ? '' : ' · axe non disponibile'}`);
process.exit(failures.length ? 1 : 0);

// #endregion
