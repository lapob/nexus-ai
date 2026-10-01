/** @module scripts/lib/installer-artifacts Validates the built release, not source configuration alone. */
const fs = require('node:fs');
const path = require('node:path');

function verifyInstallerArtifacts({ root, version, extractFile = require('@electron/asar').extractFile }) {
  const release = path.join(root, 'release');
  const archive = path.join(release, 'win-unpacked', 'resources', 'app.asar');
  const installer = path.join(release, `NexusNXS-${version}-Setup.exe`);
  for (const file of [archive, installer, `${installer}.blockmap`, path.join(release, 'latest.yml')]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
      throw new Error(`Artefatto installer mancante o vuoto: ${path.relative(root, file)}`);
    }
  }
  const packaged = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
  if (packaged.version !== version) throw new Error(`Versione ASAR ${packaged.version} diversa dall'installer ${version}.`);
  for (const relative of [
    'config/public-client.release.json',
    'src/application/bootstrap.js',
    'src/application/register-ipc.js',
    'src/infrastructure/windows/continuity-task.js'
  ]) {
    if (!fs.readFileSync(path.join(root, relative)).equals(extractFile(archive, path.normalize(relative)))) {
      throw new Error(`ASAR non aggiornato: ${relative}`);
    }
  }
  return { archive, installer };
}

module.exports = { verifyInstallerArtifacts };
