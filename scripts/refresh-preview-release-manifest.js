/**
 * @module scripts/refresh-preview-release-manifest
 * @description Rigenera la distinta del bundle preview gia costruito, senza ricompilare artefatti.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  artifactRecord,
  releaseManifest,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  writeManifest
} = require('./release-manifest');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseRoot = path.join(root, 'release');
const androidGradle = fs.readFileSync(path.join(root, 'android', 'NexusRemote', 'app', 'build.gradle'), 'utf8');
const androidVersion = androidGradle.match(/versionName\s*(?:=\s*)?["']([^"']+)["']/)?.[1];
if (!androidVersion) throw new Error('Versione Android non rilevata.');

const artifacts = [
  [path.join(releaseRoot, `NexusNXS-${packageJson.version}-Setup.exe`), { platform: 'windows', kind: 'installer', componentVersion: packageJson.version, feedPath: `NexusNXS-${packageJson.version}-Setup.exe` }],
  [path.join(releaseRoot, `NexusNXS-${packageJson.version}-Setup.exe.blockmap`), { platform: 'windows', kind: 'update-blockmap', componentVersion: packageJson.version, feedPath: `NexusNXS-${packageJson.version}-Setup.exe.blockmap` }],
  [path.join(releaseRoot, 'latest.yml'), { platform: 'windows', kind: 'update-manifest', componentVersion: packageJson.version, feedPath: 'latest.yml' }],
  [path.join(root, 'release-android', 'NexusNXS-Android.apk'), { platform: 'android', kind: 'apk', componentVersion: androidVersion }]
];

for (const name of ['nexus-sbom.cdx.json', 'nexus-sbom.cdx.json.sha256']) {
  const source = path.join(root, 'qa-artifacts', name);
  if (!fs.existsSync(source)) throw new Error(`SBOM mancante: eseguire npm run sbom (${source}).`);
  const destination = path.join(releaseRoot, name);
  fs.copyFileSync(source, destination);
  artifacts.push([destination, {
    platform: 'multi',
    kind: name.endsWith('.sha256') ? 'sbom-digest' : 'sbom-cyclonedx',
    componentVersion: packageJson.version
  }]);
}

const manifest = releaseManifest({
  product: 'NexusNXS',
  version: packageJson.version,
  channel: 'preview',
  visibility: 'public',
  releaseClass: 'preview',
  signatureRequired: false,
  artifacts: artifacts.map(([file, metadata]) => artifactRecord(root, file, {
    ...metadata,
    visibility: 'public',
    distributionSigned: false
  }))
});

const destination = writeManifest(path.join(releaseRoot, 'release-manifest.json'), manifest);
verifyArtifactRecords(root, manifest);
verifyElectronUpdateManifest(root, path.join(releaseRoot, 'latest.yml'), packageJson.version);
process.stdout.write(`Distinta preview aggiornata: ${destination} (${manifest.artifacts.length} artefatti).\n`);
