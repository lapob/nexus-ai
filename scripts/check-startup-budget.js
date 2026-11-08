/**
 * @module scripts/check-startup-budget
 * @description Budget di avvio della UI unica desktop (renderer-dist): un solo bundle JS contenuto, nessuna libreria 3D, nessuna origine esterna, nucleo WebGPU con fallback Canvas.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Lettura della build
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'renderer-dist', 'assets');
if (!fs.existsSync(dist)) throw new Error('renderer-dist assente: esegui prima npm run build:renderer.');
const files = fs.readdirSync(dist).map((name) => ({ name, bytes: fs.statSync(path.join(dist, name)).size }));
const scripts = files.filter((file) => file.name.endsWith('.js'));
const entry = scripts.find((file) => /^index-.*\.js$/.test(file.name));
const html = fs.readFileSync(path.join(root, 'renderer-dist', 'index.html'), 'utf8');
const source = entry ? fs.readFileSync(path.join(dist, entry.name), 'utf8') : '';
// #endregion

// #region 02 — Regole
const LIMIT = 400 * 1024;
const failures = [];
if (!entry || entry.bytes > LIMIT) failures.push(`bundle oltre ${LIMIT / 1024} KiB (${entry?.bytes || 0} byte)`);
if (scripts.length !== 1) failures.push(`attesi un solo bundle JS, trovati ${scripts.length}`);
if (/three\.module|WebGLRenderer|@react-three/.test(source)) failures.push('una libreria 3D è rientrata nel bundle');
if (!/navigator\.gpu|requestAdapter/.test(source) || !/getContext\(['"`]2d/.test(source)) failures.push('nucleo WebGPU o fallback Canvas mancanti');
if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html)) failures.push('l HTML carica risorse da origini esterne');
if (failures.length) {
  console.error(`Startup budget non rispettato:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Startup budget verificato: bundle ${entry.bytes} byte, nessuna libreria 3D o origine esterna, WebGPU con fallback.`);
}
// #endregion
