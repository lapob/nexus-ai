/**
 * @module infrastructure/storage/portable-paths
 * @description Risolve vault portabile e directory dati senza dipendere dalla lettera del disco.
 */
// #region 01 — Lettura e validazione dei percorsi

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

function userVaultConfigPath(userDataPath) {
  return userDataPath ? path.join(userDataPath, 'vault.json') : '';
}

function readUserVaultConfig(userDataPath) {
  const filePath = userVaultConfigPath(userDataPath);
  if (!filePath) return { filePath, value: {} };
  try { return { filePath, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) }; }
  catch { return { filePath, value: {} }; }
}

function saveUserVaultPath(userDataPath, vaultPath) {
  const filePath = userVaultConfigPath(userDataPath);
  const target = fs.realpathSync(vaultPath);
  if (!isVault(target)) throw new Error('La cartella selezionata non è una vault Obsidian valida.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, vaultPath: target }, null, 2), { encoding: 'utf8', mode: 0o600 });
  return target;
}

// #endregion

// #region 02 — Risoluzione vault e layout dati

function ensurePublicKnowledgeVault(userDataPath, seedPath) {
  const vaultPath = path.join(path.resolve(userDataPath), 'knowledge');
  const obsidianPath = path.join(vaultPath, '.obsidian');
  fs.mkdirSync(obsidianPath, { recursive: true });

  // I contenuti pubblici sono un seed versionato: copiamo solo i file assenti,
  // così aggiornamenti e reinstallazioni non sovrascrivono memoria o note.
  if (seedPath && fs.existsSync(seedPath)) {
    fs.cpSync(seedPath, vaultPath, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  }
  return { vaultPath: fs.realpathSync(vaultPath), source: 'public-local', configPath: '' };
}

function resolveVaultPath({ appRoot, env = process.env, userDataPath }) {
  const root = fs.realpathSync(appRoot);
  const { filePath, value } = readPortableConfig(root);
  const userConfig = readUserVaultConfig(userDataPath);
  const candidates = [];

  if (env.NEXUS_VAULT_PATH) {
    candidates.push({ source: 'environment', path: path.resolve(env.NEXUS_VAULT_PATH) });
  }
  if (typeof userConfig.value.vaultPath === 'string' && userConfig.value.vaultPath.trim()) {
    candidates.push({ source: 'user-settings', path: path.resolve(userConfig.value.vaultPath) });
  }
  if (typeof value.vaultRelativePath === 'string' && value.vaultRelativePath.trim()) {
    candidates.push({ source: 'portable-config', path: path.resolve(root, value.vaultRelativePath) });
  }
  // Layout USB predefinito: NexusNXS/.AI contiene l'app e NexusNXS contiene la vault.
  candidates.push({ source: 'auto-detected-parent', path: path.resolve(root, '..') });

  for (const candidate of candidates) {
    if (isVault(candidate.path)) {
      return { vaultPath: fs.realpathSync(candidate.path), source: candidate.source, configPath: filePath };
    }
  }
  throw new Error('Vault NexusNXS non trovata. Collega la USB o configura vaultRelativePath in config/portable.json.');
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

module.exports = {
  isVault,
  readPortableConfig,
  readUserVaultConfig,
  saveUserVaultPath,
  resolveVaultPath,
  ensurePublicKnowledgeVault,
  localDataLayout
};

// #endregion
