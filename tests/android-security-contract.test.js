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

const remoteManifest = () => read('android/NexusRemote/app/src/main/AndroidManifest.xml');
const consoleManifest = () => read('android/NexusConsole/app/src/main/AndroidManifest.xml');
const remoteActivity = () => read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
const consoleActivity = () => read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');

test('manifest minimizzano backup, debug e componenti esportati', () => {
  for (const manifest of [remoteManifest(), consoleManifest()]) {
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:fullBackupContent="false"/);
    assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.doesNotMatch(manifest, /<receiver/);
  }
  assert.doesNotMatch(consoleManifest(), /<service/);
  const assistantServices = [...remoteManifest().matchAll(/<service\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(assistantServices.length, 3);
  for (const service of assistantServices) {
    assert.match(service, /android:permission="android\.permission\.BIND_(VOICE_INTERACTION|SPEECH_RECOGNITION)"/);
  }
  const assistantConfig = read('android/NexusRemote/app/src/main/res/xml/voice_interaction.xml');
  assert.match(assistantConfig, /android:recognitionService="local.nexus.remote.NexusRecognitionService"/);
  assert.match(assistantConfig, /android:supportsLaunchVoiceAssistFromKeyguard="false"/);
  assert.match(read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusRecognitionService.kt'), /it.serviceInfo.packageName != packageName/);
  assert.match(remoteManifest(), /androidx\.core\.content\.FileProvider[\s\S]*?android:exported="false"[\s\S]*?android:grantUriPermissions="true"/);
  assert.doesNotMatch(consoleManifest(), /<provider/);
  assert.doesNotMatch(remoteManifest(), /<profileable|android:shell="true"/);
  assert.doesNotMatch(consoleManifest(), /android\.permission\.CAMERA|QrScannerActivity|android\.intent\.category\.BROWSABLE/);
  assert.equal(fs.existsSync(path.join(root, 'android/NexusConsole/app/src/main/java/local/nexus/console/QrScannerActivity.java')), false);
  assert.doesNotMatch(consoleManifest(), /<queries|com\.tailscale\.ipn/);
});

test('rete Android richiede TLS, endpoint validi e nessun trust manager permissivo', () => {
  for (const app of ['NexusRemote', 'NexusConsole']) {
    const config = read(`android/${app}/app/src/main/res/xml/network_security_config.xml`);
    assert.match(config, /<base-config cleartextTrafficPermitted="false"\s*\/>/);
    assert.doesNotMatch(config, /cleartextTrafficPermitted="true"|certificates src="user"/);
  }
  const sources = [remoteActivity(), consoleActivity()].join('\n');
  assert.doesNotMatch(sources, /HostnameVerifier|X509TrustManager|TrustAll|SSLContext/);
  assert.match(remoteActivity(), /instanceFollowRedirects = false/);
  assert.match(consoleActivity(), /setInstanceFollowRedirects\(false\)/);
  assert.match(read('android/NexusRemote/app/build.gradle'), /requireHttpsEndpoint/);
  assert.match(read('android/NexusConsole/app/build.gradle'), /requireHttpsEndpoint/);
  assert.doesNotMatch(read('android/NexusConsole/app/build.gradle'), /work-runtime/);
});

test('deep link e intent condivisi sono validati prima di cambiare endpoint o leggere dati', () => {
  const activity = remoteActivity();
  assert.match(activity, /private fun isTrustedDeepLink/);
  assert.match(activity, /uri\.queryParameterNames\.any/);
  assert.match(activity, /trustedEndpoint\(requestedServer\) \?: return false/);
  assert.doesNotMatch(activity, /getQueryParameter\("server"\).*startsWith\("https:\/\/"\)/);
  assert.match(activity, /stream != null && !stream\.scheme\.equals\("content"/);
  assert.match(activity, /allowedMime\(declaredMime\)/);
  assert.match(activity, /incoming\.replaceExtras\(Bundle\(\)\)/);
});

test('allegati e backup non possono causare letture illimitate', () => {
  const activity = remoteActivity();
  assert.match(activity, /private fun readBoundedContent\(uri: Uri, limit: Int\)/);
  assert.match(activity, /require\(total <= limit\)/);
  assert.match(activity, /readBoundedContent\(it, MAX_BACKUP_BYTES\)/);
  assert.match(activity, /readBoundedContent\(state\.attachmentUri\.toUri\(\), MAX_ATTACHMENT_BYTES\)/);
  assert.doesNotMatch(activity, /\.readBytes\(\)\.take\(/);
});

test('sessioni restano cifrate con Android Keystore e fuori dai backup', () => {
  for (const file of [
    'android/NexusRemote/app/src/main/java/local/nexus/remote/SecureTokenStore.java',
    'android/NexusConsole/app/src/main/java/local/nexus/console/SecureTokenStore.java',
  ]) {
    const store = read(file);
    assert.match(store, /AndroidKeyStore/);
    assert.match(store, /AES\/GCM\/NoPadding/);
    assert.doesNotMatch(store, /MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE/);
  }
  assert.match(read('android/NexusRemote/app/src/main/java/local/nexus/remote/SecureChatCodec.java'), /AES\/GCM\/NoPadding/);
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
  for (const file of ['android/NexusRemote/app/build.gradle', 'android/NexusConsole/app/build.gradle']) {
    const gradle = read(file);
    assert.match(gradle, /preview \{[\s\S]*initWith(?:\s*\(\s*release\s*\)|\s+release)[\s\S]*debuggable\s*(?:=\s*)?false/);
  }
  const remoteBuild = read('scripts/build-android-remote.ps1');
  const consoleBuild = read('scripts/build-android-console.ps1');
  assert.match(remoteBuild, /client pubblico[\s\S]*\$env:NEXUS_LAN_URL = ""[\s\S]*\$env:NEXUS_FALLBACK_URL = ""/);
  assert.match(consoleBuild, /if \(\$signedRelease\) \{ "Release" \} else \{ "Preview" \}/);
});

test('i client sono nativi e i log release non espongono endpoint o contenuti', () => {
  const sources = [remoteActivity(), consoleActivity()].join('\n');
  assert.doesNotMatch(sources, /android\.webkit|\bWebView\b|addJavascriptInterface|loadUrl\s*\(/);
  assert.doesNotMatch(remoteActivity(), /Log\.w\([^\n]*URL\(endpoint\)\.host/);
  assert.match(remoteActivity(), /if \(BuildConfig\.DEBUG\) android\.util\.Log\.w/);
});

test('le operazioni Work hanno un id univoco e cancellazione remota best effort', () => {
  const activity = remoteActivity();
  assert.match(activity, /val operationId = java\.util\.UUID\.randomUUID\(\)\.toString\(\)/);
  assert.match(activity, /put\("operationId", operationId\)/);
  assert.match(activity, /"\/api\/actions\/cancel"/);
  assert.match(activity, /requestActiveWorkCancellation\(900L\)/);
  assert.match(activity, /postWorkCancellation\(operationId, token\)[\s\S]*executionConnection\?\.disconnect\(\)/);
  assert.match(activity, /connection\.connectTimeout = 800[\s\S]*connection\.readTimeout = 800/);
  assert.match(activity, /workCancellationRequested[\s\S]*activeWorkConnection/);
  assert.doesNotMatch(activity, /rollback (?:garantito|automatico)|annullamento garantito/i);
});

test('Cuore richiede identità di sistema e lega l’esecuzione al ticket approvato', () => {
  const activity = remoteActivity();
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.USE_BIOMETRIC/);
  assert.match(activity, /"approveWork" -> authorizeWorkProposal\(\)/);
  assert.match(activity, /BiometricPrompt\.Builder/);
  assert.match(activity, /BiometricManager\.Authenticators\.BIOMETRIC_STRONG/);
  assert.match(activity, /createConfirmDeviceCredentialIntent/);
  assert.match(activity, /deviceCredentialInProgress/);
  assert.match(activity, /pendingAuthorizationKind != NexusAuthorizationKind\.WORK \|\| pendingAuthorizationTicket != ticket/);
  assert.match(activity, /state\.workTicketId != ticket/);
  assert.match(activity, /executeAuthorizedWorkProposal\(ticket\)/);
  assert.match(activity, /ticket != authorizedTicket/);
  assert.doesNotMatch(activity, /"approveWork" -> execute(?:Authorized)?WorkProposal\(/);
});

test('Work e pairing pubblici sono capability-driven e non degradano chat o voce', () => {
  const activity = remoteActivity();
  assert.match(activity, /val remoteWorkAvailable: Boolean = false/);
  assert.match(activity, /val pairingAvailable: Boolean = false/);
  assert.match(activity, /private fun explicitRemoteCapabilities\(payload: JSONObject\)/);
  assert.match(activity, /if \(!source\.has\("remoteWork"\) && !source\.has\("pairing"\)\) return null/);
  assert.match(activity, /getJsonAt\(endpoint, "\/api\/status", token\)/);
  assert.match(activity, /"work" -> if \(state\.remoteWorkAvailable\)/);
  assert.match(activity, /"pair" -> if \(state\.pairingAvailable\)/);
  assert.match(activity, /if \(!remoteWorkAvailable\)[\s\S]*Text\("Chat"/);
  assert.match(activity, /if \(state\.remoteWorkAvailable\) DrawerItem\(Icons\.Outlined\.Folder/);
  assert.match(activity, /if \(state\.pairingAvailable \|\| state\.wakePairingAvailable \|\| state\.wakeAvailable\) RemoteDrawerItem/);
  assert.match(activity, /if \(!state\.pairingAvailable\) return[\s\S]*secureTokens\.read\("remoteToken"\)/);
  assert.match(activity, /if \(state\.pairingAvailable\) DropdownMenuItem[\s\S]*"continueOnPc"/);
  assert.match(activity, /if \(!user && !state\.temporary && canRegenerate && state\.pairingAvailable\)/);
  assert.doesNotMatch(activity, /pairingOptional/);
  assert.doesNotMatch(activity, /if \(reachable\) \{ refreshRemoteCapabilities\(\); if \(!appVisible\) retryPendingRequests\(\); loadDevices\(\) \}/);
  assert.match(activity, /SpeechRecognizer\.createSpeechRecognizer\(context\)/);
  assert.match(activity, /"send" -> sendMessage\(\)/);
});

test('il relay Wake Android fallisce chiuso e non accetta destinazioni fornite dal telefono', () => {
  const activity = remoteActivity();
  assert.match(activity, /parsed\.rawUserInfo == null && parsed\.rawQuery == null && parsed\.rawFragment == null/);
  assert.match(activity, /parsed\.port == -1 \|\| parsed\.port == 443/);
  assert.match(activity, /host\.endsWith\("\.ts\.net"\)/);
  assert.match(activity, /path in setOf\("\/api\/pair", "\/api\/session\/rotate", "\/api\/wake\/capabilities", "\/api\/wake\/plan", "\/api\/wake\/execute"\)/);
  assert.match(activity, /!payload\.optBoolean\("requiresConfirmation", false\) \|\| payload\.optBoolean\("arbitraryDestinations", true\)/);
  assert.match(activity, /ticket\.matches\(Regex\("\[A-Za-z0-9_-\]\{8,128\}"\)\)/);
  assert.match(activity, /pendingAuthorizationKind != NexusAuthorizationKind\.WAKE \|\| pendingAuthorizationTicket != ticket/);
  assert.match(activity, /Il ticket del relay e monouso anche in caso di errore/);
  assert.doesNotMatch(activity, /put\("(?:mac|address|broadcast|port)"/i);
  assert.doesNotMatch(activity, /tailscale-user-login/i, 'l’identità Tailscale deve essere iniettata da Serve, mai dal client');
});
