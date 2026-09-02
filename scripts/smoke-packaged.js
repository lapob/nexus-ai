/**
 * @module scripts/smoke-packaged
 * @description Esegue lo smoke test UI contro l'eseguibile Windows realmente impacchettato.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const executable = path.join(root, 'release', 'win-unpacked', 'NexusNXS.exe');
if (!fs.existsSync(executable)) {
  throw new Error('Eseguibile impacchettato assente: esegui prima npm run build:win.');
}

const result = spawnSync(process.execPath, [path.join(root, 'tests', 'electron-smoke.js')], {
  cwd: root,
  env: { ...process.env, NEXUS_PACKAGED_EXECUTABLE: executable },
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
