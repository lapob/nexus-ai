const fs = require('node:fs');
const path = require('node:path');
const { resolveVaultPath } = require('../src/portable-paths');
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
check('package.json', () => JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version);
check('runtime configuration', () => {
  const config = loadRuntimeConfig();
  return `${config.llm.baseUrl} · ${config.llm.model} · log=${config.logging.level}`;
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
  for (const file of ['index.html', 'styles.css', 'app.js']) fs.accessSync(path.join(appRoot, 'src', 'renderer', file), fs.constants.R_OK);
  return 'HTML, CSS e JavaScript leggibili';
});
check('local model endpoint', () => 'non contattato (diagnostica offline)', false);

for (const item of checks) console.log(`${item.status.padEnd(4)} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
const failures = checks.filter((item) => item.status === 'FAIL').length;
console.log(`\nNEXUS doctor: ${checks.length - failures}/${checks.length} controlli superati.`);
if (failures) process.exitCode = 1;

