const { app, BrowserWindow, Menu, session } = require('electron');

function configureSessionSecurity() {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!details.url.startsWith('http:') && !details.url.startsWith('https:')) return callback({ cancel: false });
    try {
      const host = new URL(details.url).hostname;
      callback({ cancel: !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) });
    } catch { callback({ cancel: true }); }
  });
}

function startAppLifecycle({ createWindow, onReady, logger }) {
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  return app.whenReady().then(() => {
    configureSessionSecurity();
    onReady();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch((error) => {
    logger.error('Lifecycle Electron fallito.', { error });
    throw error;
  });
}

module.exports = { configureSessionSecurity, startAppLifecycle };
