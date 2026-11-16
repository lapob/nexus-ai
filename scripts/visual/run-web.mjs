/**
 * @module scripts/visual/run-web
 * @description Regressione visiva della web app (web-dist servita da `vite preview` su 4180).
 *  - suite `web`: home, conversazione, pannelli e impostazioni × larghezze 1440/1024/390 × tema scuro/chiaro,
 *    confrontati con le baseline approvate (diff percettivo, rapporto HTML).
 *  - suite `core`: nucleo di particelle in ogni fase (ingresso, composto, fioritura, zoom massimo, ricomposizione,
 *    collasso), pose hero e ambiente, WebGPU e Canvas 2D: alpha ≈ 0 su bordi del canvas e dell'area visibile
 *    (nessuna particella tagliata da un "box invisibile") più baseline della forma in Canvas 2D.
 * Uso: npm run qa:visual [-- --build] [--suite=web|core] [--only=prefisso] [--update] [--no-webgpu]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { advanceTo, captureCoreAlpha, closeNetwork, FROZEN_EPOCH, freezeTime, ISOLATE_CSS, launch, loadPlaywright, settle, startVitePreview } from './lib/browser.mjs';

const require = createRequire(import.meta.url);
const { createSuite } = require('./lib/baselines.js');
const { analyzeCoreEdges } = require('./lib/edges.js');
const { decode } = require('./lib/png.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const suites = option('suite', 'web,core').split(',').map((value) => value.trim()).filter(Boolean);
const only = option('only', '');
const update = flag('update');
// --tag=nome: esecuzione separata (es. autoverifica) che non sovrascrive il rapporto principale.
const tag = option('tag', '');
const runName = (suite) => tag ? `${suite}-${tag}` : suite;
if (update && (tag || option('dist', ''))) { console.error('--update non è ammesso con --tag o --dist: le baseline si approvano solo dalla build vera.'); process.exit(2); }

// #region 01 — Dati sintetici (orologio fermo: date e testi identici a ogni esecuzione)

const now = FROZEN_EPOCH;
const msg = (id, role, content, at, extra = {}) => ({ id, role, content, createdAt: at, ...extra });
const thread = {
  activeId: 'c1', mode: 'fast', pinned: ['c3'], preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' },
  conversations: [
    { id: 'c1', title: 'Piano della settimana', createdAt: now - 60_000, updatedAt: now - 30_000, messages: [
      msg('m1', 'user', 'Organizza la mia settimana: palestra tre volte e consegna venerdì.', now - 60_000),
      msg('m2', 'assistant', 'Settimana bilanciata:\n\n| Giorno | Mattina |\n|---|---|\n| Lunedì | Struttura |\n| Mercoledì | Recupero |\n| Venerdì | Consegna |\n\nTieni libero il giovedì sera per rivedere la consegna.', now - 50_000, { requestId: 'r1' }),
      msg('m3', 'user', 'Rendila più leggera il mercoledì', now - 40_000),
      msg('m4', 'assistant', 'Fatto: il mercoledì diventa una camminata di 30 minuti e stretching.', now - 30_000, { requestId: 'r2' })
    ] },
    { id: 'c2', title: 'Ricetta', createdAt: now - 86_400_000, updatedAt: now - 86_400_000, messages: [msg('a', 'user', 'ricetta?', now - 86_400_000)] },
    { id: 'c3', title: 'Idee regalo', createdAt: now - 3 * 86_400_000, updatedAt: now - 3 * 86_400_000, messages: [msg('b', 'user', 'idee?', now - 3 * 86_400_000)] }
  ]
};
const code = Array.from({ length: 14 }, (_, i) => `  const valore${i} = calcola(${i}); // passo ${i}`).join('\n');
const artifacts = { ...thread, activeId: 'c9', conversations: [{ id: 'c9', title: 'Artefatti', createdAt: now, updatedAt: now, messages: [
  msg('p1', 'user', 'Codice e dati', now - 9000),
  msg('p2', 'assistant', `Codice:\n\n\`\`\`ts\nfunction lunga() {\n${code}\n}\n\`\`\`\n\nDati:\n\n\`\`\`csv\nmese,vendite\ngennaio,120\nfebbraio,140\n\`\`\``, now - 8000, { requestId: 'rq' })
] }, ...thread.conversations] };

const MOCKS = {
  '/api/guest/bootstrap': { token: 'visual-token', expiresAt: now + 3_600_000 },
  // Serviti in produzione dal gateway (il proxy di vite preview andrebbe in rete): mai fuori dalla macchina.
  '/nexus-icon.png': 204, '/manifest.webmanifest': 204, '/favicon.ico': 204
};

// #endregion
// #region 02 — Superfici e matrice

const WIDTHS = [[1440, 900], [1024, 768], [390, 844]];
const THEMES = ['dark', 'light'];
const SURFACES = [
  { id: 'home', expect: '.welcome h2' },
  { id: 'conversation', state: thread, expect: '.thread .message.assistant' },
  { id: 'panel', state: artifacts, expect: '.doc-panel', run: async (page) => { await page.locator('.open-panel').first().click(); } },
  { id: 'settings', expect: '.sheet', run: async (page) => {
    await page.keyboard.press('Control+k'); await settle(page, 400);
    await page.keyboard.type('Impostazioni e preferenze'); await settle(page, 400);
    await page.keyboard.press('Enter');
  } }
];

// Fasi del respiro (core-breath.ts: periodo 11 s a velocità 0,8 → 13,75 s; fioritura nei cicli pari, collasso nei dispari).
const PHASES = [
  { id: 'ingresso', t: 0.6 }, { id: 'composto', t: 4.5 }, { id: 'fioritura', t: 7.6 },
  { id: 'zoom-max', t: 9.0 }, { id: 'ricomposizione', t: 11.6 }, { id: 'collasso', t: 22.7 }
];
const POSES = [{ id: 'hero' }, { id: 'ambiente', state: thread }];
const BASELINE_PHASES = new Set(['composto', 'zoom-max', 'collasso']);

// Con orologio e casualità fissi le esecuzioni ripetute danno 0,000%: le soglie sono strette. Il limite assoluto
// coglie i difetti piccoli ma reali (un controllo spostato di pochi px cambia ~300 px, lo 0,03% di 1440×900).
const WEB_TOLERANCE = { threshold: 0.1, maxDiffRatio: 0.002, maxDiffPixels: 120 };
const CORE_TOLERANCE = { threshold: 0.12, maxDiffRatio: 0.004, maxDiffPixels: 240 };

// #endregion
// #region 03 — Pagina pronta e deterministica

async function openPage(browser, origin, { width, height, theme = 'dark', state, canvas2d = false }) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme, isMobile: mobile, hasTouch: mobile,
    reducedMotion: 'no-preference', locale: 'it-IT', timezoneId: 'Europe/Rome' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await closeNetwork(context, origin, MOCKS);
  await freezeTime(context, page, { canvas2d });
  if (state) await context.addInitScript((value) => { if (window === window.top) localStorage.setItem('nxs.next.state.v1', JSON.stringify(value)); }, state);
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForSelector('canvas.core[data-backend]', { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // I chunk dell'avvio (motion-features, press) arrivano in tempo reale, mentre l'orologio finto corre in pochi
  // millisecondi: senza attesa lo scatto a volte precedeva le animazioni (conversazione 390 spostata di ~26 px).
  await page.waitForLoadState('networkidle');
  return { context, page, errors };
}

const matches = (name) => !only || only.split(',').some((prefix) => name.startsWith(prefix));

async function runWebSuite(browser, origin) {
  const suite = createSuite({ root, suite: 'web', runName: runName('web'), update, defaults: WEB_TOLERANCE });
  for (const surface of SURFACES) for (const [width, height] of WIDTHS) for (const theme of THEMES) {
    const name = `${surface.id}-${width}-${theme}`;
    if (!matches(name)) continue;
    const { context, page, errors } = await openPage(browser, origin, { width, height, theme, state: surface.state, canvas2d: true });
    try {
      await settle(page, 2500);
      if (surface.run) { await surface.run(page); await settle(page, 1200); }
      await page.waitForSelector(surface.expect, { timeout: 5_000 });
      await advanceTo(page, 6);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      const result = suite.check(name, png);
      const problems = [...errors.map((error) => `errore pagina: ${error}`), ...(overflow > 0 ? [`scorrimento orizzontale ${overflow}px`] : [])];
      if (problems.length) suite.assert(`${name}-integrita`, problems);
      console.log(`${result.status === 'pass' || result.status === 'approved' ? '✔' : '✖'} web ${name} ${result.status}${result.diffRatio !== undefined ? ` ${(result.diffRatio * 100).toFixed(3)}%` : ''}${problems.length ? ` · ${problems.join(' · ')}` : ''}`);
    } catch (error) {
      suite.assert(name, [error.message.split('\n')[0]]);
      console.log(`✖ web ${name}: ${error.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }
  return suite.finish({ browser: browser.version(), origin: 'vite preview (rete chiusa)' });
}

async function runCoreSuite(browsers, origin) {
  const suite = createSuite({ root, suite: 'core', runName: runName('core'), update, defaults: CORE_TOLERANCE });
  for (const [backend, browser] of browsers) for (const pose of POSES) for (const [width, height] of WIDTHS) {
    const prefix = `${backend}-${pose.id}-${width}`;
    if (!PHASES.some((phase) => matches(`${prefix}-${phase.id}`))) continue;
    const { context, page, errors } = await openPage(browser, origin, { width, height, state: pose.state, canvas2d: backend === 'canvas2d' });
    try {
      const actual = await page.$eval('canvas.core', (canvas) => canvas.dataset.backend);
      if (actual !== (backend === 'canvas2d' ? 'canvas' : 'webgpu')) throw new Error(`backend atteso ${backend}, ottenuto ${actual}`);
      for (const phase of PHASES) {
        const name = `${prefix}-${phase.id}`;
        await advanceTo(page, phase.t);
        if (!matches(name)) continue;
        const { png, geometry } = await captureCoreAlpha(page);
        const analysis = analyzeCoreEdges(decode(png), geometry);
        const problems = [...analysis.problems, ...errors.splice(0).map((error) => `errore pagina: ${error}`)];
        suite.assert(`edges-${name}`, problems, png, `ritaglio: ${geometry.host}; alpha totale ${analysis.total}`);
        const peaks = analysis.sides.map((side) => `${side.side[0]}${side.peak}`).join(' ');
        console.log(`${problems.length ? '✖' : '✔'} core ${name} bordi [${peaks}]${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
        if (backend === 'canvas2d' && BASELINE_PHASES.has(phase.id)) {
          const result = suite.check(`shape-${name}`, png);
          if (result.status !== 'pass' && result.status !== 'approved') console.log(`✖ core shape-${name} ${result.status}${result.diffRatio !== undefined ? ` ${(result.diffRatio * 100).toFixed(3)}%` : ''}`);
        }
      }
    } catch (error) {
      suite.assert(`edges-${prefix}`, [error.message.split('\n')[0]]);
      console.log(`✖ core ${prefix}: ${error.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }
  if (matches('qa-time')) await checkQaTime(suite, browsers[0][1], origin);
  return suite.finish({ backends: browsers.map(([id, browser]) => `${id} ${browser.version()}`).join(', ') });
}

/**
 * Aggancio `?nxs-qa-time` (nexus-core): con l'orologio vero, nel worker, il nucleo disegna un solo istante. Due
 * catture a 700 ms di distanza devono essere identiche; il canvas dichiara versione del nucleo e `data-qa="ready"`.
 */
async function checkQaTime(suite, browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`errore pagina: ${error}`));
  try {
    await closeNetwork(context, origin, MOCKS);
    await page.goto(`${origin}/?nxs-qa-time=9`, { waitUntil: 'load' });
    await page.waitForSelector('canvas.core[data-qa="ready"]', { timeout: 20_000 });
    const version = await page.$eval('canvas.core', (canvas) => canvas.dataset.coreVersion || '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`versione del nucleo assente (${version || 'vuota'})`);
    // Solo il nucleo (il resto della pagina è nascosto): hover e stato della UI non entrano nel confronto.
    await page.addStyleTag({ content: ISOLATE_CSS });
    await page.waitForTimeout(1500);
    const capture = () => page.screenshot({ omitBackground: true, animations: 'disabled', caret: 'hide' });
    await page.mouse.move(720, 450);
    await page.waitForTimeout(300);
    const first = await capture();
    await page.mouse.move(200, 200);
    await page.waitForTimeout(700);
    const second = await capture();
    if (!first.equals(second)) problems.push('istante QA non fermo: due catture diverse');
  } catch (error) { problems.push(error.message.split('\n')[0]); } finally { await context.close(); }
  suite.assert('qa-time-fermo', problems);
  console.log(`${problems.length ? '✖' : '✔'} core qa-time fermo${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
}

// #endregion
// #region 04 — Esecuzione

if (flag('build')) {
  const build = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'web/vite.config.ts'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
// --dist=<cartella>: serve un'altra build (es. una copia alterata apposta per provare che il test fallisce).
const dist = option('dist', '');
if (!fs.existsSync(path.join(dist ? path.resolve(dist) : path.join(root, 'web-dist'), 'index.html'))) { console.error('web-dist assente: eseguire npm run build:web (o --build).'); process.exit(2); }

const playwright = await loadPlaywright(root);
const server = await startVitePreview(root, Number(option('port', 4180)), dist);
const opened = [];
let failed = 0;
try {
  const pinned = await launch(playwright);
  opened.push(pinned);
  const reports = [];
  if (suites.includes('web')) reports.push(await runWebSuite(pinned, server.origin));
  if (suites.includes('core')) {
    const backends = [['canvas2d', pinned]];
    if (!flag('no-webgpu')) {
      try { const chrome = await launch(playwright, { webgpu: true }); opened.push(chrome); backends.push(['webgpu', chrome]); }
      catch (error) { console.log(`· WebGPU saltato: Chrome di sistema non disponibile (${error.message.split('\n')[0]})`); }
    }
    reports.push(await runCoreSuite(backends, server.origin));
  }
  for (const report of reports) {
    failed += report.failed;
    console.log(`\n${report.failed ? '✖' : '✔'} ${report.total - report.failed}/${report.total} · rapporto ${path.relative(root, report.report)}`);
  }
  if (update) console.log('Baseline aggiornate: rivedere il rapporto prima del commit.');
  else if (failed) console.log('Regressione visiva: rivedere il rapporto; se il cambiamento è voluto, npm run qa:visual:approve -- <suite> [nomi].');
} finally {
  for (const browser of opened) await browser.close().catch(() => {});
  server.stop();
}
process.exit(failed ? 1 : 0);

// #endregion
