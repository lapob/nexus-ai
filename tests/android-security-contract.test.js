/**
 * @module tests/android-security-contract
 * @description Contratti MASVS per i due client Android NexusNXS.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const consoleManifest = () => read('android/NexusConsole/app/src/main/AndroidManifest.xml');
const consoleActivity = () => read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');

test('manifest minimizzano backup, debug e componenti esportati', () => {
  for (const manifest of [consoleManifest()]) {
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:fullBackupContent="false"/);
    assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.doesNotMatch(manifest, /<receiver/);
  }
  assert.doesNotMatch(consoleManifest(), /<service/);
  assert.doesNotMatch(consoleManifest(), /android\.permission\.CAMERA|QrScannerActivity|android\.intent\.category\.BROWSABLE/);
  assert.equal(fs.existsSync(path.join(root, 'android/NexusConsole/app/src/main/java/local/nexus/console/QrScannerActivity.java')), false);
  assert.doesNotMatch(consoleManifest(), /<queries|com\.tailscale\.ipn/);
});

test('rete Android richiede TLS, endpoint validi e nessun trust manager permissivo', () => {
  for (const app of ['NexusConsole']) {
    const config = read(`android/${app}/app/src/main/res/xml/network_security_config.xml`);
    assert.match(config, /<base-config cleartextTrafficPermitted="false"\s*\/>/);
    assert.doesNotMatch(config, /cleartextTrafficPermitted="true"|certificates src="user"/);
  }
  const sources = [consoleActivity()].join('\n');
  assert.doesNotMatch(sources, /HostnameVerifier|X509TrustManager|TrustAll|SSLContext/);
  assert.match(consoleActivity(), /setInstanceFollowRedirects\(false\)/);
  assert.match(read('android/NexusConsole/app/build.gradle'), /requireHttpsEndpoint/);
  assert.doesNotMatch(read('android/NexusConsole/app/build.gradle'), /work-runtime/);
});

test('sessioni restano cifrate con Android Keystore e fuori dai backup', () => {
  for (const file of [
    'android/NexusConsole/app/src/main/java/local/nexus/console/SecureTokenStore.java',
  ]) {
    const store = read(file);
    assert.match(store, /AndroidKeyStore/);
    assert.match(store, /AES\/GCM\/NoPadding/);
    assert.doesNotMatch(store, /MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE/);
  }
});

test('azioni di alimentazione falliscono chiuse anche su Android 8', () => {
  const activity = consoleActivity();
  assert.match(activity, /isDeviceSecure\(\)/);
  assert.match(activity, /createConfirmDeviceCredentialIntent/);
  assert.match(activity, /REQUEST_DEVICE_CREDENTIAL/);
  assert.match(activity, /resultCode == RESULT_OK && action != null/);
  assert.doesNotMatch(activity, /VERSION\.SDK_INT < 28\) \{ action\.run\(\)/);
});

test('build Preview sono ottimizzate ma non debuggable e la release pubblica esclude endpoint privati', () => {
  for (const file of ['android/NexusConsole/app/build.gradle']) {
    const gradle = read(file);
    assert.match(gradle, /preview \{[\s\S]*initWith(?:\s*\(\s*release\s*\)|\s+release)[\s\S]*debuggable\s*(?:=\s*)?false/);
  }
  const consoleBuild = read('scripts/build-android-console.ps1');
  assert.match(consoleBuild, /if \(\$signedRelease\) \{ "Release" \} else \{ "Preview" \}/);
});
