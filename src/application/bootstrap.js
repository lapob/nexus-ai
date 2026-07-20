const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { NexusIndex } = require('../rag');
const { resolveVaultPath } = require('../portable-paths');
const { loadRuntimeConfig } = require('../core/config');
const { createLogger } = require('../services/logger');
const { registerIpcHandlers } = require('./register-ipc');
const { createMainWindow } = require('../infrastructure/electron/create-main-window');
const { startAppLifecycle } = require('../infrastructure/electron/app-lifecycle');

function bootstrapElectron({ env = process.env } = {}) {
  const appRoot = path.resolve(__dirname, '..', '..');
  const vaultLocation = resolveVaultPath({ appRoot, env });
  const rendererPath = path.join(appRoot, 'src', 'renderer', 'index.html');
  const runtimeConfig = loadRuntimeConfig(env);
  const logger = createLogger({ level: runtimeConfig.logging.level, scope: 'main' });
  const smokeTest = env.NEXUS_SMOKE_TEST === '1';
  const screenshotPath = env.NEXUS_SCREENSHOT_PATH || '';
  let index;

  return startAppLifecycle({
    logger,
    createWindow: () => createMainWindow({ rendererPath, smokeTest, screenshotPath, logger }),
    onReady: () => {
      index = new NexusIndex(vaultLocation.vaultPath);
      index.rebuild();
      registerIpcHandlers({
        trustedRendererUrl: pathToFileURL(rendererPath).href,
        vaultPath: vaultLocation.vaultPath,
        vaultLocation,
        runtimeConfig,
        logger,
        getIndex: () => index
      });
      logger.info('NEXUS avviato.', {
        vaultSource: vaultLocation.source,
        notes: index.stats().notes,
        chunks: index.stats().chunks
      });
    }
  });
}

module.exports = { bootstrapElectron };
