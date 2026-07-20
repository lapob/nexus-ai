const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadWindowState, saveWindowState } = require('../../window-state');

function createMainWindow({ rendererPath, smokeTest, screenshotPath, logger }) {
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  const state = loadWindowState(statePath, screen.getAllDisplays().map((display) => display.workArea));
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#09100e',
    title: 'NEXUS',
    show: !smokeTest,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      safeDialogs: true
    }
  });
  if (state.isFullScreen) win.setFullScreen(true);
  else if (state.isMaximized) win.maximize();
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.webContents.on('context-menu', (event) => event.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const inspectShortcut = key === 'f12' || (input.control && input.shift && ['i', 'j', 'c'].includes(key)) || (input.control && key === 'u');
    if (inspectShortcut) event.preventDefault();
  });
  win.webContents.on('did-fail-load', (_event, code, description) => logger.error('Caricamento renderer fallito.', { code, description }));
  win.webContents.on('render-process-gone', (_event, details) => logger.error('Processo renderer terminato.', { details }));
  if (smokeTest) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (screenshotPath) {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(screenshotPath, image.toPNG());
      }
      win.destroy();
      app.exit(0);
    }, 800));
  }
  if (!smokeTest) win.once('ready-to-show', () => win.show());
  win.on('close', () => { if (!smokeTest) saveWindowState(statePath, win); });
  win.loadFile(rendererPath);
  return win;
}

module.exports = { createMainWindow };
