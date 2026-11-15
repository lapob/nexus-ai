/**
 * @module scripts/visual/approve
 * @description Approvazione intenzionale delle baseline: copia le catture dell'ultima esecuzione di una suite
 * (qa-artifacts/visual-runs/<suite>/actual) in qa-artifacts/visual-baselines/<suite>. Prima rivedere report.html.
 * Uso: npm run qa:visual:approve -- <suite> [nome | prefisso*]...   (suite: web, core, android; --root=<repo> per il sito)
 */
const path = require('node:path');
const { approve } = require('./lib/baselines');

const args = process.argv.slice(2);
const rootArg = args.find((arg) => arg.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(__dirname, '..', '..');
const [suite, ...only] = args.filter((arg) => !arg.startsWith('--'));
if (!suite) {
  console.error('Uso: npm run qa:visual:approve -- <suite> [nome | prefisso*]...');
  process.exit(2);
}
try {
  const names = approve({ root, suite, only });
  if (!names.length) { console.error(`Nessuna cattura corrisponde in ${suite}: nulla approvato.`); process.exit(1); }
  for (const name of names) console.log(`approvata ${suite}/${name}`);
  console.log(`${names.length} baseline aggiornate in ${path.relative(process.cwd(), path.join(root, 'qa-artifacts', 'visual-baselines', suite)) || '.'}: committarle con la modifica che le giustifica.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
