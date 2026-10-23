/** @module scripts/lib/installer-artifacts Validates the built release, not source configuration alone. */
const fs = require('node:fs');
const path = require('node:path');

function verifyElectronBuildTarget(args, build = {}) {
  const target = JSON.stringify(args);
  if (![JSON.stringify(['--dir']), JSON.stringify(['--win', 'nsis'])].includes(target)) {
    throw new Error('Target Electron non ammesso: usare --dir oppure --win nsis senza override di configurazione.');
  }
  for (const key of ['electronDist', 'electronDownload', 'extends']) {
    if (build[key] !== undefined) throw new Error(`Configurazione runtime Electron non ammessa: ${key}.`);
  }
}

function verifyElectronRuntime(root) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const expected = read('package.json').devDependencies?.electron;
  const locked = read('package-lock.json').packages?.['node_modules/electron']?.version;
  const installed = read('node_modules/electron/package.json').version;
  // Version metadata consistency complements registry signatures and packaged integrity;
  // this sidecar is not an attestation of the executable's contents.
  const distribution = fs.readFileSync(path.join(root, 'node_modules/electron/dist/version'), 'utf8').trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(expected || '') || [locked, installed, distribution].some(version => version !== expected)) {
    throw new Error(`Runtime Electron incoerente: atteso ${expected}, lock ${locked}, pacchetto ${installed}, distribuzione ${distribution}. Ripristinare la dipendenza prima della build.`);
  }
  return expected;
}

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

module.exports = { verifyInstallerArtifacts, verifyElectronRuntime, verifyElectronBuildTarget };
