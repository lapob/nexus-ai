package local.nexus.console;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Sessione privata con la workstation: token cifrato (SecureTokenStore) con
 * rotazione giornaliera, identità hardware (DeviceIdentityStore) che firma ogni
 * comando sensibile, e tutte le richieste HTTPS verso gli ingressi configurati.
 *
 * Nessuna classe dell'interfaccia apre connessioni da sé: passano tutte da qui,
 * così redirect disabilitati, timeout e gestione del 401 restano in un punto.
 */
final class ConsoleSession {
    interface Host {
        boolean isForeground();
        boolean isClosed();
        void runOnUi(Runnable action);
        /** Nessun ingresso ha risposto: mostrare il varco offline. */
        void onConnectionLost();
        /** Bootstrap riuscito: aprire la superficie autenticata. */
        void onSignedIn();
        /** Una risposta valida azzera il backoff di riconnessione. */
        void onServerReachable();
    }

    interface ObjectCallback { void accept(JSONObject value); }
    interface RescueCallback { void accept(int status, JSONObject value); }

    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private final Set<HttpURLConnection> activeConnections = ConcurrentHashMap.newKeySet();
    private final SharedPreferences preferences;
    private final SecureTokenStore secureTokenStore;
    private final DeviceIdentityStore deviceIdentityStore;
    private final Host host;
    private volatile String token;
    private volatile String serverUrl;
    private boolean sessionRotationInFlight;
    private boolean bootstrapInFlight;

    ConsoleSession(Context context, SharedPreferences preferences, Host host) {
        this.preferences = preferences;
        this.host = host;
        secureTokenStore = new SecureTokenStore(context);
        deviceIdentityStore = new DeviceIdentityStore(context);
        token = secureTokenStore.read();
        // Un token senza identità hardware registrata non viene mai riusato.
        if (!token.isEmpty() && !preferences.getBoolean("identityEnrolled", false)) {
            token = "";
            secureTokenStore.clear();
        }
        serverUrl = preferences.getString("serverUrl", "");
    }

    String token() { return token; }
    boolean signedIn() { return !token.isEmpty(); }
    boolean rotationInFlight() { return sessionRotationInFlight; }

    // #region Credenziali: bootstrap, rotazione, revoca

    void bootstrapConsole() {
        if (bootstrapInFlight || host.isClosed() || !token.isEmpty()) return;
        bootstrapInFlight = true;
        JSONObject enrollment;
        try { enrollment = deviceIdentityStore.enrollment(); }
        catch (Exception error) { bootstrapInFlight = false; if (host.isForeground()) host.onConnectionLost(); return; }
        JSONObject bootstrapBody = json("deviceName", android.os.Build.MODEL);
        try { bootstrapBody.put("deviceIdentity", enrollment); }
        catch (Exception ignored) { bootstrapInFlight = false; return; }
        request("POST", "/api/console/bootstrap", bootstrapBody, false, result -> {
            bootstrapInFlight = false;
            token = result.optString("token");
            if (token.isEmpty()) { if (host.isForeground()) host.onConnectionLost(); return; }
            secureTokenStore.write(token);
            JSONObject identity = result.optJSONObject("identity");
            preferences.edit().putBoolean("identityEnrolled", identity != null && identity.optBoolean("enrolled")).apply();
            preferences.edit().putLong("tokenRotatedAt", System.currentTimeMillis()).apply();
            if (host.isForeground()) host.onSignedIn();
        }, false, () -> bootstrapInFlight = false);
    }

    /** Ruota il token una volta al giorno; true se una rotazione è in corso. */
    boolean rotateSessionIfDue(Runnable completed) {
        if (sessionRotationInFlight) return true;
        if (token.isEmpty() || System.currentTimeMillis() - preferences.getLong("tokenRotatedAt", 0L) < 86_400_000L) return false;
        sessionRotationInFlight = true;
        request("POST", "/api/session/rotate", new JSONObject(), true, result -> {
            sessionRotationInFlight = false;
            String rotated = result.optString("token");
            if (!rotated.isEmpty()) {
                token = rotated;
                secureTokenStore.write(token);
                preferences.edit().putLong("tokenRotatedAt", result.optLong("rotatedAt", System.currentTimeMillis())).apply();
            }
            completed.run();
        }, true, () -> { sessionRotationInFlight = false; completed.run(); });
        return true;
    }

    /**
     * Il server ha rifiutato la credenziale. Si cancella solo se è ancora
     * quella inviata: un 401 tardivo non cancella il token di una rotazione.
     */
    void rejectSession(String requestToken) {
        if (!requestToken.equals(token)) return;
        token = "";
        secureTokenStore.clear();
        bootstrapConsole();
    }

    String signPayload(String payload) throws Exception {
        return deviceIdentityStore.signPayload(payload);
    }

    // #endregion

    // #region Richieste

    /**
     * I comandi di apertura sono operazioni best-effort distinte dalla sonda di
     * raggiungibilita. L'applicazione desktop puo impiegare alcuni secondi ad
     * avviarsi: un timeout della conferma non deve distruggere la dashboard,
     * invalidare la sessione o mostrare falsamente il PC come offline.
     */
    void requestCommandWithProof(String purpose, String path, JSONObject body, ObjectCallback done, Runnable onFailure) {
        requestWithProof(purpose, path, body, done, true, () -> {
            if (onFailure != null) onFailure.run();
        });
    }

    void requestWithProof(String purpose, String path, JSONObject body, ObjectCallback done) {
        requestWithProof(purpose, path, body, done, false, () -> { });
    }

    /** Ogni comando sensibile porta la firma della chiave hardware su una sfida del server. */
    void requestWithProof(String purpose, String path, JSONObject body, ObjectCallback done, boolean silentFailure, Runnable onFailure) {
        request("POST", "/api/device/challenge", json("purpose", purpose), true, challenge -> {
            try {
                JSONObject proof = new JSONObject()
                    .put("challengeId", challenge.optString("challengeId"))
                    .put("signature", deviceIdentityStore.signPayload(challenge.optString("payload")));
                body.put("deviceProof", proof);
                request("POST", path, body, true, done, silentFailure, onFailure);
            } catch (Exception error) {
                onFailure.run();
                if (!silentFailure && host.isForeground()) host.onConnectionLost();
            }
        }, silentFailure, onFailure);
    }

    void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done) {
        request(method, path, body, authenticated, done, false);
    }

    void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done, boolean silentFailure) {
        request(method, path, body, authenticated, done, silentFailure, () -> { });
    }

    void request(String method, String path, JSONObject body, boolean authenticated, ObjectCallback done, boolean silentFailure, Runnable onFailure) {
        if (host.isClosed() || network.isShutdown()) return;
        // Associa la risposta alla credenziale realmente inviata. Una richiesta
        // partita prima della rotazione puo ricevere 401 dopo che il token nuovo
        // e gia stato salvato: in quel caso non deve cancellare la sessione nuova.
        final String requestToken = authenticated ? token : "";
        try {
            network.execute(() -> {
                for (String candidate : connectionCandidates()) {
                    HttpURLConnection connection = null;
                    try {
                        connection = open(candidate + path, method, path.contains("/power/") ? 30000 : 10000, requestToken, body);
                        int status = connection.getResponseCode();
                        String text = readBody(connection, status, Integer.MAX_VALUE);
                        if (status == 401) {
                            host.runOnUi(() -> {
                                onFailure.run();
                                if (!authenticated) {
                                    if (!silentFailure && host.isForeground()) host.onConnectionLost();
                                    return;
                                }
                                if (sessionRotationInFlight && !"/api/session/rotate".equals(path)) return;
                                rejectSession(requestToken);
                            });
                            return;
                        }
                        if (status < 200 || status >= 300) throw new Exception("unavailable");
                        JSONObject result = new JSONObject(text);
                        rememberServer(candidate);
                        host.runOnUi(() -> { host.onServerReachable(); done.accept(result); });
                        return;
                    } catch (Exception ignored) { }
                    finally { release(connection); }
                }
                host.runOnUi(() -> {
                    onFailure.run();
                    if (!silentFailure && host.isForeground()) host.onConnectionLost();
                });
            });
        } catch (RejectedExecutionException ignored) {
            // La chiusura dell'activity prevale su un refresh arrivato in ritardo.
        }
    }

    /**
     * Richiesta al punto di ripristino del Desktop Bridge. A differenza di
     * request() non porta mai al varco offline né tocca la sessione: riporta
     * soltanto lo stato HTTP (-1 se nessun ingresso ha risposto).
     */
    void rescueRequest(String method, String path, JSONObject body, RescueCallback done) {
        if (host.isClosed() || network.isShutdown()) return;
        final String requestToken = token;
        try {
            network.execute(() -> {
                int lastStatus = -1;
                JSONObject lastResult = null;
                for (String candidate : connectionCandidates()) {
                    HttpURLConnection connection = null;
                    try {
                        connection = open(candidate + path, method, 8000, requestToken, body);
                        int status = connection.getResponseCode();
                        String text = readBody(connection, status, 16_384);
                        JSONObject parsed = null;
                        try { parsed = new JSONObject(text); } catch (Exception ignored) { }
                        lastStatus = status;
                        lastResult = parsed;
                        if (status >= 200 && status < 300) break;
                    } catch (Exception ignored) { }
                    finally { release(connection); }
                }
                final int status = lastStatus;
                final JSONObject result = lastResult;
                host.runOnUi(() -> done.accept(status, result));
            });
        } catch (RejectedExecutionException ignored) { }
    }

    /** Connessione HTTPS senza redirect: un ingresso non può dirottare la credenziale. */
    private HttpURLConnection open(String url, String method, int readTimeout, String requestToken, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        track(connection);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        connection.setConnectTimeout(2500);
        connection.setReadTimeout(readTimeout);
        connection.setRequestProperty("Accept", "application/json");
        if (!requestToken.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + requestToken);
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        }
        return connection;
    }

    private static String readBody(HttpURLConnection connection, int status, int limit) throws Exception {
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) try (BufferedReader input = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line; while ((line = input.readLine()) != null && text.length() < limit) text.append(line);
        }
        return text.toString();
    }

    void track(HttpURLConnection connection) { activeConnections.add(connection); }

    void release(HttpURLConnection connection) {
        if (connection == null) return;
        activeConnections.remove(connection);
        connection.disconnect();
    }

    // #endregion

    /** Primario, eventuale secondo ingresso privato e LAN; l'ultimo che ha risposto va per primo. */
    List<String> connectionCandidates() {
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

    void rememberServer(String candidate) {
        serverUrl = candidate;
        preferences.edit().putString("serverUrl", serverUrl).apply();
    }

    static JSONObject json(Object... entries) {
        JSONObject value = new JSONObject();
        try { for (int index = 0; index + 1 < entries.length; index += 2) value.put(String.valueOf(entries[index]), entries[index + 1]); }
        catch (Exception ignored) { }
        return value;
    }

    void shutdown() {
        for (HttpURLConnection connection : activeConnections) connection.disconnect();
        activeConnections.clear();
        network.shutdownNow();
    }
}
