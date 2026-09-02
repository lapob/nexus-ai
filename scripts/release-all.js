/**
 * @module scripts/release-all
 * @description Produce release pubbliche e private in percorsi e distinte non confondibili.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { cleanupAndroidReleases } = require('./clean-android-releases');
const {
  artifactRecord,
  releaseManifest,
  verifyArtifactRecords,
  verifyElectronUpdateManifest,
  writeManifest,
  writeManifestSignature
} = require('./release-manifest');

// #region Configurazione e build

const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
const argumentsSet = new Set(process.argv.slice(2));
const publicOnly = argumentsSet.has('--public-only');
const privateOnly = argumentsSet.has('--private-only');
const production = argumentsSet.has('--production');
if (publicOnly && privateOnly) throw new Error('--public-only e --private-only sono mutuamente esclusivi.');
const includePublic = !privateOnly;
const includePrivate = !publicOnly;
const channelArgument = process.argv.find((argument) => argument.startsWith('--channel='));
const releaseChannel = String(channelArgument ? channelArgument.slice('--channel='.length) : process.env.NEXUS_RELEASE_CHANNEL || (production ? 'stable' : 'preview')).trim().toLowerCase();
if (!['preview', 'beta', 'stable'].includes(releaseChannel)) throw new Error('NEXUS_RELEASE_CHANNEL deve essere preview, beta oppure stable.');
if (production && releaseChannel !== 'stable') throw new Error('--production richiede NEXUS_RELEASE_CHANNEL=stable.');
const signedChannel = releaseChannel !== 'preview';
const releaseEnvironment = { ...process.env, NEXUS_RELEASE_CHANNEL: releaseChannel };
const MANIFEST_SIGNING_SECRETS = ['NEXUS_RELEASE_MANIFEST_PRIVATE_KEY'];
const WINDOWS_SIGNING_SECRETS = ['CSC_LINK', 'CSC_KEY_PASSWORD'];
const ANDROID_SIGNING_SECRETS = ['NEXUS_ANDROID_KEYSTORE', 'NEXUS_ANDROID_STORE_PASSWORD', 'NEXUS_ANDROID_KEY_ALIAS', 'NEXUS_ANDROID_KEY_PASSWORD'];
const RELEASE_SECRET_KEYS = [...MANIFEST_SIGNING_SECRETS, ...WINDOWS_SIGNING_SECRETS, ...ANDROID_SIGNING_SECRETS];
const scopedEnvironment = (allowedSecrets = []) => {
  const allowed = new Set(allowedSecrets);
  const environment = { ...releaseEnvironment };
  for (const key of RELEASE_SECRET_KEYS) if (!allowed.has(key)) delete environment[key];
  return environment;
};
const run = (name, { secrets = [] } = {}) => {
  const environment = scopedEnvironment(secrets);
  if (npmCli && fs.existsSync(npmCli)) return execFileSync(process.execPath, [npmCli, 'run', name], { cwd: root, env: environment, stdio: 'inherit' });
  return execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', `npm run ${name}`] : ['run', name], { cwd: root, env: environment, stdio: 'inherit' });
};
const runNode = (script, args = [], { secrets = [] } = {}) => execFileSync(process.execPath, [path.join(root, script), ...args], {
  cwd: root, env: scopedEnvironment(secrets), stdio: 'inherit'
});
const androidVersion = (project) => {
  const gradle = fs.readFileSync(path.join(root, 'android', project, 'app', 'build.gradle'), 'utf8');
  const match = gradle.match(/versionName\s*(?:=\s*)?["']([^"']+)["']/);
  if (!match) throw new Error(`Versione Android non rilevata per ${project}.`);
  return match[1];
};

if (production) {
  runNode('scripts/check-stable-release-readiness.js', ['--strict'], {
    secrets: [...MANIFEST_SIGNING_SECRETS, ...WINDOWS_SIGNING_SECRETS, ...ANDROID_SIGNING_SECRETS]
  });
}
if (!argumentsSet.has('--skip-verify')) run('verify');
if (includePublic) {
  if (signedChannel) {
    run('check:publication');
    run('check:hygiene');
    run('check:python-runtime:production');
    runNode('scripts/check-release-readiness.js', ['--production'], {
      secrets: [...MANIFEST_SIGNING_SECRETS, ...WINDOWS_SIGNING_SECRETS, ...ANDROID_SIGNING_SECRETS]
    });
  }
  run(signedChannel ? 'build:win:signed' : 'build:win', { secrets: signedChannel ? WINDOWS_SIGNING_SECRETS : [] });
  run('verify:installer');
  run(signedChannel ? 'android:remote:public' : 'android:remote', { secrets: signedChannel ? ANDROID_SIGNING_SECRETS : [] });
  run('sbom');
}
if (includePrivate) run('android:console', { secrets: ANDROID_SIGNING_SECRETS });

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
cleanupAndroidReleases({ releaseRoot: path.join(root, 'release-android') });

// #endregion
// #region Distinte pubbliche e private

if (includePublic) {
  const releaseRoot = path.join(root, 'release');
  const sbomSource = path.join(root, 'qa-artifacts', 'nexus-sbom.cdx.json');
  const sbomDigestSource = `${sbomSource}.sha256`;
  const sbom = path.join(releaseRoot, 'nexus-sbom.cdx.json');
  const sbomDigest = `${sbom}.sha256`;
  fs.copyFileSync(sbomSource, sbom);
  fs.copyFileSync(sbomDigestSource, sbomDigest);
  const publicArtifacts = [
    [path.join(root, 'release', `NexusNXS-${packageJson.version}-Setup.exe`), { platform: 'windows', kind: 'installer', componentVersion: packageJson.version, feedPath: `NexusNXS-${packageJson.version}-Setup.exe` }],
    [path.join(root, 'release', `NexusNXS-${packageJson.version}-Setup.exe.blockmap`), { platform: 'windows', kind: 'update-blockmap', componentVersion: packageJson.version, feedPath: `NexusNXS-${packageJson.version}-Setup.exe.blockmap` }],
    [path.join(root, 'release', 'latest.yml'), { platform: 'windows', kind: 'update-manifest', componentVersion: packageJson.version, feedPath: 'latest.yml' }],
    [path.join(root, 'release-android', 'NexusNXS-Android.apk'), { platform: 'android', kind: 'apk', componentVersion: androidVersion('NexusRemote') }],
    [sbom, { platform: 'multi', kind: 'sbom-cyclonedx', componentVersion: packageJson.version }],
    [sbomDigest, { platform: 'multi', kind: 'sbom-digest', componentVersion: packageJson.version }],
  ];
  const androidBundle = path.join(root, 'release-android', 'NexusNXS-Android.aab');
  if (fs.existsSync(androidBundle)) publicArtifacts.push([androidBundle, { platform: 'android', kind: 'play-bundle', componentVersion: androidVersion('NexusRemote') }]);
  const manifest = releaseManifest({
    product: 'NexusNXS', version: packageJson.version, channel: releaseChannel,
    visibility: 'public', releaseClass: releaseChannel === 'stable' ? 'production' : releaseChannel === 'beta' ? 'beta' : 'preview',
    signatureRequired: signedChannel,
    artifacts: publicArtifacts.map(([file, metadata]) => artifactRecord(root, file, { ...metadata, visibility: 'public', distributionSigned: signedChannel })),
  });
  const destination = writeManifest(path.join(releaseRoot, 'release-manifest.json'), manifest);
  verifyArtifactRecords(root, manifest);
  verifyElectronUpdateManifest(root, path.join(releaseRoot, 'latest.yml'), packageJson.version);
  const signaturePath = path.join(releaseRoot, 'release-manifest.sig.json');
  if (signedChannel) {
    writeManifestSignature(destination, signaturePath, {
      privateKey: process.env.NEXUS_RELEASE_MANIFEST_PRIVATE_KEY,
      publicKey: process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY,
      keyId: process.env.NEXUS_RELEASE_MANIFEST_KEY_ID
    });
  } else fs.rmSync(signaturePath, { force: true });
  console.log(`Distinta pubblica pronta: ${destination}`);
}

if (includePrivate) {
  const source = path.join(root, 'release-android', 'NexusNXS-Control.apk');
  if (!fs.existsSync(source)) throw new Error(`Artefatto privato mancante: ${source}`);
  const privateRoot = path.join(root, 'release-private');
  fs.mkdirSync(privateRoot, { recursive: true });
  fs.rmSync(path.join(privateRoot, 'NexusNXS-PC.apk'), { force: true });
  const privateApk = path.join(privateRoot, 'NexusNXS-Control.apk');
  fs.copyFileSync(source, privateApk);
  const manifest = releaseManifest({
    product: 'NexusNXS PC Control', version: androidVersion('NexusConsole'), channel: 'owner',
    visibility: 'private-owner', releaseClass: production ? 'production' : 'preview',
    signatureRequired: production,
    artifacts: [artifactRecord(root, privateApk, {
      platform: 'android', kind: 'apk', componentVersion: androidVersion('NexusConsole'), visibility: 'private-owner', distributionSigned: Boolean(process.env.NEXUS_ANDROID_KEYSTORE),
    })],
  });
  const destination = writeManifest(path.join(privateRoot, 'release-manifest.private.json'), manifest);
  verifyArtifactRecords(root, manifest);
  const privateSignaturePath = path.join(privateRoot, 'release-manifest.private.sig.json');
  if (production) {
    writeManifestSignature(destination, privateSignaturePath, {
      privateKey: process.env.NEXUS_RELEASE_MANIFEST_PRIVATE_KEY,
      publicKey: process.env.NEXUS_RELEASE_MANIFEST_PUBLIC_KEY,
      keyId: process.env.NEXUS_RELEASE_MANIFEST_KEY_ID
    });
  } else fs.rmSync(privateSignaturePath, { force: true });
  console.log(`Distinta privata pronta: ${destination}`);
}

// #endregion
