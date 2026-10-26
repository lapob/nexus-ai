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

test('la release separa i due client pubblici dalla Console privata', () => {
  const packageJson = JSON.parse(read('package.json'));
  const release = read('scripts', 'release-all.js');
  assert.match(packageJson.scripts['release:all'], /release-all\.js/);
  assert.match(release, /NexusNXS-Control\.apk/);
  assert.match(release, /release-manifest\.json/);
  assert.match(release, /release-manifest\.private\.json/);
  assert.match(release, /visibility: 'public'/);
  assert.match(release, /visibility: 'private-owner'/);
  assert.match(release, /--public-only/);
  assert.match(release, /--private-only/);
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
  assert.match(activity, /symbolPaths\.get\(name\)/, 'i vettori operativi devono essere riusati senza parsing ad ogni aggiornamento');
  assert.doesNotMatch(activity, /density \* \.96f/, 'la densità non deve essere applicata due volte al tratto');
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
  assert.match(activity, /reverseContentTransition = true/);
  assert.match(activity, /content\.setTranslationX\(materialize \? 0f : reverse \? -dp\(NexusMotion\.CONTENT_TRAVEL_DP\) : dp\(NexusMotion\.CONTENT_TRAVEL_DP\)\)/);
  assert.match(activity, /materializationOverlay\.materialize\(\)/);
  assert.match(activity, /class MaterializationView extends View/);
  assert.match(activity, /cancel\.setOnClickListener\(v -> cancelPowerConfirmation\(\)\)/, 'Annulla deve usare lo stesso ritorno immediato del Back Android');
  assert.match(activity, /getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/, 'il ritorno alla Home deve restare gestito da Android');
  assert.match(activity, /handleOnBackCancelled\(\)/, 'annullare il gesto deve ripristinare il contenuto');
  assert.match(activity, /boolean materialize = materializeNextContent;/, 'la materializzazione deve valere per ogni cambio superficie');
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
  assert.match(activity, /service\.addView\(services, wrapBlock\(\)\)/, 'la scheda servizi deve adattarsi a sessioni e font grandi senza tagliare righe');
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
  assert.match(activity, /String actionHint = enabled && !pending && open != null/);
  assert.match(activity, /setContentDescription\(label \+ ", " \+ status[\s\S]*?\+ actionHint\)/);
  assert.doesNotMatch(activity, /Aperta · tocca per chiudere|Chiusa · tocca per aprire/);
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
  assert.match(activity, /"supremo", "Supremo"/);
  assert.match(activity, /case "supremo": return "RemoteDesktop"/);
  assert.match(activity, /Aperta · UAC pronto/);
  assert.match(activity, /Chiusa · configura UAC sul PC/);
  assert.doesNotMatch(activity, /"settings", "Impostazioni", "settings"/);
  assert.match(activity, /import local\.nexus\.motion\.NexusMotion/);
  assert.match(activity, /new PathInterpolator\(NexusMotion\.EMPHASIZED_X1/);
  assert.match(activity, /content\.setAlpha\(materialize \? \.42f : NexusMotion\.CONTENT_START_ALPHA\)/);
  assert.match(consoleBuild, /shared-motion\/src\/main\/java/);
  assert.match(sharedMotion, /public static final int ENTER = 260/);
  assert.match(sharedMotion, /public static final int CONTENT_SWAP = 320/);
  assert.match(sharedMotion, /profileScale\(boolean lowRam, boolean powerSave, float refreshRate\)/);
  assert.doesNotMatch(activity, /motionDuration\([0-9]/, 'le durate della Console non devono tornare a essere valori sparsi');
  assert.match(activity, /NexusSymbolPaths\.path\(name\)/, 'le icone devono provenire dal catalogo vettoriale condiviso');
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

test('Control riduce il budget grafico con isteresi sui frame reali', () => {
  const privateMonitor = read('android/NexusConsole/app/src/main/java/local/nexus/console/FrameBudgetMonitor.java');
  const privateActivity = read('android/NexusConsole/app/src/main/java/local/nexus/console/NativeMainActivity.java');
  for (const monitor of [privateMonitor]) {
    assert.match(monitor, /Choreographer\.FrameCallback/);
    assert.match(monitor, /smoothedSlowRatio >= \.12f/);
    assert.match(monitor, /smoothedSlowRatio <= \.05f/);
    assert.match(monitor, /healthyWindows >= 3/);
    assert.match(monitor, /frameHealth\.constrained/);
  }
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
