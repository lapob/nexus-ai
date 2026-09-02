const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('usa NexusNXS come identità pubblica su desktop e release', () => {
  const packageJson = JSON.parse(read('package.json'));
  const release = read('scripts/release-all.js');

  assert.equal(packageJson.name, 'nexusnxs');
  assert.equal(packageJson.productName, 'NexusNXS');
  assert.equal(packageJson.build.productName, 'NexusNXS');
  assert.equal(packageJson.build.win.artifactName, 'NexusNXS-${version}-Setup.${ext}');
  assert.match(release, /NexusNXS-Android\.apk/);
  assert.match(release, /NexusNXS-Control\.apk/);
});

test('espone i nomi distinti delle due app Android', () => {
  assert.match(
    read('android/NexusRemote/app/src/main/res/values/strings.xml'),
    /<string name="app_name" translatable="false">NexusNXS<\/string>/,
  );
  assert.match(
    read('android/NexusConsole/app/src/main/AndroidManifest.xml'),
    /android:label="NexusNXS Control"/,
  );
});

test('mantiene gli identificatori tecnici compatibili mentre migra il nome pubblico', () => {
  const packageJson = JSON.parse(read('package.json'));
  const remoteGradle = read('android/NexusRemote/app/build.gradle');
  const consoleGradle = read('android/NexusConsole/app/build.gradle');
  const migration = read('src/infrastructure/storage/user-data-migration.js');

  assert.equal(packageJson.build.appId, 'local.nexus.ai');
  assert.match(remoteGradle, /applicationId\s*(?:=\s*)?"local\.nexus\.remote"/);
  assert.match(consoleGradle, /applicationId\s*(?:=\s*)?"local\.nexus\.console"/);
  assert.match(migration, /expectedName = 'NexusNXS'/);
  assert.match(migration, /=== 'nexus'/);
});

test('la documentazione pubblica non reintroduce i vecchi nomi prodotto', () => {
  const publicFiles = [
    'README.md',
    'LICENSE',
    'docs/NEXUS_ANDROID_REDESIGN_BLUEPRINT.md',
    'android/NexusRemote/README.md',
  ];
  const combined = publicFiles.map(read).join('\n');

  assert.doesNotMatch(combined, /NexusNXS per Android Android/);
  assert.doesNotMatch(combined, /NexusNXS-AI/);
  assert.doesNotMatch(combined, /\bNexus AI\b/);
  assert.doesNotMatch(combined, /\bNexus Desktop\b/);
});

test('usa ai.nexusnxs.com come unica origine AI pubblica', () => {
  const publicClient = JSON.parse(read('config/public-client.json'));
  const releaseClientPath = path.join(root, 'config', 'public-client.release.json');
  const releaseClient = fs.existsSync(releaseClientPath)
    ? JSON.parse(fs.readFileSync(releaseClientPath, 'utf8'))
    : null;
  const endpointExample = read('config/android-endpoints.example.properties');
  const environmentExample = read('.env.example');
  const headlessRunner = read('scripts/run-headless-server.ps1');
  const remoteGradle = read('android/NexusRemote/app/build.gradle');
  const remoteManifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const operations = read('docs/SERVER_OPERATIONS.md');
  const localEndpointsPath = path.join(root, 'config', 'android-endpoints.local.properties');
  const checked = [
    JSON.stringify(publicClient),
    ...(releaseClient ? [JSON.stringify(releaseClient)] : []),
    endpointExample,
    environmentExample,
    headlessRunner,
    remoteGradle,
    remoteManifest,
    operations,
    ...(fs.existsSync(localEndpointsPath) ? [fs.readFileSync(localEndpointsPath, 'utf8')] : []),
  ].join('\n');

  assert.equal(publicClient.serviceUrl, 'https://ai.nexusnxs.com');
  if (releaseClient) assert.equal(releaseClient.serviceUrl, 'https://ai.nexusnxs.com');
  assert.match(endpointExample, /^NEXUS_URL=https:\/\/ai\.nexusnxs\.com$/m);
  assert.match(environmentExample, /^NEXUS_SERVICE_URL=https:\/\/ai\.nexusnxs\.com$/m);
  assert.match(environmentExample, /^NEXUS_PUBLIC_URL=https:\/\/ai\.nexusnxs\.com$/m);
  assert.match(headlessRunner, /NEXUS_PUBLIC_URL = 'https:\/\/ai\.nexusnxs\.com'/);
  assert.match(remoteGradle, /manifestPlaceholders = \[nexusHost: publicNexusUrl/);
  assert.match(remoteManifest, /android:host="\$\{nexusHost\}"/);
  assert.match(operations, /stable public client origin is `https:\/\/ai\.nexusnxs\.com`/);
  assert.doesNotMatch(checked, /api\.nexusnxs\.com/i);
});
