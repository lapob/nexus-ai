/**
 * @module scripts/build-signed
 * @description Impedisce di pubblicare per errore un installer privo di firma fiduciaria.
 */
const { spawnSync } = require('node:child_process');

if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) {
  console.error('Firma non configurata: imposta CSC_LINK e CSC_KEY_PASSWORD con il certificato del distributore.');
  process.exit(2);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build:win'], { stdio: 'inherit', env: process.env, windowsHide: true });
process.exit(result.status ?? 1);
