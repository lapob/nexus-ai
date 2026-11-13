/**
 * @module scripts/check-window-overlay
 * @description Verifica reale della barra alta su Windows: apre il renderer compilato con le stesse opzioni della
 * finestra principale (nessun pulsante di sistema), misura riduci/ingrandisci/chiudi integrati, allineamento,
 * collisioni e trascinamento, e salva le catture. Uso: npm run qa:desktop:overlay.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, desktopCapturer, protocol, screen } = require('electron');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'qa-artifacts', 'window-overlay');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-overlay-')));
const log = (message) => console.error(message);
process.on('uncaughtException', (e) => { log('ERR ' + e.stack); app.exit(1); });
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const { registerRendererProtocol, RENDERER_ENTRY_URL } = require(path.join(root, 'src/infrastructure/electron/renderer-protocol'));
app.whenReady().then(async () => {
  registerRendererProtocol(path.join(root, 'renderer-dist'));
  const results = [];
  // show:false + showInactive: la finestra di prova non ruba il fuoco e non riceve ciò che il proprietario sta digitando.
  // Stesse opzioni della finestra principale: nessun pulsante di sistema, controlli integrati nella barra.
  const { ipcMain } = require('electron');
  ipcMain.handle('nexus:window-action', () => ({ maximized: false, fullscreen: false, focused: true }));
  const win = new BrowserWindow({ show: false, width: 1366, height: 720, x: 40, y: 40, backgroundColor: '#030405', titleBarStyle: 'hidden',
      webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(root, 'src', 'preload.js') } });
  win.showInactive();
  await win.loadURL(RENDERER_ENTRY_URL).catch((e) => log('loadErr ' + e.message));
  for (const [width, height] of [[1920, 1040], [1366, 720], [1024, 700], [900, 640], [720, 560]]) {
    win.setBounds({ x: 40, y: 40, width, height });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const metrics = await win.webContents.executeJavaScript(`(() => {
      const wco = navigator.windowControlsOverlay;
      const area = wco?.getTitlebarAreaRect?.();
      const actions = [...document.querySelectorAll('.topbar button, .topbar a, .topbar [role="status"], .topbar .status-dot, .topbar > *')]
        .filter((node) => node.getClientRects().length).map((node) => node.getBoundingClientRect());
      const right = Math.max(...actions.map((box) => box.right));
      const drag = getComputedStyle(document.querySelector('.topbar')).getPropertyValue('app-region') || getComputedStyle(document.querySelector('.topbar')).webkitAppRegion;
      const controls = [...document.querySelectorAll('.window-controls .window-control')].map((node) => node.getBoundingClientRect());
      const bar = document.querySelector('.topbar'); const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:env(titlebar-area-x, -1px);width:env(titlebar-area-width, 3px);height:env(titlebar-area-height, 5px)'; document.body.append(probe); const pr = probe.getBoundingClientRect(); const sheet = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).join(' '); const tb = bar.getBoundingClientRect(); const cmd = [...bar.querySelectorAll('button')].pop()?.getBoundingClientRect(); return { barH: tb.height, iconMid: cmd ? cmd.top + cmd.height / 2 : null, pad: getComputedStyle(bar).paddingRight, probe: [pr.left, pr.width, pr.height], hasEnv: sheet.includes('titlebar-area'), hasDrag: /app-region/.test(sheet), visible: Boolean(wco?.visible), areaRight: area ? area.x + area.width : null, areaHeight: area?.height ?? null, actionsRight: right, viewport: innerWidth, drag,
        controls: controls.length, controlsRight: controls.length ? Math.max(...controls.map((box) => box.right)) : null,
        controlsMidOffset: controls.length ? Math.max(...controls.map((box) => Math.abs(box.top + box.height / 2 - (tb.top + tb.height / 2)))) : null,
        collisions: (() => {
          // Ogni controllo visibile e cliccabile deve stare nella finestra e non coprire un altro controllo.
          const hit = [...document.querySelectorAll('button, a[href], input, textarea, [role="button"], [role="switch"], [role="combobox"]')]
            .filter((node) => { const s = getComputedStyle(node); const b = node.getBoundingClientRect(); return b.width > 1 && b.height > 1 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && !node.closest('[aria-hidden="true"], [inert]'); })
            .map((node) => ({ node, box: node.getBoundingClientRect(), name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 24) || node.tagName }));
          const issues = [];
          for (const item of hit) {
            if (item.box.left < -0.5 || item.box.right > innerWidth + 0.5 || item.box.top < -0.5 || item.box.bottom > innerHeight + 0.5) {
              const clipped = item.node.closest('[style*="overflow"], .conversation-list, .messages, .sidebar-scroll');
              if (!clipped) issues.push('fuori finestra: ' + item.name);
            }
          }
          for (let i = 0; i < hit.length; i += 1) for (let j = i + 1; j < hit.length; j += 1) {
            const a = hit[i], b = hit[j];
            if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
            const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
            const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
            if (w > 1.5 && h > 1.5) issues.push('sovrapposti: ' + a.name + ' / ' + b.name);
          }
          return issues.slice(0, 12);
        })() };
    })()`);
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const scale = display.scaleFactor;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width * scale, height: display.size.height * scale } });
    const shot = sources.find((source) => String(source.display_id) === String(display.id)) || sources[0];
    const crop = shot.thumbnail.crop({ x: Math.round((bounds.x + bounds.width - 420 - display.bounds.x) * scale), y: Math.round((bounds.y - display.bounds.y) * scale), width: Math.round(420 * scale), height: Math.round(90 * scale) });
    fs.writeFileSync(path.join(out, `overlay-${width}.png`), crop.toPNG());
    fs.writeFileSync(path.join(out, `window-${width}.png`), (await win.webContents.capturePage()).toPNG());
    results.push({ width, ...metrics });
  }
  win.destroy();
  fs.writeFileSync(path.join(out, 'overlay.json'), JSON.stringify(results, null, 2));
  const broken = results.filter((entry) => entry.visible || entry.controls !== 3 || entry.controlsRight > entry.viewport - 4 || entry.controlsMidOffset > 1.5 || entry.drag !== 'drag' || entry.collisions.length);
  console.log(broken.length ? `Barra desktop non corretta: ${JSON.stringify(broken)}` : `Barra desktop corretta su ${results.length} larghezze: riduci/ingrandisci/chiudi integrati, centrati, nessuna collisione, trascinabile.`);
  app.exit(broken.length ? 1 : 0);
});
