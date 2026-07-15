const fs = require('node:fs');
const path = require('node:path');

function isVault(directory) {
  try {
    return fs.statSync(directory).isDirectory()
      && fs.statSync(path.join(directory, '.obsidian')).isDirectory();
  } catch { return false; }
}

function readPortableConfig(appRoot) {
  const filePath = path.join(appRoot, 'config', 'portable.json');
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { filePath, value };
  } catch { return { filePath, value: {} }; }
}

function resolveVaultPath({ appRoot, env = process.env }) {
  const root = fs.realpathSync(appRoot);
  const { filePath, value } = readPortableConfig(root);
  const candidates = [];

  if (env.NEXUS_VAULT_PATH) {
    candidates.push({ source: 'environment', path: path.resolve(env.NEXUS_VAULT_PATH) });
  }
  if (typeof value.vaultRelativePath === 'string' && value.vaultRelativePath.trim()) {
    candidates.push({ source: 'portable-config', path: path.resolve(root, value.vaultRelativePath) });
  }
  // Layout USB predefinito: Nexus/.AI contiene l'app e Nexus contiene la vault.
  candidates.push({ source: 'auto-detected-parent', path: path.resolve(root, '..') });

  for (const candidate of candidates) {
    if (isVault(candidate.path)) {
      return { vaultPath: fs.realpathSync(candidate.path), source: candidate.source, configPath: filePath };
    }
  }
  throw new Error('Vault Nexus non trovata. Collega la USB o configura vaultRelativePath in config/portable.json.');
}

function localDataLayout(userDataPath) {
  const root = path.resolve(userDataPath, 'data');
  return {
    root,
    database: path.join(root, 'database'),
    vectorIndex: path.join(root, 'vector-index'),
    embeddingCache: path.join(root, 'embedding-cache'),
    logs: path.join(root, 'logs')
  };
}

module.exports = { isVault, readPortableConfig, resolveVaultPath, localDataLayout };
