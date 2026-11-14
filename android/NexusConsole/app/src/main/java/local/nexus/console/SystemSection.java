package local.nexus.console;

import static local.nexus.console.Formats.formatBytes;
import static local.nexus.console.Formats.formatRate;
import static local.nexus.console.Formats.formatUpdated;
import static local.nexus.console.Formats.formatUptime;
import static local.nexus.console.Formats.percent;

import local.nexus.console.ui.NexusUi;

import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Sistema: scheda tecnica della workstation (OS, CPU, GPU, RAM, rete, dischi,
 * prestazioni AI) con i segnali di sicurezza integrati, senza una pagina
 * dedicata duplicata.
 */
final class SystemSection {
    private final DashboardScreen dashboard;
    private final NexusUi ui;

    SystemSection(DashboardScreen dashboard, NexusUi ui) {
        this.dashboard = dashboard;
        this.ui = ui;
    }

    void build(LinearLayout system, JSONObject snapshot, JSONObject lastSecuritySummary) {
        JSONObject memory = snapshot.optJSONObject("memory");
        JSONObject cpu = snapshot.optJSONObject("cpu");
        JSONObject gpu = snapshot.optJSONObject("gpu");
        JSONObject activity = snapshot.optJSONObject("activity");
        JSONObject connection = snapshot.optJSONObject("network");
        JSONObject performance = snapshot.optJSONObject("performance");

        TextView technical = ui.eyebrow("DATI TECNICI");
        technical.setPadding(0, ui.dp(16), 0, ui.dp(9));
        system.addView(technical);

        LinearLayout specifications = ui.card();
        specifications.setTag("technical-details");
        JSONObject windows = snapshot.optJSONObject("windows");
        String systemName = windows != null && !windows.optString("caption").isEmpty() ? windows.optString("caption") : Formats.platformName(snapshot.optString("platform"));
        specifications.addView(ui.infoRow("Sistema", systemName));
        if (windows != null) specifications.addView(ui.infoRow("Versione", windows.optString("version", snapshot.optString("release")) + " · build " + windows.optString("build", "—")));
        specifications.addView(ui.infoRow("Architettura", snapshot.optString("architecture", "—").toUpperCase(Locale.ROOT)));
        specifications.addView(ui.divider());
        specifications.addView(ui.infoRow("CPU", cpu == null ? "Non rilevata" : cpu.optString("model", "CPU")));
        specifications.addView(ui.infoRow("Core logici", cpu == null ? "—" : String.valueOf(cpu.optInt("logicalCores"))));
        if (cpu != null && cpu.optInt("speedMhz") > 0) specifications.addView(ui.infoRow("Frequenza", cpu.optInt("speedMhz") + " MHz"));
        if (cpu != null) specifications.addView(ui.infoRow("Utilizzo CPU", cpu.optInt("percent") + "%"));
        specifications.addView(ui.divider());
        JSONArray gpus = snapshot.optJSONArray("gpus");
        if (gpus != null && gpus.length() > 0) {
            for (int index = 0; index < gpus.length(); index++) {
                JSONObject item = gpus.optJSONObject(index);
                if (item == null) continue;
                String suffix = item.optLong("memoryBytes") > 0 ? " · " + formatBytes(item.optLong("memoryBytes")) : "";
                specifications.addView(ui.infoRow("GPU " + (index + 1), item.optString("name", "GPU") + suffix));
                if (!item.optString("driverVersion").isEmpty()) specifications.addView(ui.infoRow("Driver GPU " + (index + 1), item.optString("driverVersion")));
            }
        } else {
            specifications.addView(ui.infoRow("GPU", gpu != null && gpu.optBoolean("available") ? gpu.optString("name", "Disponibile") : "Non rilevata"));
        }
        if (activity != null) specifications.addView(ui.infoRow("Utilizzo GPU", activity.optInt("gpuPercent") + "%"));
        specifications.addView(ui.divider());
        specifications.addView(ui.infoRow("RAM", memory == null ? "Non rilevata" : formatBytes(memory.optLong("usedBytes")) + " / " + formatBytes(memory.optLong("totalBytes"))));
        if (memory != null) specifications.addView(ui.infoRow("RAM disponibile", formatBytes(memory.optLong("freeBytes"))));
        if (memory != null) specifications.addView(ui.infoRow("Utilizzo RAM", memory.optInt("percent") + "%"));
        if (memory != null) specifications.addView(ui.progress(memory.optInt("percent")));
        specifications.addView(ui.divider());
        specifications.addView(ui.infoRow("Rete", Formats.networkSummary(connection)));
        if (connection != null && connection.optJSONArray("addresses") != null) specifications.addView(ui.infoRow("Indirizzi locali", Formats.join(connection.optJSONArray("addresses"))));
        if (activity != null) specifications.addView(ui.infoRow("Traffico rete", formatRate(activity.optLong("networkBytesPerSecond"))));
        JSONArray disks = snapshot.optJSONArray("storage");
        if (disks != null && disks.length() > 0) {
            specifications.addView(ui.divider());
            for (int index = 0; index < disks.length(); index++) {
                JSONObject disk = disks.optJSONObject(index);
                if (disk == null) continue;
                specifications.addView(ui.infoRow("Unità " + disk.optString("name"), formatBytes(disk.optLong("freeBytes")) + " liberi / " + formatBytes(disk.optLong("totalBytes"))));
            }
        }
        if (activity != null) specifications.addView(ui.infoRow("Attività dischi", activity.optInt("diskPercent") + "%"));
        JSONArray physicalDisks = snapshot.optJSONArray("physicalDisks");
        if (physicalDisks != null && physicalDisks.length() > 0) {
            specifications.addView(ui.divider());
            for (int index = 0; index < physicalDisks.length(); index++) {
                JSONObject disk = physicalDisks.optJSONObject(index);
                if (disk == null) continue;
                String temperature = disk.isNull("temperatureCelsius") ? "" : " · " + disk.optInt("temperatureCelsius") + " °C";
                specifications.addView(ui.infoRow("Disco fisico " + (index + 1), disk.optString("name") + " · " + Formats.translateHealth(disk.optString("health")) + temperature));
            }
        }
        specifications.addView(ui.infoRow("Tempo di attività", formatUptime(snapshot.optLong("uptimeSeconds"))));
        if (performance != null && performance.optInt("samples") > 0) {
            specifications.addView(ui.divider());
            specifications.addView(ui.infoRow("Richieste AI misurate", String.valueOf(performance.optInt("samples"))));
            specifications.addView(ui.infoRow("Preparazione P95", performance.optInt("prepareP95Ms") + " ms"));
            specifications.addView(ui.infoRow("Primo output P95", performance.optInt("firstTokenP95Ms") + " ms"));
            specifications.addView(ui.infoRow("Inferenza P95", performance.optInt("inferenceP95Ms") + " ms"));
            specifications.addView(ui.infoRow("Verifica P95", performance.optInt("verifyP95Ms") + " ms"));
        }
        specifications.addView(ui.divider());
        appendSecurityOverview(specifications, lastSecuritySummary);
        system.addView(specifications);
    }

    void update(JSONObject snapshot) {
        JSONObject memory = snapshot.optJSONObject("memory");
        dashboard.setTaggedText("value:RAM", formatBytes(memory == null ? 0 : memory.optLong("usedBytes")) + " / " + formatBytes(memory == null ? 0 : memory.optLong("totalBytes")));
        dashboard.setTaggedText("value:RAM disponibile", formatBytes(memory == null ? 0 : memory.optLong("freeBytes")));
        dashboard.setTaggedText("value:Utilizzo RAM", percent(snapshot, "memory", "percent") + "%");
        dashboard.setTaggedText("value:Utilizzo CPU", percent(snapshot, "cpu", "percent") + "%");
        JSONObject activity = snapshot.optJSONObject("activity");
        if (activity != null) {
            dashboard.setTaggedText("value:Utilizzo GPU", activity.optInt("gpuPercent") + "%");
            dashboard.setTaggedText("value:Attività dischi", activity.optInt("diskPercent") + "%");
            dashboard.setTaggedText("value:Traffico rete", formatRate(activity.optLong("networkBytesPerSecond")));
        }
        dashboard.setTaggedText("value:Tempo di attività", formatUptime(snapshot.optLong("uptimeSeconds")));
        JSONObject performance = snapshot.optJSONObject("performance");
        if (performance != null && performance.optInt("samples") > 0) {
            dashboard.setTaggedText("value:Richieste AI misurate", String.valueOf(performance.optInt("samples")));
            dashboard.setTaggedText("value:Preparazione P95", performance.optInt("prepareP95Ms") + " ms");
            dashboard.setTaggedText("value:Primo output P95", performance.optInt("firstTokenP95Ms") + " ms");
            dashboard.setTaggedText("value:Inferenza P95", performance.optInt("inferenceP95Ms") + " ms");
            dashboard.setTaggedText("value:Verifica P95", performance.optInt("verifyP95Ms") + " ms");
        }
        dashboard.setTaggedText("value:Rete", Formats.networkSummary(snapshot.optJSONObject("network")));
    }

    // #region Sicurezza nel pannello tecnico

    /** Mantiene i segnali di sicurezza nel pannello tecnico, senza una pagina duplicata. */
    private void appendSecurityOverview(LinearLayout target, JSONObject summary) {
        target.addView(ui.infoRow("Protezione", securityProtection(summary)));
        target.addView(ui.infoRow("Dispositivi autorizzati", securityDeviceCount(summary)));
        target.addView(ui.infoRow("Avvisi 24 ore", securityWarningCount(summary)));
        target.addView(ui.infoRow("Ultimo evento", latestSecurityEvent(summary)));
        target.addView(ui.infoRow("Registro locale", securityRegister(summary)));
    }

    void updateSecurityOverview(JSONObject summary) {
        dashboard.setTaggedText("value:Protezione", securityProtection(summary));
        dashboard.setTaggedText("value:Dispositivi autorizzati", securityDeviceCount(summary));
        dashboard.setTaggedText("value:Avvisi 24 ore", securityWarningCount(summary));
        dashboard.setTaggedText("value:Ultimo evento", latestSecurityEvent(summary));
        dashboard.setTaggedText("value:Registro locale", securityRegister(summary));
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

    // #endregion
}
