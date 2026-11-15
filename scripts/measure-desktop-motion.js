/**
 * @module scripts/measure-desktop-motion
 * @description Misura la fluidità della UI desktop nel vero Electron: renderer compilato (renderer-dist) sul protocollo
 * nexus://, preload reale e finestra con le opzioni della principale, mostrata senza rubare il fuoco. Il processo
 * principale è sostituito da risposte IPC sintetiche (servizio pronto, due conversazioni, risposta in streaming):
 * nessun server, modello o dato reale. Stessi scenari di scripts/measure-ui-motion.mjs.
 * Uso: npm run build:renderer && npx electron scripts/measure-desktop-motion.js
 * Risultato: qa-artifacts/desktop-motion-frames.json
 */
// #region 01 — Preparazione e ponte IPC sintetico
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, protocol, screen } = require('electron');
const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-motion-')));
process.on('uncaughtException', (error) => { console.error(error.stack); app.exit(1); });
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const { registerRendererProtocol, RENDERER_ENTRY_URL } = require(path.join(root, 'src/infrastructure/electron/renderer-protocol'));

// Canali dichiarati dal preload: ognuno riceve una risposta, così nessuna chiamata resta appesa.
const preloadSource = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const CHANNELS = Object.fromEntries([...preloadSource.matchAll(/^\s{2}(\w+): '(nexus:[^']+)'/gm)].map((match) => [match[1], match[2]]));
const now = Date.now();
const longAnswer = Array.from({ length: 14 }, (_, i) => `Paragrafo ${i + 1}: il nucleo **fiorisce** e poi collassa in un cuore denso, mentre la UI respira con lui.\n\n- punto uno\n- punto due`).join('\n\n');
const history = ['Misura A', 'Misura B'].map((title, index) => ({ id: `m${index + 1}`, title, createdAt: now - index, updatedAt: now - index,
  turns: [{ role: 'user', content: `Domanda di prova ${index + 1}`, createdAt: now }, { role: 'assistant', content: longAnswer, createdAt: now }] }));
const answers = {
  bootstrap: { settings: { autoSelectModel: true, responseStyle: 'natural', userName: 'Prova', assistantName: 'NexusNXS', memoryEnabled: true } },
  health: { ok: true, status: 'ready' }, historyList: history, listModels: [], voiceCapabilities: { available: false },
  neuralVoiceCapabilities: { available: false }, updateStatus: { state: 'idle', currentVersion: '0.0.0-misura' },
  windowAction: { maximized: false, fullscreen: false, focused: true }
};
for (const [name, channel] of Object.entries(CHANNELS)) {
  if (name === 'streamEvent' || name === 'streamChat') continue;
  if (process.env.NXS_MOTION_ONLY && !process.env.NXS_MOTION_ONLY.split(',').includes(name)) continue;
  try { ipcMain.handle(channel, () => answers[name] ?? null); } catch { /* canale solo evento */ }
}
// 3 fasi + 160 token ogni 35 ms (~5,7 s): stesso ritmo dello scenario Chrome.
ipcMain.handle(CHANNELS.streamChat, (event, payload) => {
  const requestId = payload?.requestId;
  const events = [
    ...['Comprendo la richiesta…', 'Raccolgo le informazioni utili…', 'Genero la risposta…'].map((label) => ({ type: 'phase', phase: { label } })),
    ...Array.from({ length: 160 }, (_, i) => ({ type: 'token', token: i % 14 === 13 ? `parola ${i}.\n\n` : `parola ${i} ` })),
    { type: 'complete', result: { message: { content: '' } } }
  ];
  let index = 0;
  const timer = setInterval(() => {
    if (index >= events.length || event.sender.isDestroyed()) { clearInterval(timer); return; }
    event.sender.send(CHANNELS.streamEvent, { requestId, ...events[index] }); index += 1;
  }, 35);
  return { ok: true, requestId };
});
// #endregion

// #region 02 — Registratore di fotogrammi e scenari
const RECORDER = `(() => {
  if (window.__frames) return true;
  const state = { recording: false, frames: [], longTasks: [], loaf: [], last: 0 };
  const tick = (now) => { if (state.recording && state.last) state.frames.push(now - state.last); state.last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { if (state.recording) for (const e of l.getEntries()) state.longTasks.push(e.duration); }).observe({ type: 'longtask' }); } catch {}
  try { new PerformanceObserver((l) => { if (state.recording) for (const e of l.getEntries()) state.loaf.push(e.blockingDuration || 0); }).observe({ type: 'long-animation-frame' }); } catch {}
  window.__frames = { start() { Object.assign(state, { frames: [], longTasks: [], loaf: [], last: 0, recording: true }); }, stop() { state.recording = false; return { frames: state.frames, longTasks: state.longTasks, loaf: state.loaf }; } };
  return true;
})()`;
const VSYNC = `new Promise((resolve) => { const t = []; const f = (n) => { t.push(n); if (t.length < 121) requestAnimationFrame(f); else resolve((t[120] - t[0]) / 120); }; requestAnimationFrame(f); })`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

function summarize(scenario, { frames, longTasks, loaf }, vsync, extra) {
  const sorted = [...frames].sort((a, b) => a - b);
  const pick = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return { scenario, ...extra, frames: frames.length, vsyncMs: round(vsync), p50: round(pick(0.5)), p95: round(pick(0.95)), p99: round(pick(0.99)), max: round(sorted.at(-1) || 0),
    over1_5Vsync: frames.filter((v) => v > vsync * 1.5).length, over2Vsync: frames.filter((v) => v > vsync * 2).length,
    longTasks: longTasks.length, longTaskMaxMs: round(Math.max(0, ...longTasks)), loafMaxBlockingMs: round(Math.max(0, ...loaf)) };
}

// Ogni scenario apre e distrugge la propria finestra: l'app non deve uscire tra uno scenario e l'altro.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  registerRendererProtocol(path.join(root, 'renderer-dist'));
  const results = [];
  async function measure(scenario, { width = 1440, height = 900, run }) {
    // Stesse opzioni della finestra principale; showInactive: nessun furto di fuoco o di tastiera.
    const win = new BrowserWindow({ show: false, width, height, x: 40, y: 40, backgroundColor: '#030405', titleBarStyle: 'hidden',
      webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(root, 'src', 'preload.js') } });
    win.showInactive();
    if (process.env.NXS_MOTION_DEBUG) {
      win.webContents.on('console-message', (_event, level, message) => console.error(`renderer[${level}] ${message}`));
      win.webContents.on('did-fail-load', (_event, code, description, url) => console.error(`fail-load ${code} ${description} ${url}`));
      win.webContents.on('render-process-gone', (_event, details) => console.error(`renderer gone ${JSON.stringify(details)}`));
      win.on('closed', () => console.error('finestra chiusa'));
    }
    // Come in check-window-overlay: il caricamento può segnalare ERR_FAILED anche se il documento è montato.
    await win.loadURL(RENDERER_ENTRY_URL).catch((error) => console.error(`load: ${error.message}`));
    const js = (code) => win.webContents.executeJavaScript(code);
    await wait(5000); // avvio, chunk pigri, cronologia e rampa del respiro
    if (!(await js(`Boolean(document.querySelector('.composer'))`))) {
      console.error(`Renderer desktop non montato: ${win.webContents.getURL()} · ${await js('document.documentElement.outerHTML.slice(0, 300)').catch((error) => error.message)}`);
      app.exit(1); return;
    }
    await js(RECORDER);
    const vsync = await js(VSYNC);
    await js('window.__frames.start()');
    await run(js, win);
    const raw = await js('window.__frames.stop()');
    const backend = await js(`document.querySelector('canvas')?.dataset.backend || 'nessuno'`);
    const display = screen.getDisplayMatching(win.getBounds());
    results.push(summarize(scenario, raw, vsync, { backend, window: `${width}×${height}`, dpr: display.scaleFactor, displayHz: display.displayFrequency }));
    win.destroy();
  }
  const key = (win, keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  const clickText = (js, text) => js(`[...document.querySelectorAll('.conversation > button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`);

  await measure('nucleo a riposo, respiro completo (14 s)', { run: () => wait(14_000) });
  await measure('finestra stretta 720×800 (8 s)', { width: 720, height: 800, run: () => wait(8_000) });
  await measure('cambio conversazione ×8 (View Transitions)', { run: async (js) => {
    for (let i = 0; i < 8; i += 1) { await clickText(js, i % 2 ? 'Misura B' : 'Misura A'); await wait(700); }
  } });
  await measure('fogli e palette ×5 (apri/chiudi)', { run: async (js, win) => {
    for (let i = 0; i < 5; i += 1) {
      await js(`document.querySelector('[aria-label="Comandi (Ctrl+K)"]')?.click()`); await wait(450); key(win, 'Escape'); await wait(350);
      key(win, '/', ['control']); await wait(500); key(win, 'Escape'); await wait(400);
    }
  } });
  await measure('invio e risposta in streaming (~6 s)', { run: async (js) => {
    await js(`document.querySelector('[aria-label="Nuova conversazione"]')?.click()`); await wait(800);
    await js(`(() => { const area = document.querySelector('textarea[aria-label="Messaggio"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'Spiegami il respiro del nucleo');
      area.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(150);
    await js(`document.querySelector('button.send[type="submit"]')?.click()`);
    await wait(7_000);
  } });
  // #endregion

  // #region 03 — Rapporto
  const report = { measuredAt: new Date().toISOString(), engine: `Electron ${process.versions.electron} (Chromium ${process.versions.chrome})`, note: 'Finestra reale mostrata senza fuoco; IPC sintetico, nessun server.', results };
  fs.mkdirSync(path.join(root, 'qa-artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'qa-artifacts', 'desktop-motion-frames.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(report.engine);
  console.table(results.map(({ scenario, backend, dpr, displayHz, frames, vsyncMs, p50, p95, p99, max, over1_5Vsync, over2Vsync, longTasks, loafMaxBlockingMs }) =>
    ({ scenario, backend, dpr, hz: displayHz, frames, vsyncMs, p50, p95, p99, max, '>1.5v': over1_5Vsync, '>2v': over2Vsync, longTasks, loafBlock: loafMaxBlockingMs })));
  app.exit(0);
}).catch((error) => { console.error(error.stack || error); app.exit(1); });
process.on('unhandledRejection', (error) => { console.error('rejection', error?.stack || error); });
// #endregion
