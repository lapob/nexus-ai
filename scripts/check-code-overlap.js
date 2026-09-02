/**
 * @module scripts/check-code-overlap
 * @description Blocca copie identiche e identificatori di modulo duplicati nel codice operativo.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const roots = ['src', 'scripts'];
const extensions = new Set(['.js', '.ts', '.tsx', '.ps1']);
const ignored = new Set(['node_modules', 'renderer-dist', 'dist', 'build', 'outputs']);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

const hashes = new Map();
const modules = new Map();
const problems = [];

for (const sourceRoot of roots) {
  const directory = path.join(root, sourceRoot);
  if (!fs.existsSync(directory)) continue;
  for (const file of walk(directory)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
    if (content.length >= 240) {
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const previous = hashes.get(hash);
      if (previous) problems.push(`Contenuto duplicato: ${previous} = ${relative}`);
      else hashes.set(hash, relative);
    }
    const moduleId = content.match(/@module\s+([^\s*]+)/)?.[1];
    if (moduleId) {
      const previous = modules.get(moduleId);
      if (previous) problems.push(`@module duplicato: ${moduleId} (${previous}, ${relative})`);
      else modules.set(moduleId, relative);
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Sovrapposizioni verificate: ${hashes.size} sorgenti operative, ${modules.size} moduli univoci.`);
}
