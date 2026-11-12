/**
 * @module scripts/check-window-overlay
 * @description Verifica reale della Window Controls Overlay su Windows: apre il renderer compilato con le stesse
 * opzioni della finestra principale, misura le azioni della barra rispetto ai controlli di sistema e salva una
 * cattura. Uso: npm run qa:desktop:overlay (richiede renderer-dist aggiornato).
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
  const win = new BrowserWindow({ width: 1366, height: 720, x: 40, y: 40, backgroundColor: '#030405', titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#cfeff0', height: 56 }, webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadURL(RENDERER_ENTRY_URL).catch((e) => log('loadErr ' + e.message));
  for (const width of [1366, 900]) {
    win.setBounds({ x: 40, y: 40, width, height: 720 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const metrics = await win.webContents.executeJavaScript(`(() => {
      const wco = navigator.windowControlsOverlay;
      const area = wco?.getTitlebarAreaRect?.();
      const actions = [...document.querySelectorAll('.topbar button, .topbar a, .topbar [role="status"], .topbar .status-dot, .topbar > *')]
        .filter((node) => node.getClientRects().length).map((node) => node.getBoundingClientRect());
      const right = Math.max(...actions.map((box) => box.right));
      const drag = getComputedStyle(document.querySelector('.topbar')).getPropertyValue('app-region') || getComputedStyle(document.querySelector('.topbar')).webkitAppRegion;
      const bar = document.querySelector('.topbar'); const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:env(titlebar-area-x, -1px);width:env(titlebar-area-width, 3px);height:env(titlebar-area-height, 5px)'; document.body.append(probe); const pr = probe.getBoundingClientRect(); const sheet = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).join(' '); const tb = bar.getBoundingClientRect(); const cmd = [...bar.querySelectorAll('button')].pop()?.getBoundingClientRect(); return { barH: tb.height, iconMid: cmd ? cmd.top + cmd.height / 2 : null, pad: getComputedStyle(bar).paddingRight, probe: [pr.left, pr.width, pr.height], hasEnv: sheet.includes('titlebar-area'), hasDrag: /app-region/.test(sheet), visible: Boolean(wco?.visible), areaRight: area ? area.x + area.width : null, areaHeight: area?.height ?? null, actionsRight: right, viewport: innerWidth, drag };
    })()`);
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const scale = display.scaleFactor;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width * scale, height: display.size.height * scale } });
    const shot = sources.find((source) => String(source.display_id) === String(display.id)) || sources[0];
    const crop = shot.thumbnail.crop({ x: Math.round((bounds.x + bounds.width - 420 - display.bounds.x) * scale), y: Math.round((bounds.y - display.bounds.y) * scale), width: Math.round(420 * scale), height: Math.round(90 * scale) });
    fs.writeFileSync(path.join(out, `overlay-${width}.png`), crop.toPNG());
    results.push({ width, ...metrics });
  }
  win.destroy();
  fs.writeFileSync(path.join(out, 'overlay.json'), JSON.stringify(results, null, 2));
  const broken = results.filter((entry) => !entry.visible || entry.actionsRight > entry.areaRight || Math.abs(entry.iconMid - entry.areaHeight / 2) > 2 || entry.drag !== 'drag');
  console.log(broken.length ? `Sovrapposizione con i controlli di Windows: ${JSON.stringify(broken)}` : `Barra desktop corretta su ${results.length} larghezze: azioni fuori dai controlli, centri allineati, trascinabile.`);
  app.exit(broken.length ? 1 : 0);
});
