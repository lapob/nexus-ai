/** @module infrastructure/storage/portable-user-data */
const fs = require('node:fs');
const path = require('node:path');

function argumentUserDataRoot(argv = process.argv) {
  const prefix = '--user-data-root=';
  const value = argv.find((entry) => String(entry).startsWith(prefix));
  return value ? path.resolve(String(value).slice(prefix.length).replace(/^"|"$/g, '')) : '';
}

function externalNexusDataRoot(executable = process.execPath) {
  let current = path.dirname(path.resolve(executable));
  for (let depth = 0; depth < 7; depth += 1) {
    if (path.basename(current).toLowerCase() === '.ai') return path.join(path.dirname(current), '.nexus-data');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

function resolvePortableUserData({ argv = process.argv, executable = process.execPath, env = process.env } = {}) {
  const explicit = argumentUserDataRoot(argv) || String(env.NEXUS_USER_DATA_ROOT || '').trim();
  const inferred = explicit || externalNexusDataRoot(executable);
  if (!inferred) return '';
  fs.mkdirSync(inferred, { recursive: true });
  return path.resolve(inferred);
}

module.exports = { argumentUserDataRoot, externalNexusDataRoot, resolvePortableUserData };
