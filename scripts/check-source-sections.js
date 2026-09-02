/**
 * @module scripts/check-source-sections
 * @description Verifica che il sorgente resti navigabile tramite intestazioni e regioni.
 */

const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Discovery

const projectRoot = path.resolve(__dirname, '..');
const roots = [path.join(projectRoot, 'src'), path.join(projectRoot, 'scripts')];
const supportedExtensions = new Set(['.js', '.ts', '.tsx', '.css', '.html', '.ps1', '.py']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

// #endregion

// #region 02 — Regole e report

const sourceFiles = [
  ...roots.flatMap(walk),
  path.join(projectRoot, 'vite.config.ts')
].filter((file) => supportedExtensions.has(path.extname(file)));

const failures = [];
for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath);
  const lineCount = source.split(/\r?\n/).length;
  if (!source.slice(0, 800).includes('@module')) failures.push(`${relativePath}: intestazione @module assente.`);
  const regions = source.match(/#region\b/g)?.length || 0;
  if (lineCount > 80 && regions < 2) failures.push(`${relativePath}: modulo lungo senza almeno due #region.`);
}

if (failures.length) {
  console.error(`Convenzione sorgente non rispettata:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Intestazioni e regioni del sorgente verificate.');
}

// NEXUSNXS-EGG: se trovi questo guardiano, hai già aperto la mappa giusta.

// #endregion
