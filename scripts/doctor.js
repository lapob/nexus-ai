/**
 * @module scripts/doctor
 * @description Diagnostica offline e non distruttiva dell'installazione NEXUSNXS.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveVaultPath } = require('../src/infrastructure/storage/portable-paths');
const { loadRuntimeConfig } = require('../src/core/config');

const appRoot = path.resolve(__dirname, '..');
const checks = [];
function check(name, operation, required = true) {
  try {
    const detail = operation();
    checks.push({ name, status: 'OK', detail: detail || '' });
  } catch (error) {
    checks.push({ name, status: required ? 'FAIL' : 'WARN', detail: error.message });
  }
}

check('Node.js', () => process.version);
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
check('package.json', () => packageJson.version);
check('npm command targets', () => {
  const targets = new Set();
  for (const command of Object.values(packageJson.scripts || {})) {
    for (const match of String(command).matchAll(/(?:scripts|tests|src)[\\/][^\s&"'*?]+\.(?:js|ps1)/g)) {
      targets.add(match[0]);
    }
  }
  const missing = [...targets].filter((target) => !fs.existsSync(path.join(appRoot, target)));
  if (missing.length) throw new Error(`target mancanti: ${missing.join(', ')}`);
  return `${Object.keys(packageJson.scripts || {}).length} comandi · ${targets.size} target verificati`;
});
check('Electron development runtime', () => {
  fs.accessSync(path.join(appRoot, 'node_modules', 'electron', 'cli.js'), fs.constants.R_OK);
  return 'CLI disponibile';
});
check('PowerShell 7', () => {
  if (process.platform !== 'win32') return 'non richiesto su questo sistema';
  return execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000
  }).trim();
});
check('runtime configuration', () => {
  const config = loadRuntimeConfig();
  return `${config.ai.provider} · ${config.ai.ollama.baseUrl} · model=${config.ai.chatModel || 'none'} · log=${config.logging.level}`;
});
check('portable configuration', () => {
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'config', 'portable.json'), 'utf8'));
  if (config.schemaVersion !== 1) throw new Error('schemaVersion non supportata.');
  return `schema ${config.schemaVersion}`;
});
check('vault', () => {
  const location = resolveVaultPath({ appRoot });
  fs.accessSync(location.vaultPath, fs.constants.R_OK);
  return `${location.vaultPath} (${location.source})`;
});
check('renderer', () => {
  fs.accessSync(path.join(appRoot, 'renderer-dist', 'index.html'), fs.constants.R_OK);
  return 'bundle React/TypeScript compilato e leggibile';
});
check('local model endpoint', () => 'non contattato (diagnostica offline)', false);

for (const item of checks) console.log(`${item.status.padEnd(4)} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
const failures = checks.filter((item) => item.status === 'FAIL').length;
console.log(`\nNEXUS doctor: ${checks.length - failures}/${checks.length} controlli superati.`);
if (failures) process.exitCode = 1;
