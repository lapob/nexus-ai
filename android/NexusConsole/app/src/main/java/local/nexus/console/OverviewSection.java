package local.nexus.console;

import static local.nexus.console.Formats.percent;

import local.nexus.console.ui.MetricGaugeView;
import local.nexus.console.ui.NexusUi;
import local.nexus.console.ui.SparklineView;

import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Panoramica: presenza del PC che respira col nucleo, anelli di carico CPU e
 * GPU, memoria RAM e grafici sfumati dell'ultimo minuto.
 */
final class OverviewSection {
    private final DashboardScreen dashboard;
    private final NexusUi ui;

    OverviewSection(DashboardScreen dashboard, NexusUi ui) {
        this.dashboard = dashboard;
        this.ui = ui;
    }

    void build(LinearLayout overview, JSONObject snapshot, String corePulseSummary) {
        LinearLayout presence = ui.card();
        LinearLayout presenceRow = new LinearLayout(ui.context());
        presenceRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView dot = ui.text("●", 17, NexusUi.ACCENT);
        TextView online = ui.bold(ui.text("  PC connesso", 16, NexusUi.TEXT));
        online.setTag("health-summary");
        presenceRow.addView(dot);
        presenceRow.addView(online);
        TextView updated = ui.text("Dati in tempo reale · aggiornato ora", 13, NexusUi.MUTED);
        updated.setTag("live-updated");
        updated.setPadding(0, ui.dp(7), 0, 0);
        TextView corePulse = ui.text(corePulseSummary, 12, Color.rgb(113, 143, 144));
        corePulse.setTag("core-pulse-detail");
        corePulse.setPadding(0, ui.dp(5), 0, 0);
        presence.addView(presenceRow);
        presence.addView(updated);
        presence.addView(corePulse);
        overview.addView(presence, ui.wrapBlock());
        ui.motion().breathe(dot);

        LinearLayout liveMetrics = new LinearLayout(ui.context());
        liveMetrics.setOrientation(LinearLayout.HORIZONTAL);
        liveMetrics.addView(metricCard("CPU", percent(snapshot, "cpu", "percent")), new LinearLayout.LayoutParams(0, -2, 1));
        liveMetrics.addView(metricCard("GPU", percent(snapshot, "activity", "gpuPercent")), ui.spaced(0, -2, 1, 7));
        overview.addView(liveMetrics, ui.wrapBlock());

        LinearLayout memoryCard = ui.card();
        memoryCard.setBackground(ui.withEdgeLight(ui.rounded(Color.rgb(20, 38, 40), 24, Color.rgb(45, 69, 71)), 24, true));
        int ram = percent(snapshot, "memory", "percent");
        TextView memoryValue = ui.bold(ui.text(ram + "%", 40, NexusUi.TEXT));
        memoryValue.setTag("metric:RAM");
        memoryCard.addView(ui.eyebrow("MEMORIA RAM"));
        memoryCard.addView(memoryValue);
        memoryCard.addView(ui.chartRow("RAM", ram));
        overview.addView(memoryCard, ui.wrapBlock());

        TextView trends = ui.eyebrow("ULTIMO MINUTO");
        trends.setPadding(0, ui.dp(18), 0, ui.dp(8));
        overview.addView(trends);
        LinearLayout charts = ui.card();
        charts.addView(ui.chartRow("CPU", percent(snapshot, "cpu", "percent")));
        charts.addView(ui.chartRow("GPU", percent(snapshot, "activity", "gpuPercent")));
        charts.addView(ui.chartRow("DISCO", percent(snapshot, "activity", "diskPercent")));
        overview.addView(charts);
    }

    private LinearLayout metricCard(String label, int value) {
        LinearLayout metric = ui.card();
        metric.setGravity(Gravity.CENTER);
        TextView name = ui.text(label, 10, NexusUi.MUTED);
        name.setLetterSpacing(.12f);
        name.setGravity(Gravity.CENTER);
        TextView number = ui.bold(ui.text(value + "%", 19, value >= 90 ? NexusUi.DANGER : NexusUi.TEXT));
        number.setTag("metric:" + label);
        number.setGravity(Gravity.CENTER);
        // Anello di carico attorno al valore: si aggiorna da solo con la telemetria.
        FrameLayout dial = new FrameLayout(ui.context());
        MetricGaugeView gauge = new MetricGaugeView(ui.context(), ui.motion(), value);
        gauge.setTag("gauge:" + label);
        dial.addView(gauge, new FrameLayout.LayoutParams(ui.dp(96), ui.dp(96), Gravity.CENTER));
        dial.addView(number, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        metric.addView(name);
        LinearLayout.LayoutParams dialParams = new LinearLayout.LayoutParams(-1, ui.dp(100));
        dialParams.topMargin = ui.dp(4);
        metric.addView(dial, dialParams);
        return metric;
    }

    void update(JSONObject snapshot) {
        int cpu = percent(snapshot, "cpu", "percent");
        int gpu = percent(snapshot, "activity", "gpuPercent");
        int ram = percent(snapshot, "memory", "percent");
        JSONObject activity = snapshot.optJSONObject("activity");
        if (activity != null) {
            addChartValue("GPU", gpu);
            addChartValue("DISCO", activity.optInt("diskPercent"));
        }
        addChartValue("CPU", cpu);
        addChartValue("RAM", ram);
        updateHealthSummary(cpu, ram, gpu);
        dashboard.setTaggedText("live-updated", "Dati in tempo reale · " + Formats.formatUpdated(snapshot.optLong("updatedAt")));
        dashboard.setTaggedText("metric:CPU", cpu + "%");
        dashboard.setTaggedText("metric:GPU", gpu + "%");
        setGauge("CPU", cpu);
        setGauge("GPU", gpu);
        dashboard.setTaggedText("metric:RAM", ram + "%");
    }

    private void setGauge(String label, int value) {
        View target = dashboard.findTagged("gauge:" + label);
        if (target instanceof MetricGaugeView) ((MetricGaugeView) target).setValue(value);
        View number = dashboard.findTagged("metric:" + label);
        if (number instanceof TextView) ((TextView) number).setTextColor(value >= 90 ? NexusUi.DANGER : NexusUi.TEXT);
    }

    private void addChartValue(String label, int value) {
        View target = dashboard.findTagged("chart:" + label);
        if (target instanceof SparklineView) ((SparklineView) target).add(value);
        dashboard.setTaggedText("chart-value:" + label, value + "%");
    }

    private void updateHealthSummary(int cpu, int ram, int gpu) {
        boolean critical = cpu >= 90 || ram >= 90 || gpu >= 95;
        View target = dashboard.findTagged("health-summary");
        if (target instanceof TextView) {
            ((TextView) target).setText(critical ? "  Carico elevato" : "  PC connesso");
            ((TextView) target).setTextColor(critical ? NexusUi.DANGER : NexusUi.TEXT);
        }
    }
}
