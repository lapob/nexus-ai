/**
 * @module scripts/clean-android-releases
 * @description Conserva alias, versione corrente e rollback; ignora file sconosciuti.
 */
const fs = require('node:fs');
const path = require('node:path');

function cleanupAndroidReleases({ releaseRoot = path.resolve(__dirname, '..', 'release-android'), dryRun = true } = {}) {
  const root = path.resolve(releaseRoot);
  if (path.basename(root).toLowerCase() !== 'release-android') throw new Error('Cartella release Android non valida.');
  if (!fs.existsSync(root)) return { removed: 0, recoveredBytes: 0, plannedBytes: 0, planned: [], kept: [] };
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('La cartella release non puo essere un collegamento.');
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^NexusNXS-(Android|Control)-(\d+)\.(\d+)\.(\d+)(?:-nexus-control)?\.(apk|aab)$/.exec(entry.name);
    if (!match) continue;
    const key = `${match[1]}.${match[5]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ name: entry.name, version: match.slice(2, 5).map(Number) });
  }
  const planned = [];
  for (const group of groups.values()) {
    group.sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2]);
    planned.push(...group.slice(2).map(item => item.name));
  }
  let plannedBytes = 0;
  for (const name of planned) {
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root || !fs.lstatSync(target).isFile()) throw new Error('Artefatto fuori confine o modificato.');
    plannedBytes += fs.statSync(target).size;
    if (!dryRun) fs.unlinkSync(target);
  }
  return { removed: dryRun ? 0 : planned.length, recoveredBytes: dryRun ? 0 : plannedBytes, plannedBytes,
    planned, kept: entries.map(entry => entry.name).filter(name => !planned.includes(name)).sort() };
}
if (require.main === module) console.log(JSON.stringify(cleanupAndroidReleases({ dryRun: !process.argv.includes('--apply') }), null, 2));
module.exports = { cleanupAndroidReleases };
