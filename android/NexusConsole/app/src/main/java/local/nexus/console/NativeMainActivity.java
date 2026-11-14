package local.nexus.console;

import local.nexus.console.ui.ControlCoreView;
import local.nexus.console.ui.Motion;
import local.nexus.console.ui.NexusUi;
import local.nexus.motion.NexusSystemBars;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;

import org.json.JSONObject;

/**
 * Centro di comando privato per monitorare e controllare la workstation NexusNXS.
 *
 * L'Activity coordina soltanto: ciclo di vita, macchina a stati delle
 * schermate (connessione → dashboard ↔ conferma, varco offline), navigazione
 * Indietro, telemetria e riconnessione. Il resto vive in classi dedicate:
 * <ul>
 *   <li>{@link ConsoleSession}: token cifrato e ruotato, firme hardware, HTTPS;</li>
 *   <li>{@link LiveTelemetry}: flusso eventi autenticato in primo piano;</li>
 *   <li>{@link ConsoleShell}: finestra edge-to-edge, transizioni, dock;</li>
 *   <li>{@link DashboardScreen} con Panoramica, Sistema, App ({@link DesktopApps}) e Servizi;</li>
 *   <li>{@link PowerConfirmations} e {@link OfflineGate}: comandi sensibili e varco;</li>
 *   <li>pacchetto {@code ui}: kit visivo, viste disegnate e profilo di movimento.</li>
 * </ul>
 */
public final class NativeMainActivity extends androidx.activity.ComponentActivity implements
        ConsoleSession.Host, ConsoleShell.Host, DashboardScreen.Host, DesktopApps.Host, LiveTelemetry.Listener {
    static final int SCREEN_CONNECTING = 0, SCREEN_DASHBOARD = 1, SCREEN_POWER = 3, SCREEN_OFFLINE = 4;
    private static final long LIVE_REFRESH_MS = 750L;

    private volatile boolean destroyed;
    private volatile boolean foreground;
    private volatile int currentScreen = SCREEN_CONNECTING;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Motion motion = new Motion(() -> !destroyed && foreground);
    private NexusUi ui;
    private ConsoleSession session;
    private LiveTelemetry live;
    private ConsoleShell shell;
    private DashboardScreen dashboard;
    private DesktopApps apps;
    private OfflineGate gate;
    private PowerConfirmations power;
    private DeviceAuthenticator authenticator;
    private OperationalAlerts alerts;
    private FrameBudgetMonitor frameBudgetMonitor;
    private OnBackPressedCallback backNavigation;
    private boolean dashboardVisible;
    private JSONObject lastSecuritySummary;
    private String visibleState = "";
    private int reconnectAttempt;
    private int lastCriticalCount = -1;
    private boolean materializeOnResume;
    private boolean telemetryInFlight;
    private boolean dashboardLoadInFlight;
    private boolean securityRefreshInFlight;
    private int telemetryFailures;
    private long lastTelemetryAt;
    private long lastSecurityAt;

    private final Runnable reconnect = () -> {
        if (destroyed || !foreground || session.rotationInFlight()) return;
        if (!session.signedIn()) session.bootstrapConsole(); else restoreAuthenticatedScreen();
    };
    private final Runnable refresh = () -> {
        if (!destroyed && foreground && !session.rotationInFlight() && currentScreen == SCREEN_DASHBOARD && session.signedIn()) refreshDashboard();
    };
    private final Runnable securityRefresh = () -> {
        if (destroyed || !session.signedIn() || !foreground || securityRefreshInFlight) return;
        if (session.rotationInFlight()) { scheduleSecurityRefresh(); return; }
        securityRefreshInFlight = true;
        session.request("GET", "/api/security/summary", null, true, summary -> {
            securityRefreshInFlight = false;
            JSONObject counts = summary.optJSONObject("counts");
            int critical = counts == null ? 0 : counts.optInt("critical");
            if (lastCriticalCount >= 0 && critical > lastCriticalCount) alerts.notifyUser("security", "Nuovo evento critico da verificare");
            lastCriticalCount = critical;
            lastSecuritySummary = summary;
            lastSecurityAt = System.currentTimeMillis();
            if (currentScreen == SCREEN_DASHBOARD) dashboard.updateSecurityOverview(summary);
            scheduleSecurityRefresh();
        }, true, () -> {
            securityRefreshInFlight = false;
            if (currentScreen == SCREEN_DASHBOARD && lastSecurityAt == 0) dashboard.showSecurityUnavailable();
            scheduleSecurityRefresh();
        });
    };

    private void scheduleSecurityRefresh() {
        main.removeCallbacks(securityRefresh);
        if (!destroyed && foreground) main.postDelayed(securityRefresh, 15_000);
    }

    private final ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) {
            reconnectAttempt = 0;
            main.postDelayed(() -> {
                if (destroyed || !foreground) return;
                if (session.rotationInFlight()) return;
                if (currentScreen == SCREEN_DASHBOARD && dashboardVisible) main.post(refresh);
                // Una variazione di rete non deve chiudere la conferma di un
                // comando né sovrascrivere il ritorno dall'autenticazione.
                else if (currentScreen != SCREEN_POWER) reconnect.run();
            }, 180);
        }
        @Override public void onLost(Network network) {
            main.postDelayed(() -> {
                if (destroyed || !foreground) return;
                ConnectivityManager manager = getSystemService(ConnectivityManager.class);
                Network active = manager.getActiveNetwork();
                NetworkCapabilities capabilities = active == null ? null : manager.getNetworkCapabilities(active);
                if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) showOffline();
            }, 250);
        }
    };

    // #region Ciclo di vita

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        // onCreate costruisce gia la prima superficie visibile; onPause resta il
        // confine che arresta clock e richieste ricorrenti in background.
        foreground = true;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        NexusSystemBars.applyFrosted(getWindow());
        configureMotionProfile();
        frameBudgetMonitor = new FrameBudgetMonitor(this, (constrained, slowRatio) -> {
            if (motion.setFrameConstrained(constrained) && shell != null) shell.invalidateMotion();
        });
        SharedPreferences preferences = getPreferences(MODE_PRIVATE);
        ui = new NexusUi(this, motion);
        alerts = new OperationalAlerts(this);
        alerts.prepareNotifications();
        session = new ConsoleSession(this, preferences, this);
        live = new LiveTelemetry(session, this, this);
        authenticator = new DeviceAuthenticator(this);
        SafeActionHistory history = new SafeActionHistory(this, preferences);
        power = new PowerConfirmations(this, ui, session, authenticator, history, alerts);
        shell = new ConsoleShell(this, ui, power.powerActions(), this);
        power.attach(shell);
        apps = new DesktopApps(ui, session, history, main, this);
        dashboard = new DashboardScreen(shell, ui, preferences, apps, history, power::planServerStop, this);
        dashboard.restoreNavigation();
        gate = new OfflineGate(this, shell, ui, session, authenticator, main);
        setContentView(shell.root);
        registerSystemBackNavigation();
        getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(networkCallback);
        showConnecting();
        main.postDelayed(securityRefresh, 3_000);
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        ConsoleNotifications.appInForeground = true;
        NotificationWatchJob.cancel(this);
        consumeNotificationLink(getIntent());
        if (frameBudgetMonitor != null) frameBudgetMonitor.start();
        if (materializeOnResume) {
            materializeOnResume = false;
            shell.materializeNow();
        }
        if (session.rotateSessionIfDue(this::resumeForegroundRefreshes)) return;
        resumeForegroundRefreshes();
    }

    private void resumeForegroundRefreshes() {
        if (destroyed || !foreground || session.rotationInFlight()) return;
        // Il dialog credenziali mette in pausa l'Activity. Al ritorno la
        // conferma e il ticket devono restare validi finché l'esecuzione non
        // termina o l'utente annulla esplicitamente.
        if (currentScreen == SCREEN_POWER) return;
        if (!session.signedIn()) main.post(reconnect);
        else if (currentScreen == SCREEN_DASHBOARD && dashboardVisible) {
            main.removeCallbacks(refresh);
            startLiveTelemetry();
            main.post(refresh);
        }
        else main.post(reconnect);
        if (session.signedIn()) main.post(securityRefresh);
        if (session.signedIn()) syncNotificationCursor();
    }

    /**
     * Allinea il cursore eventi al ritorno in primo piano: una risposta pronta
     * non va più notificata, un consenso ancora aperto sì.
     */
    private void syncNotificationCursor() {
        long cursor = ConsoleNotifications.cursor(this);
        String instance = ConsoleNotifications.instance(this);
        String path = cursor >= 0 && !instance.isEmpty()
            ? "/api/notifications/events?since=" + cursor + "&instance=" + Uri.encode(instance)
            : "/api/notifications/events";
        session.request("GET", path, null, true, result -> ConsoleNotifications.deliver(this, result, true), true);
    }

    private void consumeNotificationLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (!ConsoleNotifications.isKnownLink(data)) return;
        intent.setData(null);
        boolean consent = ConsoleNotifications.LINK_CONSENT.equals(data.toString());
        if (!consent) ConsoleNotifications.cancelResponse(this);
        Toast.makeText(this, consent
            ? "Un'azione di NexusNXS attende la tua conferma dove l'hai avviata."
            : "Risposta pronta: la trovi nella conversazione NexusNXS.", Toast.LENGTH_LONG).show();
    }

    @Override protected void onPause() {
        dashboard.persistNavigation();
        foreground = false;
        ConsoleNotifications.appInForeground = false;
        // Ascolto in background a bassa frequenza: solo con sessione e permesso.
        if (session.signedIn() && !isChangingConfigurations()) NotificationWatchJob.start(this);
        materializeOnResume = !isFinishing();
        if (frameBudgetMonitor != null) frameBudgetMonitor.stop();
        stopLiveTelemetry();
        main.removeCallbacks(refresh);
        main.removeCallbacks(securityRefresh);
        shell.settleContent();
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        reconnect.run();
    }

    @Override public void onConfigurationChanged(android.content.res.Configuration configuration) {
        dashboard.rememberDashboardPosition();
        super.onConfigurationChanged(configuration);
        configureMotionProfile();
        if (frameBudgetMonitor != null) frameBudgetMonitor.refreshBudget();
        if (!destroyed && foreground && dashboardVisible && currentScreen == SCREEN_DASHBOARD && dashboard.snapshot() != null) {
            JSONObject lastDashboardSnapshot = dashboard.snapshot();
            shell.swapContent(() -> renderDashboard(lastDashboardSnapshot));
            apps.refreshDesktopControlStatus(true);
        }
    }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        authenticator.handleResult(requestCode, resultCode);
    }

    @Override protected void onDestroy() {
        destroyed = true;
        if (frameBudgetMonitor != null) frameBudgetMonitor.stop();
        stopLiveTelemetry();
        authenticator.cancelPending();
        main.removeCallbacksAndMessages(null);
        try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { }
        session.shutdown();
        live.shutdown();
        super.onDestroy();
    }

    /** RAM ridotta, risparmio energetico e frequenza dello schermo scelgono il profilo di movimento. */
    private void configureMotionProfile() {
        motion.configure(this, frameBudgetMonitor != null && frameBudgetMonitor.isConstrained());
    }

    // #endregion

    // #region Navigazione Indietro

    private void registerSystemBackNavigation() {
        backNavigation = new OnBackPressedCallback(false) {
            @Override public void handleOnBackStarted(BackEventCompat event) {
                shell.content.animate().cancel();
            }
            @Override public void handleOnBackProgressed(BackEventCompat event) {
                float progress = Math.max(0f, Math.min(1f, event.getProgress()));
                shell.backProgress(progress, event.getSwipeEdge() == BackEventCompat.EDGE_LEFT);
            }
            @Override public void handleOnBackCancelled() {
                shell.backCancelled();
            }
            @Override public void handleOnBackPressed() {
                shell.settleContent();
                navigateBack();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backNavigation);
        updateBackNavigation();
    }

    private void updateBackNavigation() {
        if (backNavigation != null) backNavigation.setEnabled(currentScreen == SCREEN_POWER
            || (currentScreen == SCREEN_DASHBOARD && !dashboard.atHome()));
    }

    private void navigateBack() {
        if (currentScreen == SCREEN_POWER) {
            cancelPowerConfirmation();
            return;
        }
        if (currentScreen == SCREEN_DASHBOARD && !dashboard.atHome()) {
            dashboard.selectDashboardSection(DashboardScreen.HOME);
            return;
        }
        // Dalla Panoramica il ritorno alla Home resta gestito da Android.
        backNavigation.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (shell != null && shell.routeDockScroll(event, currentScreen == SCREEN_DASHBOARD, super::dispatchTouchEvent)) return true;
        return super.dispatchTouchEvent(event);
    }

    // #endregion

    // #region Schermate

    private void showConnecting() {
        dashboard.rememberDashboardPosition();
        currentScreen = SCREEN_CONNECTING;
        dashboardVisible = false;
        shell.materializeNext();
        shell.swapContent(() -> {
            shell.content.setGravity(Gravity.CENTER);
            ControlCoreView core = new ControlCoreView(this, motion, false);
            core.setContentDescription("Connessione privata in corso");
            shell.content.addView(core, new LinearLayout.LayoutParams(-1, ui.dp(190)));
        });
        setState("Connessione…", false);
    }

    /** Ripristina una superficie consultiva dopo bootstrap o cambio rete. */
    private void restoreAuthenticatedScreen() {
        if (destroyed || !foreground) return;
        loadDashboard();
    }

    private void loadDashboard() {
        currentScreen = SCREEN_DASHBOARD;
        if (dashboardLoadInFlight || telemetryInFlight) return;
        dashboardLoadInFlight = true;
        setState("Aggiornamento…", false);
        session.request("GET", "/api/system/telemetry", null, true, snapshot -> {
            dashboardLoadInFlight = false;
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            showDashboard(snapshot);
        }, false, () -> dashboardLoadInFlight = false);
    }

    private void showDashboard(JSONObject snapshot) {
        if (currentScreen != SCREEN_DASHBOARD) return;
        boolean firstVisibleDashboard = !dashboardVisible;
        main.removeCallbacks(refresh);
        dashboardVisible = true;
        telemetryFailures = 0;
        lastTelemetryAt = System.currentTimeMillis();
        reconnectAttempt = 0;
        setState("Online", false);
        if (firstVisibleDashboard) shell.materializeNext();
        shell.swapContent(() -> renderDashboard(snapshot));
        apps.refreshDesktopControlStatus(true);
        startLiveTelemetry();
        if (!live.isActive()) main.postDelayed(refresh, LIVE_REFRESH_MS);
    }

    private void renderDashboard(JSONObject snapshot) {
        dashboard.render(snapshot, lastSecuritySummary);
    }

    /** Ritorno istantaneo da una conferma: la dashboard in cache, poi i dati freschi. */
    private void returnToDashboard() {
        currentScreen = SCREEN_DASHBOARD;
        securityRefreshInFlight = false;
        JSONObject lastDashboardSnapshot = dashboard.snapshot();
        if (lastDashboardSnapshot == null) { loadDashboard(); return; }
        dashboardVisible = true;
        setState("Online", false);
        shell.materializeNext();
        shell.swapContent(() -> renderDashboard(lastDashboardSnapshot));
        apps.refreshDesktopControlStatus(true);
        startLiveTelemetry();
        main.removeCallbacks(refresh);
        main.post(refresh);
    }

    /** Annulla una conferma (pulsante Annulla o Indietro): stesso ritorno immediato. */
    void cancelPowerConfirmation() {
        shell.reverseNext();
        shell.materializeNext();
        authenticator.cancelPending();
        main.removeCallbacks(securityRefresh);
        main.removeCallbacks(refresh);
        returnToDashboard();
    }

    /** Da qui in poi una conferma è in preparazione: telemetria e dock in pausa. */
    void enterCommandScreen() {
        dashboard.rememberDashboardPosition();
        currentScreen = SCREEN_POWER;
        dashboardVisible = false;
        main.removeCallbacks(refresh);
        setState("Preparazione…", false);
    }

    /**
     * Varco offline: con server o PC persi la dashboard (e con essa ogni
     * comando) lascia il posto al varco, che distingue i due casi.
     */
    void showOffline() {
        dashboard.rememberDashboardPosition();
        if (destroyed || !foreground) return;
        boolean enteringOffline = currentScreen != SCREEN_OFFLINE;
        stopLiveTelemetry();
        main.removeCallbacks(refresh);
        dashboardVisible = false;
        telemetryInFlight = false;
        currentScreen = SCREEN_OFFLINE;
        main.removeCallbacks(reconnect);
        setState("Offline", true);
        if (enteringOffline && !gate.isRendered()) shell.materializeNext();
        gate.show();
        scheduleReconnect();
    }

    void showOfflineAfter(long delayMs) {
        main.postDelayed(this::showOffline, delayMs);
    }

    // #endregion

    // #region Telemetria e riconnessione

    private void refreshDashboard() {
        if (telemetryInFlight || dashboardLoadInFlight || currentScreen != SCREEN_DASHBOARD || !foreground) return;
        telemetryInFlight = true;
        session.request("GET", "/api/system/telemetry", null, true, snapshot -> {
            telemetryInFlight = false;
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            if (dashboardVisible) updateDashboard(snapshot); else showDashboard(snapshot);
        }, true, this::handleTelemetryFailure);
    }

    private void handleTelemetryFailure() {
        telemetryInFlight = false;
        telemetryFailures++;
        // Server o PC persi: dopo pochi tentativi la dashboard (e con essa ogni
        // comando) lascia il posto al varco, che distingue i due casi.
        if (telemetryFailures >= 3 && currentScreen == SCREEN_DASHBOARD && foreground) {
            showOffline();
            return;
        }
        if (telemetryFailures >= 2 && currentScreen == SCREEN_DASHBOARD && foreground) {
            setState("Riconnessione…", true);
            dashboard.showStale(lastTelemetryAt);
        }
        if (currentScreen == SCREEN_DASHBOARD && foreground) main.postDelayed(refresh, 1500);
    }

    private void updateDashboard(JSONObject snapshot) {
        telemetryFailures = 0;
        lastTelemetryAt = System.currentTimeMillis();
        dashboard.update(snapshot);
        apps.refreshDesktopControlStatus(false);
        setState("Online", false);
        main.removeCallbacks(refresh);
        if (!live.isActive()) main.postDelayed(refresh, LIVE_REFRESH_MS);
    }

    private void startLiveTelemetry() { live.start(); }

    private void stopLiveTelemetry() { if (live != null) live.stop(); }

    private void scheduleReconnect() {
        main.removeCallbacks(reconnect);
        if (destroyed || !foreground) return;
        long base = Math.min(30_000L, 1_000L << Math.min(reconnectAttempt, 5));
        long jitter = Math.abs((long) android.os.Build.MODEL.hashCode()) % 450L;
        reconnectAttempt++;
        main.postDelayed(reconnect, base + jitter);
    }

    /** Riprova subito, azzerando il backoff (pulsante Riprova o server di nuovo online). */
    void reconnectNow() {
        main.removeCallbacks(reconnect);
        reconnectAttempt = 0;
        reconnect.run();
    }

    void reconnectAfter(long delayMs) {
        main.postDelayed(reconnect, delayMs);
    }

    // #endregion

    // #region Stato condiviso con le schermate

    int screen() { return currentScreen; }

    boolean isForegroundActive() { return foreground && !destroyed; }

    void setState(String value, boolean offline) {
        updateBackNavigation();
        boolean showDock = currentScreen == SCREEN_DASHBOARD && dashboardVisible;
        if (!showDock) shell.hideNavigation();
        shell.setDock(showDock, !offline && session.signedIn());
        String stateKey = value + ":" + offline;
        if (stateKey.equals(visibleState)) return;
        visibleState = stateKey;
    }

    @Override public void setState(String value) { setState(value, false); }

    @Override public boolean isForeground() { return foreground; }

    @Override public boolean isClosed() { return destroyed; }

    @Override public void runOnUi(Runnable action) {
        if (destroyed) return;
        runOnUiThread(() -> { if (!destroyed) action.run(); });
    }

    @Override public void onConnectionLost() { showOffline(); }

    @Override public void onSignedIn() { restoreAuthenticatedScreen(); }

    @Override public void onServerReachable() { reconnectAttempt = 0; }

    @Override public boolean dashboardShowing() { return currentScreen == SCREEN_DASHBOARD && dashboardVisible; }

    @Override public boolean onDashboardScreen() { return currentScreen == SCREEN_DASHBOARD; }

    @Override public void onSectionChanged() { updateBackNavigation(); }

    @Override public boolean onDashboard() { return foreground && currentScreen == SCREEN_DASHBOARD; }

    @Override public void onApplicationsChanged() { if (dashboard != null) dashboard.refreshCorePulse(); }

    @Override public boolean wantsLive() { return foreground && currentScreen == SCREEN_DASHBOARD; }

    @Override public void onSnapshot(JSONObject snapshot) {
        main.removeCallbacks(refresh);
        if (dashboardVisible) updateDashboard(snapshot); else showDashboard(snapshot);
    }

    @Override public void onNotifications(JSONObject batch) { ConsoleNotifications.deliver(this, batch, true); }

    @Override public void onStreamEnded() {
        if (foreground && currentScreen == SCREEN_DASHBOARD) {
            main.removeCallbacks(refresh);
            main.post(refresh);
            main.postDelayed(this::startLiveTelemetry, 2_500);
        }
    }

    // #endregion
}
