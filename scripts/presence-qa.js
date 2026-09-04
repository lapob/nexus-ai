/**
 * @module scripts/presence-qa
 * @description Verifica reale della singola Presence NexusNXS sul display selezionato.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'qa-artifacts', 'system-presence');

// #region Processo coordinatore Node

if (!process.versions.electron) {
  const electron = require('electron');
  const temporaryRoot = path.join(root, 'artifacts', 'qa-temp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'nexus-presence-qa-'));
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const result = spawnSync(electron, [__filename, `--user-data-dir=${profile}`], {
    cwd: root,
    timeout: 20_000,
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, NEXUS_PRESENCE_QA_OUTPUT: outputDirectory }
  });
  fs.rmSync(profile, { recursive: true, force: true });
  if (fs.existsSync(temporaryRoot) && fs.readdirSync(temporaryRoot).length === 0) fs.rmdirSync(temporaryRoot);
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  runElectronQa().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    const { app } = require('electron');
    app.quit();
  });
}

// #endregion
// #region Processo Electron isolato

async function waitForWindows(BrowserWindow, expected, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    if (windows.length === expected && windows.every((window) => !window.webContents.isLoadingMainFrame())) return windows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Presenza incompleta: attese ${expected} superfici entro ${timeoutMs} ms.`);
}

function insideWorkArea(bounds, workArea) {
  return bounds.x >= workArea.x
    && bounds.y >= workArea.y
    && bounds.x + bounds.width <= workArea.x + workArea.width
    && bounds.y + bounds.height <= workArea.y + workArea.height;
}

async function runElectronQa() {
  const { app, BrowserWindow, protocol, screen } = require('electron');
  const { createSystemPresenceManager } = require('../src/infrastructure/electron/companion-window');
  const { registerRendererProtocol } = require('../src/infrastructure/electron/renderer-protocol');
  const output = process.env.NEXUS_PRESENCE_QA_OUTPUT || outputDirectory;
  fs.mkdirSync(output, { recursive: true });
  protocol.registerSchemesAsPrivileged([{
    scheme: 'nexus',
    privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false, stream: true }
  }]);
  app.setName('NexusNXS Presence QA');
  app.enableSandbox();
  await app.whenReady();
  registerRendererProtocol(path.join(root, 'renderer-dist'));

  const displays = screen.getAllDisplays();
  const manager = createSystemPresenceManager({
    logger: { warn: (message, details) => console.warn(message, details || '') },
    openPrimaryWindow: () => null,
    defaultSystemPresence: true
  });
  manager.setSystemPresenceConfiguration({
    state: 'listening', appearance: 'jarvis-reactor', motion: 'full', quality: 'balanced'
  });
  manager.startSystemPresence();
  // Il prodotto mantiene una sola Presence selezionabile: duplicarla su ogni
  // monitor sprecherebbe GPU e renderebbe ambiguo il punto di interazione.
  const windows = await waitForWindows(BrowserWindow, 1);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const report = [];
  const primaryDisplayId = String(screen.getPrimaryDisplay().id);
  for (const [index, window] of windows.entries()) {
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    if (!display || !insideWorkArea(bounds, display.workArea)) {
      throw new Error(`Superficie ${index + 1} fuori dalla work area: ${JSON.stringify(bounds)}.`);
    }
    const image = await window.webContents.capturePage();
    if (image.isEmpty()) throw new Error(`Cattura vuota per la superficie ${index + 1}.`);
    const visual = await window.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.presence');
      return {
        appearance: root?.dataset?.appearance || '',
        state: root?.dataset?.state || '',
        visualCount: document.querySelectorAll('.visual').length,
        particleCount: document.querySelectorAll('.presence-particles i').length,
        hasCore: document.querySelector('.core') instanceof HTMLButtonElement
      };
    })()`);
    if (visual.appearance !== 'jarvis-reactor' || visual.visualCount !== 3
      || visual.particleCount !== 18 || !visual.hasCore) {
      throw new Error(`Presence non renderizzata sul display ${index + 1}: ${JSON.stringify(visual)}.`);
    }
    const fileName = `presence-display-${index + 1}.png`;
    fs.writeFileSync(path.join(output, fileName), image.toPNG());
    report.push({
      display: String(display.id) === primaryDisplayId ? 'primary' : 'secondary',
      bounds,
      visual,
      withinWorkArea: true,
      screenshot: fileName
    });
  }
  const window = windows[0];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 800));
  manager.setApplicationVisible(true);
  await settle();
  if (!window.isVisible() || window.getBounds().width !== 128) throw new Error('Presence dock non visibile/compatta.');
  fs.writeFileSync(path.join(output, 'presence-docked.png'), (await window.webContents.capturePage()).toPNG());
  const dock = window.getBounds();
  window.setPosition(dock.x - 100, dock.y - 100);
  await settle();
  if (window.getBounds().width !== 240) throw new Error('Presence trascinata non espansa.');
  manager.setApplicationVisible(false);
  await settle();
  if (!window.isVisible() || window.getBounds().width !== 300) throw new Error('Presence tray non espansa.');
  const surface = await window.webContents.executeJavaScript("document.querySelector('.presence').getBoundingClientRect().width");
  if (Math.abs(surface - 300) > 1) throw new Error('Visualizer non scalato insieme alla finestra.');
  fs.writeFileSync(path.join(output, 'presence-tray.png'), (await window.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify({ displays: displays.length, windows: windows.length, dock: 128, detached: 240, tray: 300, surfaces: report }, null, 2)}\n`);
  manager.dispose();
  console.log(`Presence verificata sul display selezionato (${windows.length} superficie, ${displays.length} display rilevati).`);
  app.quit();
}

// #endregion
