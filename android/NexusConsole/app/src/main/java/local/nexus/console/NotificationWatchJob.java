package local.nexus.console;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Ascolto degli eventi server con l'app in background, senza servizi
 * persistenti né FCM. Un job JobScheduler tiene un long-poll autenticato:
 * la prima sessione dopo l'uscita dall'app dura pochi minuti (le generazioni
 * lunghe finiscono lì), poi le riprese si diradano con backoff fino a 30 min.
 * Doze e Battery Saver possono ritardare le riprese: è un compromesso voluto.
 */
public final class NotificationWatchJob extends JobService {
    static final int JOB_ID = 4201;
    private static final long WAIT_MS = 50_000L;
    private static final long FIRST_SESSION_MS = 8 * 60_000L;
    private static final long[] BACKOFF_MS = { 0L, 60_000L, 2 * 60_000L, 5 * 60_000L, 10 * 60_000L, 15 * 60_000L, 30 * 60_000L };

    private volatile boolean stopped;
    private volatile HttpURLConnection active;

    /** Avvia l'ascolto dopo l'uscita dall'app; senza permesso o sessione non pianifica nulla. */
    static void start(Context context) {
        if (!ConsoleNotifications.canPost(context)) return;
        ConsoleNotifications.markBackground(context);
        schedule(context, 3_000L);
    }

    static void cancel(Context context) {
        context.getSystemService(JobScheduler.class).cancel(JOB_ID);
    }

    private static void schedule(Context context, long delayMs) {
        long latency = Math.max(0L, delayMs);
        JobInfo.Builder builder = new JobInfo.Builder(JOB_ID, new ComponentName(context, NotificationWatchJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setMinimumLatency(latency)
            // Senza scadenza Android 15+ applica la "flessibilità" e può rinviare
            // il job di molti minuti: la scadenza limita il ritardo, non lo anticipa.
            .setOverrideDeadline(latency + Math.max(30_000L, latency / 4))
            .setBackoffCriteria(60_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .setPersisted(false);
        // Solo la sessione subito dopo l'uscita dall'app è "attesa" dall'utente.
        if (android.os.Build.VERSION.SDK_INT >= 33) builder.setPriority(latency <= 5_000L ? JobInfo.PRIORITY_HIGH : JobInfo.PRIORITY_DEFAULT);
        context.getSystemService(JobScheduler.class).schedule(builder.build());
    }

    @Override public boolean onStartJob(JobParameters params) {
        if (ConsoleNotifications.appInForeground) return false;
        stopped = false;
        new Thread(() -> run(params), "nexus-notification-watch").start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        stopped = true;
        HttpURLConnection connection = active;
        if (connection != null) connection.disconnect();
        // Il sistema ripianifica con il backoff dichiarato.
        return !ConsoleNotifications.appInForeground;
    }

    private void run(JobParameters params) {
        Context context = getApplicationContext();
        SharedPreferences prefs = ConsoleNotifications.prefs(context);
        int step = prefs.getInt("backoffStep", 0);
        long budget = step == 0 ? FIRST_SESSION_MS : WAIT_MS + 5_000L;
        long deadline = System.currentTimeMillis() + budget;
        boolean keepWatching = true;
        boolean delivered = false;
        String token = new SecureTokenStore(context).read();
        if (token.isEmpty()) keepWatching = false;
        while (keepWatching && !stopped && !ConsoleNotifications.appInForeground && System.currentTimeMillis() < deadline) {
            long remaining = deadline - System.currentTimeMillis();
            int outcome = poll(context, token, Math.max(1_000L, Math.min(WAIT_MS, remaining - 2_000L)));
            if (outcome == POLL_UNAUTHORIZED) keepWatching = false;
            else if (outcome == POLL_FAILED) break;
            else if (outcome == POLL_DELIVERED) delivered = true;
        }
        if (stopped) return;
        jobFinished(params, false);
        if (!keepWatching || ConsoleNotifications.appInForeground) return;
        int next = delivered ? 1 : Math.min(step + 1, BACKOFF_MS.length - 1);
        prefs.edit().putInt("backoffStep", next).apply();
        schedule(context, BACKOFF_MS[next]);
    }

    private static final int POLL_EMPTY = 0, POLL_DELIVERED = 1, POLL_FAILED = 2, POLL_UNAUTHORIZED = 3;

    private int poll(Context context, String token, long waitMs) {
        StringBuilder query = new StringBuilder("/api/notifications/events?wait=").append(waitMs);
        long cursor = ConsoleNotifications.cursor(context);
        String instance = ConsoleNotifications.instance(context);
        if (cursor >= 0 && !instance.isEmpty()) query.append("&since=").append(cursor).append("&instance=").append(instance);
        for (String candidate : candidates(context)) {
            if (stopped) return POLL_FAILED;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(candidate + query).openConnection();
                active = connection;
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(4_000);
                connection.setReadTimeout((int) waitMs + 15_000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                int status = connection.getResponseCode();
                if (status == 401 || status == 403) return POLL_UNAUTHORIZED;
                if (status != 200) continue;
                StringBuilder text = new StringBuilder();
                try (InputStream stream = connection.getInputStream();
                     BufferedReader input = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line; while ((line = input.readLine()) != null) text.append(line);
                }
                JSONObject result = new JSONObject(text.toString());
                int shown = ConsoleNotifications.deliver(context, result, false);
                return shown > 0 ? POLL_DELIVERED : POLL_EMPTY;
            } catch (Exception ignored) {
                // Candidato non raggiungibile: si prova il successivo.
            } finally {
                if (connection != null) connection.disconnect();
                active = null;
            }
        }
        return POLL_FAILED;
    }

    private static List<String> candidates(Context context) {
        String saved = context.getSharedPreferences("NativeMainActivity", Context.MODE_PRIVATE).getString("serverUrl", "");
        String primary = BuildConfig.NEXUS_URL.replaceAll("/console$", "");
        String fallback = BuildConfig.NEXUS_FALLBACK_URL.replaceAll("/$", "");
        String lan = BuildConfig.NEXUS_LAN_URL.replaceAll("/$", "");
        List<String> configured = new ArrayList<>();
        if (!primary.isEmpty()) configured.add(primary);
        if (!fallback.isEmpty() && !configured.contains(fallback)) configured.add(fallback);
        if (!lan.isEmpty() && !configured.contains(lan)) configured.add(lan);
        List<String> result = new ArrayList<>();
        if (configured.contains(saved)) result.add(saved);
        for (String candidate : configured) if (!result.contains(candidate)) result.add(candidate);
        return result;
    }
}
