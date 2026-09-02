/**
 * @module scripts/check-project-hygiene
 * @description Blocca artefatti temporanei, file vuoti e duplicati accidentali prima della build.
 */
// #region 01 — Inventario deterministico

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const appRoot = path.resolve(__dirname, '..');
const roots = ['src', 'scripts', 'config', 'docs', 'knowledge-packs', 'knowledge-public', 'build', 'tests', 'android/NexusRemote/app/src'];
const temporaryName = /(?:\.tmp|\.temp|\.bak|\.old|\.orig|~)$/i;
const ignoredEmptyNames = new Set([]);
const officialReleaseDirectories = new Set(['release', 'release-android', 'release-private']);
const generatedFiles = new Set(['config/public-client.release.json']);
const forbiddenGeneratedDirectories = new Set(['.next', '.nyc_output', '.parcel-cache', '.turbo', 'coverage', 'temp', 'tmp']);
const legacyStreamingPattern = new RegExp(`${['sun', 'shine'].join('')}|${['moon', 'light'].join('')}`, 'i');
const searchableExtensions = new Set([
  '.bat', '.cjs', '.cmd', '.css', '.gradle', '.html', '.js', '.json', '.jsx',
  '.kts', '.md', '.mjs', '.properties', '.ps1', '.toml', '.ts', '.tsx', '.xml', '.yaml', '.yml'
]);

function filesBelow(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

const files = roots.flatMap((root) => filesBelow(path.join(appRoot, root)));
const failures = [];
const hashes = new Map();

for (const entry of fs.readdirSync(appRoot, { withFileTypes: true })) {
  if (entry.isFile() && temporaryName.test(entry.name)) failures.push(`artefatto temporaneo nella radice: ${entry.name}`);
  if (entry.isDirectory() && /^release(?:-|$)/i.test(entry.name) && !officialReleaseDirectories.has(entry.name)) {
    failures.push(`release intermedia fuori standard: ${entry.name}`);
  }
  if (entry.isDirectory() && forbiddenGeneratedDirectories.has(entry.name)) {
    failures.push(`directory generata fuori standard: ${entry.name}`);
  }
}

for (const filePath of files) {
  const relativePath = path.relative(appRoot, filePath).replaceAll('\\', '/');
  if (generatedFiles.has(relativePath)) continue;
  const stat = fs.statSync(filePath);
  if (temporaryName.test(path.basename(filePath))) failures.push(`artefatto temporaneo: ${relativePath}`);
  if (stat.size === 0 && !ignoredEmptyNames.has(path.basename(filePath))) failures.push(`file vuoto: ${relativePath}`);
  if (stat.size === 0) continue;
  const content = fs.readFileSync(filePath);
  if (searchableExtensions.has(path.extname(filePath).toLowerCase())
    && legacyStreamingPattern.test(content.toString('utf8'))) {
    failures.push(`integrazione streaming obsoleta: ${relativePath}`);
  }
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const key = `${stat.size}:${digest}`;
  const duplicate = hashes.get(key);
  if (duplicate) failures.push(`duplicato identico: ${relativePath} = ${duplicate}`);
  else hashes.set(key, relativePath);
}

// #endregion

// #region 02 — Esito per CI e build locali

if (failures.length) {
  console.error(`Igiene progetto non rispettata:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Igiene progetto verificata: ${files.length} file, nessun artefatto o duplicato accidentale.`);
}

// #endregion
