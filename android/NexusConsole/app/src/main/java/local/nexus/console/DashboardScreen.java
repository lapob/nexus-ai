package local.nexus.console;

import local.nexus.console.ui.Motion;
import local.nexus.console.ui.NexusUi;
import local.nexus.motion.NexusMotion;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Cruscotto della workstation: titolo e tab a pillola nella barra sovrapposta,
 * quattro sezioni (Panoramica, Sistema, App, Servizi) costruite ciascuna dalla
 * propria classe. La telemetria aggiorna i valori sul posto per tag, senza
 * ricostruire le viste; la posizione di scorrimento è ricordata per sezione.
 */
final class DashboardScreen {
    interface Host {
        boolean isClosed();
        /** Dashboard visibile e schermata corrente. */
        boolean dashboardShowing();
        /** Schermata corrente è la dashboard, anche se non ancora disegnata. */
        boolean onDashboardScreen();
        /** Sezione cambiata: Indietro torna alla Panoramica. */
        void onSectionChanged();
    }

    static final String HOME = "Panoramica";
    private static final String[] SECTIONS = { "Panoramica", "Sistema", "App", "Servizi" };

    private final ConsoleShell shell;
    private final NexusUi ui;
    private final Motion motion;
    private final SharedPreferences preferences;
    private final DesktopApps apps;
    private final Host host;
    private final OverviewSection overview;
    private final SystemSection system;
    private final ServicesSection services;
    private final Map<String, LinearLayout> dashboardPanels = new LinkedHashMap<>();
    private final Map<String, Button> dashboardTabs = new LinkedHashMap<>();
    private final Map<String, Integer> dashboardPositions = new HashMap<>();
    private final Map<View, Integer> sectionEntryGenerations = new WeakHashMap<>();
    private HorizontalScrollView dashboardTabScroll;
    private String dashboardSection = HOME;
    private boolean restoringDashboardPosition;
    private int navigationGeneration;
    private int sectionEntryGeneration;
    private JSONObject lastDashboardSnapshot;

    DashboardScreen(ConsoleShell shell, NexusUi ui, SharedPreferences preferences, DesktopApps apps,
                    SafeActionHistory history, Runnable planServerStop, Host host) {
        this.shell = shell;
        this.ui = ui;
        this.motion = ui.motion();
        this.preferences = preferences;
        this.apps = apps;
        this.host = host;
        overview = new OverviewSection(this, ui);
        system = new SystemSection(this, ui);
        services = new ServicesSection(this, ui, history, planServerStop);
    }

    NexusUi ui() { return ui; }
    JSONObject snapshot() { return lastDashboardSnapshot; }
    String section() { return dashboardSection; }
    boolean atHome() { return HOME.equals(dashboardSection); }

    // #region Posizione di navigazione

    void rememberDashboardPosition() {
        if (host.dashboardShowing() && !restoringDashboardPosition)
            dashboardPositions.put(dashboardSection, Math.max(0, Math.round(shell.scroll.getScrollY() / ui.context().getResources().getDisplayMetrics().density)));
    }

    private void restoreDashboardPosition() {
        restoringDashboardPosition = true;
        int generation = ++navigationGeneration;
        String key = dashboardSection;
        shell.scroll.post(() -> {
            if (generation != navigationGeneration) return;
            if (host.onDashboardScreen() && key.equals(dashboardSection))
                shell.scroll.scrollTo(0, ui.dp(dashboardPositions.getOrDefault(key, 0)));
            restoringDashboardPosition = false;
        });
    }

    void restoreNavigation() {
        String section = preferences.getString("navigation.section", HOME);
        if (Arrays.asList(SECTIONS).contains(section)) dashboardSection = section;
        for (String key : SECTIONS)
            dashboardPositions.put(key, Math.max(0, Math.min(100000, preferences.getInt("navigation.scroll." + key, 0))));
    }

    void persistNavigation() {
        rememberDashboardPosition();
        SharedPreferences.Editor editor = preferences.edit()
            .putString("navigation.section", dashboardSection).remove("navigation.folder");
        for (Map.Entry<String, Integer> entry : dashboardPositions.entrySet())
            editor.putInt("navigation.scroll." + entry.getKey(), entry.getValue());
        editor.apply();
    }

    // #endregion

    // #region Costruzione

    void render(JSONObject snapshot, JSONObject securitySummary) {
        LinearLayout navigation = shell.navigation;
        LinearLayout content = shell.content;
        navigation.removeAllViews();
        shell.showNavigation();
        content.setGravity(Gravity.TOP);
        lastDashboardSnapshot = snapshot;

        String host = Formats.workstationDisplayName(snapshot);
        boolean compactHeader = ui.context().getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        TextView title = ui.bold(ui.text(host, compactHeader ? 20 : 24, NexusUi.TEXT));
        title.setTag("value:host");
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setContentDescription(host);
        title.setPadding(0, 0, 0, ui.dp(compactHeader ? 6 : 12));
        navigation.addView(title);

        dashboardPanels.clear();
        dashboardTabs.clear();
        HorizontalScrollView tabs = new HorizontalScrollView(ui.context());
        dashboardTabScroll = tabs;
        tabs.setHorizontalScrollBarEnabled(false);
        // Android modulates each transparent edge only while more tabs exist
        // beyond it. No bitmap capture or blur work in the scroll callback.
        tabs.setHorizontalFadingEdgeEnabled(true);
        tabs.setFadingEdgeLength(ui.dp(24));
        tabs.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout tabRow = new LinearLayout(ui.context());
        for (String name : SECTIONS) {
            LinearLayout panel = new LinearLayout(ui.context());
            panel.setOrientation(LinearLayout.VERTICAL);
            dashboardPanels.put(name, panel);
            Button tab = ui.action(name, dashboardGlyph(name), NexusUi.TEXT, false, false);
            tab.setOnClickListener(v -> selectDashboardSection(name));
            dashboardTabs.put(name, tab);
            LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(-2, -2);
            tabParams.setMargins(0, 0, ui.dp(8), 0);
            tabRow.addView(tab, tabParams);
        }
        tabs.addView(tabRow);
        navigation.addView(tabs, new LinearLayout.LayoutParams(-1, -2));
        for (LinearLayout panel : dashboardPanels.values()) content.addView(panel, new LinearLayout.LayoutParams(-1, -2));

        JSONObject nexusService = snapshot.optJSONObject("nexusService");
        overview.build(dashboardPanels.get("Panoramica"), snapshot, apps.corePulseSummary(nexusService));
        system.build(dashboardPanels.get("Sistema"), snapshot, securitySummary);
        apps.renderApplicationsPanel(dashboardPanels.get("App"), content);
        services.build(dashboardPanels.get("Servizi"), snapshot);
        apps.applyDesktopControlState();

        selectDashboardSection(dashboardSection);
        restoreDashboardPosition();
    }

    private String dashboardGlyph(String section) {
        switch (section) {
            case "Panoramica": return "dashboard";
            case "Sistema": return "system";
            case "Servizi": return "services";
            default: return "apps";
        }
    }

    /** Sezione attiva: pillola luminosa ghiaccio→ciano, come il nucleo acceso. */
    private Drawable selectedTabSurface() {
        GradientDrawable pill = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[] { Color.rgb(236, 252, 251), Color.rgb(176, 240, 238) });
        pill.setCornerRadius(ui.dp(16));
        return pill;
    }

    // #endregion

    // #region Sezioni

    void selectDashboardSection(String name) {
        boolean changed = !dashboardSection.equals(name);
        List<String> order = new ArrayList<>(dashboardPanels.keySet());
        int direction = Integer.compare(order.indexOf(name), order.indexOf(dashboardSection));
        if (changed) rememberDashboardPosition();
        dashboardSection = name;
        if (changed) {
            dashboardPositions.put(name, 0);
            // Una nuova sequenza touch interrompe lo scroller nativo; uno
            // smoothScrollBy(0, 0) puo invece ripristinare il vecchio offset.
            long now = android.os.SystemClock.uptimeMillis();
            MotionEvent stop = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, 0, 0, 0);
            shell.scroll.onTouchEvent(stop);
            stop.setAction(MotionEvent.ACTION_CANCEL);
            shell.scroll.onTouchEvent(stop);
            stop.recycle();
            shell.scroll.scrollTo(0, 0);
            restoreDashboardPosition();
        }
        for (String key : dashboardPanels.keySet()) {
            boolean selected = key.equals(name);
            LinearLayout panel = dashboardPanels.get(key);
            panel.animate().cancel();
            panel.setAlpha(1f);
            panel.setTranslationY(0f);
            panel.setVisibility(selected ? View.VISIBLE : View.GONE);
            if (selected && changed) animateSectionEntry(panel, direction);
            Button tab = dashboardTabs.get(key);
            tab.setSelected(selected);
            tab.setTextColor(selected ? NexusUi.BG : Color.rgb(176, 202, 203));
            ui.decorateButton(tab, dashboardGlyph(key), selected ? NexusUi.BG : Color.rgb(140, 184, 186));
            tab.setBackground(ui.ripple(selected ? selectedTabSurface()
                : ui.withEdgeLight(ui.rounded(NexusUi.SURFACE, 16, Color.argb(26, 132, 190, 192)), 16, false)));
        }
        revealSelectedDashboardTab();
        host.onSectionChanged();
    }

    private void revealSelectedDashboardTab() {
        HorizontalScrollView strip = dashboardTabScroll;
        Button selected = dashboardTabs.get(dashboardSection);
        if (strip == null || selected == null) return;
        strip.post(() -> {
            if (strip != dashboardTabScroll || !selected.isSelected() || selected.getWidth() == 0) return;
            int start = strip.getScrollX(), width = strip.getWidth();
            int available = Math.max(0, strip.getChildAt(0).getWidth() - width);
            int target = Math.min(available, Math.max(0, selected.getLeft() - (width - selected.getWidth()) / 2));
            if (target != start) {
                if (motion.enabled()) strip.smoothScrollTo(Math.max(0, target), 0);
                else strip.scrollTo(Math.max(0, target), 0);
            }
        });
    }

    /**
     * Cambio sezione: il pannello entra dal lato della scheda scelta (destra se si
     * avanza, sinistra se si torna indietro) e le sue schede arrivano a onda.
     */
    private void animateSectionEntry(View panel, int direction) {
        if (panel == null) return;
        int generation = ++sectionEntryGeneration;
        sectionEntryGenerations.put(panel, generation);
        panel.animate().cancel();
        panel.setAlpha(1f);
        panel.setTranslationX(0f);
        panel.setTranslationY(0f);
        if (!motion.enabled()) {
            if (panel instanceof ViewGroup) motion.waveChildren((ViewGroup) panel, 0, () -> true);
            return;
        }
        panel.setAlpha(0f);
        // Folder contents have a different height. Animate only after their new
        // bounds are laid out, never the stale bounds from the previous folder.
        panel.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override public boolean onPreDraw() {
                panel.getViewTreeObserver().removeOnPreDrawListener(this);
                if (host.isClosed() || !Integer.valueOf(generation).equals(sectionEntryGenerations.get(panel)) || !panel.isShown()) {
                    panel.setAlpha(1f); panel.setTranslationX(0f);
                    return true;
                }
                float travel = ui.dp(motion.lowBudget() ? NexusMotion.SECTION_TRAVEL_DP / 2 : NexusMotion.SECTION_TRAVEL_DP);
                panel.setTranslationX(direction * travel);
                if (panel instanceof ViewGroup) motion.waveChildren((ViewGroup) panel, 0,
                    () -> !host.isClosed() && Integer.valueOf(generation).equals(sectionEntryGenerations.get(panel)));
                panel.animate().alpha(1f).translationX(0f).setDuration(motion.duration(NexusMotion.SECTION_SWAP))
                    .setInterpolator(motion.emphasized())
                    .withEndAction(() -> { panel.setAlpha(1f); panel.setTranslationX(0f); })
                    .start();
                return true;
            }
        });
    }

    // #endregion

    // #region Aggiornamenti dal vivo

    /** Nuova telemetria: aggiorna i valori sul posto, senza ricostruire le viste. */
    void update(JSONObject snapshot) {
        lastDashboardSnapshot = snapshot;
        setTaggedText("value:host", Formats.workstationDisplayName(snapshot));
        overview.update(snapshot);
        system.update(snapshot);
        services.update(snapshot);
        refreshCorePulse();
    }

    void updateSecurityOverview(JSONObject summary) { system.updateSecurityOverview(summary); }

    /** Telemetria in ritardo: lo dice nel riquadro di presenza. */
    void showStale(long lastTelemetryAt) {
        setTaggedText("health-summary", "  Dati non aggiornati");
        setTaggedText("live-updated", "Ultimo aggiornamento · " + Formats.formatUpdated(lastTelemetryAt));
    }

    void showSecurityUnavailable() { setTaggedText("value:Protezione", "Verifica non disponibile"); }

    void refreshCorePulse() {
        JSONObject nexusService = lastDashboardSnapshot == null ? null : lastDashboardSnapshot.optJSONObject("nexusService");
        setTaggedText("core-pulse-detail", apps.corePulseSummary(nexusService));
    }

    View findTagged(String tag) {
        View target = shell.content.findViewWithTag(tag);
        return target == null ? shell.navigation.findViewWithTag(tag) : target;
    }

    void setTaggedText(String tag, String value) {
        View target = findTagged(tag);
        if (target instanceof TextView && !value.contentEquals(((TextView) target).getText())) {
            ((TextView) target).setText(value);
            if ("value:host".equals(tag)) target.setContentDescription(value);
            shell.backdrop.postInvalidateOnAnimation();
        }
    }

    // #endregion
}
