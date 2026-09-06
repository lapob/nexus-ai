/**
 * @module tests/android-client-contract
 * @description Blocca regressioni tra i due client Android NexusNXS.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Remote AI e Console hanno package, modalità e sorgenti indipendenti', () => {
  const remote = read('android', 'NexusRemote', 'app', 'build.gradle');
  const consoleClient = read('android', 'NexusConsole', 'app', 'build.gradle');
  assert.match(remote, /applicationId\s*(?:=\s*)?"local\.nexus\.remote"/);
  assert.match(remote, /APP_MODE.*remote/);
  assert.match(consoleClient, /applicationId\s*(?:=\s*)?"local\.nexus\.console"/);
  assert.match(consoleClient, /APP_MODE.*console/);
  assert.doesNotMatch(consoleClient, /NexusRemote\/app\/src\/main/);
  assert.ok(fs.existsSync(path.join(root, 'android', 'NexusConsole', 'app', 'src', 'main', 'java', 'local', 'nexus', 'console', 'NativeMainActivity.java')));
});

test('launcher e superfici esterne identificano senza ambiguità le due app', () => {
  const remoteManifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const consoleManifest = read('android/NexusConsole/app/src/main/AndroidManifest.xml');
  assert.match(remoteManifest, /android:label="@string\/app_name"/);
  assert.match(read('android/NexusRemote/app/src/main/res/values/strings.xml'), />NexusNXS</);
  assert.match(remoteManifest, /android:host="remote"/);
  assert.doesNotMatch(remoteManifest, /android:host="console"/);
  assert.match(consoleManifest, /android:label="NexusNXS Control"/);
  assert.doesNotMatch(
    read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java'),
    /notifyUser\("NexusNXS per PC"|createConfirmDeviceCredentialIntent\([^\n]+"NexusNXS per PC"/,
    'notifiche e conferme di sistema devono usare il nome corrente NexusNXS Control'
  );
  assert.match(consoleManifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.notEqual(
    read('android/NexusConsole/app/src/main/res/drawable/ic_control_foreground.xml'),
    read('android/NexusRemote/app/src/main/res/drawable-nodpi/ic_nexus_remote.png'),
    'NexusNXS Control deve avere un simbolo launcher autonomo rispetto al client pubblico',
  );
  assert.match(consoleManifest, /tools:targetApi="33"/);
  assert.doesNotMatch(consoleManifest, /android\.intent\.category\.BROWSABLE|android:host="console"/);
  assert.doesNotMatch(consoleManifest, /android:host="remote"/);
  assert.doesNotMatch(consoleManifest, /com\.tailscale\.ipn/, 'la Console non deve dipendere da launcher o scorciatoie VPN');
});

test('NexusNXS per Android segue la lingua del dispositivo in UI, voce e configurazione Android', () => {
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const localeConfig = read('android/NexusRemote/app/src/main/res/xml/locales_config.xml');
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(manifest, /android:localeConfig="@xml\/locales_config"/);
  assert.match(localeConfig, /android:name="en"/);
  assert.match(localeConfig, /android:name="it"/);
  assert.match(activity, /resources\.configuration\.locales\[0\]/);
  assert.match(activity, /localizedServerActivity\(phase\)/);
  assert.match(activity, /"Ragiono e collego i dettagli…" -> "Reasoning through the details…"/);
  assert.match(activity, /"Waiting · position \$\{it\.groupValues\[1\]\}"/);
  assert.match(activity, /textToSpeech\?\.setLanguage\(deviceLocale\)/);
  assert.doesNotMatch(activity, /textToSpeech\?\.language = Locale\.ITALIAN/);
});

test('entrambi i client usano barre di sistema edge-to-edge traslucide senza separatori neri', () => {
  const policy = read('android/shared-motion/src/main/java/local/nexus/motion/NexusSystemBars.java');
  const publicActivity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const controlActivity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  for (const relative of [
    'android/NexusRemote/app/src/main/res/values/styles.xml',
    'android/NexusConsole/app/src/main/res/values/styles.xml',
  ]) {
    const style = read(relative);
    assert.match(style, /android:statusBarColor">@android:color\/transparent/);
    assert.match(style, /android:navigationBarColor">@android:color\/transparent/);
    assert.match(style, /android:windowDrawsSystemBarBackgrounds">true/);
  }
  assert.match(policy, /WindowCompat\.setDecorFitsSystemWindows\(window, false\)/);
  assert.match(policy, /Color\.argb\(166, 2, 6, 7\)/);
  assert.match(policy, /FROSTED_COSMIC_SCRIM = Color\.argb\(82, 2, 6, 7\)/);
  assert.match(policy, /FROSTED_STATUS_MAX_ALPHA = 116/);
  assert.match(policy, /applyFrosted\(Window window\)[\s\S]*apply\(window, FROSTED_COSMIC_SCRIM, FROSTED_COSMIC_SCRIM\)/);
  assert.match(policy, /updateFrostedStatus\(Window window, float progress\)/);
  assert.match(policy, /float eased = 1f - \(\(1f - clamped\) \* \(1f - clamped\)\)/);
  assert.match(policy, /setStatusBarColor\(statusScrim\)/);
  assert.match(policy, /setNavigationBarColor\(navigationScrim\)/);
  assert.match(policy, /setNavigationBarDividerColor\(Color\.TRANSPARENT\)/);
  assert.match(policy, /setNavigationBarContrastEnforced\(false\)/);
  assert.match(publicActivity, /NexusSystemBars\.apply\(window\)/);
  assert.match(controlActivity, /NexusSystemBars\.applyFrosted\(getWindow\(\)\)/);
  assert.match(controlActivity, /scroll\.setClipToPadding\(false\)/);
  assert.match(controlActivity, /scroll\.setOnScrollChangeListener/);
  assert.match(controlActivity, /Math\.max\(0f, scrollY\) \/ \(float\) dp\(56\)/);
  assert.match(controlActivity, /updateStatusFrost\(step \/ 24f\)/);
  assert.match(controlActivity, /statusFrostOverlay = new View\(this\)/);
  assert.match(controlActivity, /new int\[\]\{Color\.argb\(topAlpha, 2, 6, 7\), Color\.argb\(edgeAlpha, 2, 6, 7\), Color\.TRANSPARENT\}/);
  assert.doesNotMatch(controlActivity, /SystemBarGlassView|RenderEffect|RenderNode|glassOverlap/, 'il velo resta leggero e non usa blur software per-frame');
  assert.match(controlActivity, /int topInset = insets\.getSystemWindowInsetTop\(\)[\s\S]*int bottomInset = insets\.getSystemWindowInsetBottom\(\)[\s\S]*scroll\.setPadding\(0, dp\(8\) \+ topInset, 0, dp\(10\) \+ bottomInset\)/);
  assert.doesNotMatch(controlActivity, /view\.setPadding\(horizontal,\s*dp\(8\)\s*\+\s*insets\.getSystemWindowInsetTop/);
  assert.doesNotMatch(publicActivity, /navigationBarStyle\s*=\s*SystemBarStyle\.dark\(android\.graphics\.Color\.BLACK\)/);
});

test('i client richiedono credenziali limitate alla propria funzione', () => {
  const remoteActivity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const consoleActivity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  assert.match(remoteActivity, /"scope", "remote"/);
  assert.doesNotMatch(remoteActivity, /"scope", "console"/);
  assert.match(consoleActivity, /\/api\/console\/bootstrap/);
  assert.doesNotMatch(consoleActivity, /Inquadra QR|Codice di collegamento|Collega dispositivo/);
  assert.doesNotMatch(consoleActivity, /\/api\/conversations|Compagno NexusNXS|Scrivi a NexusNXS/);
  assert.doesNotMatch(consoleActivity, /\/api\/actions\/plan|\/api\/actions\/execute|\/api\/voice\/transcribe/);
  assert.doesNotMatch(consoleActivity, /TERMINALE|SESSIONE IN TEMPO REALE|\/api\/events|console-output|ProcessBuilder|Runtime\.getRuntime\(\)\.exec/);
  assert.match(consoleActivity, /DATI TECNICI/);
  assert.match(consoleActivity, /text\("OFFLINE"/);
  assert.doesNotMatch(consoleActivity, /Ripristina connessione privata|openPrivateNetwork/, 'la riconnessione deve essere automatica e non occupare la UI');
  assert.doesNotMatch(consoleActivity, /com\.tailscale\.ipn/);
  assert.match(consoleActivity, /else main\.post\(reconnect\)/);
});

test('le due app restano client Android nativi con uno stato offline comprensibile', () => {
  const remoteActivity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const consoleActivity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  for (const source of [remoteActivity, consoleActivity]) {
    assert.doesNotMatch(source, /\bWebView\b|android\.webkit|loadUrl\s*\(/);
    assert.match(source, /HttpURLConnection/);
  }
  assert.match(remoteActivity, /private fun endpointCandidates/);
  assert.match(consoleActivity, /1_000L << Math\.min\(reconnectAttempt, 5\)/);
  assert.match(remoteActivity, /Server NexusNXS non raggiungibili/);
  assert.match(remoteActivity, /Invio automatico alla riconnessione/);
  assert.match(remoteActivity, /clientMessageId/);
  assert.match(remoteActivity, /retryPendingRequests/);
  assert.match(remoteActivity, /rememberReachable/);
  assert.match(consoleActivity, /text\("OFFLINE"/);
  assert.match(consoleActivity, /Riconnessione automatica/);
});

test('NexusMainActivity avvia la superficie istantanea e separa il richiamo assistente', () => {
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const assistantActivity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusAssistantActivity.kt');
  const styles = read('android/NexusRemote/app/src/main/res/values/styles.xml');
  const launcherActivity = manifest.split('android:name=".NexusMainActivity"')[1]?.split('</activity>')[0] || '';
  assert.match(launcherActivity, /android\.intent\.action\.MAIN/);
  assert.doesNotMatch(manifest, /NativeMainActivity|QrScannerActivity|NexusRedesignActivity/);
  assert.match(activity, /enum class NexusWidthClass \{ COMPACT, MEDIUM, EXPANDED \}/);
  assert.match(activity, /LocalWindowInfo\.current\.containerSize/);
  assert.match(activity, /ValueAnimator\.areAnimatorsEnabled\(\)/);
  assert.match(activity, /slideInHorizontally/);
  assert.match(activity, /slideOutHorizontally/);
  assert.match(activity, /if \(back\) -width \/ 9 else width \/ 9/, 'avanzamento e ritorno devono avere direzioni Android speculari');
  assert.match(activity, /setContent \{ NexusTheme \{ if \(state\.assistantOverlay\) NexusAssistantOverlay\(state, ::dispatch\) else NexusInstantApp\(state, ::dispatch\) \} \}/);
  assert.match(manifest, /android:name="\.NexusAssistantActivity"[\s\S]*android\.intent\.action\.ASSIST/);
  assert.match(styles, /Theme\.NexusRemote\.Assistant[\s\S]*windowIsTranslucent">true/);
  assert.match(styles, /Theme\.NexusRemote\.Assistant[\s\S]*backgroundDimEnabled">false/);
  assert.match(assistantActivity, /PixelFormat\.TRANSLUCENT/);
  assert.match(activity, /private fun nexusComposerTransform[\s\S]{0,160}sizeTransform = null/, 'il composer non deve sovrapporre una molla alla transizione della tastiera Android');
  assert.doesNotMatch(activity, /"assistantClose"\s*->[^\n]*assistantOverlay\s*=\s*false/, 'la chiusura Assist non deve comporre la UI opaca prima di terminare');
  assert.match(assistantActivity, /clearFlags\(WindowManager\.LayoutParams\.FLAG_DIM_BEHIND\)/);
  assert.doesNotMatch(assistantActivity, /addFlags\(WindowManager\.LayoutParams\.FLAG_DIM_BEHIND\)/, 'il richiamo assistente non deve oscurare o sostituire il contesto Android');
  assert.doesNotMatch(activity.match(/setContent[^\n]+/)?.[0] || '', /NexusApp\(/);
  assert.match(activity, /private fun NexusInstantApp/);
  assert.match(activity, /private fun NexusInstantCore/);
  assert.match(activity, /"voiceSend"/);
  assert.match(activity, /if \(speakReply\) speakOrStop\(answer\)/);
  assert.match(activity, /\/api\/guest\/voice\/synthesize/);
  assert.match(activity, /MediaPlayer/);
  assert.match(activity, /if \(state\.busy\) dispatch\("stop", ""\)/, 'il Core deve consentire barge-in durante una risposta');
  assert.match(activity, /dispatch\("stopSpeech", ""\)[\s\S]{0,80}voiceMode = !voiceMode/);
  assert.match(activity, /keyboard\?\.hide\(\)[\s\S]{0,160}textMode = false[\s\S]{0,160}dispatch\("send"/);
  const instantSurface = activity.match(/@Composable private fun NexusInstantApp[\s\S]*?@Composable private fun NexusInstantCore/)?.[0] || '';
  assert.match(instantSurface, /navigationBarsPadding\(\)\.imePadding\(\)/, 'il composer deve restare sopra la tastiera edge-to-edge');
  assert.doesNotMatch(instantSurface.split('/** Superficie traslucida')[0], /composerBringIntoView|AnimatedContent\(textMode/, 'il composer non deve duplicarsi o riposizionarsi durante il movimento IME');
  assert.match(instantSurface, /bottom = 10\.dp/, 'il composer mantiene un margine stabile sopra la tastiera');
  assert.match(instantSurface, /centeredExchange/);
  assert.match(instantSurface, /contentAlignment = Alignment\.Center/);
  assert.match(instantSurface, /InstantWrittenExchange/);
  assert.match(instantSurface, /shape = RoundedCornerShape\(18\.dp\)/, 'prompt e stato devono condividere superfici arrotondate coerenti');
  assert.match(instantSurface, /var typedSession by rememberSaveable/);
  assert.match(instantSurface, /align\(Alignment\.BottomStart\)[\s\S]{0,260}Icons\.Rounded\.Keyboard/, 'la tastiera deve restare raggiungibile in basso a sinistra');
  assert.doesNotMatch(instantSurface, /Icons\.Rounded\.Mic/, 'la superficie istantanea deve usare il Core come unico ingresso vocale');
  assert.match(activity, /energy: Float = 0f/);
  assert.match(activity, /energy = voiceEnergy/);
  assert.match(activity, /haltCapture\(false, true\)[\s\S]{0,80}close\(\)/, 'un secondo tocco sul Core deve interrompere e tornare alla superficie principale');
  assert.match(instantSurface, /NexusAttachmentFlow/);
  assert.match(instantSurface, /AttachmentPreview\(state\.composerState\(\)/);
  assert.match(instantSurface, /Icons\.Rounded\.Add/);
  assert.match(instantSurface, /Row\(Modifier\.padding\(horizontal = 7\.dp, vertical = 7\.dp\)/, 'allega e invia devono avere inset simmetrici nel composer');
  assert.match(instantSurface, /Icons\.Rounded\.Add[\s\S]{0,180}Modifier\.size\(21\.dp\)/, 'il glifo più deve avere lo stesso peso ottico del pulsante invio');
  assert.match(instantSurface, /state\.remoteWorkAvailable && state\.workTicketId\.isNotBlank\(\)/, 'la superficie istantanea deve rendere autorizzabile un piano remoto');
  assert.match(activity, /enteredText\.ifBlank \{ nexusCopy\("Analizza questo allegato\./, 'un allegato deve poter essere inviato anche senza testo manuale');
  assert.match(activity, /Server NexusNXS non raggiungibili/);
});

test('l APK pubblico blocca ogni input finché il server non è realmente online', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const protocol = JSON.parse(read('config/nexus-interaction-states.json'));
  const instantSurface = activity.match(/@Composable private fun NexusInstantApp[\s\S]*?@Composable private fun NexusInstantCore/)?.[0] || '';
  const dispatch = activity.match(/private fun dispatch[\s\S]*?private fun refreshChats/)?.[0] || '';
  const send = activity.match(/private fun sendMessage[\s\S]*?private fun explicitDesktopIntent/)?.[0] || '';
  assert.equal(protocol.states.offline.inputPolicy, 'blocked-until-online');
  assert.deepEqual(protocol.states.offline.allowedActions, ['retry-connection', 'read-status']);
  assert.match(instantSurface, /val interactionAvailable = state\.connection == NexusConnection\.ONLINE/);
  assert.match(instantSurface, /if \(!interactionAvailable\)[\s\S]{0,240}keyboard\?\.hide\(\)[\s\S]{0,240}typedSession = false/);
  assert.match(instantSurface, /enabled = interactionAvailable/);
  assert.match(instantSurface, /visible = attachmentSheet && interactionAvailable/);
  assert.match(dispatch, /"draft" -> \{[\s\S]{0,100}state\.connection != NexusConnection\.ONLINE\) return/);
  assert.match(dispatch, /spoken\.isNotBlank\(\) && !state\.busy && state\.connection == NexusConnection\.ONLINE/);
  assert.match(send, /if \(state\.connection != NexusConnection\.ONLINE\)[\s\S]{0,420}probeConnection\(\)/);
  assert.doesNotMatch(activity, /server è offline\. Puoi comunque scrivere|server is offline\. You can still type/i);
});

test('il client pubblico invia al training soltanto feedback volontario in quarantena', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /"approveTraining"\s*->\s*submitApprovedFeedback\(value\)/);
  assert.match(activity, /\/api\/guest\/feedback/);
  assert.match(activity, /\.put\("consent", true\)/);
  assert.match(activity, /Migliora NexusNXS/);
  assert.match(activity, /quarantena per revisione/);
  assert.match(activity, /substringBefore\("\\n\\nAllegato:"\)/);
  assert.match(activity, /state\.temporary \|\| response\.isBlank\(\)/);
});

test('la release separa i due client pubblici dalla Console privata', () => {
  const packageJson = JSON.parse(read('package.json'));
  const release = read('scripts', 'release-all.js');
  assert.match(packageJson.scripts['release:all'], /release-all\.js/);
  assert.match(release, /NexusNXS-Android\.apk/);
  assert.match(release, /NexusNXS-Control\.apk/);
  assert.match(release, /release-manifest\.json/);
  assert.match(release, /release-manifest\.private\.json/);
  assert.match(release, /visibility: 'public'/);
  assert.match(release, /visibility: 'private-owner'/);
  assert.match(release, /--public-only/);
  assert.match(release, /--private-only/);
});

test('la release Android pubblica rifiuta credenziali mancanti e firme Debug', () => {
  const packageJson = JSON.parse(read('package.json'));
  const build = read('scripts', 'build-android-remote.ps1');
  assert.match(packageJson.scripts['android:remote:public'], /-PublicRelease/);
  assert.match(build, /\[switch\]\$PublicRelease/);
  assert.match(build, /\$PublicRelease -and -not \$signedRelease/);
  assert.match(build, /CN=Android Debug/);
  assert.match(build, /\$variant = if \(\$signedRelease\) \{ "Release" \} else \{ "Preview" \}/);
  assert.match(build, /if \(\$signedRelease\) \{ \$gradleTasks \+= "bundle\$variant" \}/);
  assert.match(build, /nessun bundle Play generato/);
  assert.match(read('android/NexusRemote/app/build.gradle'), /preview \{[\s\S]*signingConfig\s*(?:=\s*)?signingConfigs\.debug/);
  assert.doesNotMatch(read('android/NexusRemote/app/build.gradle'), /signingConfig nexusKeystore \? signingConfigs\.nexusRelease : signingConfigs\.debug/);
  assert.match(read('android/NexusRemote/app/src/main/baseline-prof.txt'), /NexusMainActivity;->dispatch/);
});

test('NexusNXS Android conserva diagnostica crash locale senza contenuti privati', () => {
  const store = read('android/NexusRemote/app/src/main/java/local/nexus/remote/AndroidCrashStore.java');
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /AndroidCrashStore\.install\(this\)/);
  assert.match(store, /MAX_REPORTS = 8/);
  assert.match(store, /getSimpleName\(\)/);
  assert.doesNotMatch(store, /getMessage\(|printStackTrace|stackTrace|HttpURLConnection|URL\(/);
});

test('le notifiche Android usano un simbolo monocromatico dedicato', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const icon = read('android/NexusRemote/app/src/main/res/drawable/ic_nexus_notification.xml');
  assert.match(activity, /setSmallIcon\(R\.drawable\.ic_nexus_notification\)/);
  assert.match(icon, /android:fillColor="#FFFFFFFF"/);
  assert.doesNotMatch(icon, /gradient|bitmap/i);
});

test('il client istantaneo non richiede la fotocamera', () => {
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const build = read('android/NexusRemote/app/build.gradle');
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA|android\.hardware\.camera/);
  assert.match(activity, /setContent \{ NexusTheme \{ if \(state\.assistantOverlay\)[\s\S]*NexusInstantApp/);
  assert.doesNotMatch(activity.match(/@Composable private fun NexusInstantApp[\s\S]*?@Composable private fun NexusInstantCore/)?.[0] || '', /TakePicture|AttachmentPicker|PhotoCamera/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.doesNotMatch(manifest, /QrScannerActivity/);
  assert.doesNotMatch(build, /com\.google\.zxing/);
});

test('NexusNXS Control espone diagnostica e alimentazione senza voce o shell remota', () => {
  const activity = read('android', 'NexusConsole', 'app', 'src', 'main', 'java', 'local', 'nexus', 'console', 'NativeMainActivity.java');
  const secureStore = read('android', 'NexusConsole', 'app', 'src', 'main', 'java', 'local', 'nexus', 'console', 'SecureTokenStore.java');
  assert.match(activity, /authenticateThen\(\(\) -> executePower/);
  assert.match(activity, /\/api\/system\/power\/plan/);
  assert.match(activity, /\/api\/system\/power\/execute/);
  assert.doesNotMatch(activity, /executeRemoteAction|AudioRecord|\/api\/voice\/transcribe|RecognizerIntent|ACTION_RECOGNIZE_SPEECH/);
  assert.doesNotMatch(read('android/NexusConsole/app/src/main/AndroidManifest.xml'), /android\.permission\.RECORD_AUDIO/);
  assert.match(activity, /Sistema|CPU|Core logici|GPU|Memoria video|RAM|Rete|Tempo di attività|Ultimo controllo/);
  assert.match(activity, /LIVE_REFRESH_MS = 750L/);
  assert.match(activity, /telemetryInFlight/);
  assert.match(activity, /bootstrapInFlight/);
  assert.match(activity, /dashboardLoadInFlight/);
  assert.match(activity, /sessionRotationInFlight/);
  assert.match(activity, /private boolean rotateSessionIfDue\(\)/);
  assert.match(activity, /if \(rotateSessionIfDue\(\)\) return;/);
  assert.match(activity, /final String requestToken = authenticated \? token : "";/, 'ogni richiesta deve conservare il token realmente inviato');
  assert.match(activity, /if \(!requestToken\.equals\(token\)\) return;/, 'un 401 tardivo non deve cancellare il token ottenuto da una rotazione successiva');
  assert.match(activity, /sessionRotationInFlight && !"\/api\/session\/rotate"\.equals\(path\)/, 'le risposte della vecchia sessione devono attendere la rotazione in corso');
  assert.match(activity, /private void handleTelemetryFailure\(\)/);
  assert.doesNotMatch(activity, /if \(!silentFailure\) showOffline\(null\);[\s\S]{0,260}telemetryInFlight = false/);
  assert.match(activity, /Dati in tempo reale/);
  assert.match(activity, /content\.addView\(services, wrapBlock\(\)\)/, 'la scheda servizi deve adattarsi a sessioni e font grandi senza tagliare righe');
  assert.doesNotMatch(activity, /content\.addView\(services, block\(dp\(178\)\)\)/, 'la scheda servizi non deve avere un altezza rigida');
  assert.match(activity, /serviceMetric\("SESSIONI"/);
  assert.match(activity, /serviceMetric\("STREAM LIVE"/);
  assert.match(activity, /service:sessions/);
  assert.match(activity, /Preparazione P95/);
  assert.match(activity, /Primo output P95/);
  assert.match(activity, /Inferenza P95/);
  assert.match(activity, /Verifica P95/);
  assert.match(activity, /value\.contentEquals/, 'la telemetria non deve forzare un nuovo layout quando il valore non cambia');
  assert.doesNotMatch(activity, /infoRow\("Sessioni attive"/, 'le sessioni devono avere uno spazio proprio e non collidere con le righe descrittive');
  assert.match(activity, /onResume/);
  assert.match(activity, /extends androidx\.activity\.ComponentActivity/);
  assert.match(activity, /getOnBackPressedDispatcher\(\)\.addCallback/);
  assert.match(activity, /handleOnBackPressed\(\)/);
  assert.match(activity, /currentScreen == SCREEN_POWER/);
  assert.match(activity, /if \(currentScreen != SCREEN_POWER\) return;/, 'una risposta tardiva non deve riaprire la conferma dopo Indietro');
  assert.match(activity, /if \(currentScreen != SCREEN_POWER \|\| !foreground\) return;/, 'una conferma completata non deve riaprire la schermata dopo Indietro o in background');
  assert.doesNotMatch(activity, /SCREEN_SECURITY/);
  assert.match(activity, /contentSwapGeneration/);
  assert.match(activity, /content\.animate\(\)\.cancel\(\)/);
  assert.match(activity, /content\.postOnAnimation\(/, 'la transizione deve iniziare sul frame Android successivo');
  assert.match(activity, /content\.setTranslationX\(materialize \? 0f : reverse \? -dp\(NexusMotion\.CONTENT_TRAVEL_DP\) : dp\(NexusMotion\.CONTENT_TRAVEL_DP\)\)/, 'la Console deve mostrare avanzamento e ritorno con direzione distinta');
  assert.doesNotMatch(activity, /content\.setAlpha\(0f\)/, 'un refresh sovrapposto non deve lasciare tutta la console trasparente');
  assert.match(activity, /ValueAnimator\.areAnimatorsEnabled\(\)/);
  assert.doesNotMatch(activity, /new LayoutTransition\(\)/, 'la dashboard non deve animare ogni figlio durante il rendering iniziale');
  assert.match(activity, /NEXUS_LAN_URL/);
  const consoleBuild = read('android/NexusConsole/app/build.gradle');
  assert.match(consoleBuild, /NEXUS_CONSOLE_FALLBACK_URL/);
  assert.doesNotMatch(consoleBuild, /providers\.gradleProperty\("NEXUS_FALLBACK_URL"\)/, 'la Console non deve ereditare il Funnel pubblico del client AI');
  const networkSecurity = read('android/NexusRemote/app/src/main/res/xml/network_security_config.xml');
  assert.match(networkSecurity, /<base-config cleartextTrafficPermitted="false"\s*\/>/);
  assert.doesNotMatch(networkSecurity, /<domain-config|cleartextTrafficPermitted="true"/, 'il client AI non deve inviare contenuti o token in HTTP');
  assert.match(activity, /secureTokenStore\.read\(\)/);
  assert.doesNotMatch(activity, /WorkManager|enqueueUniquePeriodicWork/);
  assert.match(activity, /telemetryFailures >= 2/);
  assert.match(activity, /NET_CAPABILITY_INTERNET/);
  assert.match(secureStore, /AndroidKeyStore/);
  assert.match(secureStore, /AES\/GCM\/NoPadding/);
  assert.match(secureStore, /remove\("token"\)/);
  assert.equal(fs.existsSync(path.join(root, 'android', 'NexusConsole', 'app', 'src', 'main', 'java', 'local', 'nexus', 'console', 'ConnectionHealthWorker.java')), false);
  assert.doesNotMatch(activity, /EditText|\/api\/system\/processes|ProcessBuilder|Runtime\.getRuntime\(\)\.exec/);
});

test('NexusNXS Control offre controlli applicativi e server espliciti e sicuri', () => {
  const activity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  const consoleBuild = read('android/NexusConsole/app/build.gradle');
  const remoteBuild = read('android/NexusRemote/app/build.gradle');
  const sharedMotion = read('android/shared-motion/src/main/java/local/nexus/motion/NexusMotion.java');
  assert.match(activity, /Verifica server/);
  assert.match(activity, /Arresta server/);
  assert.match(activity, /\/api\/system\/service/);
  assert.match(activity, /controlDesktopApp\("open-full-app"/);
  assert.match(activity, /controlDesktopApp\("close-full-app"/);
  assert.match(activity, /controlDesktopApp\("open-chatgpt"/);
  assert.match(activity, /controlDesktopApp\("close-chatgpt"/);
  assert.match(activity, /applicationGrid\(\)/);
  assert.match(activity, /screenWidthDp < 360/);
  assert.match(activity, /fontScale >= 1\.25f/);
  assert.doesNotMatch(activity, /Mostra pannello completo|Vista essenziale|overviewMode/);
  assert.match(activity, /onConfigurationChanged/);
  assert.match(activity, /"open-application"/);
  assert.match(activity, /"close-application"/);
  assert.match(activity, /controlCatalogApplication/);
  assert.match(activity, /Chiudi app in primo piano/);
  assert.match(activity, /foregroundApplicationId/);
  assert.match(activity, /foregroundApplicationLabel/);
  assert.match(activity, /L’app in primo piano non è controllabile da NexusNXS/);
  assert.match(activity, /Apertura…/);
  assert.match(activity, /Chiusura…/);
  assert.match(activity, /Aperta · tocca per chiudere/);
  assert.match(activity, /Chiusa · tocca per aprire/);
  assert.match(activity, /class NexusGlyphDrawable extends Drawable/);
  assert.match(activity, /class ControlCoreView extends View/);
  assert.match(activity, /applicationId/);
  assert.match(activity, /app-tile:/);
  assert.match(activity, /configureMotionProfile\(\)/);
  assert.match(activity, /isLowRamDevice\(\)/);
  assert.match(activity, /isPowerSaveMode\(\)/);
  assert.match(activity, /getRefreshRate\(\)/);
  assert.match(activity, /\/api\/system\/service\/plan/);
  assert.match(activity, /\/api\/system\/service\/execute/);
  assert.match(activity, /authenticateThen\(\(\) -> executeServerStop/);
  assert.match(activity, /ChatGPT è già aperto/);
  assert.match(activity, /requestCommandWithProof\("presence-plan"/);
  assert.match(activity, /requestWithProof\(purpose, path, body, done, true/);
  assert.match(activity, /verifyDesktopCommandOutcome/);
  assert.match(activity, /Impossibile confermare la /);
  assert.match(activity, /Verifica non disponibile\. La connessione resta attiva\./);
  assert.match(activity, /"supremo", "Supremo", "supremo"/);
  assert.match(activity, /"supremo"\.equals\(glyph\)/);
  assert.match(activity, /Aperta · UAC pronto/);
  assert.match(activity, /Chiusa · configura UAC sul PC/);
  assert.doesNotMatch(activity, /"settings", "Impostazioni", "settings"/);
  assert.match(activity, /import local\.nexus\.motion\.NexusMotion/);
  assert.match(activity, /new PathInterpolator\(NexusMotion\.EMPHASIZED_X1/);
  assert.match(activity, /content\.setAlpha\(materialize \? \.42f : NexusMotion\.CONTENT_START_ALPHA\)/);
  assert.match(consoleBuild, /shared-motion\/src\/main\/java/);
  assert.match(remoteBuild, /shared-motion\/src\/main\/java/);
  assert.match(sharedMotion, /public static final int ENTER = 260/);
  assert.match(sharedMotion, /public static final int CONTENT_SWAP = 320/);
  assert.match(sharedMotion, /profileScale\(boolean lowRam, boolean powerSave, float refreshRate\)/);
  assert.doesNotMatch(activity, /motionDuration\([0-9]/, 'le durate della Console non devono tornare a essere valori sparsi');
  assert.match(activity, /density \* \.96f/, 'le icone devono usare un tratto leggero e coerente');
  assert.match(activity, /NXS-CORE-01/);
  assert.match(activity, /corePulseSummary/);
  assert.match(activity, /core-pulse-detail/);
  assert.match(activity, /Executors\.newSingleThreadExecutor\(\)/);
  assert.match(activity, /\/api\/system\/telemetry\/stream/);
  assert.match(activity, /stopLiveTelemetry\(\)/);
  assert.match(activity, /if \(!liveTelemetryActive\) main\.postDelayed\(refresh, LIVE_REFRESH_MS\)/);
  assert.match(activity, /launchCommandInFlight/);
  assert.match(activity, /Verifica non riuscita\. La telemetria continua in background\./);
  assert.match(activity, /\/api\/presence\/status/);
  assert.match(activity, /applyDesktopControlState/);
  assert.match(activity, /SAFE_ACTION_HISTORY/);
  assert.match(activity, /Math\.min\(history\.length\(\), 3\)/, 'la cronologia locale deve restare compatta');
  assert.match(activity, /getTimeFormat\(this\)/, 'gli orari devono seguire il formato del dispositivo');
  assert.doesNotMatch(
    activity.split('private void requestCommandWithProof')[1]?.split('private void requestWithProof')[0] || '',
    /showOffline/,
    'un timeout di apertura non deve trasformarsi in una falsa disconnessione'
  );
  assert.doesNotMatch(activity, /ACTION_VIEW, Uri\.parse\("https:\/\/chatgpt\.com"\)/);
  assert.doesNotMatch(activity, /Runtime\.getRuntime\(\)\.exec|\/bin\/sh|cmd\.exe/);
});

test('la matrice visuale Android copre telefono font grande landscape e tablet', () => {
  const script = read('scripts/capture-android-visual-matrix.ps1');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['qa:android:visual'], /capture-android-visual-matrix\.ps1/);
  assert.match(script, /phone-compact/);
  assert.match(script, /phone-large-font/);
  assert.match(script, /phone-landscape/);
  assert.match(script, /tablet/);
  assert.match(script, /finally\s*\{[\s\S]*Restore-Display/);
  assert.match(script, /uiautomator dump/);
  assert.match(script, /dumpsys gfxinfo \$package reset/);
  assert.match(script, /MaxJankyPercent = 18/);
  assert.match(script, /JankyPercent = \$jankyPercent/);
});

test('entrambi i client Android riducono il budget grafico con isteresi sui frame reali', () => {
  const publicMonitor = read('android/NexusRemote/app/src/main/java/local/nexus/remote/FrameHealthMonitor.java');
  const publicActivity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const privateMonitor = read('android/NexusConsole/app/src/main/java/local/nexus/console/FrameBudgetMonitor.java');
  const privateActivity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  for (const monitor of [publicMonitor, privateMonitor]) {
    assert.match(monitor, /Choreographer\.FrameCallback/);
    assert.match(monitor, /smoothedSlowRatio >= \.12f/);
    assert.match(monitor, /smoothedSlowRatio <= \.05f/);
    assert.match(monitor, /healthyWindows >= 3/);
    assert.match(monitor, /frameHealth\.constrained/);
  }
  assert.match(publicActivity, /frameConstrained/);
  assert.match(publicActivity, /adaptiveReducedMotion = frameConstrained/);
  assert.match(privateActivity, /new FrameBudgetMonitor/);
  assert.match(privateActivity, /frameBudgetMonitor\.start\(\)/);
  assert.match(privateActivity, /frameBudgetMonitor\.stop\(\)/);
  assert.match(privateActivity, /private static final int PARTICLE_CAPACITY = 34/);
  assert.match(privateActivity, /private static final int PARTICLE_CAPACITY = 14/);
  assert.doesNotMatch(privateActivity, /setLayerType\(View\.LAYER_TYPE_SOFTWARE/);
  const materializationDraw = privateActivity.split('private final class MaterializationView')[1]?.split('private final class ControlCoreView')[0] || '';
  const coreDraw = privateActivity.split('private final class ControlCoreView')[1]?.split('private final class NexusGlyphDrawable')[0] || '';
  assert.doesNotMatch(materializationDraw, /onDraw\([\s\S]*new float\[/);
  assert.doesNotMatch(coreDraw, /onDraw\([\s\S]*new float\[/);
  assert.match(privateActivity, /NotificationChannel\(NOTIFICATION_CHANNEL, "Avvisi operativi"/);
  assert.match(privateActivity, /deleteNotificationChannel\("nexus_console"\)/);
  assert.match(privateActivity, /setVisibility\(android\.app\.Notification\.VISIBILITY_PRIVATE\)/);
  assert.match(privateActivity, /PendingIntent\.FLAG_UPDATE_CURRENT \| PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(privateActivity, /notify\(notificationId, value\)/);
  assert.doesNotMatch(privateActivity, /notify\(\(int\) \(System\.currentTimeMillis\(\) & 0xfffffff\)/);
});

test('la conferma privata sopravvive al ritorno biometrico e ai cambi rete', () => {
  const activity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  assert.match(activity, /else if \(currentScreen != SCREEN_POWER\) reconnect\.run\(\)/);
  assert.match(activity, /resumeForegroundRefreshes\(\)[\s\S]*if \(currentScreen == SCREEN_POWER\) return/);
  assert.match(activity, /if \(requestCode == REQUEST_DEVICE_CREDENTIAL\)[\s\S]*resultCode == RESULT_OK && action != null/);
});

test('la telemetria Android disegna lo storico senza allocazioni a ogni frame', () => {
  const activity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  const sparkline = activity.split('private final class SparklineView')[1]?.split('private LinearLayout card()')[0] || '';
  assert.match(sparkline, /private final float\[\] samples = new float\[SAMPLE_CAPACITY\]/);
  assert.match(sparkline, /System\.arraycopy\(samples, 1, samples, 0, SAMPLE_CAPACITY - 1\)/);
  assert.doesNotMatch(sparkline, /toArray\s*\(/);
  assert.doesNotMatch(sparkline, /new Float\[/);
});

test('NexusNXS Control non usa header navbar o footer persistenti', () => {
  const activity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  const shell = activity.split('private void createShell()')[1]?.split('private void showConnecting()')[0] || '';
  assert.doesNotMatch(shell, /statePill|LinearLayout top|root\.addView\(top\)/);
  assert.doesNotMatch(activity, /Ogni azione richiede la tua conferma\./);
  assert.doesNotMatch(activity, /TextView state(?:Dot)?;/);
  assert.match(activity, /visibleState = stateKey/);
  assert.match(activity, /content\.setGravity\(Gravity\.CENTER\)/);
});

test('NexusNXS per Android parte senza account e conserva le chat anonime nel database locale', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  assert.match(activity, /\/api\/guest\/bootstrap/);
  assert.match(activity, /\/api\/guest\/messages/);
  assert.match(activity, /\/api\/guest\/messages\/stream/);
  assert.match(activity, /secureTokens\.read\("guestToken"\)/);
  assert.match(activity, /refreshChats\(openIfEmpty = true\)/);
  assert.match(activity, /private fun openConversation/);
  assert.match(activity, /NexusNXS Rapido/);
  assert.match(activity, /NexusNXS Pro/);
  assert.match(activity, /NexusComposer/);
  assert.match(activity, /ModalDrawerSheet/);
  assert.match(activity, /PredictiveBackHandler\(enabled = state\.drawer && !state\.modelSheet\)/);
  assert.match(activity, /chatGeneration\+\+/);
  assert.match(activity, /SpeechRecognizer/);
  assert.match(activity, /RECORD_AUDIO/);
  assert.match(activity, /TextToSpeech/);
  assert.match(activity, /NexusScreen\.SCHEDULED/);
  assert.match(activity, /queueDraftPersistence/);
  assert.match(store, /deleteLastAssistantTurn/);
  assert.match(store, /SQLiteOpenHelper/);
  assert.match(store, /nexusnxs-chats\.db/);
  assert.match(store, /preview/);
});

test('NexusNXS per Android Compose conserva la coda offline e autorizza Cuore prima di eseguire', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  assert.match(store, /CREATE TABLE pending_requests/);
  assert.match(store, /queueRequest/);
  assert.match(store, /nextPendingRequest/);
  assert.match(activity, /clientMessageId/);
  assert.match(activity, /BuildConfig\.NEXUS_FALLBACK_URL/);
  assert.match(activity, /ModelRow\("nexus-fast", "NexusNXS Rapido"\)/);
  assert.match(activity, /ModelRow\("nexus-deep", "NexusNXS Pro"\)/);
  assert.match(activity, /put\("model", publicModelId\(model\)\)/);
  assert.doesNotMatch(activity, /if \(model == "NexusNXS Pro"[^\n]+return "deep"/, 'il profilo Pro e un tetto di capacita e non deve forzare deep sui prompt banali');
  assert.match(activity, /explicitDepth\.containsMatchIn\(text\)/, 'le richieste esplicitamente approfondite devono poter scegliere il percorso deep');
  assert.match(activity, /id\.equals\("nexus-fast", true\)/);
  assert.match(activity, /id\.equals\("nexus-deep", true\)/);
  assert.match(activity, /private fun endpointCandidates/);
  assert.match(activity, /status !in 200\.\.299/);
  assert.match(activity, /retryPendingRequests/);
  assert.match(activity, /\/api\/actions\/plan/);
  assert.match(activity, /\/api\/actions\/execute/);
  assert.match(activity, /secureTokens\.write\("workProposal"/);
  assert.match(activity, /secureTokens\.read\("workProposal"/);
  assert.match(activity, /if \(failure == null\) clearWorkProposal\(\)/);
  assert.match(activity, /Autorizza questa operazione/);
  assert.match(activity, /"approveWork" -> authorizeWorkProposal\(\)/);
  assert.match(activity, /BiometricPrompt\.Builder/);
  assert.match(activity, /createConfirmDeviceCredentialIntent/);
  assert.match(activity, /pendingAuthorizationKind != NexusAuthorizationKind\.WORK \|\| pendingAuthorizationTicket != ticket/);
  assert.match(activity, /executeAuthorizedWorkProposal\(ticket\)/);
  assert.match(activity, /branchConversation/);
  assert.match(store, /archiveConversation/);
  assert.match(activity, /Rimuovi dai fissati/);
  assert.match(activity, /Modalità Cuore/);
  assert.match(activity, /ComposerTrailing/);
  assert.match(activity, /claimed = true[\s\S]*keyboard\?\.hide\(\)/);
  assert.match(activity, /NexusParticlePresence/);
  assert.match(activity, /WindowInsets\.isImeVisible/);
  assert.match(activity, /Presenza NexusNXS/);
  assert.match(activity, /particleCount = if \(state\.reduceMotion \|\| imeVisible\)/);
  assert.match(activity, /enum class NexusWidthClass/);
  assert.match(activity, /rememberNexusMetrics/);
  assert.match(activity, /val landscape = windowSize\.width > windowSize\.height/);
  assert.match(activity, /metrics\.contentMaxWidth/);
  assert.match(activity, /metrics\.drawerWidth/);
  assert.match(activity, /metrics\.fontScale/);
});

test('NexusNXS Android condivide la palette slash e salva comandi personali sul dispositivo', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /data class SlashCommandRow/);
  assert.match(activity, /builtinSlashCommands\(\)/);
  assert.match(activity, /loadCustomSlashCommands\(\)/);
  assert.match(activity, /persistCustomSlashCommands/);
  assert.match(activity, /COMANDI NEXUSNXS/);
  assert.match(activity, /resolveSlashInput/);
  assert.match(activity, /Cerca sul web informazioni aggiornate/);
});

test('la chat temporanea non persiste contenuti e protegge anteprime e allegati', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const manifest = read('android', 'NexusRemote', 'app', 'src', 'main', 'AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:fullBackupContent="false"/);
  assert.match(activity, /FLAG_SECURE/);
  assert.match(activity, /if \(!state\.temporary && state\.conversationId\.isNotBlank\(\)\)/);
  assert.match(activity, /conversationId = "", turns = emptyList\(\), draft = "", attachment = null/);
  assert.match(activity, /temporaryHasContent = draft\.isNotBlank\(\) \|\| turns\.isNotEmpty\(\) \|\| attachment != null/);
  assert.match(activity, /Messaggi, bozze e allegati di questa sessione verranno eliminati/);
  assert.match(activity, /Non verrà salvata/);
});

test('la home mobile separa suggerimenti Chat e identità Work', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /AnimatedVisibility\(!temporary && !work && visible,[\s\S]*?suggestions\.forEach/);
  assert.doesNotMatch(activity, /WorkLaunchpad/);
  assert.match(activity, /WorkIdentityPanel/);
  assert.match(activity, /Descrivi il risultato\. NexusNXS prepara il piano e chiede conferma prima di agire/);
  assert.match(activity, /bottom = 5\.dp/);
});

test('NexusNXS usa identità modello proprietaria e apre direttamente la chat', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /NexusNXS Rapido/);
  assert.match(activity, /NexusNXS Pro/);
  assert.doesNotMatch(activity, /firstRunGuide|homeGuideSeen|Inizia come preferisci|Start your way/);
  assert.match(activity, /Continua un’attività dal mio PC/);
  assert.match(activity, /state\.devices\.isNotEmpty\(\)/);
  assert.match(activity, /state\.pendingCount > 0/);
  assert.match(activity, /align\(if \(imeVisible\) Alignment\.TopCenter else Alignment\.Center\)/);
  assert.match(activity, /if \(imeVisible\) nexusCopy\("Non verrà salvata", "Won't be saved"\)/);
});

test('invio mobile libera la tastiera e segue lo streaming finché l utente non scorre', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /if \(action == "send"\)[\s\S]*keyboard\?\.hide\(\)[\s\S]*focusManager\.clearFocus\(force = true\)/);
  assert.match(activity, /state = state\.copy\(conversationId = id,[\s\S]*turns = store\.get\(id\)\.optJSONArray\("turns"\)\.toTurns\(\)/);
  assert.match(activity, /val bottomAnchor = remember \{ BringIntoViewRequester\(\) \}/);
  assert.match(activity, /if \(movingBack\) autoFollow = false/);
  assert.match(activity, /else if \(atBottom\) autoFollow = true/);
  assert.match(activity, /if \(itemCount > 0 && autoFollow\)[\s\S]*bottomAnchor\.bringIntoView\(\)/);
  assert.match(activity, /SmallFloatingActionButton\(onClick = \{ autoFollow = true; unseenStreamingCharacters = 0;/);
});

test('NexusNXS per Android carica i modelli anche dal percorso di continuità raggiungibile', () => {
  const remoteCompose = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(remoteCompose, /private fun refreshModels\(\) = runTask/);
  assert.match(remoteCompose, /backgroundExecutor\.shutdownNow\(\)/);
  assert.match(remoteCompose, /if \(destroyed \|\| backgroundExecutor\.isShutdown\) return/);
  assert.match(remoteCompose, /for \(endpoint in endpointCandidates\(\)\)/);
  assert.match(remoteCompose, /rememberReachable\(endpoint\)/);
  assert.doesNotMatch(remoteCompose, /URL\(server\.trimEnd\('\/'\) \+ "\/api\/models"\)/);
});

test('NexusNXS per Android distingue verifica, connessione e server offline senza affidarsi al testo', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /enum class NexusConnection \{ CHECKING, ONLINE, OFFLINE \}/);
  assert.match(activity, /val connection: NexusConnection = NexusConnection\.CHECKING/);
  assert.match(activity, /ConnectionStatusStrip\(state\.connection, state\.pendingCount\)/);
  assert.match(activity, /Server NexusNXS non raggiungibili/);
  assert.match(activity, /state\.connection == NexusConnection\.OFFLINE\) 5_000 else 15_000/);
  assert.match(activity, /@Volatile private var connectionProbeRunning = false/);
  assert.match(activity, /NetworkCapabilities\.NET_CAPABILITY_VALIDATED/);
  assert.match(activity, /probeStatus\(base, "\/readyz"\)/, 'Online deve indicare che il servizio AI è pronto, non soltanto che il processo risponde');
  assert.match(activity, /readiness == 404 && probeStatus\(base, "\/healthz"\)/, 'healthz resta soltanto compatibilità per gateway che non espongono readiness');
});

test('Android conserva la chat scelta e sospende soltanto i polling periodici in background', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /val canResume = store\.get\(savedConversationId\) != null/);
  assert.doesNotMatch(activity, /elapsed > SESSION_RESUME_WINDOW_MS\) openConversation\(store\.createConversation\(\)\)/);
  assert.match(activity, /"probe" -> if \(appVisible\) probeConnection\(\)/);
  assert.match(activity, /"models" -> if \(appVisible\) refreshModels\(\)/);
  assert.match(activity, /override fun onResume\(\)[\s\S]*if \(::store\.isInitialized\) \{[\s\S]*probeConnection\(\)[\s\S]*loadWakeCapabilities\(\)/);
});

test('la voce Android parte dal Core, invia una frase e non resta attiva in background', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  assert.match(activity, /enum class NexusVoiceMode \{ IDLE, SINGLE_TURN, HANDS_FREE \}/);
  assert.match(activity, /SpeechRecognizer\.isOnDeviceRecognitionAvailable\(context\)/);
  assert.match(activity, /SpeechRecognizer\.createOnDeviceSpeechRecognizer\(context\)/);
  assert.match(activity, /RecognizerIntent\.EXTRA_PREFER_OFFLINE, onDeviceAvailable/);
  assert.match(activity, /RecognizerIntent\.EXTRA_LANGUAGE, voiceLocale/);
  assert.match(activity, /LaunchedEffect\(Unit\)[\s\S]{0,120}beginCapture\(NexusVoiceMode\.SINGLE_TURN\)/);
  assert.doesNotMatch(activity, /LaunchedEffect\(instantSubmit\)/, 'Recomposition must not restart the microphone');
  assert.match(activity, /if \(inlineState != null\) return/, 'Inline voice must keep the existing core, without a second dialog');
  assert.match(activity, /if \(instantSubmit != null\) instantSubmit\(value\)/);
  assert.match(activity, /dispatch\("voiceSend", phrase\)/);
  assert.match(activity, /event == Lifecycle\.Event\.ON_STOP\) haltCapture\(false, false\)/);
  assert.match(activity, /handler\.removeCallbacksAndMessages\(null\)/);
  assert.match(activity, /sessionGeneration == expectedGeneration/);
  assert.doesNotMatch(manifest, /<receiver|FOREGROUND_SERVICE_MICROPHONE/, 'nessuna wake word con ascolto nascosto in background');
  assert.match(manifest, /android.permission.BIND_VOICE_INTERACTION/);
  assert.match(activity, /"stopSpeech" -> stopAllSpeech\(\)/, 'aprire la cattura deve interrompere subito sia la voce server sia il fallback locale');
  assert.match(activity, /speechConnection\?\.disconnect\(\)/);
  assert.match(activity, /EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS/, 'il VAD del recognizer deve chiudere una frase con un endpoint esplicito');
  assert.match(activity, /lastCommittedPhrase/);
  assert.match(activity, /now - lastCommittedAt < 4_000L/);
  assert.match(activity, /draftNormalized\.endsWith\(normalized\)/);
  assert.match(activity, /coerceAtMost\(2_400L\)/);
});

test('il risveglio Android usa soltanto un relay Tailscale autenticato e un ticket approvato', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /private const val WAKE_RELAY_PROTOCOL_VERSION = 1/);
  assert.match(activity, /private fun trustedWakeRelayEndpoint/);
  assert.match(activity, /host\.endsWith\("\.ts\.net"\)/);
  assert.match(activity, /explicitWakeRelayDescriptor\(status\)/, 'il descriptor deve provenire dallo status letto con bearer, non da input utente');
  assert.match(activity, /wake\.optInt\("protocolVersion", 0\) != WAKE_RELAY_PROTOCOL_VERSION/);
  assert.match(activity, /explicitWakeRelayDescriptor\(status\)\?\.let\(::applyWakeRelayDescriptor\)[\s\S]*?: clearWakeRelayAdvertisement\(\)/, 'rimuovere la capability dallo status autenticato deve revocare la superficie locale');
  assert.match(activity, /private fun clearWakeRelayAdvertisement\(\)[\s\S]*secureTokens\.clear\("wakeToken"\)[\s\S]*secureTokens\.clear\("wakeRelayEndpoint"\)/);
  assert.match(activity, /secureTokens\.write\("wakeRelayEndpoint", descriptor\.endpoint\)/);
  assert.match(activity, /secureTokens\.write\("wakeToken", token\)/);
  assert.match(activity, /put\("scope", "wake"\)/);
  assert.match(activity, /wakeGet\("\/api\/wake\/capabilities", token\)/);
  assert.match(activity, /requiresConfirmation/);
  assert.match(activity, /arbitraryDestinations/);
  assert.match(activity, /wakePost\("\/api\/wake\/plan"/);
  assert.match(activity, /wakePost\("\/api\/wake\/execute"/);
  assert.match(activity, /put\("approved", true\)/);
  assert.match(activity, /NexusAuthorizationKind\.WAKE/);
  assert.match(activity, /completeWakeAuthorization/);
  assert.match(activity, /wakeAwaiting = true/);
  assert.match(activity, /if \(state\.wakePairingAvailable \|\| state\.wakeAvailable\) WakeRelaySection/);
  assert.doesNotMatch(activity, /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i, 'il client non deve incorporare indirizzi MAC');
  assert.doesNotMatch(activity, /sendMagicPacket|DatagramSocket|DatagramPacket/, 'il client non invia Wake-on-LAN direttamente');
});

test('Work usa il modello approfondito soltanto per azioni o richieste sensibili', () => {
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(activity, /val workAction = Regex/);
  assert.match(activity, /sensitive\.containsMatchIn\(text\) \|\| \(state\.work && workAction\.containsMatchIn\(text\)\)/);
  assert.doesNotMatch(activity, /if \(state\.work \|\| sensitive\.containsMatchIn\(text\)\)/);
});

test('Console integra i segnali di sicurezza nei dettagli senza una pagina duplicata', () => {
  const activity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  const manifest = read('android/NexusConsole/app/src/main/AndroidManifest.xml');
  assert.match(activity, /if \(token\.isEmpty\(\)\) bootstrapConsole\(\); else restoreAuthenticatedScreen\(\)/);
  assert.match(activity, /if \(foreground\) restoreAuthenticatedScreen\(\)/);
  assert.match(activity, /lastSecuritySummary/);
  assert.doesNotMatch(activity, /Centro sicurezza|loadSecurityCenter|SCREEN_SECURITY/);
  assert.match(activity, /appendSecurityOverview\(specifications, lastSecuritySummary\)/);
  assert.match(activity, /infoRow\("Protezione"/);
  assert.match(activity, /infoRow\("Dispositivi autorizzati"/);
  assert.match(activity, /infoRow\("Avvisi 24 ore"/);
  assert.match(activity, /infoRow\("Ultimo evento"/);
  assert.match(activity, /updateSecurityOverview\(summary\)/, 'il refresh deve aggiornare il pannello tecnico senza ricostruire la dashboard');
  assert.match(activity, /private void returnToDashboard\(\)[\s\S]*lastDashboardSnapshot[\s\S]*renderDashboard\(lastDashboardSnapshot\)/, 'Indietro deve ripristinare subito la dashboard in cache');
  assert.match(activity, /paint\.setStrokeWidth\(getResources\(\)\.getDisplayMetrics\(\)\.density \* \.96f\)/, 'le icone operative devono usare un tratto leggero e coerente');
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
  assert.match(activity, /reverseContentTransition = true/);
  assert.match(activity, /content\.setTranslationX\(materialize \? 0f : reverse \? -dp\(NexusMotion\.CONTENT_TRAVEL_DP\) : dp\(NexusMotion\.CONTENT_TRAVEL_DP\)\)/);
  assert.match(activity, /materializationOverlay\.materialize\(\)/);
  assert.match(activity, /class MaterializationView extends View/);
  assert.match(activity, /cancel\.setOnClickListener\(v -> cancelPowerConfirmation\(\)\)/, 'Annulla deve usare lo stesso ritorno immediato del Back Android');
  assert.match(activity, /materializationOverlay\.materialize\(this::finishAfterTransition\)/, 'anche l uscita deve conservare la transizione particellare');
  assert.match(activity, /boolean materialize = materializeNextContent;/, 'la materializzazione deve valere per ogni cambio superficie');
});

test('la home Android riserva lo stato, sostituisce il turno e mostra soltanto attività reale', () => {
  const manifest = read('android/NexusRemote/app/src/main/AndroidManifest.xml');
  const activity = read('android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt');
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
  assert.match(activity, /padding\(top = 48\.dp\)/, 'il contenuto deve riservare lo spazio dello stato connessione');
  assert.match(activity, /targetState = exchangeGeneration/);
  assert.match(activity, /nexusExchangeTransform\(reduceMotion\)/);
  assert.match(activity, /if \(state\.busy\) state\.streaming/);
  assert.match(activity, /InstantReasoningPhase\(/);
  assert.match(activity, /label = activity\.ifBlank/);
  assert.doesNotMatch(activity, /Catena di pensiero|chain of thought/i);
});

test('transizioni mobile e gesture drawer restano fluide e coerenti', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.doesNotMatch(activity, /label = "nexusHomeMode"/, 'la home deve conservare lo stesso layer invece di sostituire due pagine');
  assert.match(activity, /SystemClock\.uptimeMillis\(\) % 1_800_000L/);
  assert.match(activity, /List\(104\)/);
  assert.match(activity, /drawerProgress = \(drawerProgress \+ delta \/ drawerWidthPx\)/);
  assert.doesNotMatch(activity, /closedDrawerActivationEdge|insideSafeSurface|canStartDrawer/, 'il drawer deve poter iniziare da qualsiasi punto orizzontale della scena');
  assert.match(activity, /if \(state\.modelSheet\) return@awaitEachGesture/);
  assert.match(activity, /val horizontalIntent = kotlin\.math\.abs\(totalX\) > kotlin\.math\.abs\(totalY\) \* 1\.2f/);
  assert.match(activity, /val validDirection = state\.drawer \|\| totalX > 0f/);
  assert.match(activity, /Box\(Modifier\.fillMaxSize\(\)\.pointerInput\(state\.drawer, state\.modelSheet, state\.hapticsEnabled\)/, 'il gesto deve coprire tutta la superficie utile, non una fascia verticale');
  assert.match(activity, /PredictiveBackHandler\(enabled = state\.drawer && !state\.modelSheet\)/, 'Back predittivo deve accompagnare il drawer');
  assert.match(activity, /drawerProgress = \(1f - event\.progress\)\.coerceIn\(0f, 1f\)/);
  assert.match(activity, /val detailBackAction = when/);
  assert.match(activity, /PredictiveBackHandler\(enabled = !state\.drawer && !state\.modelSheet && detailBackAction\.isBlank\(\) && state\.conversationSearchOpen\)/, 'la ricerca deve precedere la schermata nel back stack');
  assert.match(activity, /state\.screen != NexusScreen\.CHAT/, 'la chat deve restare l ultimo livello prima della Home Android');
  assert.match(activity, /private fun nexusScreenTransform\(back: Boolean/);
  assert.match(activity, /slideInHorizontally/);
  assert.match(activity, /slideOutHorizontally/);
  assert.match(activity, /delay\(if \(effectiveReduceMotion\) 1L else NexusFlow\.EXIT\.toLong\(\)\)[\s\S]*dispatch\(action, value\)/);
  assert.match(activity, /Surface\(color = Ink, contentColor = Ice, modifier = Modifier\.fillMaxSize\(\)\)/);
  assert.match(activity, /if \(state\.drawer \|\| motionSuspended\) return/);
  assert.match(activity, /rememberSaveable\(title, saver = androidx\.compose\.foundation\.ScrollState\.Saver\)/);
  assert.match(activity, /if \(maxWidth >= 700\.dp\) Row/);
  assert.match(activity, /val pressed by interaction\.collectIsPressedAsState\(\)/);
  assert.match(activity, /maxLines = if \(fontScale > 1\.3f\) Int\.MAX_VALUE else 2/);
  assert.match(activity, /targetState == NexusScreen\.CHAT && initialState != NexusScreen\.CHAT/);
  assert.match(activity, /thresholdHapticSent/);
  assert.match(activity, /private object NexusFlow/);
  assert.doesNotMatch(activity, /item \{ PendingQueueCard\(/, 'la coda non deve apparire come popup permanente nella conversazione');
  assert.match(activity, /reconcileAnsweredPendingRequests\(\)/);
  assert.match(activity, /private fun nexusLoopFloat\(/);
  assert.match(activity, /if \(!enabled\) return disabledValue/);
  assert.match(activity, /NexusFlow\.THINKING_PULSE, RepeatMode\.Reverse, "thinkingPulse"/);
  assert.match(activity, /drawCircle\(Cyan\.copy\(alpha = \.48f \+ energy \* \.46f\)/);
  assert.doesNotMatch(activity, /Text\("N", color = Color\(0xFF002223\)/);
  assert.match(activity, /if \(state\.streaming\.isBlank\(\)\) ThinkingIndicator/);
  assert.match(activity, /val ENTER = NexusMotion\.ENTER/);
  assert.match(activity, /val FADE_DELAY = NexusMotion\.FADE_DELAY/);
  assert.match(activity, /private fun nexusTransform[\s\S]*ContentTransform\(nexusEnter\(reduced\), nexusExit\(reduced\)/, 'le superfici di navigazione restano ancorate durante la dissolvenza');
  assert.match(activity, /private fun nexusExchangeTransform[\s\S]*slideInVertically[\s\S]*slideOutVertically/, 'solo il nuovo turno deve salire dal composer');
  assert.doesNotMatch(activity, /scaleIn|scaleOut/);
  assert.match(activity, /CompletableFuture\.supplyAsync/);
  assert.match(activity, /rememberReachable\(winner\)/);
  assert.match(activity, /ValueAnimator\.areAnimatorsEnabled\(\)/);
  assert.match(activity, /hapticsEnabled/);
  assert.match(activity, /Feedback aptico/);
  assert.match(activity, /val workExpanded = state\.work && imeVisible/);
  assert.doesNotMatch(activity, /val emptyCompact =/);
  assert.match(activity, /textAlign = androidx\.compose\.ui\.text\.style\.TextAlign\.Start/);
  assert.match(activity, /val composerExpanded = workExpanded \|\| measuredDraftLines > 1/);
  assert.match(activity, /val STREAM_FADE = NexusMotion\.STREAM_FADE/);
  assert.match(activity, /val COMPOSER_RESIZE = NexusMotion\.COMPOSER_RESIZE/);
  assert.match(activity, /getSystemService\(DisplayManager::class\.java\)\.getDisplay\(Display\.DEFAULT_DISPLAY\)/);
  assert.match(activity, /val uiFrameMs = if \(\(activeDisplay\?\.refreshRate \?: 60f\) >= 90f\) 11L else 16L/);
  assert.match(activity, /val bottomAnchor = remember \{ BringIntoViewRequester\(\) \}/);
  assert.match(activity, /if \(scrolling && movingBack\)|if \(scrolling\)[\s\S]*if \(movingBack\) autoFollow = false/);
  assert.match(activity, /bottomAnchor\.bringIntoView\(\)/);
  assert.doesNotMatch(activity, /state\.streaming\.length\)[\s\S]{0,180}scrollToItem/);
  assert.match(activity, /animationSpec = infiniteRepeatable\([\s\S]*repeatMode = repeatMode/);
  assert.doesNotMatch(activity, /infiniteRepeatable\(tween\(if \(reduceMotion\) NexusFlow\.REDUCED/);
  assert.match(activity, /MarkdownMessage\(liveTail, streamingTailChars = 10, streamingAccent = accent\.value\)/);
  assert.match(activity, /accent\.animateTo\(0f, tween\(NexusFlow\.STREAM_FADE/);
  assert.match(activity, /state = state\.copy\(temporary = true, work = false/);
  assert.match(activity, /onTextLayout = \{ layoutDraftLines = it\.lineCount\.coerceIn\(1, 10\) \}/);
  assert.match(activity, /delay\(90\)[\s\S]*layoutDraftLines < measuredDraftLines/);
  assert.match(activity, /val showDraftExpander = measuredDraftLines >= 5 \|\| state\.draft\.length >= 280/);
  assert.match(activity, /FullScreenDraftEditor\(state/);
  assert.match(activity, /Icons\.Rounded\.OpenInFull/);
  assert.match(activity, /workExpanded -> 112\.dp \+ \(\(measuredDraftLines - 1\) \* 22\)\.dp/);
  assert.match(activity, /contentAlignment = Alignment\.TopStart/);
  assert.match(activity, /label = "composerTextTop"/);
  assert.match(activity, /textAlign = androidx\.compose\.ui\.text\.style\.TextAlign\.Start/);
  assert.match(activity, /val voicePressed by voiceInteraction\.collectIsPressedAsState\(\)/);
  assert.match(activity, /IconButton\(voice, Modifier\.size\(48\.dp\)[\s\S]*Box\(Modifier\.size\(42\.dp\).*scaleX = voiceScale/);
  assert.match(activity, /if \(hapticsEnabled\) haptic\.performHapticFeedback/);
  assert.match(activity, /liveRegion = LiveRegionMode\.Polite/);
  assert.match(activity, /align\(Alignment\.BottomEnd\)\.offset \{ IntOffset\(0, with\(density\) \{ composerTrailingOffset\.roundToPx\(\) \}\) \}/);
  assert.match(activity, /offset \{ IntOffset\(with\(density\) \{ indicatorOffset\.roundToPx\(\) \}, 0\) \}/);
  assert.match(activity, /Surface\(color = Surface\.copy\(alpha = \.94f\)[\s\S]*Modifier\.size\(56\.dp\)/);
  assert.match(activity, /FilledIconButton\([\s\S]*modifier = Modifier\.size\(40\.dp\)/);
  assert.match(activity, /val compactHeight = with\(LocalDensity\.current\) \{ LocalWindowInfo\.current\.containerSize\.height\.toDp\(\) \} < 700\.dp \|\| metrics\.landscape/);
  assert.match(activity, /FlowRow\(Modifier\.fillMaxWidth\(\)\.padding\(top = 15\.dp\)/);
  assert.match(activity, /onFocusChanged \{ composerFocused = it\.isFocused \}/);
  assert.doesNotMatch(activity, /activeWorkComposer/);
  assert.match(activity, /composerExpanded -> 60\.dp \+ \(\(measuredDraftLines - 1\) \* 22\)\.dp/);
  assert.match(activity, /workExpanded -> 112\.dp \+ \(\(measuredDraftLines - 1\) \* 22\)\.dp/);
  assert.match(activity, /BackHandler\(imeVisible\)/);
  assert.match(activity, /else if \(imeWasVisible\)/, 'la chiusura dell’IME deve ricompattare Work anche con tastiere che conservano il focus');
  assert.doesNotMatch(activity, /else if \(imeWasVisible\)[\s\S]{0,260}delay\(60\)/, 'la chiusura non deve produrre un secondo assestamento ritardato');
  assert.match(activity, /val composerTextTop by animateDpAsState/);
  assert.match(activity, /StreamingMarkdownAccumulator/);
  assert.match(activity, /stablePrefix\.hashCode\(\)/);
  assert.match(activity, /persistStreamDiagnostics/);
  assert.match(activity, /stream\.lastFirstTextMs/);
  assert.match(activity, /stream\.lastTokensPerSecond/);
  assert.match(activity, /frameHealth\.recentSlowRatio/);
  assert.match(activity, /metrics\.adaptiveReducedMotion/);
  assert.match(activity, /val motionState = if \(effectiveReduceMotion/);
  assert.match(activity, /private fun nexusTransform/);
  assert.match(activity, /SizeTransform\(clip = false\)/);
  assert.match(activity, /AnimatedContent\(headerMode/);
  assert.match(activity, /label = "topBarMode"/);
  assert.match(activity, /transitionSpec = \{ nexusTransform\(/);
  assert.doesNotMatch(activity, /tween\([0-9]/);
  assert.doesNotMatch(activity, /spring\(/);
  assert.match(activity, /drawerSettleRequest\+\+/);
  assert.doesNotMatch(activity, /vertical = if \(imeVisible\) 5\.dp else 7\.dp/);
  assert.match(activity, /LaunchedEffect\(value\.length \/ 18\)/);
  assert.match(activity, /streamMatchesUi\(uiConversationId, uiTemporary, uiGeneration\)/);
  assert.match(activity, /generation != chatGeneration/);
  assert.match(activity, /"stop" -> \{[\s\S]{0,120}chatGeneration\+\+/);
  assert.match(activity, /private fun queueDraftPersistence\(conversationId: String, value: String\)/);
  assert.match(activity, /postDelayed\(persistDraftRunnable, 220L\)/);
  assert.match(activity, /private fun publishStreamUi\(conversationId: String, temporary: Boolean, generation: Long, text: String\)/);
  assert.match(activity, /pendingStreamUpdate\.set\(StreamUiUpdate/);
  assert.match(activity, /uiHandler\.post\(streamUiDrain\)/);
  assert.match(activity, /snapshotFlow \{ latestStreamingLength\.value \}/);
  assert.doesNotMatch(activity, /LaunchedEffect\(itemCount, state\.streaming\.length/);
  assert.match(activity, /val accessibilityLabel = nexusCopy\("NexusNXS sta rispondendo", "NexusNXS is responding"\)/);
  assert.match(activity, /clearAndSetSemantics \{ contentDescription = accessibilityLabel/);
  assert.doesNotMatch(activity, /settingsPreloaded/);
});

test('Attention Inbox usa solo stato locale esistente e rende chiari offline consensi e coda', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /private fun NexusUiState\.attentionCount\(\)/);
  assert.match(activity, /AttentionInboxScreen/);
  assert.match(activity, /AttentionDrawerItem\(state\.attentionCount\(\), state\.reduceMotion\)/);
  assert.match(activity, /Server NexusNXS non raggiungibili/);
  assert.match(activity, /Invio automatico alla riconnessione/);
  assert.match(activity, /"approveWork"/);
  assert.match(activity, /"approveWake"/);
  assert.match(activity, /"retryQueue"/);
  assert.doesNotMatch(activity, /AttentionInboxScreen[\s\S]{0,5000}openTrackedConnection|AttentionInboxScreen[\s\S]{0,5000}HttpURLConnection/, 'la Inbox non deve creare una nuova sorgente remota');
});

test('NexusNXS espone presenza reale, timeline Work e trasparenza delle risposte', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /enum class NexusPresence/);
  assert.match(activity, /private fun NexusUiState\.presence\(\)/);
  assert.match(activity, /nexusCopy\("Presenza NexusNXS", "NexusNXS presence"\) \+ " · \$\{presence\.label\(\)\}"/);
  assert.match(activity, /WorkPhaseTimeline/);
  assert.match(activity, /listOf\(nexusCopy\("Piano", "Plan"\), nexusCopy\("Autorizza", "Approve"\), nexusCopy\("Esegui", "Run"\), nexusCopy\("Verifica", "Verify"\)\)/);
  assert.match(activity, /Dettagli risposta/);
  assert.match(activity, /ResponseAction/);
  assert.match(activity, /TransparencyLine\(nexusCopy\("Elaborazione", "Processing"\)/);
  assert.match(activity, /Nessuna azione di sistema/);
});

test('NexusNXS per Android cifra le sessioni e trasferisce conversazioni al desktop senza duplicarle', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const secureStore = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'SecureTokenStore.java');
  const gateway = read('src', 'remote', 'remote-session-gateway.js');
  assert.match(activity, /continueConversationOnPc/);
  assert.match(activity, /\/api\/conversations\/import/);
  assert.match(activity, /Continua sul PC/);
  assert.match(activity, /secureTokens\.read\("remoteToken"\)/);
  assert.match(activity, /secureTokens\.write\("guestToken"/);
  assert.match(secureStore, /AndroidKeyStore/);
  assert.match(secureStore, /AES\/GCM\/NoPadding/);
  assert.match(gateway, /remoteSourceId/);
});

test('NexusNXS per Android cifra cronologia, misura i frame e mantiene private le notifiche', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  const codec = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'SecureChatCodec.java');
  const monitor = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'FrameHealthMonitor.java');
  assert.match(store, /super\(context, "nexusnxs-chats\.db", null, 6\)/);
  assert.match(store, /encryptExistingHistory/);
  assert.match(codec, /AES\/GCM\/NoPadding/);
  assert.match(codec, /AndroidKeyStore/);
  assert.match(monitor, /Choreographer\.FrameCallback/);
  assert.match(monitor, /DisplayManager/);
  assert.match(monitor, /slowFrameThresholdNanos = Math\.max\(12_000_000L, \(long\) \(\(1_000_000_000d \/ refreshRate\) \* 1\.5d\)\)/);
  assert.match(activity, /VISIBILITY_PRIVATE/);
  assert.match(activity, /La risposta è pronta nell’app\./);
  assert.doesNotMatch(activity, /setContentText\(answer/);
  assert.match(activity, /supportedModes\?\.maxOfOrNull \{ it\.refreshRate \}/);
  assert.match(activity, /refreshRate >= 90f/);
  assert.match(activity, /requestPermissions\(arrayOf\(android\.Manifest\.permission\.POST_NOTIFICATIONS\)/);
});

test('NexusNXS per Android conserva e mostra gli artefatti operativi senza trasformarsi in una web app', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  assert.match(activity, /data class WorkArtifact/);
  assert.match(activity, /WorkArtifactCard/);
  assert.match(activity, /optJSONArray\("artifacts"\)/);
  assert.match(store, /metadata TEXT NOT NULL DEFAULT/);
  assert.match(store, /addTurn\(String conversationId, String role, String content, String metadata\)/);
});

test('i token NexusNXS documentano una sola grammatica visiva desktop e mobile', () => {
  const tokens = JSON.parse(read('config', 'nexus-design-tokens.json'));
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.equal(tokens.colors.ink, '#020405');
  assert.equal(tokens.colors.cyan, '#4BE7E9');
  assert.equal(tokens.motion.modeEnterMs, 260);
  assert.equal(tokens.motion.modeExitMs, 180);
  assert.equal(tokens.motion.contentSwapMs, 320);
  assert.equal(tokens.motion.contentTravelDp, 16);
  assert.equal(tokens.typography.maximumFamilies, 2);
  assert.equal(tokens.cosmicGlass.fullPageGlass, false);
  assert.equal(tokens.qualityProfiles.reducedMotion.targetFps, 0);
  assert.equal(tokens.motion.quickMs, 170);
  assert.equal(tokens.motion.authority, 'android/shared-motion/src/main/java/local/nexus/motion/NexusMotion.java');
  assert.match(activity, /Color\(0xFF020405\)/);
  assert.match(activity, /Color\(0xFF4BE7E9\)/);
  assert.match(activity, /private object NexusFlow/);
  assert.deepEqual(tokens.motion.emphasizedCurve, [0.2, 0, 0, 1]);
});

test('ricerca privata e qualità degli effetti si adattano senza inviare contenuti', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  assert.match(activity, /store\.search\(value\)/);
  assert.match(activity, /frameHealth\.recentSlowRatio/);
  assert.match(activity, /frameScale/);
  assert.match(store, /public JSONArray search\(String query\)/);
  assert.match(store, /codec\.decrypt/);
  assert.doesNotMatch(store, /search\(String query\)[\s\S]*HttpURLConnection/);
});

test('NexusNXS riceve contenuti Android e offre attività, privacy e backup cifrato', () => {
  const manifest = read('android', 'NexusRemote', 'app', 'src', 'main', 'AndroidManifest.xml');
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  const store = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'LocalChatStore.java');
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(manifest, /android:mimeType="image\/\*"/);
  assert.match(activity, /handleIncomingIntent/);
  assert.match(activity, /NexusScreen\.ACTIVITY/);
  assert.match(activity, /Modalità privacy/);
  assert.match(activity, /ActivityResultContracts\.CreateDocument/);
  assert.match(store, /exportEncryptedArchive/);
  assert.match(store, /importEncryptedArchive/);
  assert.match(store, /codec\.encrypt\(archive\.toString\(\)\)/);
});

test('la diagnostica NexusNXS espone solo stato operativo e nessun contenuto privato', () => {
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(activity, /DiagnosticsDialog/);
  assert.match(activity, /Cifrate con Android Keystore/);
  assert.match(activity, /La diagnostica non legge né esporta il contenuto delle conversazioni/);
  assert.match(activity, /Riconnessione automatica/);
});

test('NexusNXS puo essere selezionato come assistente Android e apre subito la voce', () => {
  const manifest = read('android', 'NexusRemote', 'app', 'src', 'main', 'AndroidManifest.xml');
  const activity = read('android', 'NexusRemote', 'app', 'src', 'main', 'java', 'local', 'nexus', 'remote', 'NexusMainActivity.kt');
  assert.match(manifest, /android\.intent\.action\.ASSIST/);
  assert.match(activity, /incoming\.action == Intent\.ACTION_ASSIST/);
  assert.match(activity, /assistantInvocation = System\.currentTimeMillis\(\)/);
  assert.match(activity, /LaunchedEffect\(state\.assistantInvocation, interactionAvailable\)/);
  assert.match(activity, /if \(interactionAvailable\) voiceMode = true else dispatch\("probe", ""\)/);
});
