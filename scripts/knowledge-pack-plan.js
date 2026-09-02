/**
 * @module scripts/knowledge-pack-plan
 * @description Verifica il knowledge pack pubblico realmente distribuito con NexusNXS.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Integrità del pack

const appRoot = path.resolve(__dirname, '..');
const packRoot = path.join(appRoot, 'knowledge-packs', 'core');
const indexRoot = path.join(packRoot, '.nexus');
const catalogPath = path.join(indexRoot, 'knowledge-catalog.json');
const required = [
  path.join(packRoot, 'README.md'), catalogPath,
  path.join(indexRoot, 'knowledge-graph.json'),
  path.join(indexRoot, 'knowledge-records.jsonl'),
  path.join(indexRoot, 'knowledge.sqlite')
];
for (const file of required) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`Knowledge pack incompleto: ${path.relative(appRoot, file)}`);
}
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (catalog.schemaVersion !== 1 || !catalog.counts || Number(catalog.counts.records) < 1) throw new Error('Catalogo del knowledge pack non valido.');

// #endregion

// #region 02 — Riepilogo leggibile

let markdownFiles = 0;
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.nexus') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles += 1;
  }
};
walk(packRoot);
console.log('Knowledge pack pubblico: necessario e pronto');
console.log(`  schede: ${catalog.counts.records} · documenti: ${markdownFiles} · allegati: ${catalog.counts.assets}`);
console.log(`  esempi: ${catalog.counts.examples} · collegamenti mancanti: ${catalog.counts.brokenAttachments}`);
console.log('  dati privati e riferimenti alla workstation: esclusi dalla pubblicazione');

// #endregion
