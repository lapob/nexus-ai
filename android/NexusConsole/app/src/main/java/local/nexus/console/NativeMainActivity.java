package local.nexus.console;

import local.nexus.motion.NexusMotion;
import local.nexus.motion.NexusSystemBars;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.StateListAnimator;
import android.animation.ValueAnimator;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.PathInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Date;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;

/** Centro di comando privato per monitorare e controllare la workstation NexusNXS. */
public final class NativeMainActivity extends androidx.activity.ComponentActivity {
    private static final int BG = Color.rgb(2, 4, 5);
    private static final int SURFACE = Color.rgb(18, 23, 24);
    private static final int TEXT = Color.rgb(247, 251, 251);
    private static final int MUTED = Color.rgb(171, 186, 187);
    private static final int ACCENT = Color.rgb(75, 231, 233);
    private static final int DANGER = Color.rgb(255, 154, 145);

    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private final ExecutorService liveEvents = Executors.newSingleThreadExecutor();
    private final Set<HttpURLConnection> activeConnections = ConcurrentHashMap.newKeySet();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private MaterializationView materializationOverlay;
    private View statusFrostOverlay;
    private int frostedStatusStep = -1;
    private volatile String token = "";
    private SecureTokenStore secureTokenStore;
    private DeviceIdentityStore deviceIdentityStore;
    private String serverUrl = "";
    private boolean destroyed;
    private boolean dashboardVisible;
    private static final int SCREEN_CONNECTING = 0, SCREEN_DASHBOARD = 1, SCREEN_POWER = 3, SCREEN_OFFLINE = 4;
    private static final int REQUEST_DEVICE_CREDENTIAL = 91;
    private volatile int currentScreen = SCREEN_CONNECTING;
    private boolean detailsExpanded = false;
    private JSONObject lastDashboardSnapshot;
    private JSONObject lastSecuritySummary;
    private String visibleState = "";
    private int reconnectAttempt;
    private int lastCriticalCount = -1;
    private int contentSwapGeneration;
    private boolean reverseContentTransition;
    private boolean materializeNextContent;
    private boolean materializeOnResume;
    private boolean telemetryInFlight;
    private boolean bootstrapInFlight;
    private boolean dashboardLoadInFlight;
    private boolean sessionRotationInFlight;
    private boolean securityRefreshInFlight;
    private boolean launchCommandInFlight;
    private boolean foregroundCommandLookupInFlight;
    private String pendingApplicationId = "";
    private boolean pendingApplicationOpening;
    private boolean presenceStatusInFlight;
    private volatile boolean foreground;
    private volatile boolean liveEventsRunning;
    private volatile boolean liveTelemetryActive;
    private volatile HttpURLConnection liveEventConnection;
    private volatile int liveEventGeneration;
    private int telemetryFailures;
    private long lastTelemetryAt;
    private long lastPresenceStatusAt;
    private long lastSecurityAt;
    private Runnable pendingAuthenticatedAction;
    private TextView recentActions;
    private Boolean nexusAppOpen;
    private Boolean chatGptAppOpen;
    private final Map<String, Boolean> applicationStates = new HashMap<>();
    private final Map<String, Boolean> applicationAvailability = new HashMap<>();
    private final Map<String, Boolean> applicationAdminReady = new HashMap<>();
    private float motionScale = 1f;
    private boolean lowMotionBudget;
    private boolean baselineLowMotionBudget;
    private FrameBudgetMonitor frameBudgetMonitor;
    private static final long LIVE_REFRESH_MS = 750L;
    private static final long PRESENCE_REFRESH_MS = 2_500L;
    private static final String SAFE_ACTION_HISTORY = "safeActionHistoryV1";
    private static final String NOTIFICATION_CHANNEL = "nexus_console_alerts";
    private static final int NOTIFICATION_SECURITY = 3101;
    private static final int NOTIFICATION_SERVER = 3102;
    private static final int NOTIFICATION_POWER = 3103;

    private final Runnable reconnect = () -> {
        if (destroyed || !foreground || sessionRotationInFlight) return;
        if (token.isEmpty()) bootstrapConsole(); else restoreAuthenticatedScreen();
    };
    private final Runnable refresh = () -> {
        if (!destroyed && foreground && !sessionRotationInFlight && currentScreen == SCREEN_DASHBOARD && !token.isEmpty()) refreshDashboard();
    };
    private final Runnable securityRefresh = () -> {
        if (destroyed || token.isEmpty() || !foreground || securityRefreshInFlight) return;
        if (sessionRotationInFlight) { scheduleSecurityRefresh(); return; }
        securityRefreshInFlight = true;
        request("GET", "/api/security/summary", null, true, summary -> {
            securityRefreshInFlight = false;
            JSONObject counts = summary.optJSONObject("counts");
            int critical = counts == null ? 0 : counts.optInt("critical");
            if (lastCriticalCount >= 0 && critical > lastCriticalCount) notifyUser("security", "Nuovo evento critico da verificare");
            lastCriticalCount = critical;
            lastSecuritySummary = summary;
            lastSecurityAt = System.currentTimeMillis();
            if (currentScreen == SCREEN_DASHBOARD) updateSecurityOverview(summary);
            scheduleSecurityRefresh();
        }, true, () -> {
            securityRefreshInFlight = false;
            if (currentScreen == SCREEN_DASHBOARD && lastSecurityAt == 0) setTaggedText("value:Protezione", "Verifica non disponibile");
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
                if (sessionRotationInFlight) return;
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
                if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) showOffline(null);
            }, 250);
        }
    };

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        // onCreate costruisce gia la prima superficie visibile; onPause resta il
        // confine che arresta clock e richieste ricorrenti in background.
        foreground = true;
        if (!BuildConfig.DEBUG) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        NexusSystemBars.applyFrosted(getWindow());
        configureMotionProfile();
        frameBudgetMonitor = new FrameBudgetMonitor(this, (constrained, slowRatio) -> {
            boolean nextBudget = baselineLowMotionBudget || constrained;
            if (lowMotionBudget != nextBudget) {
                lowMotionBudget = nextBudget;
                if (content != null) content.invalidate();
                if (materializationOverlay != null) materializationOverlay.invalidate();
            }
        });
        prepareNotifications();
        secureTokenStore = new SecureTokenStore(this);
        deviceIdentityStore = new DeviceIdentityStore(this);
        token = secureTokenStore.read();
        if (!token.isEmpty() && !getPreferences(MODE_PRIVATE).getBoolean("identityEnrolled", false)) {
            token = "";
            secureTokenStore.clear();
        }
        serverUrl = getPreferences(MODE_PRIVATE).getString("serverUrl", "");
        createShell();
        registerSystemBackNavigation();
        getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(networkCallback);
        showConnecting();
        main.postDelayed(securityRefresh, 3_000);
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (frameBudgetMonitor != null) frameBudgetMonitor.start();
        if (materializeOnResume && materializationOverlay != null) {
            materializeOnResume = false;
            materializationOverlay.materialize();
        }
        if (rotateSessionIfDue()) return;
        resumeForegroundRefreshes();
    }

    private void resumeForegroundRefreshes() {
        if (destroyed || !foreground || sessionRotationInFlight) return;
        // Il dialog credenziali mette in pausa l'Activity. Al ritorno la
        // conferma e il ticket devono restare validi finché l'esecuzione non
        // termina o l'utente annulla esplicitamente.
        if (currentScreen == SCREEN_POWER) return;
        if (token.isEmpty()) main.post(reconnect);
        else if (currentScreen == SCREEN_DASHBOARD && dashboardVisible) {
            main.removeCallbacks(refresh);
            startLiveTelemetry();
            main.post(refresh);
        }
        else main.post(reconnect);
        if (!token.isEmpty()) main.post(securityRefresh);
    }

    @Override protected void onPause() {
        foreground = false;
        materializeOnResume = !isFinishing();
        if (frameBudgetMonitor != null) frameBudgetMonitor.stop();
        stopLiveTelemetry();
        main.removeCallbacks(refresh);
        main.removeCallbacks(securityRefresh);
        content.animate().cancel();
        content.setAlpha(1f);
        content.setTranslationY(0f);
        content.setTranslationX(0f);
        content.setScaleX(1f);
        content.setScaleY(1f);
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        reconnect.run();
    }

    @Override public void onConfigurationChanged(android.content.res.Configuration configuration) {
        super.onConfigurationChanged(configuration);
        configureMotionProfile();
        if (frameBudgetMonitor != null) frameBudgetMonitor.refreshBudget();
        if (!destroyed && foreground && dashboardVisible && currentScreen == SCREEN_DASHBOARD && lastDashboardSnapshot != null) {
            swapContent(() -> renderDashboard(lastDashboardSnapshot));
            refreshDesktopControlStatus(true);
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_DEVICE_CREDENTIAL) {
            Runnable action = pendingAuthenticatedAction;
            pendingAuthenticatedAction = null;
            if (resultCode == RESULT_OK && action != null) action.run();
            return;
        }
    }

    private void registerSystemBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { navigateBack(); }
        });
    }

    private void navigateBack() {
        if (currentScreen == SCREEN_POWER) {
            cancelPowerConfirmation();
            return;
        }
        finishWithMaterialization();
    }

    private void createShell() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        // Lo spazio sicuro appartiene allo scroller, non alla finestra: con
        // clipToPadding disattivato il contenuto in movimento continua dietro
        // status e navigation bar, restando leggibile attraverso il velo Nexus.
        scroll.setClipToPadding(false);
        // Il vetro superiore cresce solo mentre del contenuto gli scorre
        // dietro. Ventiquattro livelli evitano invalidazioni ridondanti e
        // mantengono l'effetto continuo anche su GPU meno recenti.
        scroll.setOnScrollChangeListener((view, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            float progress = Math.min(1f, Math.max(0f, scrollY) / (float) dp(56));
            int step = Math.round(progress * 24f);
            if (step == frostedStatusStep) return;
            frostedStatusStep = step;
            updateStatusFrost(step / 24f);
        });
        updateStatusFrost(0f);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, 0);
        root.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(6), dp(18), dp(18));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        FrameLayout viewport = new FrameLayout(this);
        viewport.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        materializationOverlay = new MaterializationView();
        materializationOverlay.setVisibility(View.GONE);
        viewport.addView(materializationOverlay, new FrameLayout.LayoutParams(-1, -1));
        // Android 15 puo ignorare il colore della status bar nelle finestre
        // edge-to-edge. Un velo interno, non interattivo, mantiene quindi lo
        // stesso contrasto su ogni versione senza acquisire tocchi o focus.
        statusFrostOverlay = new View(this);
        statusFrostOverlay.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        statusFrostOverlay.setClickable(false);
        statusFrostOverlay.setFocusable(false);
        viewport.addView(statusFrostOverlay, new FrameLayout.LayoutParams(-1, 0, Gravity.TOP));
        updateStatusFrost(0f);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int horizontal = getResources().getDisplayMetrics().widthPixels < dp(360) ? dp(12) : dp(18);
            content.setPadding(horizontal, dp(6), horizontal, dp(18));
            int topInset = insets.getSystemWindowInsetTop();
            int bottomInset = insets.getSystemWindowInsetBottom();
            scroll.setPadding(0, dp(8) + topInset, 0, dp(10) + bottomInset);
            FrameLayout.LayoutParams frostParams = (FrameLayout.LayoutParams) statusFrostOverlay.getLayoutParams();
            frostParams.height = topInset + dp(14);
            statusFrostOverlay.setLayoutParams(frostParams);
            return insets;
        });
        root.addView(viewport, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void updateStatusFrost(float progress) {
        float clamped = Math.max(0f, Math.min(1f, progress));
        float eased = 1f - ((1f - clamped) * (1f - clamped));
        NexusSystemBars.updateFrostedStatus(getWindow(), eased);
        if (statusFrostOverlay == null) return;
        int topAlpha = Math.round(82f + (34f * eased));
        int edgeAlpha = Math.round(34f + (22f * eased));
        GradientDrawable veil = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.argb(topAlpha, 2, 6, 7), Color.argb(edgeAlpha, 2, 6, 7), Color.TRANSPARENT}
        );
        statusFrostOverlay.setBackground(veil);
    }

    private void showConnecting() {
        currentScreen = SCREEN_CONNECTING;
        dashboardVisible = false;
        materializeNextContent = true;
        swapContent(() -> {
            content.setGravity(Gravity.CENTER);
            ControlCoreView core = new ControlCoreView(false);
            core.setContentDescription("Connessione privata in corso");
            content.addView(core, new LinearLayout.LayoutParams(-1, dp(190)));
        });
        setState("Connessione…", false);
    }

    private void bootstrapConsole() {
        if (bootstrapInFlight || destroyed || !token.isEmpty()) return;
        bootstrapInFlight = true;
        JSONObject enrollment;
        try { enrollment = deviceIdentityStore.enrollment(); }
        catch (Exception error) { bootstrapInFlight = false; if (foreground) showOffline(null); return; }
        JSONObject bootstrapBody = json("deviceName", android.os.Build.MODEL);
        try { bootstrapBody.put("deviceIdentity", enrollment); }
        catch (Exception ignored) { bootstrapInFlight = false; return; }
        request("POST", "/api/console/bootstrap", bootstrapBody, false, result -> {
            bootstrapInFlight = false;
            token = result.optString("token");
            if (token.isEmpty()) { if (foreground) showOffline(null); return; }
            secureTokenStore.write(token);
            JSONObject identity = result.optJSONObject("identity");
            getPreferences(MODE_PRIVATE).edit().putBoolean("identityEnrolled", identity != null && identity.optBoolean("enrolled")).apply();
            getPreferences(MODE_PRIVATE).edit().putLong("tokenRotatedAt", System.currentTimeMillis()).apply();
            if (foreground) restoreAuthenticatedScreen();
        }, false, () -> bootstrapInFlight = false);
    }

    private boolean rotateSessionIfDue() {
        if (sessionRotationInFlight) return true;
        if (token.isEmpty() || System.currentTimeMillis() - getPreferences(MODE_PRIVATE).getLong("tokenRotatedAt", 0L) < 86_400_000L) return false;
        sessionRotationInFlight = true;
        request("POST", "/api/session/rotate", new JSONObject(), true, result -> {
            sessionRotationInFlight = false;
            String rotated = result.optString("token");
            if (!rotated.isEmpty()) {
                token = rotated;
                secureTokenStore.write(token);
                getPreferences(MODE_PRIVATE).edit().putLong("tokenRotatedAt", result.optLong("rotatedAt", System.currentTimeMillis())).apply();
            }
            resumeForegroundRefreshes();
        }, true, () -> { sessionRotationInFlight = false; resumeForegroundRefreshes(); });
        return true;
    }

    private void loadDashboard() {
        currentScreen = SCREEN_DASHBOARD;
        if (dashboardLoadInFlight || telemetryInFlight) return;
        dashboardLoadInFlight = true;
        setState("Aggiornamento…", false);
        request("GET", "/api/system/telemetry", null, true, snapshot -> {
            dashboardLoadInFlight = false;
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            showDashboard(snapshot);
        }, false, () -> dashboardLoadInFlight = false);
    }

    private void returnToDashboard() {
        currentScreen = SCREEN_DASHBOARD;
        securityRefreshInFlight = false;
        if (lastDashboardSnapshot == null) { loadDashboard(); return; }
        dashboardVisible = true;
        setState("Online", false);
        materializeNextContent = true;
        swapContent(() -> renderDashboard(lastDashboardSnapshot));
        refreshDesktopControlStatus(true);
        startLiveTelemetry();
        main.removeCallbacks(refresh);
        main.post(refresh);
    }

    private void refreshDashboard() {
        if (telemetryInFlight || dashboardLoadInFlight || currentScreen != SCREEN_DASHBOARD || !foreground) return;
        telemetryInFlight = true;
        request("GET", "/api/system/telemetry", null, true, snapshot -> {
            telemetryInFlight = false;
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            if (dashboardVisible) updateDashboard(snapshot); else showDashboard(snapshot);
        }, true, this::handleTelemetryFailure);
    }

    private void handleTelemetryFailure() {
        telemetryInFlight = false;
        telemetryFailures++;
        if (telemetryFailures >= 2 && currentScreen == SCREEN_DASHBOARD && foreground) {
            setState("Riconnessione…", true);
            setTaggedText("health-summary", "  Dati non aggiornati");
            setTaggedText("live-updated", "Ultimo aggiornamento · " + formatUpdated(lastTelemetryAt));
        }
        if (currentScreen == SCREEN_DASHBOARD && foreground) main.postDelayed(refresh, 1500);
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
        if (firstVisibleDashboard) materializeNextContent = true;
        swapContent(() -> renderDashboard(snapshot));
        refreshDesktopControlStatus(true);
        startLiveTelemetry();
        if (!liveTelemetryActive) main.postDelayed(refresh, LIVE_REFRESH_MS);
    }

    private void renderDashboard(JSONObject snapshot) {
        content.setGravity(Gravity.TOP);
        lastDashboardSnapshot = snapshot;
        recentActions = null;
        String host = workstationDisplayName(snapshot);
        JSONObject memory = snapshot.optJSONObject("memory");
        JSONObject cpu = snapshot.optJSONObject("cpu");
        JSONObject gpu = snapshot.optJSONObject("gpu");
        JSONObject activity = snapshot.optJSONObject("activity");
        JSONObject connection = snapshot.optJSONObject("network");
        JSONObject nexusService = snapshot.optJSONObject("nexusService");
        JSONObject performance = snapshot.optJSONObject("performance");

        TextView eyebrow = eyebrow("NODO OPERATIVO PRIVATO");
        TextView title = text(host, 30, TEXT);
        title.setTag("value:host");
        title.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        title.setPadding(0, dp(6), 0, dp(5));
        TextView detail = text("Acceso e raggiungibile", 15, MUTED);
        detail.setPadding(0, 0, 0, dp(22));
        content.addView(eyebrow);
        content.addView(title);
        content.addView(detail);

        LinearLayout presence = card();
        LinearLayout presenceRow = new LinearLayout(this);
        presenceRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView dot = text("●", 17, ACCENT);
        TextView online = text("  Tutto operativo", 16, TEXT);
        online.setTag("health-summary");
        online.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        presenceRow.addView(dot);
        presenceRow.addView(online);
        TextView updated = text("Dati in tempo reale · aggiornato ora", 13, MUTED);
        updated.setTag("live-updated");
        updated.setPadding(0, dp(7), 0, 0);
        TextView corePulse = text(corePulseSummary(nexusService), 12, Color.rgb(113, 143, 144));
        corePulse.setTag("core-pulse-detail");
        corePulse.setPadding(0, dp(5), 0, 0);
        presence.addView(presenceRow);
        presence.addView(updated);
        presence.addView(corePulse);
        content.addView(presence, block(dp(108)));
        breathe(dot);

        LinearLayout liveMetrics = new LinearLayout(this);
        liveMetrics.setOrientation(LinearLayout.HORIZONTAL);
        liveMetrics.addView(metricCard("CPU", cpu == null ? 0 : cpu.optInt("percent")), new LinearLayout.LayoutParams(0, dp(76), 1));
        liveMetrics.addView(metricCard("GPU", activity == null ? 0 : activity.optInt("gpuPercent")), spacedMetric());
        liveMetrics.addView(metricCard("RAM", memory == null ? 0 : memory.optInt("percent")), spacedMetric());
        content.addView(liveMetrics, block(dp(76)));

        LinearLayout services = card();
        TextView servicesTitle = text("Servizi NexusNXS", 16, TEXT);
        servicesTitle.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        servicesTitle.setPadding(0, 0, 0, dp(9));
        services.addView(servicesTitle);
        services.addView(infoRow("AI pubblica", nexusService != null && "online".equals(nexusService.optString("status")) ? "Operativa" : "Non disponibile"));
        services.addView(infoRow("Controllo privato", "Connesso"));
        JSONObject requests = nexusService == null ? null : nexusService.optJSONObject("requests");
        services.addView(divider());
        LinearLayout activityMetrics = new LinearLayout(this);
        activityMetrics.setOrientation(LinearLayout.HORIZONTAL);
        activityMetrics.setPadding(0, dp(12), 0, 0);
        activityMetrics.addView(serviceMetric("RICHIESTE", requestCount(requests), "requests"), new LinearLayout.LayoutParams(0, dp(68), 1));
        activityMetrics.addView(serviceMetric("SESSIONI", nexusService == null ? 0 : nexusService.optInt("anonymousSessions"), "sessions"), spacedServiceMetric());
        activityMetrics.addView(serviceMetric("STREAM LIVE", nexusService == null ? 0 : nexusService.optInt("connectedStreams"), "streams"), spacedServiceMetric());
        services.addView(activityMetrics);
        // Service values can wrap when the device uses a larger font scale.
        // Let the card measure its content instead of clipping the final rows.
        content.addView(services, wrapBlock());

        TextView quickActions = eyebrow("LE TUE APP");
        quickActions.setPadding(0, dp(16), 0, dp(9));
        content.addView(quickActions);
        content.addView(applicationGrid());
        content.addView(foregroundCloseAction(), block(dp(52)));
        content.addView(serverActions());

        LinearLayout history = card();
        TextView historyTitle = eyebrow("ULTIME OPERAZIONI");
        historyTitle.setPadding(0, 0, 0, dp(7));
        recentActions = text(readSafeActionHistory(), 12, MUTED);
        recentActions.setLineSpacing(dp(2), 1f);
        history.addView(historyTitle);
        history.addView(recentActions);
        content.addView(history, wrapBlock());

        applyDesktopControlState();

        TextView technical = eyebrow("DATI TECNICI");
        technical.setPadding(0, dp(16), 0, dp(9));
        content.addView(technical);

        LinearLayout specifications = card();
        specifications.setTag("technical-details");
        JSONObject windows = snapshot.optJSONObject("windows");
        String systemName = windows != null && !windows.optString("caption").isEmpty() ? windows.optString("caption") : platformName(snapshot.optString("platform"));
        specifications.addView(infoRow("Sistema", systemName));
        if (windows != null) specifications.addView(infoRow("Versione", windows.optString("version", snapshot.optString("release")) + " · build " + windows.optString("build", "—")));
        specifications.addView(infoRow("Architettura", snapshot.optString("architecture", "—").toUpperCase(Locale.ROOT)));
        specifications.addView(divider());
        specifications.addView(infoRow("CPU", cpu == null ? "Non rilevata" : cpu.optString("model", "CPU")));
        specifications.addView(infoRow("Core logici", cpu == null ? "—" : String.valueOf(cpu.optInt("logicalCores"))));
        if (cpu != null && cpu.optInt("speedMhz") > 0) specifications.addView(infoRow("Frequenza", cpu.optInt("speedMhz") + " MHz"));
        if (cpu != null) specifications.addView(infoRow("Utilizzo CPU", cpu.optInt("percent") + "%"));
        specifications.addView(divider());
        JSONArray gpus = snapshot.optJSONArray("gpus");
        if (gpus != null && gpus.length() > 0) {
            for (int index = 0; index < gpus.length(); index++) {
                JSONObject item = gpus.optJSONObject(index);
                if (item == null) continue;
                String suffix = item.optLong("memoryBytes") > 0 ? " · " + formatBytes(item.optLong("memoryBytes")) : "";
                specifications.addView(infoRow("GPU " + (index + 1), item.optString("name", "GPU") + suffix));
                if (!item.optString("driverVersion").isEmpty()) specifications.addView(infoRow("Driver GPU " + (index + 1), item.optString("driverVersion")));
            }
        } else {
            specifications.addView(infoRow("GPU", gpu != null && gpu.optBoolean("available") ? gpu.optString("name", "Disponibile") : "Non rilevata"));
        }
        if (activity != null) specifications.addView(infoRow("Utilizzo GPU", activity.optInt("gpuPercent") + "%"));
        specifications.addView(divider());
        specifications.addView(infoRow("RAM", memory == null ? "Non rilevata" : formatBytes(memory.optLong("usedBytes")) + " / " + formatBytes(memory.optLong("totalBytes"))));
        if (memory != null) specifications.addView(infoRow("RAM disponibile", formatBytes(memory.optLong("freeBytes"))));
        if (memory != null) specifications.addView(infoRow("Utilizzo RAM", memory.optInt("percent") + "%"));
        if (memory != null) specifications.addView(progress(memory.optInt("percent")));
        specifications.addView(divider());
        specifications.addView(infoRow("Rete", connection != null && connection.optBoolean("online") ? "Online · " + connection.optInt("interfaces") + " interfacce" : "Offline"));
        if (connection != null && connection.optJSONArray("addresses") != null) specifications.addView(infoRow("Indirizzi locali", join(connection.optJSONArray("addresses"))));
        if (activity != null) specifications.addView(infoRow("Traffico rete", formatRate(activity.optLong("networkBytesPerSecond"))));
        JSONArray disks = snapshot.optJSONArray("storage");
        if (disks != null && disks.length() > 0) {
            specifications.addView(divider());
            for (int index = 0; index < disks.length(); index++) {
                JSONObject disk = disks.optJSONObject(index);
                if (disk == null) continue;
                specifications.addView(infoRow("Unità " + disk.optString("name"), formatBytes(disk.optLong("freeBytes")) + " liberi / " + formatBytes(disk.optLong("totalBytes"))));
            }
        }
        if (activity != null) specifications.addView(infoRow("Attività dischi", activity.optInt("diskPercent") + "%"));
        JSONArray physicalDisks = snapshot.optJSONArray("physicalDisks");
        if (physicalDisks != null && physicalDisks.length() > 0) {
            specifications.addView(divider());
            for (int index = 0; index < physicalDisks.length(); index++) {
                JSONObject disk = physicalDisks.optJSONObject(index);
                if (disk == null) continue;
                String temperature = disk.isNull("temperatureCelsius") ? "" : " · " + disk.optInt("temperatureCelsius") + " °C";
                specifications.addView(infoRow("Disco fisico " + (index + 1), disk.optString("name") + " · " + translateHealth(disk.optString("health")) + temperature));
            }
        }
        specifications.addView(infoRow("Tempo di attività", formatUptime(snapshot.optLong("uptimeSeconds"))));
        specifications.addView(infoRow("Ultimo controllo", formatUpdated(snapshot.optLong("updatedAt"))));
        if (performance != null && performance.optInt("samples") > 0) {
            specifications.addView(divider());
            specifications.addView(infoRow("Richieste AI misurate", String.valueOf(performance.optInt("samples"))));
            specifications.addView(infoRow("Preparazione P95", performance.optInt("prepareP95Ms") + " ms"));
            specifications.addView(infoRow("Primo output P95", performance.optInt("firstTokenP95Ms") + " ms"));
            specifications.addView(infoRow("Inferenza P95", performance.optInt("inferenceP95Ms") + " ms"));
            specifications.addView(infoRow("Verifica P95", performance.optInt("verifyP95Ms") + " ms"));
        }
        specifications.addView(divider());
        appendSecurityOverview(specifications, lastSecuritySummary);
        content.addView(specifications);

        if (!detailsExpanded) specifications.setVisibility(View.GONE);
        Button details = button(detailsExpanded ? "Riduci dettagli" : "Mostra dettagli", false, false);
        details.setTag("details-toggle");
        details.setOnClickListener(v -> toggleDetails());
        content.addView(details, block(dp(48)));

        TextView trends = eyebrow("ULTIMO MINUTO");
        trends.setPadding(0, dp(18), 0, dp(8));
        content.addView(trends);
        LinearLayout charts = card();
        charts.addView(chartRow("CPU", cpu == null ? 0 : cpu.optInt("percent")));
        charts.addView(chartRow("GPU", activity == null ? 0 : activity.optInt("gpuPercent")));
        charts.addView(chartRow("RAM", memory == null ? 0 : memory.optInt("percent")));
        charts.addView(chartRow("DISCO", activity == null ? 0 : activity.optInt("diskPercent")));
        content.addView(charts);

        TextView section = eyebrow("CONTROLLO");
        section.setPadding(0, dp(14), 0, dp(10));
        content.addView(section);
        content.addView(powerActions());

    }

    private LinearLayout serverActions() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button verify = button("Verifica server", false, false);
        decorateButton(verify, "pulse", Color.rgb(142, 211, 211));
        verify.setOnClickListener(v -> verifyServer());
        Button stop = button("Arresta server", false, true);
        decorateButton(stop, "stop", Color.rgb(244, 193, 178));
        stop.setOnClickListener(v -> planServerStop());
        row.addView(verify, new LinearLayout.LayoutParams(0, dp(50), 1));
        row.addView(stop, spaced(1));
        return row;
    }

    private Button foregroundCloseAction() {
        Button close = button("Chiudi app in primo piano", false, false);
        close.setTag("foreground-close");
        close.setContentDescription("Chiudi sul PC l'ultima applicazione autorizzata lasciata in primo piano");
        decorateButton(close, "stop", Color.rgb(151, 190, 191));
        close.setOnClickListener(v -> closeForegroundApplication());
        return close;
    }

    private LinearLayout powerActions() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button restart = button("Riavvia", false, false);
        decorateButton(restart, "restart", Color.rgb(142, 211, 211));
        restart.setOnClickListener(v -> planPower("restart"));
        Button shutdown = button("Spegni", false, true);
        decorateButton(shutdown, "power", Color.rgb(244, 193, 178));
        shutdown.setOnClickListener(v -> planPower("shutdown"));
        row.addView(restart, new LinearLayout.LayoutParams(0, dp(58), 1));
        row.addView(shutdown, spaced(1));
        return row;
    }

    private void verifyServer() {
        setState("Verifica server…", false);
        request("GET", "/api/system/service", null, true, result -> {
            setState("Online", false);
            recordSafeAction("Server verificato");
            android.widget.Toast.makeText(this, "Server NexusNXS operativo", android.widget.Toast.LENGTH_SHORT).show();
        }, true, () -> {
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            // Una singola sonda puo scadere durante un cambio rete senza che il
            // PC sia realmente offline. La classificazione resta affidata al
            // ciclo telemetrico, che verifica piu campioni e si riconnette.
            setState("Riconnessione…", false);
            recordSafeAction("Verifica server non riuscita");
            android.widget.Toast.makeText(this, "Verifica non riuscita. La telemetria continua in background.", android.widget.Toast.LENGTH_SHORT).show();
            main.removeCallbacks(refresh);
            main.postDelayed(refresh, 750);
        });
    }

    private void openNexusNxs() {
        controlDesktopApp("open-full-app", "Apro NexusNXS…", "NexusNXS è già aperto", "NexusNXS aperto sul PC");
    }

    private void closeNexusNxs() {
        controlDesktopApp("close-full-app", "Chiudo NexusNXS…", "NexusNXS è già chiuso", "NexusNXS chiuso sul PC");
    }

    private void openChatGpt() {
        controlDesktopApp("open-chatgpt", "Apro ChatGPT sul PC…", "ChatGPT è già aperto", "ChatGPT aperto sul PC");
    }

    private void closeChatGpt() {
        controlDesktopApp("close-chatgpt", "Chiudo ChatGPT sul PC…", "ChatGPT è già chiuso", "ChatGPT chiuso sul PC");
    }

    private void closeForegroundApplication() {
        if (launchCommandInFlight || foregroundCommandLookupInFlight) {
            android.widget.Toast.makeText(this, "Comando già in corso", android.widget.Toast.LENGTH_SHORT).show();
            return;
        }
        foregroundCommandLookupInFlight = true;
        setForegroundCloseBusy(true);
        setState("Rilevo l’app in primo piano…", false);
        request("GET", "/api/presence/status", null, true, result -> {
            foregroundCommandLookupInFlight = false;
            setForegroundCloseBusy(false);
            String applicationId = result.optString("foregroundApplicationId");
            String label = foregroundApplicationLabel(result, applicationId);
            if (applicationId.isEmpty() || label.isEmpty()) {
                setState("Online", false);
                android.widget.Toast.makeText(this, "L’app in primo piano non è controllabile da NexusNXS", android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            controlDesktopApp("close-application", applicationId,
                "Chiudo " + label + "…", label + " è già chiusa", label + " chiusa sul PC");
        }, true, () -> {
            foregroundCommandLookupInFlight = false;
            setForegroundCloseBusy(false);
            setState("Online", false);
            android.widget.Toast.makeText(this, "Non riesco a rilevare l’app in primo piano", android.widget.Toast.LENGTH_SHORT).show();
        });
    }

    private String foregroundApplicationLabel(JSONObject status, String applicationId) {
        if (applicationId == null || applicationId.isEmpty()) return "";
        JSONArray applications = status.optJSONArray("applications");
        if (applications == null) return "";
        for (int index = 0; index < applications.length(); index++) {
            JSONObject application = applications.optJSONObject(index);
            if (application != null && applicationId.equals(application.optString("id"))
                && application.optBoolean("available") && "open".equals(application.optString("state"))) {
                return application.optString("label", applicationId);
            }
        }
        return "";
    }

    private void setForegroundCloseBusy(boolean busy) {
        View target = content == null ? null : content.findViewWithTag("foreground-close");
        if (!(target instanceof Button)) return;
        Button button = (Button) target;
        button.setEnabled(!busy && !launchCommandInFlight);
        button.setAlpha(button.isEnabled() ? 1f : .42f);
        button.setText(busy ? "Rilevo l’app in primo piano…" : "Chiudi app in primo piano");
    }

    private void controlCatalogApplication(String id, String label) {
        boolean open = Boolean.TRUE.equals(applicationStates.get(id));
        String action = open ? "close-application" : "open-application";
        controlDesktopApp(action, id,
            (open ? "Chiudo " : "Apro ") + label + "…",
            label + (open ? " è già chiusa" : " è già aperta"),
            label + (open ? " chiusa sul PC" : " aperta sul PC"));
    }

    private void controlDesktopApp(String action, String progress, String unchanged, String completed) {
        controlDesktopApp(action, "", progress, unchanged, completed);
    }

    private void controlDesktopApp(String action, String applicationId, String progress, String unchanged, String completed) {
        if (launchCommandInFlight) {
            android.widget.Toast.makeText(this, "Comando già in corso", android.widget.Toast.LENGTH_SHORT).show();
            return;
        }
        launchCommandInFlight = true;
        pendingApplicationId = applicationId.isEmpty() ? applicationIdForAction(action) : applicationId;
        pendingApplicationOpening = action.startsWith("open-");
        applyDesktopControlState();
        setState(progress, false);
        Runnable recover = () -> verifyDesktopCommandOutcome(action, applicationId, completed);
        JSONObject command = applicationId.isEmpty() ? json("action", action) : json("action", action, "applicationId", applicationId);
        requestCommandWithProof("presence-plan", "/api/presence/plan", command, plan -> {
            if (!plan.optBoolean("changed", true)) {
                finishDesktopCommand();
                setState("Online", false);
                updateDesktopControlState(action);
                if (!applicationId.isEmpty()) applicationStates.put(applicationId, "open-application".equals(action));
                recordSafeAction(unchanged);
                android.widget.Toast.makeText(this, unchanged, android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            JSONObject proposal = plan.optJSONObject("proposal");
            if (proposal == null || proposal.optString("id").isEmpty()) {
                finishDesktopCommand();
                setState("Online", false);
                return;
            }
            requestCommandWithProof("presence-execute", "/api/presence/execute",
                json("ticketId", proposal.optString("id"), "approved", true), result -> {
                    finishDesktopCommand();
                    setState("Online", false);
                    updateDesktopControlState(action);
                    if (!applicationId.isEmpty()) applicationStates.put(applicationId, "open-application".equals(action));
                    recordSafeAction(completed);
                    android.widget.Toast.makeText(this, completed, android.widget.Toast.LENGTH_SHORT).show();
                    refreshDesktopControlStatus(true);
                }, recover);
        }, recover);
    }

    private void verifyDesktopCommandOutcome(String action, String applicationId, String completed) {
        if (!foreground || currentScreen != SCREEN_DASHBOARD) { finishDesktopCommand(); return; }
        setState("Verifico il comando…", false);
        main.postDelayed(() -> request("GET", "/api/presence/status", null, true, result -> {
            boolean confirmed = desktopCommandMatches(result, action, applicationId);
            applyPresenceStatus(result);
            finishDesktopCommand();
            setState("Online", false);
            if (confirmed) {
                recordSafeAction(completed);
                android.widget.Toast.makeText(this, completed, android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            String operation = action.startsWith("open-") ? "apertura" : "chiusura";
            android.widget.Toast.makeText(this, "Impossibile confermare la " + operation + ". Riprova.", android.widget.Toast.LENGTH_SHORT).show();
        }, true, () -> {
            finishDesktopCommand();
            setState("Online", false);
            android.widget.Toast.makeText(this, "Verifica non disponibile. La connessione resta attiva.", android.widget.Toast.LENGTH_SHORT).show();
        }), 650);
    }

    private boolean desktopCommandMatches(JSONObject result, String action, String applicationId) {
        if (!result.optBoolean("available", false)) return false;
        boolean expectedOpen = action.startsWith("open-");
        if (action.endsWith("full-app")) return expectedOpen == "open".equals(result.optString("fullApp"));
        if (action.endsWith("chatgpt")) return expectedOpen == "open".equals(result.optString("chatGpt"));
        JSONArray applications = result.optJSONArray("applications");
        if (applications == null) return false;
        for (int index = 0; index < applications.length(); index++) {
            JSONObject application = applications.optJSONObject(index);
            if (application != null && applicationId.equals(application.optString("id"))) {
                return expectedOpen == "open".equals(application.optString("state"));
            }
        }
        return false;
    }

    private String applicationIdForAction(String action) {
        if (action.endsWith("full-app")) return "nexusnxs";
        if (action.endsWith("chatgpt")) return "chatgpt";
        return "";
    }

    private void finishDesktopCommand() {
        launchCommandInFlight = false;
        pendingApplicationId = "";
        applyDesktopControlState();
        setForegroundCloseBusy(false);
    }

    private void refreshDesktopControlStatus(boolean force) {
        long now = System.currentTimeMillis();
        if (presenceStatusInFlight || token.isEmpty() || currentScreen != SCREEN_DASHBOARD || !foreground) return;
        if (!force && now - lastPresenceStatusAt < PRESENCE_REFRESH_MS) return;
        presenceStatusInFlight = true;
        request("GET", "/api/presence/status", null, true, result -> {
            presenceStatusInFlight = false;
            lastPresenceStatusAt = System.currentTimeMillis();
            if (!foreground || currentScreen != SCREEN_DASHBOARD) return;
            applyPresenceStatus(result);
        }, true, () -> presenceStatusInFlight = false);
    }

    private void applyPresenceStatus(JSONObject result) {
        if (!result.optBoolean("available", false)) {
            nexusAppOpen = null;
            chatGptAppOpen = null;
            applicationStates.clear();
            applicationAvailability.clear();
            applicationAdminReady.clear();
        } else {
            nexusAppOpen = stateValue(result.optString("fullApp"));
            chatGptAppOpen = stateValue(result.optString("chatGpt"));
            applicationStates.clear();
            applicationAvailability.clear();
            applicationAdminReady.clear();
            JSONArray applications = result.optJSONArray("applications");
            if (applications != null) for (int index = 0; index < applications.length(); index++) {
                JSONObject application = applications.optJSONObject(index);
                if (application == null) continue;
                String id = application.optString("id");
                if (id.isEmpty()) continue;
                applicationStates.put(id, "open".equals(application.optString("state")));
                applicationAvailability.put(id, application.optBoolean("available"));
                if ("supremo".equals(id)) applicationAdminReady.put(id, application.optBoolean("adminReady"));
            }
        }
        applyDesktopControlState();
    }

    private Boolean stateValue(String value) {
        if ("open".equals(value)) return Boolean.TRUE;
        if ("closed".equals(value)) return Boolean.FALSE;
        return null;
    }

    private void updateDesktopControlState(String action) {
        if ("open-full-app".equals(action)) nexusAppOpen = Boolean.TRUE;
        else if ("close-full-app".equals(action)) nexusAppOpen = Boolean.FALSE;
        else if ("open-chatgpt".equals(action)) chatGptAppOpen = Boolean.TRUE;
        else if ("close-chatgpt".equals(action)) chatGptAppOpen = Boolean.FALSE;
        applyDesktopControlState();
    }

    private void applyDesktopControlState() {
        updateApplicationTile("nexusnxs", "NexusNXS", nexusAppOpen, true);
        updateApplicationTile("chatgpt", "ChatGPT", chatGptAppOpen, true);
        updateApplicationTile("brave", "Brave", applicationStates.get("brave"), applicationAvailability.get("brave"));
        updateApplicationTile("terminal", "Terminale", applicationStates.get("terminal"), applicationAvailability.get("terminal"));
        updateApplicationTile("supremo", "Supremo", applicationStates.get("supremo"), applicationAvailability.get("supremo"));
        updateApplicationTile("notepad", "Note", applicationStates.get("notepad"), applicationAvailability.get("notepad"));
        setTaggedText("core-pulse-detail", corePulseSummary(lastDashboardSnapshot == null ? null : lastDashboardSnapshot.optJSONObject("nexusService")));
    }

    private LinearLayout applicationGrid() {
        String[][] applications = new String[][] {
            { "nexusnxs", "NexusNXS", "nexus" }, { "chatgpt", "ChatGPT", "chat" },
            { "brave", "Brave", "browser" }, { "terminal", "Terminale", "terminal" },
            { "supremo", "Supremo", "supremo" }, { "notepad", "Note", "note" }
        };
        LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        boolean singleColumn = getResources().getConfiguration().screenWidthDp < 360
            || getResources().getConfiguration().fontScale >= 1.25f;
        int columns = singleColumn ? 1 : 2;
        for (int index = 0; index < applications.length; index += columns) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (int column = 0; column < columns && index + column < applications.length; column++) {
                String[] application = applications[index + column];
                LinearLayout.LayoutParams params = column == 0
                    ? new LinearLayout.LayoutParams(0, -2, 1)
                    : spacedApplicationTile();
                row.addView(applicationTile(application[0], application[1], application[2]), params);
            }
            grid.addView(row, wrapBlock());
        }
        return grid;
    }

    private Button applicationTile(String id, String label, String glyph) {
        Button tile = button("", false, false);
        tile.setTag("app-tile:" + id);
        tile.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        tile.setPadding(dp(16), dp(10), dp(12), dp(10));
        tile.setMinHeight(dp(80));
        tile.setTextSize(14);
        tile.setMaxLines(2);
        Drawable icon = new NexusGlyphDrawable(glyph, Color.rgb(151, 190, 191), dp(20));
        tile.setCompoundDrawables(icon, null, null, null);
        tile.setCompoundDrawablePadding(dp(12));
        tile.setContentDescription(label + ", stato in verifica");
        tile.setOnClickListener(v -> {
            if (launchCommandInFlight) return;
            Boolean open = "nexusnxs".equals(id) ? nexusAppOpen : "chatgpt".equals(id) ? chatGptAppOpen : applicationStates.get(id);
            if ("nexusnxs".equals(id)) { if (Boolean.TRUE.equals(open)) closeNexusNxs(); else openNexusNxs(); return; }
            if ("chatgpt".equals(id)) { if (Boolean.TRUE.equals(open)) closeChatGpt(); else openChatGpt(); return; }
            controlCatalogApplication(id, label);
        });
        updateApplicationTile(tile, id, label, null, true);
        return tile;
    }

    private void updateApplicationTile(String id, String label, Boolean open, Boolean available) {
        View target = content.findViewWithTag("app-tile:" + id);
        if (target instanceof Button) updateApplicationTile((Button) target, id, label, open, available);
    }

    private void updateApplicationTile(Button tile, String id, String label, Boolean open, Boolean available) {
        boolean pending = launchCommandInFlight && id.equals(pendingApplicationId);
        boolean enabled = !Boolean.FALSE.equals(available) && !launchCommandInFlight;
        boolean supremo = "supremo".equals(id);
        boolean adminReady = Boolean.TRUE.equals(applicationAdminReady.get(id));
        String status = pending ? (pendingApplicationOpening ? "Apertura…" : "Chiusura…")
            : Boolean.TRUE.equals(open) ? (supremo ? (adminReady ? "Aperta · UAC pronto" : "Aperta · UAC limitato") : "Aperta · tocca per chiudere")
            : Boolean.FALSE.equals(open) ? (supremo && !adminReady ? "Chiusa · configura UAC sul PC" : "Chiusa · tocca per aprire") : "Stato in verifica…";
        String next = label + "\n" + status;
        if (!next.contentEquals(tile.getText())) {
            SpannableString styled = new SpannableString(next);
            int statusStart = label.length() + 1;
            styled.setSpan(new RelativeSizeSpan(.78f), statusStart, next.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            styled.setSpan(new ForegroundColorSpan(pending || Boolean.TRUE.equals(open) ? ACCENT : MUTED), statusStart, next.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            tile.setText(styled);
        }
        tile.setEnabled(enabled);
        tile.setAlpha(enabled ? 1f : .42f);
        tile.setContentDescription(label + ", " + status.toLowerCase(Locale.getDefault()).replace("·", ""));
        int fill = Boolean.TRUE.equals(open) ? Color.rgb(6, 31, 32) : SURFACE;
        int stroke = Boolean.TRUE.equals(open) ? Color.argb(92, 101, 220, 216) : Color.argb(25, 128, 188, 190);
        GradientDrawable surface = rounded(fill, 19, stroke);
        tile.setBackground(new RippleDrawable(ColorStateList.valueOf(Color.argb(42, 109, 224, 221)), surface, null));
        tile.setTextColor(Boolean.TRUE.equals(open) ? Color.rgb(226, 247, 246) : Color.rgb(190, 211, 211));
        String glyph = "nexusnxs".equals(id) ? "nexus" : "chatgpt".equals(id) ? "chat" : id;
        Drawable icon = new NexusGlyphDrawable(glyph, Boolean.TRUE.equals(open) ? ACCENT : Color.rgb(151, 190, 191), dp(20));
        tile.setCompoundDrawables(icon, null, null, null);
        if (pending && animationsEnabled()) tile.animate().alpha(.58f).setDuration(motionDuration(NexusMotion.STATUS_PULSE)).withEndAction(() -> {
            if (launchCommandInFlight && id.equals(pendingApplicationId) && tile.isAttachedToWindow()) tile.animate().alpha(1f).setDuration(motionDuration(NexusMotion.STATUS_PULSE)).start();
        }).start();
    }

    private LinearLayout.LayoutParams spacedApplicationTile() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
        params.setMargins(dp(8), 0, 0, 0);
        return params;
    }

    private void recordSafeAction(String label) {
        SharedPreferences preferences = getPreferences(MODE_PRIVATE);
        JSONArray previous;
        try { previous = new JSONArray(preferences.getString(SAFE_ACTION_HISTORY, "[]")); }
        catch (Exception ignored) { previous = new JSONArray(); }
        JSONArray next = new JSONArray();
        JSONObject entry = new JSONObject();
        try {
            entry.put("label", label);
            entry.put("at", System.currentTimeMillis());
            next.put(entry);
            for (int index = 0; index < Math.min(previous.length(), 2); index++) next.put(previous.optJSONObject(index));
            preferences.edit().putString(SAFE_ACTION_HISTORY, next.toString()).apply();
        } catch (Exception ignored) { }
        if (recentActions != null) recentActions.setText(readSafeActionHistory());
    }

    private String readSafeActionHistory() {
        JSONArray history;
        try { history = new JSONArray(getPreferences(MODE_PRIVATE).getString(SAFE_ACTION_HISTORY, "[]")); }
        catch (Exception ignored) { history = new JSONArray(); }
        if (history.length() == 0) return "Nessuna operazione recente";
        StringBuilder text = new StringBuilder();
        for (int index = 0; index < Math.min(history.length(), 3); index++) {
            JSONObject entry = history.optJSONObject(index);
            if (entry == null) continue;
            if (text.length() > 0) text.append('\n');
            String time = android.text.format.DateFormat.getTimeFormat(this).format(new Date(entry.optLong("at")));
            text.append(entry.optString("label", "Operazione")).append("  ·  ").append(time);
        }
        return text.length() == 0 ? "Nessuna operazione recente" : text.toString();
    }

    /** Mantiene i segnali di sicurezza nel pannello tecnico, senza una pagina duplicata. */
    private void appendSecurityOverview(LinearLayout target, JSONObject summary) {
        target.addView(infoRow("Protezione", securityProtection(summary)));
        target.addView(infoRow("Dispositivi autorizzati", securityDeviceCount(summary)));
        target.addView(infoRow("Avvisi 24 ore", securityWarningCount(summary)));
        target.addView(infoRow("Ultimo evento", latestSecurityEvent(summary)));
        target.addView(infoRow("Registro locale", securityRegister(summary)));
    }

    private void updateSecurityOverview(JSONObject summary) {
        setTaggedText("value:Protezione", securityProtection(summary));
        setTaggedText("value:Dispositivi autorizzati", securityDeviceCount(summary));
        setTaggedText("value:Avvisi 24 ore", securityWarningCount(summary));
        setTaggedText("value:Ultimo evento", latestSecurityEvent(summary));
        setTaggedText("value:Registro locale", securityRegister(summary));
    }

    private String securityProtection(JSONObject summary) {
        if (summary == null) return "Verifica in corso";
        return "protected".equals(summary.optString("status", "protected")) && summary.optBoolean("integrity", false) ? "Protetta" : "Richiede attenzione";
    }

    private String securityDeviceCount(JSONObject summary) {
        JSONArray devices = summary == null ? null : summary.optJSONArray("devices");
        return devices == null ? "—" : String.valueOf(devices.length());
    }

    private String securityWarningCount(JSONObject summary) {
        JSONObject counts = summary == null ? null : summary.optJSONObject("counts");
        return counts == null ? "—" : String.valueOf(counts.optInt("warnings"));
    }

    private String securityRegister(JSONObject summary) {
        if (summary == null) return "Verifica in corso";
        return (summary.optBoolean("integrity", false) ? "Integro" : "Da verificare") + " · " + summary.optInt("retentionDays", 30) + " giorni";
    }

    private String latestSecurityEvent(JSONObject summary) {
        JSONArray events = summary == null ? null : summary.optJSONArray("events");
        JSONObject event = events == null ? null : events.optJSONObject(0);
        if (event == null) return "Nessuna anomalia";
        return securityEventLabel(event.optString("type")) + " · " + formatUpdated(event.optLong("at"));
    }

    private String securityEventLabel(String type) {
        switch (type) {
            case "device.paired": return "Dispositivo associato";
            case "device.revoked": return "Accesso revocato";
            case "pairing.failed": return "Associazione rifiutata";
            case "authentication.denied": return "Accesso rifiutato";
            case "request.rate_limited": return "Traffico limitato";
            case "console.bootstrap.denied": return "Console bloccata";
            case "power.executed": return "Comando di alimentazione";
            case "guest.bootstrap.blocked": return "Sessione pubblica limitata";
            default: return "Attività NexusNXS";
        }
    }

    private void updateDashboard(JSONObject snapshot) {
        telemetryFailures = 0;
        lastTelemetryAt = System.currentTimeMillis();
        lastDashboardSnapshot = snapshot;
        setTaggedText("value:host", workstationDisplayName(snapshot));
        setTaggedText("value:RAM", formatBytes(snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optLong("usedBytes")) + " / " + formatBytes(snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optLong("totalBytes")));
        setTaggedText("value:RAM disponibile", formatBytes(snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optLong("freeBytes")));
        setTaggedText("value:Utilizzo RAM", (snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optInt("percent")) + "%");
        setTaggedText("value:Utilizzo CPU", (snapshot.optJSONObject("cpu") == null ? 0 : snapshot.optJSONObject("cpu").optInt("percent")) + "%");
        JSONObject activity = snapshot.optJSONObject("activity");
        if (activity != null) {
            setTaggedText("value:Utilizzo GPU", activity.optInt("gpuPercent") + "%");
            setTaggedText("value:Attività dischi", activity.optInt("diskPercent") + "%");
            setTaggedText("value:Traffico rete", formatRate(activity.optLong("networkBytesPerSecond")));
            addChartValue("GPU", activity.optInt("gpuPercent"));
            addChartValue("DISCO", activity.optInt("diskPercent"));
        }
        addChartValue("CPU", snapshot.optJSONObject("cpu") == null ? 0 : snapshot.optJSONObject("cpu").optInt("percent"));
        addChartValue("RAM", snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optInt("percent"));
        updateHealthSummary(snapshot);
        setTaggedText("value:Tempo di attività", formatUptime(snapshot.optLong("uptimeSeconds")));
        setTaggedText("value:Ultimo controllo", formatUpdated(snapshot.optLong("updatedAt")));
        setTaggedText("live-updated", "Dati in tempo reale · " + formatUpdated(snapshot.optLong("updatedAt")));
        setTaggedText("metric:CPU", (snapshot.optJSONObject("cpu") == null ? 0 : snapshot.optJSONObject("cpu").optInt("percent")) + "%");
        setTaggedText("metric:GPU", (snapshot.optJSONObject("activity") == null ? 0 : snapshot.optJSONObject("activity").optInt("gpuPercent")) + "%");
        setTaggedText("metric:RAM", (snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optInt("percent")) + "%");
        JSONObject nexusService = snapshot.optJSONObject("nexusService");
        setTaggedText("value:AI pubblica", nexusService != null && "online".equals(nexusService.optString("status")) ? "Operativa" : "Non disponibile");
        setTaggedText("service:requests", String.valueOf(requestCount(nexusService == null ? null : nexusService.optJSONObject("requests"))));
        setTaggedText("service:sessions", nexusService == null ? "0" : String.valueOf(nexusService.optInt("anonymousSessions")));
        setTaggedText("service:streams", nexusService == null ? "0" : String.valueOf(nexusService.optInt("connectedStreams")));
        setTaggedText("core-pulse-detail", corePulseSummary(nexusService));
        JSONObject performance = snapshot.optJSONObject("performance");
        if (performance != null && performance.optInt("samples") > 0) {
            setTaggedText("value:Richieste AI misurate", String.valueOf(performance.optInt("samples")));
            setTaggedText("value:Preparazione P95", performance.optInt("prepareP95Ms") + " ms");
            setTaggedText("value:Primo output P95", performance.optInt("firstTokenP95Ms") + " ms");
            setTaggedText("value:Inferenza P95", performance.optInt("inferenceP95Ms") + " ms");
            setTaggedText("value:Verifica P95", performance.optInt("verifyP95Ms") + " ms");
        }
        refreshDesktopControlStatus(false);
        JSONObject connection = snapshot.optJSONObject("network");
        setTaggedText("value:Rete", connection != null && connection.optBoolean("online") ? "Online · " + connection.optInt("interfaces") + " interfacce" : "Offline");
        setState("Online", false);
        main.removeCallbacks(refresh);
        if (!liveTelemetryActive) main.postDelayed(refresh, LIVE_REFRESH_MS);
    }

    /**
     * Un solo canale autenticato porta la telemetria mentre l'app e visibile.
     * Il polling rimane un fallback: nessun servizio o socket sopravvive a onPause.
     */
    private void startLiveTelemetry() {
        if (destroyed || !foreground || token.isEmpty() || currentScreen != SCREEN_DASHBOARD || liveEventsRunning || liveEvents.isShutdown()) return;
        liveEventsRunning = true;
        final int generation = ++liveEventGeneration;
        final String requestToken = token;
        try {
            liveEvents.execute(() -> {
                boolean unauthorized = false;
                try {
                    for (String candidate : connectionCandidates()) {
                        if (!isLiveEventGeneration(generation, requestToken)) break;
                        HttpURLConnection connection = null;
                        try {
                            connection = (HttpURLConnection) new URL(candidate + "/api/system/telemetry/stream").openConnection();
                            liveEventConnection = connection;
                            activeConnections.add(connection);
                            connection.setInstanceFollowRedirects(false);
                            connection.setRequestMethod("GET");
                            connection.setConnectTimeout(2500);
                            connection.setReadTimeout(35_000);
                            connection.setRequestProperty("Accept", "text/event-stream");
                            connection.setRequestProperty("Authorization", "Bearer " + requestToken);
                            int status = connection.getResponseCode();
                            if (status == 401) { unauthorized = true; break; }
                            if (status != 200) continue;
                            serverUrl = candidate;
                            getPreferences(MODE_PRIVATE).edit().putString("serverUrl", serverUrl).apply();
                            try (BufferedReader input = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                                String line;
                                StringBuilder data = new StringBuilder();
                                while (isLiveEventGeneration(generation, requestToken) && (line = input.readLine()) != null) {
                                    if (line.isEmpty()) {
                                        if (data.length() > 0) consumeLiveEvent(data.toString(), generation, requestToken);
                                        data.setLength(0);
                                    } else if (line.startsWith("data:")) {
                                        if (data.length() > 0) data.append('\n');
                                        data.append(line.substring(5).trim());
                                    }
                                }
                            }
                            if (!isLiveEventGeneration(generation, requestToken)) return;
                        } catch (Exception ignored) { }
                        finally {
                            if (connection != null) {
                                activeConnections.remove(connection);
                                connection.disconnect();
                            }
                            if (liveEventConnection == connection) liveEventConnection = null;
                        }
                    }
                } finally {
                    final boolean clearSession = unauthorized;
                    postUi(() -> {
                        if (generation != liveEventGeneration) return;
                        liveEventsRunning = false;
                        liveTelemetryActive = false;
                        if (clearSession && requestToken.equals(token)) {
                            token = "";
                            secureTokenStore.clear();
                            bootstrapConsole();
                            return;
                        }
                        if (foreground && currentScreen == SCREEN_DASHBOARD) {
                            main.removeCallbacks(refresh);
                            main.post(refresh);
                            main.postDelayed(this::startLiveTelemetry, 2_500);
                        }
                    });
                }
            });
        } catch (RejectedExecutionException ignored) { liveEventsRunning = false; }
    }

    private boolean isLiveEventGeneration(int generation, String requestToken) {
        return !destroyed && foreground && currentScreen == SCREEN_DASHBOARD && generation == liveEventGeneration && requestToken.equals(token);
    }

    private void consumeLiveEvent(String raw, int generation, String requestToken) {
        try {
            JSONObject event = new JSONObject(raw);
            if (!"telemetry".equals(event.optString("type"))) return;
            JSONObject snapshot = event.optJSONObject("snapshot");
            if (snapshot == null) return;
            postUi(() -> {
                if (!isLiveEventGeneration(generation, requestToken)) return;
                liveTelemetryActive = true;
                main.removeCallbacks(refresh);
                if (dashboardVisible) updateDashboard(snapshot); else showDashboard(snapshot);
            });
        } catch (Exception ignored) { }
    }

    private void stopLiveTelemetry() {
        liveEventGeneration++;
        liveEventsRunning = false;
        liveTelemetryActive = false;
        HttpURLConnection connection = liveEventConnection;
        liveEventConnection = null;
        if (connection != null) connection.disconnect();
    }

    private String workstationDisplayName(JSONObject snapshot) {
        String value = snapshot == null ? "" : snapshot.optString("displayName", "").trim();
        return value.isEmpty() ? "NXS-CORE-01" : value.toUpperCase(Locale.ROOT);
    }

    private String corePulseSummary(JSONObject nexusService) {
        int open = 0;
        int known = 0;
        if (nexusAppOpen != null) { known++; if (Boolean.TRUE.equals(nexusAppOpen)) open++; }
        if (chatGptAppOpen != null) { known++; if (Boolean.TRUE.equals(chatGptAppOpen)) open++; }
        for (Boolean state : applicationStates.values()) {
            if (state == null) continue;
            known++;
            if (Boolean.TRUE.equals(state)) open++;
        }
        boolean aiOnline = nexusService != null && "online".equals(nexusService.optString("status"));
        int streams = nexusService == null ? 0 : nexusService.optInt("connectedStreams");
        String apps = known == 0 ? "app in verifica" : open + (open == 1 ? " app aperta" : " app aperte");
        return (aiOnline ? "AI operativa" : "AI in verifica") + "  ·  " + apps + "  ·  " + streams + (streams == 1 ? " flusso live" : " flussi live");
    }

    private int requestCount(JSONObject requests) {
        return requests == null ? 0 : Math.max(0, requests.optInt("active")) + Math.max(0, requests.optInt("queued"));
    }

    private LinearLayout metricCard(String label, int value) {
        LinearLayout metric = card(); metric.setGravity(Gravity.CENTER);
        TextView name = text(label, 10, MUTED); name.setLetterSpacing(.12f); name.setGravity(Gravity.CENTER);
        TextView number = text(value + "%", 19, value >= 90 ? DANGER : TEXT); number.setTag("metric:" + label); number.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD); number.setGravity(Gravity.CENTER);
        metric.addView(name); metric.addView(number); return metric;
    }

    private LinearLayout.LayoutParams spacedMetric() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(76), 1); params.setMargins(dp(7), 0, 0, 0); return params;
    }

    private LinearLayout serviceMetric(String label, int value, String tag) {
        LinearLayout metric = new LinearLayout(this);
        metric.setOrientation(LinearLayout.VERTICAL);
        metric.setGravity(Gravity.CENTER);
        metric.setPadding(dp(4), dp(7), dp(4), dp(6));
        metric.setBackground(rounded(Color.rgb(7, 24, 25), 14, Color.argb(22, 101, 220, 216)));
        TextView number = text(String.valueOf(Math.max(0, value)), 19, TEXT);
        number.setTag("service:" + tag);
        number.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        number.setGravity(Gravity.CENTER);
        TextView name = text(label, 9, MUTED);
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setLineSpacing(0, .92f);
        name.setLetterSpacing(.07f);
        metric.addView(number);
        metric.addView(name);
        return metric;
    }

    private LinearLayout.LayoutParams spacedServiceMetric() {
        return spacedServiceMetric(dp(68));
    }

    private LinearLayout.LayoutParams spacedServiceMetric(int height) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, height, 1);
        params.setMargins(dp(7), 0, 0, 0);
        return params;
    }

    private void setTaggedText(String tag, String value) {
        View target = content.findViewWithTag(tag);
        if (target instanceof TextView && !value.contentEquals(((TextView) target).getText())) {
            ((TextView) target).setText(value);
        }
    }

    private LinearLayout chartRow(String label, int initialValue) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(5), 0, dp(5));
        TextView name = text(label, 11, MUTED);
        SparklineView chart = new SparklineView();
        chart.setTag("chart:" + label);
        chart.add(initialValue);
        TextView value = text(initialValue + "%", 12, TEXT);
        value.setTag("chart-value:" + label);
        value.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        row.addView(name, new LinearLayout.LayoutParams(dp(50), dp(34)));
        row.addView(chart, new LinearLayout.LayoutParams(0, dp(34), 1));
        row.addView(value, new LinearLayout.LayoutParams(dp(50), dp(34)));
        return row;
    }

    private void addChartValue(String label, int value) {
        View target = content.findViewWithTag("chart:" + label);
        if (target instanceof SparklineView) ((SparklineView) target).add(value);
        setTaggedText("chart-value:" + label, value + "%");
    }

    private void toggleDetails() {
        View details = content.findViewWithTag("technical-details");
        View toggle = content.findViewWithTag("details-toggle");
        if (details == null || !(toggle instanceof Button)) return;
        detailsExpanded = !detailsExpanded;
        if (!animationsEnabled()) {
            details.animate().cancel();
            details.setAlpha(1f);
            details.setVisibility(detailsExpanded ? View.VISIBLE : View.GONE);
            ((Button) toggle).setText(detailsExpanded ? "Riduci dettagli" : "Mostra dettagli");
            return;
        }
        if (detailsExpanded) {
            details.setVisibility(View.VISIBLE);
            details.setAlpha(0f);
            details.animate().alpha(1f).setDuration(motionDuration(NexusMotion.ENTER)).setInterpolator(standardInterpolator()).start();
        } else {
            details.animate().alpha(0f).setDuration(motionDuration(NexusMotion.EXIT)).setInterpolator(standardInterpolator()).withEndAction(() -> details.setVisibility(View.GONE)).start();
        }
        ((Button) toggle).setText(detailsExpanded ? "Riduci dettagli" : "Mostra dettagli");
    }

    private void updateHealthSummary(JSONObject snapshot) {
        int cpu = snapshot.optJSONObject("cpu") == null ? 0 : snapshot.optJSONObject("cpu").optInt("percent");
        int ram = snapshot.optJSONObject("memory") == null ? 0 : snapshot.optJSONObject("memory").optInt("percent");
        int gpu = snapshot.optJSONObject("activity") == null ? 0 : snapshot.optJSONObject("activity").optInt("gpuPercent");
        boolean critical = cpu >= 90 || ram >= 90 || gpu >= 95;
        View target = content.findViewWithTag("health-summary");
        if (target instanceof TextView) {
            ((TextView) target).setText(critical ? "  Carico elevato" : "  Tutto operativo");
            ((TextView) target).setTextColor(critical ? DANGER : TEXT);
        }
    }

    private LinearLayout infoRow(String label, String value) {
        LinearLayout row = new LinearLayout(this);
        row.setPadding(0, dp(7), 0, dp(7));
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = text(label, 13, MUTED);
        TextView statusValue = text(value, 13, TEXT);
        statusValue.setTag("value:" + label);
        statusValue.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        statusValue.setMaxLines(2);
        row.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(statusValue, new LinearLayout.LayoutParams(0, -2, 1.65f));
        return row;
    }

    private View divider() {
        View line = new View(this);
        line.setBackgroundColor(Color.argb(18, 132, 190, 192));
        line.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(1)));
        return line;
    }

    private LinearLayout progress(int percent) {
        LinearLayout track = new LinearLayout(this);
        track.setBackground(rounded(Color.rgb(9, 29, 30), 999, Color.TRANSPARENT));
        LinearLayout fill = new LinearLayout(this);
        fill.setBackground(rounded(ACCENT, 999, Color.TRANSPARENT));
        track.addView(fill, new LinearLayout.LayoutParams(0, dp(3)));
        LinearLayout holder = new LinearLayout(this);
        holder.setPadding(0, 0, 0, dp(8));
        holder.addView(track, new LinearLayout.LayoutParams(-1, dp(3)));
        track.post(() -> {
            int width = Math.max(dp(18), Math.round(track.getWidth() * Math.max(0, Math.min(100, percent)) / 100f));
            LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) fill.getLayoutParams();
            params.width = animationsEnabled() ? 0 : width;
            params.height = dp(3);
            fill.setLayoutParams(params);
            if (!animationsEnabled()) return;
            ValueAnimator reveal = ValueAnimator.ofInt(0, width);
            reveal.setDuration(motionDuration(NexusMotion.CURSOR_PULSE));
            reveal.setInterpolator(standardInterpolator());
            reveal.addUpdateListener(animation -> {
                LinearLayout.LayoutParams animated = (LinearLayout.LayoutParams) fill.getLayoutParams();
                animated.width = (int) animation.getAnimatedValue();
                fill.setLayoutParams(animated);
            });
            reveal.start();
        });
        return holder;
    }

    private void planPower(String action) {
        currentScreen = SCREEN_POWER;
        dashboardVisible = false;
        main.removeCallbacks(refresh);
        setState("Preparazione…", false);
        requestWithProof("power-plan", "/api/system/power/plan", json("action", action), result -> {
            if (currentScreen != SCREEN_POWER) return;
            JSONObject proposal = result.optJSONObject("proposal");
            if (proposal == null) return;
            materializeNextContent = true;
            swapContent(() -> renderConfirmation(action, proposal));
            setState("Da confermare", false);
        });
    }

    private void planServerStop() {
        currentScreen = SCREEN_POWER;
        dashboardVisible = false;
        main.removeCallbacks(refresh);
        setState("Preparazione…", false);
        requestWithProof("service-plan", "/api/system/service/plan", json("action", "stop"), result -> {
            if (currentScreen != SCREEN_POWER) return;
            JSONObject proposal = result.optJSONObject("proposal");
            if (proposal == null) return;
            materializeNextContent = true;
            swapContent(() -> renderServerStopConfirmation(proposal));
            setState("Da confermare", false);
        });
    }

    private void renderServerStopConfirmation(JSONObject proposal) {
        content.setGravity(Gravity.CENTER);
        ImageView mark = logo(.55f);
        TextView eyebrow = eyebrow("CONFERMA RICHIESTA");
        eyebrow.setTextColor(DANGER);
        eyebrow.setGravity(Gravity.CENTER);
        TextView title = text("Arrestare il server?", 29, TEXT);
        title.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(10), 0, dp(13));
        TextView detail = text("Le connessioni NexusNXS resteranno offline fino al prossimo accesso a Windows o avvio manuale del server.", 15, MUTED);
        detail.setGravity(Gravity.CENTER);
        detail.setLineSpacing(0, 1.18f);
        detail.setPadding(dp(12), 0, dp(12), dp(26));
        Button confirm = button("Arresta server", true, true);
        confirm.setOnClickListener(v -> authenticateThen(() -> executeServerStop(proposal.optString("id"))));
        Button cancel = button("Annulla", false, false);
        cancel.setOnClickListener(v -> cancelPowerConfirmation());
        content.addView(mark, block(dp(126)));
        content.addView(eyebrow);
        content.addView(title);
        content.addView(detail);
        content.addView(confirm, block(dp(58)));
        content.addView(cancel, block(dp(52)));
    }

    private void executeServerStop(String ticket) {
        setState("Arresto server…", false);
        requestWithProof("service-execute", "/api/system/service/execute",
            json("ticketId", ticket, "approved", true), result -> {
                String message = result.optString("message", "Server NexusNXS in arresto.");
                recordSafeAction("Arresto server autorizzato");
                notifyUser("server", message + " Le app torneranno online al prossimo avvio del servizio.");
                if (!foreground || currentScreen != SCREEN_POWER) return;
                android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show();
                main.postDelayed(() -> showOffline(null), 900);
            });
    }

    private void renderConfirmation(String action, JSONObject proposal) {
        content.setGravity(Gravity.CENTER);
        boolean shutdown = "shutdown".equals(action);
        ImageView mark = logo(.55f);
        TextView eyebrow = eyebrow("CONFERMA RICHIESTA");
        eyebrow.setTextColor(DANGER);
        eyebrow.setGravity(Gravity.CENTER);
        TextView title = text(shutdown ? "Spegnere il PC?" : "Riavviare il PC?", 29, TEXT);
        title.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(10), 0, dp(13));
        TextView detail = text("Salva prima il lavoro aperto. L’azione partirà soltanto dopo la conferma.", 15, MUTED);
        detail.setGravity(Gravity.CENTER);
        detail.setLineSpacing(0, 1.18f);
        detail.setPadding(dp(12), 0, dp(12), dp(26));
        Button confirm = button(shutdown ? "Spegni il computer" : "Riavvia il computer", true, shutdown);
        confirm.setOnClickListener(v -> authenticateThen(() -> executePower(proposal.optString("id"), shutdown)));
        Button cancel = button("Annulla", false, false);
        cancel.setOnClickListener(v -> cancelPowerConfirmation());
        content.addView(mark, block(dp(126)));
        content.addView(eyebrow);
        content.addView(title);
        content.addView(detail);
        content.addView(confirm, block(dp(58)));
        content.addView(cancel, block(dp(52)));
    }

    private void executePower(String ticket, boolean shutdown) {
        setState("Invio…", false);
        requestWithProof("power-execute", "/api/system/power/execute", json("ticketId", ticket, "approved", true), result -> {
            String message = result.optString("message", shutdown ? "Spegnimento programmato." : "Riavvio programmato.");
            recordSafeAction(shutdown ? "Spegnimento PC autorizzato" : "Riavvio PC autorizzato");
            notifyUser("power", message);
            if (currentScreen != SCREEN_POWER || !foreground) return;
            showScheduled(shutdown, message);
        });
    }

    private void showScheduled(boolean shutdown, String message) {
        materializeNextContent = true;
        swapContent(() -> {
            content.setGravity(Gravity.CENTER);
            ImageView mark = logo(.62f);
            TextView title = text(shutdown ? "Spegnimento inviato" : "Riavvio inviato", 27, TEXT);
            title.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, dp(18), 0, dp(10));
            TextView detail = text(message, 15, MUTED);
            detail.setGravity(Gravity.CENTER);
            detail.setPadding(dp(12), 0, dp(12), dp(26));
            Button back = button("Torna allo stato", false, false);
            back.setOnClickListener(v -> cancelPowerConfirmation());
            content.addView(mark, block(dp(145)));
            content.addView(title);
            content.addView(detail);
            content.addView(back, block(dp(54)));
            pulse(mark);
        });
        setState("Comando inviato", false);
        main.postDelayed(reconnect, shutdown ? 7000 : 12000);
    }

    private void showOffline(String ignoredReason) {
        if (destroyed || !foreground) return;
        boolean enteringOffline = currentScreen != SCREEN_OFFLINE;
        stopLiveTelemetry();
        main.removeCallbacks(refresh);
        dashboardVisible = false;
        telemetryInFlight = false;
        currentScreen = SCREEN_OFFLINE;
        main.removeCallbacks(reconnect);
        setState("Offline", true);
        if (enteringOffline) materializeNextContent = true;
        swapContent(() -> {
            content.setGravity(Gravity.CENTER);
            ControlCoreView core = new ControlCoreView(true);
            core.setContentDescription("PC offline");
            TextView title = text("OFFLINE", 20, Color.rgb(166, 181, 182));
            title.setTypeface(getResources().getFont(R.font.inter_variable), Typeface.BOLD);
            title.setLetterSpacing(.18f);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, dp(2), 0, dp(10));
            TextView detail = text("Riconnessione automatica", 13, Color.rgb(101, 121, 122));
            detail.setGravity(Gravity.CENTER);
            detail.setPadding(dp(14), 0, dp(14), dp(26));
            Button retry = button("Riprova", false, false);
            decorateButton(retry, "restart", Color.rgb(142, 211, 211));
            retry.setOnClickListener(v -> { showConnecting(); reconnect.run(); });
            content.addView(core, new LinearLayout.LayoutParams(-1, dp(180)));
            content.addView(title);
            content.addView(detail);
            LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(176), dp(52));
            retryParams.gravity = Gravity.CENTER_HORIZONTAL;
            content.addView(retry, retryParams);
        });
        scheduleReconnect();
    }

    /** Ripristina una superficie consultiva dopo bootstrap o cambio rete. */
    private void restoreAuthenticatedScreen() {
        if (destroyed || !foreground) return;
        loadDashboard();
    }

    private void scheduleReconnect() {
        main.removeCallbacks(reconnect);
        if (destroyed || !foreground) return;
        long base = Math.min(30_000L, 1_000L << Math.min(reconnectAttempt, 5));
        long jitter = Math.abs((long) android.os.Build.MODEL.hashCode()) % 450L;
        reconnectAttempt++;
        main.postDelayed(reconnect, base + jitter);
    }

    /** Ritorno istantaneo dalla conferma: usa la cache come il gesto Back. */
    private void cancelPowerConfirmation() {
        reverseContentTransition = true;
        materializeNextContent = true;
        pendingAuthenticatedAction = null;
        main.removeCallbacks(securityRefresh);
        main.removeCallbacks(refresh);
        returnToDashboard();
    }

    /** Uscita coerente con l'ingresso cosmico, senza rallentare il Back di sistema. */
    private void finishWithMaterialization() {
        if (!animationsEnabled() || materializationOverlay == null) {
            finishAfterTransition();
            return;
        }
        content.animate().cancel();
        content.animate()
            .alpha(.2f)
            .scaleX(.985f)
            .scaleY(.985f)
            .setDuration(motionDuration(NexusMotion.EXIT))
            .setInterpolator(standardInterpolator())
            .start();
        materializationOverlay.materialize(this::finishAfterTransition);
    }

    private void swapContent(Runnable render) {
        int generation = ++contentSwapGeneration;
        boolean reverse = reverseContentTransition;
        boolean materialize = materializeNextContent;
        if (materialize) materializeNextContent = false;
        reverseContentTransition = false;
        content.animate().cancel();
        // The content container must never remain transparent when a refresh
        // supersedes a pending transition.  Network telemetry can legitimately
        // trigger several swaps in quick succession on resume.
        content.setAlpha(1f);
        content.setTranslationY(0f);
        content.setTranslationX(0f);
        content.setScaleX(1f);
        content.setScaleY(1f);
        content.removeAllViews();
        render.run();
        if (!animationsEnabled()) {
            return;
        }
        // Preserve a subtle native-feeling directional transition without
        // fading the entire command surface to black.
        // Entrata breve e continua: la distanza resta minima per evitare
        // scatti anche su telefoni a 60 Hz, mentre opacita e scala ricreano
        // la morbidezza dei pannelli originali. Android disattiva tutto in
        // risparmio energetico o quando le animazioni di sistema sono spente.
        content.setAlpha(materialize ? .42f : NexusMotion.CONTENT_START_ALPHA);
        content.setScaleX(materialize ? .978f : NexusMotion.CONTENT_START_SCALE);
        content.setScaleY(materialize ? .978f : NexusMotion.CONTENT_START_SCALE);
        content.setTranslationY(materialize ? dp(7) : dp(4));
        content.setTranslationX(materialize ? 0f : reverse ? -dp(NexusMotion.CONTENT_TRAVEL_DP) : dp(NexusMotion.CONTENT_TRAVEL_DP));
        if (materialize && materializationOverlay != null) materializationOverlay.materialize();
        content.postOnAnimation(() -> {
            if (destroyed || generation != contentSwapGeneration) {
                content.setAlpha(1f);
                content.setTranslationY(0f);
                content.setTranslationX(0f);
                content.setScaleX(1f);
                content.setScaleY(1f);
                return;
            }
            content.animate()
                .alpha(1f)
                .scaleX(1f)
                .scaleY(1f)
                .translationX(0f)
                .translationY(0f)
                .setDuration(motionDuration(materialize ? NexusMotion.MATERIALIZE : NexusMotion.CONTENT_SWAP))
                .setInterpolator(emphasizedInterpolator())
                .withEndAction(() -> {
                    content.setAlpha(1f);
                    content.setTranslationY(0f);
                    content.setTranslationX(0f);
                    content.setScaleX(1f);
                    content.setScaleY(1f);
                })
                .start();
        });
    }

    private void setState(String value, boolean offline) {
        String stateKey = value + ":" + offline;
        if (stateKey.equals(visibleState)) return;
        visibleState = stateKey;
    }

    private void pulse(View view) {
        if (!animationsEnabled()) {
            view.animate().cancel();
            view.setScaleX(1f); view.setScaleY(1f); view.setAlpha(1f);
            return;
        }
        view.animate().scaleX(1.035f).scaleY(1.035f).alpha(.84f).setDuration(motionDuration(NexusMotion.AMBIENT_PULSE)).setInterpolator(standardInterpolator()).withEndAction(() -> {
            if (animationsEnabled() && view.isAttachedToWindow()) view.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(motionDuration(NexusMotion.AMBIENT_PULSE)).setInterpolator(standardInterpolator()).withEndAction(() -> pulse(view)).start();
        }).start();
    }

    private void breathe(View view) {
        if (!animationsEnabled()) {
            view.animate().cancel();
            view.setAlpha(1f);
            return;
        }
        view.animate().alpha(.38f).setDuration(motionDuration(NexusMotion.THINKING_PULSE)).setInterpolator(standardInterpolator()).withEndAction(() -> {
            if (animationsEnabled() && view.isAttachedToWindow()) view.animate().alpha(1f).setDuration(motionDuration(NexusMotion.THINKING_PULSE)).setInterpolator(standardInterpolator()).withEndAction(() -> breathe(view)).start();
        }).start();
    }

    private boolean animationsEnabled() {
        return !destroyed && foreground && ValueAnimator.areAnimatorsEnabled();
    }

    private void configureMotionProfile() {
        ActivityManager activityManager = getSystemService(ActivityManager.class);
        boolean lowRam = activityManager != null && activityManager.isLowRamDevice();
        PowerManager powerManager = getSystemService(PowerManager.class);
        boolean powerSave = powerManager != null && powerManager.isPowerSaveMode();
        float refreshRate = getWindowManager().getDefaultDisplay().getRefreshRate();
        baselineLowMotionBudget = lowRam || powerSave;
        lowMotionBudget = baselineLowMotionBudget || (frameBudgetMonitor != null && frameBudgetMonitor.isConstrained());
        motionScale = NexusMotion.profileScale(lowRam, powerSave, refreshRate);
    }

    private long motionDuration(int baseMs) {
        return NexusMotion.duration(baseMs, motionScale, animationsEnabled());
    }

    private PathInterpolator standardInterpolator() {
        return new PathInterpolator(NexusMotion.STANDARD_X1, NexusMotion.STANDARD_Y1, NexusMotion.STANDARD_X2, NexusMotion.STANDARD_Y2);
    }

    private PathInterpolator emphasizedInterpolator() {
        return new PathInterpolator(NexusMotion.EMPHASIZED_X1, NexusMotion.EMPHASIZED_Y1, NexusMotion.EMPHASIZED_X2, NexusMotion.EMPHASIZED_Y2);
    }

    private void authenticateThen(Runnable action) {
        if (android.os.Build.VERSION.SDK_INT < 28) {
            android.app.KeyguardManager keyguard = getSystemService(android.app.KeyguardManager.class);
            if (keyguard == null || !keyguard.isDeviceSecure()) {
                android.widget.Toast.makeText(this, "Imposta un blocco schermo sicuro per autorizzare l’operazione.", android.widget.Toast.LENGTH_LONG).show();
                return;
            }
            Intent confirm = keyguard.createConfirmDeviceCredentialIntent("Conferma l’operazione", "NexusNXS Control");
            if (confirm == null) return;
            pendingAuthenticatedAction = action;
            startActivityForResult(confirm, REQUEST_DEVICE_CREDENTIAL);
            return;
        }
        CancellationSignal cancellation = new CancellationSignal();
        android.hardware.biometrics.BiometricPrompt.Builder builder = new android.hardware.biometrics.BiometricPrompt.Builder(this)
            .setTitle("Conferma l’operazione")
            .setSubtitle("NexusNXS Control");
        if (android.os.Build.VERSION.SDK_INT >= 29) builder.setDeviceCredentialAllowed(true);
        else builder.setNegativeButton("Annulla", getMainExecutor(), (dialog, which) -> { });
        android.hardware.biometrics.BiometricPrompt prompt = builder.build();
        prompt.authenticate(cancellation, getMainExecutor(), new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult result) { action.run(); }
        });
    }

    private interface ObjectCallback { void accept(JSONObject value); }

    /**
     * I comandi di apertura sono operazioni best-effort distinte dalla sonda di
     * raggiungibilita. L'applicazione desktop puo impiegare alcuni secondi ad
     * avviarsi: un timeout della conferma non deve distruggere la dashboard,
     * invalidare la sessione o mostrare falsamente il PC come offline.
     */
    private void requestCommandWithProof(String purpose, String path, JSONObject body, ObjectCallback done, Runnable onFailure) {
        requestWithProof(purpose, path, body, done, true, () -> {
            if (onFailure != null) onFailure.run();
        });
    }

    private void requestWithProof(String purpose, String path, JSONObject body, ObjectCallback done) {
        requestWithProof(purpose, path, body, done, false, () -> { });
    }

    private void requestWithProof(String purpose, String path, JSONObject body, ObjectCallback done, boolean silentFailure, Runnable onFailure) {
        request("POST", "/api/device/challenge", json("purpose", purpose), true, challenge -> {
            try {
                JSONObject proof = new JSONObject()
                    .put("challengeId", challenge.optString("challengeId"))
                    .put("signature", deviceIdentityStore.signPayload(challenge.optString("payload")));
                body.put("deviceProof", proof);
                request("POST", path, body, true, done, silentFailure, onFailure);
            } catch (Exception error) {
                onFailure.run();
                if (!silentFailure && foreground) showOffline(null);
            }
        }, silentFailure, onFailure);
    }

    private void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done) {
        request(method, path, body, authenticated, done, false);
    }

    private void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done, boolean silentFailure) {
        request(method, path, body, authenticated, done, silentFailure, () -> { });
    }

    private void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done, boolean silentFailure, Runnable onFailure) {
        if (destroyed || network.isShutdown()) return;
        // Associa la risposta alla credenziale realmente inviata. Una richiesta
        // partita prima della rotazione puo ricevere 401 dopo che il token nuovo
        // e gia stato salvato: in quel caso non deve cancellare la sessione nuova.
        final String requestToken = authenticated ? token : "";
        try {
            network.execute(() -> {
            for (String candidate : connectionCandidates()) {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(candidate + path).openConnection();
                    activeConnections.add(connection);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestMethod(method);
                    connection.setConnectTimeout(2500);
                    connection.setReadTimeout(path.contains("/power/") ? 30000 : 10000);
                    connection.setRequestProperty("Accept", "application/json");
                    if (authenticated && !requestToken.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + requestToken);
                    if (body != null) {
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", "application/json");
                        try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                    }
                    int status = connection.getResponseCode();
                    InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
                    StringBuilder text = new StringBuilder();
                    if (stream != null) try (BufferedReader input = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line; while ((line = input.readLine()) != null) text.append(line);
                    }
                    if (status == 401) {
                        postUi(() -> {
                            onFailure.run();
                            if (!authenticated) {
                                if (!silentFailure && foreground) showOffline(null);
                                return;
                            }
                            if (sessionRotationInFlight && !"/api/session/rotate".equals(path)) return;
                            if (!requestToken.equals(token)) return;
                            token = "";
                            secureTokenStore.clear();
                            bootstrapConsole();
                        });
                        return;
                    }
                    if (status < 200 || status >= 300) throw new Exception("unavailable");
                    JSONObject result = new JSONObject(text.toString());
                    serverUrl = candidate;
                    getPreferences(MODE_PRIVATE).edit().putString("serverUrl", serverUrl).apply();
                    postUi(() -> { reconnectAttempt = 0; done.accept(result); });
                    return;
                } catch (Exception ignored) { }
                finally {
                    if (connection != null) {
                        activeConnections.remove(connection);
                        connection.disconnect();
                    }
                }
            }
            postUi(() -> {
                onFailure.run();
                if (!silentFailure && foreground) showOffline(null);
            });
            });
        } catch (RejectedExecutionException ignored) {
            // La chiusura dell'activity prevale su un refresh arrivato in ritardo.
        }
    }

    private void postUi(Runnable action) {
        if (destroyed) return;
        runOnUiThread(() -> { if (!destroyed) action.run(); });
    }

    private List<String> connectionCandidates() {
        String primary = BuildConfig.NEXUS_URL.replaceAll("/console$", "");
        String fallback = BuildConfig.NEXUS_FALLBACK_URL.replaceAll("/$", "");
        String lan = BuildConfig.NEXUS_LAN_URL.replaceAll("/$", "");
        List<String> configured = new ArrayList<>();
        if (!primary.isEmpty()) configured.add(primary);
        if (!fallback.isEmpty() && !configured.contains(fallback)) configured.add(fallback);
        if (!lan.isEmpty() && !configured.contains(lan)) configured.add(lan);
        List<String> candidates = new ArrayList<>();
        if (configured.contains(serverUrl)) candidates.add(serverUrl);
        for (String candidate : configured) if (!candidates.contains(candidate)) candidates.add(candidate);
        return candidates;
    }

    private JSONObject json(Object... entries) {
        JSONObject value = new JSONObject();
        try { for (int index = 0; index + 1 < entries.length; index += 2) value.put(String.valueOf(entries[index]), entries[index + 1]); }
        catch (Exception ignored) { }
        return value;
    }

    private ImageView logo(float alpha) {
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_control_foreground);
        mark.setBackgroundColor(Color.TRANSPARENT);
        mark.setPadding(0, 0, 0, 0);
        mark.setAlpha(alpha);
        mark.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        return mark;
    }

    private TextView eyebrow(String value) {
        TextView view = text(value, 12, Color.rgb(171, 186, 187));
        view.setLetterSpacing(.08f);
        return view;
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(getResources().getFont(R.font.inter_variable));
        return view;
    }

    private Button button(String label, boolean primary, boolean danger) {
        Button button = new NexusButton();
        button.setText(label);
        button.setTextSize(15);
        button.setTypeface(getResources().getFont(R.font.inter_variable));
        button.setIncludeFontPadding(false);
        button.setLetterSpacing(.005f);
        button.setTextColor(danger ? Color.rgb(244, 193, 178) : primary ? Color.rgb(211, 242, 241) : Color.rgb(153, 188, 189));
        button.setTransformationMethod(null);
        button.setAllCaps(false);
        button.setStateListAnimator(null);
        int fill = danger ? Color.rgb(33, 15, 13) : primary ? Color.rgb(7, 35, 36) : Color.rgb(5, 17, 18);
        int stroke = danger ? Color.argb(70, 232, 153, 132) : primary ? Color.argb(60, 101, 221, 218) : Color.argb(26, 132, 190, 192);
        GradientDrawable surface = rounded(fill, 19, stroke);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(danger ? Color.argb(45, 240, 145, 119) : Color.argb(42, 109, 224, 221)), surface, null));
        StateListAnimator feedback = new StateListAnimator();
        ObjectAnimator pressed = ObjectAnimator.ofPropertyValuesHolder(button, PropertyValuesHolder.ofFloat(View.SCALE_X, .97f), PropertyValuesHolder.ofFloat(View.SCALE_Y, .97f));
        pressed.setDuration(motionDuration(NexusMotion.PRESS));
        ObjectAnimator released = ObjectAnimator.ofPropertyValuesHolder(button, PropertyValuesHolder.ofFloat(View.SCALE_X, 1f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f));
        released.setDuration(motionDuration(NexusMotion.RELEASE));
        feedback.addState(new int[] { android.R.attr.state_pressed }, pressed);
        feedback.addState(new int[] {}, released);
        if (ValueAnimator.areAnimatorsEnabled()) button.setStateListAnimator(feedback);
        return button;
    }

    private void decorateButton(Button button, String glyph, int color) {
        Drawable icon = new NexusGlyphDrawable(glyph, color, dp(17));
        button.setCompoundDrawables(icon, null, null, null);
        button.setCompoundDrawablePadding(dp(9));
        button.setGravity(Gravity.CENTER);
    }

    private final class NexusButton extends Button {
        NexusButton() { super(NativeMainActivity.this); }
        @Override public boolean performClick() { performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK); return super.performClick(); }
    }

    private final class MaterializationView extends View {
        private static final int PARTICLE_CAPACITY = 34;
        private final Paint node = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint link = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float[] xs = new float[PARTICLE_CAPACITY];
        private final float[] ys = new float[PARTICLE_CAPACITY];
        private ValueAnimator animator;
        private float progress;

        MaterializationView() {
            super(NativeMainActivity.this);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            setClickable(false);
            node.setColor(ACCENT);
            link.setColor(ACCENT);
            link.setStyle(Paint.Style.STROKE);
            link.setStrokeWidth(dp(1) * .55f);
        }

        void materialize() { materialize(null); }

        void materialize(Runnable completion) {
            if (!animationsEnabled()) { setVisibility(View.GONE); return; }
            if (animator != null) animator.cancel();
            progress = 0f;
            setAlpha(1f);
            setVisibility(View.VISIBLE);
            animator = ValueAnimator.ofFloat(0f, 1f);
            animator.setDuration(motionDuration(NexusMotion.MATERIALIZE));
            animator.setInterpolator(emphasizedInterpolator());
            animator.addUpdateListener(value -> { progress = (float) value.getAnimatedValue(); invalidate(); });
            animator.addListener(new android.animation.AnimatorListenerAdapter() {
                private boolean completed;
                private void complete() {
                    if (completed) return;
                    completed = true;
                    setVisibility(View.GONE);
                    if (completion != null) completion.run();
                }
                @Override public void onAnimationEnd(android.animation.Animator animation) { complete(); }
                @Override public void onAnimationCancel(android.animation.Animator animation) { complete(); }
            });
            animator.start();
        }

        @Override protected void onDetachedFromWindow() {
            if (animator != null) animator.cancel();
            super.onDetachedFromWindow();
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int count = lowMotionBudget ? 18 : 34;
            float cx = getWidth() * .5f;
            float cy = getHeight() * .42f;
            float reach = Math.min(getWidth(), getHeight()) * (.12f + progress * .46f);
            float fade = (float) Math.sin(Math.PI * Math.min(1f, progress));
            for (int index = 0; index < count; index++) {
                double angle = index * 2.399963229728653 + progress * .62;
                float lane = .32f + ((index * 37) % 67) / 100f;
                float drift = (float) Math.sin(index * 1.71 + progress * 5.4) * dp(5);
                xs[index] = cx + (float) Math.cos(angle) * reach * lane + drift;
                ys[index] = cy + (float) Math.sin(angle) * reach * lane - drift * .36f;
                node.setAlpha(Math.max(0, Math.min(255, Math.round(fade * (110 + (index % 5) * 23)))));
                canvas.drawCircle(xs[index], ys[index], dp(index % 7 == 0 ? 2 : 1), node);
            }
            link.setAlpha(Math.round(fade * (lowMotionBudget ? 20 : 34)));
            for (int index = 0; index < count; index += 4) {
                int peer = (index + 7) % count;
                canvas.drawLine(xs[index], ys[index], xs[peer], ys[peer], link);
            }
        }
    }

    private final class ControlCoreView extends View {
        private static final int PARTICLE_CAPACITY = 14;
        private final boolean offline;
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint particle = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float[] nodeX = new float[PARTICLE_CAPACITY];
        private final float[] nodeY = new float[PARTICLE_CAPACITY];
        private final RectF outerBounds = new RectF();
        private final RectF innerBounds = new RectF();
        private float phase;

        ControlCoreView(boolean offline) {
            super(NativeMainActivity.this);
            this.offline = offline;
            int color = offline ? Color.rgb(78, 94, 95) : ACCENT;
            stroke.setColor(color);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            stroke.setStrokeWidth(dp(2));
            glow.setColor(offline ? Color.argb(20, 92, 106, 107) : Color.argb(48, 75, 231, 233));
            glow.setStyle(Paint.Style.STROKE);
            glow.setStrokeWidth(dp(10));
            particle.setColor(color);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float radius = Math.min(getWidth(), getHeight()) * .29f;
            outerBounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
            canvas.save();
            canvas.rotate(offline ? -24f : phase, cx, cy);
            canvas.drawArc(outerBounds, -36, offline ? 72 : 118, false, glow);
            canvas.drawArc(outerBounds, -36, offline ? 72 : 118, false, stroke);
            canvas.drawArc(outerBounds, 126, offline ? 58 : 86, false, stroke);
            innerBounds.set(cx - radius * .72f, cy - radius * .72f, cx + radius * .72f, cy + radius * .72f);
            canvas.rotate(offline ? 0 : -phase * 1.55f, cx, cy);
            canvas.drawArc(innerBounds, 18, offline ? 100 : 174, false, stroke);
            canvas.restore();
            int particleCount = lowMotionBudget ? 7 : 14;
            for (int index = 0; index < particleCount; index++) {
                double angle = Math.toRadians(index * (360d / particleCount) + (offline ? 0 : phase * .55f));
                float wave = offline ? 0f : (float) Math.sin(Math.toRadians(phase * .8f + index * 47f)) * .055f;
                float distance = radius * (index % 3 == 0 ? 1.24f + wave : index % 2 == 0 ? 1.03f - wave : .82f + wave);
                float dot = dp(index % 3 == 0 ? 2 : 1);
                particle.setAlpha(offline ? 65 : 115 + (index * 13) % 100);
                nodeX[index] = cx + (float) Math.cos(angle) * distance;
                nodeY[index] = cy + (float) Math.sin(angle) * distance;
                canvas.drawCircle(nodeX[index], nodeY[index], dot, particle);
            }
            if (!offline) {
                particle.setStyle(Paint.Style.STROKE);
                particle.setStrokeWidth(dp(1) * .55f);
                particle.setAlpha(lowMotionBudget ? 22 : 34);
                for (int index = 0; index < particleCount; index += 2) {
                    int peer = (index + 5) % particleCount;
                    canvas.drawLine(nodeX[index], nodeY[index], nodeX[peer], nodeY[peer], particle);
                }
                particle.setStyle(Paint.Style.FILL);
            }
            particle.setAlpha(offline ? 80 : 210);
            canvas.drawCircle(cx, cy, dp(4), particle);
            if (!offline && animationsEnabled() && isAttachedToWindow()) {
                phase = (phase + (lowMotionBudget ? .85f : motionScale < .8f ? 1.55f : 1.25f)) % 360f;
                postInvalidateOnAnimation();
            }
        }
    }

    private final class NexusGlyphDrawable extends Drawable {
        private final String glyph;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int size;

        NexusGlyphDrawable(String glyph, int color, int size) {
            this.glyph = glyph;
            this.size = size;
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(getResources().getDisplayMetrics().density * .96f);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            setBounds(0, 0, size, size);
        }

        @Override public void draw(Canvas canvas) {
            RectF b = new RectF(getBounds());
            float scale = Math.min(b.width(), b.height()) / 24f;
            canvas.save();
            canvas.translate(b.left, b.top);
            canvas.scale(scale, scale);
            Path path = new Path();
            if ("nexus".equals(glyph)) {
                canvas.drawCircle(12, 12, 2.1f, paint);
                canvas.drawArc(new RectF(4, 4, 20, 20), -38, 84, false, paint);
                canvas.drawArc(new RectF(4, 4, 20, 20), 82, 80, false, paint);
                canvas.drawArc(new RectF(4, 4, 20, 20), 202, 84, false, paint);
            } else if ("chat".equals(glyph)) {
                canvas.drawRoundRect(new RectF(3.5f, 4.5f, 20.5f, 17.5f), 5, 5, paint);
                path.moveTo(8, 17); path.lineTo(6.5f, 21); path.lineTo(12, 17.5f); canvas.drawPath(path, paint);
                canvas.drawCircle(9, 11, .55f, paint); canvas.drawCircle(12, 11, .55f, paint); canvas.drawCircle(15, 11, .55f, paint);
            } else if ("browser".equals(glyph)) {
                canvas.drawCircle(12, 12, 8.2f, paint);
                canvas.drawOval(new RectF(8.2f, 3.8f, 15.8f, 20.2f), paint);
                canvas.drawLine(4, 12, 20, 12, paint);
            } else if ("terminal".equals(glyph)) {
                path.moveTo(4.5f, 7); path.lineTo(9.5f, 12); path.lineTo(4.5f, 17); canvas.drawPath(path, paint);
                canvas.drawLine(11.5f, 17, 19.5f, 17, paint);
            } else if ("supremo".equals(glyph)) {
                canvas.drawRoundRect(new RectF(3.5f, 5, 13.5f, 15.5f), 2.2f, 2.2f, paint);
                canvas.drawRoundRect(new RectF(10.5f, 8.5f, 20.5f, 19), 2.2f, 2.2f, paint);
                path.moveTo(8.2f, 12.2f); path.lineTo(11, 12.2f); path.lineTo(13.6f, 14.8f); canvas.drawPath(path, paint);
                canvas.drawLine(7, 18.2f, 17, 18.2f, paint);
            } else if ("note".equals(glyph)) {
                canvas.drawRoundRect(new RectF(5, 3.5f, 19, 20.5f), 2.4f, 2.4f, paint);
                canvas.drawLine(8, 8, 16, 8, paint); canvas.drawLine(8, 12, 16, 12, paint); canvas.drawLine(8, 16, 14, 16, paint);
            } else if ("restart".equals(glyph)) {
                canvas.drawArc(new RectF(4.5f, 4.5f, 19.5f, 19.5f), -55, 292, false, paint);
                path.moveTo(4, 6); path.lineTo(9, 6); path.lineTo(6.5f, 10); canvas.drawPath(path, paint);
            } else if ("power".equals(glyph)) {
                canvas.drawLine(12, 3.5f, 12, 12, paint); canvas.drawArc(new RectF(4.5f, 5, 19.5f, 20), -48, 276, false, paint);
            } else if ("stop".equals(glyph)) {
                canvas.drawRoundRect(new RectF(6, 6, 18, 18), 2.2f, 2.2f, paint);
            } else {
                path.moveTo(3.5f, 12); path.lineTo(7, 12); path.lineTo(9, 7); path.lineTo(13, 17); path.lineTo(16, 10); path.lineTo(20.5f, 10); canvas.drawPath(path, paint);
            }
            canvas.restore();
        }

        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
        @Override public void setColorFilter(android.graphics.ColorFilter colorFilter) { paint.setColorFilter(colorFilter); invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
        @Override public int getIntrinsicWidth() { return size; }
        @Override public int getIntrinsicHeight() { return size; }
    }

    private final class SparklineView extends View {
        private static final int SAMPLE_CAPACITY = 20;
        private final float[] samples = new float[SAMPLE_CAPACITY];
        private int sampleCount;
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);

        SparklineView() {
            super(NativeMainActivity.this);
            line.setColor(ACCENT); line.setStrokeWidth(dp(1)); line.setStyle(Paint.Style.STROKE);
            glow.setColor(Color.argb(30, 101, 220, 216)); glow.setStrokeWidth(dp(5)); glow.setStyle(Paint.Style.STROKE);
        }

        void add(int value) {
            float bounded = Math.max(0, Math.min(100, value));
            if (sampleCount < SAMPLE_CAPACITY) {
                samples[sampleCount++] = bounded;
            } else {
                System.arraycopy(samples, 1, samples, 0, SAMPLE_CAPACITY - 1);
                samples[SAMPLE_CAPACITY - 1] = bounded;
            }
            invalidate();
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (sampleCount < 2) return;
            float step = getWidth() / (float) (sampleCount - 1);
            for (int index = 1; index < sampleCount; index++) {
                float x1 = (index - 1) * step, y1 = getHeight() - samples[index - 1] / 100f * getHeight();
                float x2 = index * step, y2 = getHeight() - samples[index] / 100f * getHeight();
                canvas.drawLine(x1, y1, x2, y2, glow);
                canvas.drawLine(x1, y1, x2, y2, line);
            }
        }
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(17), dp(13), dp(17), dp(13));
        card.setBackground(rounded(SURFACE, 22, Color.argb(32, 91, 105, 106)));
        return card;
    }

    private GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setCornerRadius(dp(radius));
        if (stroke != Color.TRANSPARENT) shape.setStroke(dp(1), stroke);
        return shape;
    }

    private LinearLayout.LayoutParams block(int height) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, height);
        params.setMargins(0, dp(6), 0, dp(6));
        return params;
    }

    private LinearLayout.LayoutParams wrapBlock() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(6), 0, dp(6));
        return params;
    }

    private LinearLayout.LayoutParams spaced(int weight) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(58), weight);
        params.setMargins(dp(8), 0, 0, 0);
        return params;
    }

    private String titleCase(String value) {
        if (value == null || value.isEmpty()) return "Computer";
        String normalized = value.replace('-', ' ').replace('_', ' ').toLowerCase(Locale.getDefault());
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
    }

    private String join(JSONArray values) {
        if (values == null || values.length() == 0) return "—";
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < values.length(); index++) {
            if (index > 0) result.append(" · ");
            result.append(values.optString(index));
        }
        return result.toString();
    }

    private String platformName(String value) {
        if ("win32".equalsIgnoreCase(value)) return "Windows";
        if ("darwin".equalsIgnoreCase(value)) return "macOS";
        if ("linux".equalsIgnoreCase(value)) return "Linux";
        return value == null || value.isEmpty() ? "Non rilevato" : value;
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "—";
        double gib = bytes / 1073741824d;
        if (gib >= 1) return String.format(Locale.getDefault(), "%.1f GB", gib);
        return String.format(Locale.getDefault(), "%d MB", Math.round(bytes / 1048576d));
    }

    private String formatRate(long bytesPerSecond) {
        if (bytesPerSecond <= 0) return "0 KB/s";
        if (bytesPerSecond >= 1048576) return String.format(Locale.getDefault(), "%.1f MB/s", bytesPerSecond / 1048576d);
        return String.format(Locale.getDefault(), "%.0f KB/s", bytesPerSecond / 1024d);
    }

    private String translateHealth(String value) {
        if ("Healthy".equalsIgnoreCase(value)) return "Integro";
        if ("Warning".equalsIgnoreCase(value)) return "Attenzione";
        if ("Unhealthy".equalsIgnoreCase(value)) return "Critico";
        return "Stato non disponibile";
    }

    private String formatUptime(long seconds) {
        if (seconds <= 0) return "—";
        long days = seconds / 86400;
        long hours = (seconds % 86400) / 3600;
        long minutes = (seconds % 3600) / 60;
        if (days > 0) return days + " g " + hours + " h";
        if (hours > 0) return hours + " h " + minutes + " min";
        return minutes + " min";
    }

    private String formatUpdated(long timestamp) {
        if (timestamp <= 0) return "Adesso";
        return android.text.format.DateFormat.format("HH:mm:ss", timestamp).toString();
    }

    private void prepareNotifications() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.deleteNotificationChannel("nexus_console");
        NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL, "Avvisi operativi", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Sicurezza e operazioni richieste da NexusNXS Control");
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 88);
    }

    private void notifyUser(String kind, String message) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        String clean = message.length() > 120 ? message.substring(0, 120) + "…" : message;
        String title = "security".equals(kind) ? "Sicurezza NexusNXS" : "server".equals(kind) ? "Server NexusNXS" : "Alimentazione PC";
        int notificationId = "security".equals(kind) ? NOTIFICATION_SECURITY : "server".equals(kind) ? NOTIFICATION_SERVER : NOTIFICATION_POWER;
        Intent launch = new Intent(this, NativeMainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, notificationId, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification value = new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL)
            .setSmallIcon(R.drawable.ic_control_monochrome)
            .setContentTitle(title)
            .setContentText(clean)
            .setStyle(new android.app.Notification.BigTextStyle().bigText(clean))
            .setContentIntent(contentIntent)
            .setCategory("security".equals(kind) ? android.app.Notification.CATEGORY_ERROR : android.app.Notification.CATEGORY_STATUS)
            .setVisibility(android.app.Notification.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .build();
        getSystemService(NotificationManager.class).notify(notificationId, value);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override protected void onDestroy() {
        destroyed = true;
        if (frameBudgetMonitor != null) frameBudgetMonitor.stop();
        stopLiveTelemetry();
        pendingAuthenticatedAction = null;
        main.removeCallbacksAndMessages(null);
        try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { }
        for (HttpURLConnection connection : activeConnections) connection.disconnect();
        activeConnections.clear();
        network.shutdownNow();
        liveEvents.shutdownNow();
        super.onDestroy();
    }
}
