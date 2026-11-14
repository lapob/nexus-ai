package local.nexus.console;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/** Testi mostrati all'utente a partire dalla telemetria: unità, durate, stati. */
final class Formats {
    private Formats() {}

    static String workstationDisplayName(JSONObject snapshot) {
        String value = snapshot == null ? "" : snapshot.optString("displayName", "").trim();
        return value.isEmpty() ? "NXS-CORE-01" : value.toUpperCase(Locale.ROOT);
    }

    static String aiAvailability(JSONObject nexusService) {
        if (nexusService == null || !(nexusService.opt("aiReady") instanceof Boolean)) return "Da verificare";
        return nexusService.optBoolean("aiReady") ? "Operativa" : "Non disponibile";
    }

    static int requestCount(JSONObject requests) {
        return requests == null ? 0 : Math.max(0, requests.optInt("active")) + Math.max(0, requests.optInt("queued"));
    }

    /** Percentuale di un blocco della telemetria, 0 se il blocco manca. */
    static int percent(JSONObject snapshot, String block, String field) {
        JSONObject value = snapshot == null ? null : snapshot.optJSONObject(block);
        return value == null ? 0 : value.optInt(field);
    }

    static String join(JSONArray values) {
        if (values == null || values.length() == 0) return "—";
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < values.length(); index++) {
            if (index > 0) result.append(" · ");
            result.append(values.optString(index));
        }
        return result.toString();
    }

    static String platformName(String value) {
        if ("win32".equalsIgnoreCase(value)) return "Windows";
        if ("darwin".equalsIgnoreCase(value)) return "macOS";
        if ("linux".equalsIgnoreCase(value)) return "Linux";
        return value == null || value.isEmpty() ? "Non rilevato" : value;
    }

    static String formatBytes(long bytes) {
        if (bytes <= 0) return "—";
        double gib = bytes / 1073741824d;
        if (gib >= 1) return String.format(Locale.getDefault(), "%.1f GB", gib);
        return String.format(Locale.getDefault(), "%d MB", Math.round(bytes / 1048576d));
    }

    static String formatRate(long bytesPerSecond) {
        if (bytesPerSecond <= 0) return "0 KB/s";
        if (bytesPerSecond >= 1048576) return String.format(Locale.getDefault(), "%.1f MB/s", bytesPerSecond / 1048576d);
        return String.format(Locale.getDefault(), "%.0f KB/s", bytesPerSecond / 1024d);
    }

    static String translateHealth(String value) {
        if ("Healthy".equalsIgnoreCase(value)) return "Integro";
        if ("Warning".equalsIgnoreCase(value)) return "Attenzione";
        if ("Unhealthy".equalsIgnoreCase(value)) return "Critico";
        return "Stato non disponibile";
    }

    static String formatUptime(long seconds) {
        if (seconds <= 0) return "—";
        long days = seconds / 86400;
        long hours = (seconds % 86400) / 3600;
        long minutes = (seconds % 3600) / 60;
        if (days > 0) return days + " g " + hours + " h";
        if (hours > 0) return hours + " h " + minutes + " min";
        return minutes + " min";
    }

    static String formatUpdated(long timestamp) {
        if (timestamp <= 0) return "Adesso";
        return android.text.format.DateFormat.format("HH:mm:ss", timestamp).toString();
    }

    static String networkSummary(JSONObject connection) {
        return connection != null && connection.optBoolean("online") ? "Online · " + connection.optInt("interfaces") + " interfacce" : "Offline";
    }
}
