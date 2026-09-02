package local.nexus.remote;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Diagnostica crash locale e minimale. Non salva messaggi, prompt, URL, token,
 * stack trace o nomi di file e non effettua alcuna trasmissione di rete.
 */
public final class AndroidCrashStore {
    private static final String PREFS = "nexus_local_diagnostics";
    private static final String KEY = "crashes";
    private static final int MAX_REPORTS = 8;
    private static volatile boolean installed;

    private AndroidCrashStore() {}

    public static synchronized void install(Context context) {
        if (installed) return;
        installed = true;
        Context application = context.getApplicationContext();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            append(application, thread, error);
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private static void append(Context context, Thread thread, Throwable error) {
        try {
            SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray existing = new JSONArray(preferences.getString(KEY, "[]"));
            JSONArray bounded = new JSONArray();
            int first = Math.max(0, existing.length() - (MAX_REPORTS - 1));
            for (int index = first; index < existing.length(); index++) bounded.put(existing.get(index));
            bounded.put(new JSONObject()
                .put("at", System.currentTimeMillis())
                .put("exception", error == null ? "Unknown" : error.getClass().getSimpleName())
                .put("thread", thread != null && "main".equals(thread.getName()) ? "main" : "background")
                .put("sdk", Build.VERSION.SDK_INT)
                .put("version", BuildConfig.VERSION_NAME));
            preferences.edit().putString(KEY, bounded.toString()).apply();
        } catch (Exception ignored) {
            // La diagnostica non deve mai interferire con il normale crash handler.
        }
    }
}
