/**
 * @module scripts/check-startup-budget
 * @description Impedisce che il percorso iniziale riassorba WebGL o asset pesanti nel bundle shell.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'renderer-dist', 'index.html');
const dist = path.join(root, 'renderer-dist', 'assets');
if (!fs.existsSync(dist)) throw new Error('renderer-dist assente: esegui prima npm run build:renderer.');
const files = fs.readdirSync(dist).map((name) => ({ name, bytes: fs.statSync(path.join(dist, name)).size }));
const entry = files.find((file) => /^index-.*\.js$/.test(file.name));
const mainScene = files.find((file) => /^MainScene-.*\.js$/.test(file.name));
const worker = files.find((file) => /^particle-field-worker-.*\.js$/.test(file.name));
const failures = [];
if (!entry || entry.bytes > 240 * 1024) failures.push(`bundle shell oltre 240 KiB (${entry?.bytes || 0} byte)`);
if (!mainScene) failures.push('MainScene non è più differita');
if (!worker) failures.push('worker particellare assente dal build');
const html = fs.readFileSync(htmlPath, 'utf8');
if (/rel=["']modulepreload["'][^>]+visual-runtime/i.test(html)) {
  failures.push('il runtime WebGL viene ancora precaricato dall HTML iniziale');
}
const voice = fs.readFileSync(path.join(root, 'src', 'renderer', 'components', 'VoiceVisualizer.tsx'), 'utf8');
if (!/requestIdleCallback/.test(voice) || !/lazy\(\(\) => import\('\.\.\/scene\/MainScene'\)/.test(voice)) failures.push('caricamento WebGL non differito durante idle');
if (failures.length) {
  console.error(`Startup budget non rispettato:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Startup budget verificato: shell ${entry.bytes} byte, WebGL non precaricato, worker attivo.`);
}
