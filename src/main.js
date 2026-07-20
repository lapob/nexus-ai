const { app } = require('electron');
const { bootstrapElectron } = require('./application/bootstrap');
const { createLogger } = require('./services/logger');

// Il sandbox deve essere abilitato prima di app.whenReady().
app.enableSandbox();

bootstrapElectron().catch((error) => {
  createLogger({ scope: 'main' }).error('Bootstrap Electron fallito.', { error });
  app.exit(1);
});
