package local.nexus.console;

import android.content.Context;
import android.content.SharedPreferences;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Date;

/** Cronologia locale e compatta delle ultime operazioni confermate (al massimo tre). */
final class SafeActionHistory {
    private static final String SAFE_ACTION_HISTORY = "safeActionHistoryV1";
    private final Context context;
    private final SharedPreferences preferences;
    private TextView target;

    SafeActionHistory(Context context, SharedPreferences preferences) {
        this.context = context;
        this.preferences = preferences;
    }

    /** La vista che mostra la cronologia; null quando la dashboard viene ricostruita. */
    void bind(TextView view) {
        target = view;
        if (view != null) view.setText(read());
    }

    void record(String label) {
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
        if (target != null) target.setText(read());
    }

    String read() {
        JSONArray history;
        try { history = new JSONArray(preferences.getString(SAFE_ACTION_HISTORY, "[]")); }
        catch (Exception ignored) { history = new JSONArray(); }
        if (history.length() == 0) return "Nessuna operazione recente";
        StringBuilder text = new StringBuilder();
        for (int index = 0; index < Math.min(history.length(), 3); index++) {
            JSONObject entry = history.optJSONObject(index);
            if (entry == null) continue;
            if (text.length() > 0) text.append('\n');
            // Gli orari seguono il formato 12/24 h del dispositivo.
            String time = android.text.format.DateFormat.getTimeFormat(context).format(new Date(entry.optLong("at")));
            text.append(entry.optString("label", "Operazione")).append("  ·  ").append(time);
        }
        return text.length() == 0 ? "Nessuna operazione recente" : text.toString();
    }
}
