package local.nexus.console;

import local.nexus.console.ui.NexusUi;

import android.graphics.Color;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Servizi: stato dell'AI pubblica e del traffico (richieste, sessioni,
 * stream live), l'unica azione che cambia qualcosa — Arresta server, sempre
 * con conferma — e la cronologia locale delle ultime operazioni.
 */
final class ServicesSection {
    private final DashboardScreen dashboard;
    private final NexusUi ui;
    private final SafeActionHistory history;
    private final Runnable planServerStop;

    ServicesSection(DashboardScreen dashboard, NexusUi ui, SafeActionHistory history, Runnable planServerStop) {
        this.dashboard = dashboard;
        this.ui = ui;
        this.history = history;
        this.planServerStop = planServerStop;
    }

    void build(LinearLayout panel, JSONObject snapshot) {
        JSONObject nexusService = snapshot.optJSONObject("nexusService");
        LinearLayout services = ui.card();
        TextView servicesTitle = ui.bold(ui.text("Servizi NexusNXS", 16, NexusUi.TEXT));
        servicesTitle.setPadding(0, 0, 0, ui.dp(9));
        services.addView(servicesTitle);
        services.addView(ui.infoRow("AI pubblica", Formats.aiAvailability(nexusService)));
        JSONObject requests = nexusService == null ? null : nexusService.optJSONObject("requests");
        services.addView(ui.divider());
        LinearLayout activityMetrics = new LinearLayout(ui.context());
        boolean stackedMetrics = ui.context().getResources().getConfiguration().fontScale >= 1.3f;
        activityMetrics.setOrientation(stackedMetrics ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        activityMetrics.setPadding(0, ui.dp(12), 0, 0);
        activityMetrics.addView(serviceMetric("RICHIESTE", Formats.requestCount(requests), "requests"), serviceMetricParams(stackedMetrics, true));
        activityMetrics.addView(serviceMetric("SESSIONI", nexusService == null ? 0 : nexusService.optInt("anonymousSessions"), "sessions"), serviceMetricParams(stackedMetrics, false));
        activityMetrics.addView(serviceMetric("STREAM LIVE", nexusService == null ? 0 : nexusService.optInt("connectedStreams"), "streams"), serviceMetricParams(stackedMetrics, false));
        services.addView(activityMetrics);
        // Service values can wrap when the device uses a larger font scale.
        // Let the card measure its content instead of clipping the final rows.
        panel.addView(services, ui.wrapBlock());

        panel.addView(serverActions(), ui.wrapBlock());

        LinearLayout recent = ui.card();
        TextView historyTitle = ui.eyebrow("ULTIME OPERAZIONI");
        historyTitle.setPadding(0, 0, 0, ui.dp(7));
        TextView recentActions = ui.text("", 12, NexusUi.MUTED);
        recentActions.setLineSpacing(ui.dp(2), 1f);
        recent.addView(historyTitle);
        recent.addView(recentActions);
        history.bind(recentActions);
        panel.addView(recent, ui.wrapBlock());
    }

    /**
     * Lo stato del server si aggiorna da solo (telemetria live e varco
     * offline): resta solo l'azione che cambia davvero qualcosa.
     */
    private LinearLayout serverActions() {
        LinearLayout row = new LinearLayout(ui.context());
        boolean stacked = ui.context().getResources().getConfiguration().screenWidthDp < 420
            || ui.context().getResources().getConfiguration().fontScale >= 1.3f;
        row.setOrientation(stacked ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        Button stop = ui.action("Arresta server", "stop", NexusUi.DANGER_TEXT, false, true);
        stop.setOnClickListener(v -> planServerStop.run());
        stop.setMinHeight(ui.dp(56));
        stop.setPadding(ui.dp(16), ui.dp(12), ui.dp(16), ui.dp(12));
        row.addView(stop, stacked ? new LinearLayout.LayoutParams(-1, -2) : new LinearLayout.LayoutParams(0, -2, 1));
        return row;
    }

    private LinearLayout serviceMetric(String label, int value, String tag) {
        LinearLayout metric = new LinearLayout(ui.context());
        metric.setOrientation(LinearLayout.VERTICAL);
        metric.setGravity(Gravity.CENTER);
        metric.setPadding(ui.dp(4), ui.dp(7), ui.dp(4), ui.dp(6));
        metric.setBackground(ui.rounded(Color.rgb(7, 24, 25), 14, Color.argb(22, 101, 220, 216)));
        TextView number = ui.bold(ui.text(String.valueOf(Math.max(0, value)), 19, NexusUi.TEXT));
        number.setTag("service:" + tag);
        number.setGravity(Gravity.CENTER);
        TextView name = ui.text(label, 9, NexusUi.MUTED);
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setLineSpacing(0, .92f);
        name.setLetterSpacing(.07f);
        metric.addView(number);
        metric.addView(name);
        return metric;
    }

    private LinearLayout.LayoutParams serviceMetricParams(boolean stacked, boolean first) {
        LinearLayout.LayoutParams params = stacked
            ? new LinearLayout.LayoutParams(-1, -2) : new LinearLayout.LayoutParams(0, -2, 1);
        if (!first) params.setMargins(stacked ? 0 : ui.dp(7), stacked ? ui.dp(7) : 0, 0, 0);
        return params;
    }

    void update(JSONObject snapshot) {
        JSONObject nexusService = snapshot.optJSONObject("nexusService");
        dashboard.setTaggedText("value:AI pubblica", Formats.aiAvailability(nexusService));
        dashboard.setTaggedText("service:requests", String.valueOf(Formats.requestCount(nexusService == null ? null : nexusService.optJSONObject("requests"))));
        dashboard.setTaggedText("service:sessions", nexusService == null ? "0" : String.valueOf(nexusService.optInt("anonymousSessions")));
        dashboard.setTaggedText("service:streams", nexusService == null ? "0" : String.valueOf(nexusService.optInt("connectedStreams")));
    }
}
