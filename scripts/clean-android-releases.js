/**
 * @module scripts/clean-android-releases
 * @description Conserva soltanto gli artefatti Android correnti e rigenerabili.
 */
const fs = require('node:fs');
const path = require('node:path');

function cleanupAndroidReleases({ releaseRoot = path.resolve(__dirname, '..', 'release-android') } = {}) {
  const root = path.resolve(releaseRoot);
  if (path.basename(root).toLowerCase() !== 'release-android') {
    throw new Error(`Cartella release Android non valida: ${root}`);
  }
  if (!fs.existsSync(root)) return { removed: 0, recoveredBytes: 0, kept: [] };

  const names = fs.readdirSync(root);
  const keep = new Set(['NexusNXS-Android.apk', 'NexusNXS-Control.apk', 'NexusNXS-Android.aab']
    .filter((name) => fs.existsSync(path.join(root, name))));
  for (const prefix of ['NexusNXS-Android-', 'NexusNXS-Control-']) {
    for (const extension of ['.apk', '.aab']) {
      const latest = names
        .filter((name) => name.startsWith(prefix) && name.endsWith(extension))
        .map((name) => ({ name, modifiedAt: fs.statSync(path.join(root, name)).mtimeMs }))
        .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
      if (latest) keep.add(latest.name);
    }
  }

  let removed = 0;
  let recoveredBytes = 0;
  for (const name of names) {
    if (!['.apk', '.aab'].includes(path.extname(name).toLowerCase()) || keep.has(name)) continue;
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root) throw new Error(`Artefatto fuori confine: ${target}`);
    recoveredBytes += fs.statSync(target).size;
    fs.rmSync(target);
    removed += 1;
  }
  return { removed, recoveredBytes, kept: [...keep].sort() };
}

if (require.main === module) {
  const result = cleanupAndroidReleases();
  console.log(`Release Android ripulite: ${result.removed} file, ${(result.recoveredBytes / 1_048_576).toFixed(1)} MB recuperati.`);
  console.log(`Conservati: ${result.kept.join(', ')}`);
}

module.exports = { cleanupAndroidReleases };
