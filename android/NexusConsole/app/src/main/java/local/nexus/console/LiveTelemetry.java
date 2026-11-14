package local.nexus.console;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Un solo canale autenticato porta la telemetria mentre l'app e visibile.
 * Il polling rimane un fallback: nessun servizio o socket sopravvive a onPause.
 */
final class LiveTelemetry {
    interface Listener {
        /** Vero solo con Activity viva, in primo piano e dashboard sullo schermo. */
        boolean wantsLive();
        void onSnapshot(JSONObject snapshot);
        void onNotifications(JSONObject batch);
        /** Il flusso si è chiuso senza revoca: ripiego sul polling e nuovo tentativo. */
        void onStreamEnded();
    }

    private final ExecutorService liveEvents = Executors.newSingleThreadExecutor();
    private final ConsoleSession session;
    private final ConsoleSession.Host host;
    private final Listener listener;
    private volatile boolean liveEventsRunning;
    private volatile boolean liveTelemetryActive;
    private volatile HttpURLConnection liveEventConnection;
    private volatile int liveEventGeneration;

    LiveTelemetry(ConsoleSession session, ConsoleSession.Host host, Listener listener) {
        this.session = session;
        this.host = host;
        this.listener = listener;
    }

    /** Vero mentre arrivano eventi: il polling di ripiego resta fermo. */
    boolean isActive() { return liveTelemetryActive; }

    void start() {
        if (host.isClosed() || !session.signedIn() || !listener.wantsLive() || liveEventsRunning || liveEvents.isShutdown()) return;
        liveEventsRunning = true;
        final int generation = ++liveEventGeneration;
        final String requestToken = session.token();
        try {
            liveEvents.execute(() -> {
                boolean unauthorized = false;
                try {
                    for (String candidate : session.connectionCandidates()) {
                        if (!isLiveEventGeneration(generation, requestToken)) break;
                        HttpURLConnection connection = null;
                        try {
                            connection = (HttpURLConnection) new URL(candidate + "/api/system/telemetry/stream").openConnection();
                            liveEventConnection = connection;
                            session.track(connection);
                            connection.setInstanceFollowRedirects(false);
                            connection.setRequestMethod("GET");
                            connection.setConnectTimeout(2500);
                            connection.setReadTimeout(35_000);
                            connection.setRequestProperty("Accept", "text/event-stream");
                            connection.setRequestProperty("Authorization", "Bearer " + requestToken);
                            int status = connection.getResponseCode();
                            if (status == 401) { unauthorized = true; break; }
                            if (status != 200) continue;
                            session.rememberServer(candidate);
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
                            session.release(connection);
                            if (liveEventConnection == connection) liveEventConnection = null;
                        }
                    }
                } finally {
                    final boolean clearSession = unauthorized;
                    host.runOnUi(() -> {
                        if (generation != liveEventGeneration) return;
                        liveEventsRunning = false;
                        liveTelemetryActive = false;
                        if (clearSession && requestToken.equals(session.token())) {
                            session.rejectSession(requestToken);
                            return;
                        }
                        listener.onStreamEnded();
                    });
                }
            });
        } catch (RejectedExecutionException ignored) { liveEventsRunning = false; }
    }

    private boolean isLiveEventGeneration(int generation, String requestToken) {
        return !host.isClosed() && listener.wantsLive() && generation == liveEventGeneration && requestToken.equals(session.token());
    }

    private void consumeLiveEvent(String raw, int generation, String requestToken) {
        try {
            JSONObject event = new JSONObject(raw);
            if ("notification".equals(event.optString("type"))) {
                JSONObject notification = event.optJSONObject("notification");
                if (notification == null) return;
                JSONObject batch = new JSONObject()
                    .put("instance", event.optString("instance", ""))
                    .put("cursor", notification.optLong("cursor", -1L))
                    .put("events", new JSONArray().put(notification));
                host.runOnUi(() -> listener.onNotifications(batch));
                return;
            }
            if (!"telemetry".equals(event.optString("type"))) return;
            JSONObject snapshot = event.optJSONObject("snapshot");
            if (snapshot == null) return;
            host.runOnUi(() -> {
                if (!isLiveEventGeneration(generation, requestToken)) return;
                liveTelemetryActive = true;
                listener.onSnapshot(snapshot);
            });
        } catch (Exception ignored) { }
    }

    void stop() {
        liveEventGeneration++;
        liveEventsRunning = false;
        liveTelemetryActive = false;
        HttpURLConnection connection = liveEventConnection;
        liveEventConnection = null;
        if (connection != null) connection.disconnect();
    }

    void shutdown() {
        stop();
        liveEvents.shutdownNow();
    }
}
