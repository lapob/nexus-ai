package local.nexus.console;

import static local.nexus.console.ConsoleSession.json;
import static local.nexus.console.ui.NexusGateView.PC_OFFLINE;
import static local.nexus.console.ui.NexusGateView.PROBING;
import static local.nexus.console.ui.NexusGateView.SERVER_OFFLINE;
import static local.nexus.console.ui.NexusGateView.SERVER_STARTING;

import local.nexus.console.ui.NexusGateView;
import local.nexus.console.ui.NexusUi;

import android.graphics.Color;
import android.os.Handler;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Varco offline: nessuna funzione resta accessibile finché il server non
 * risponde. Sostituisce l'intero contenuto e nasconde navigazione e dock.
 *
 * Distingue il PC irraggiungibile (nessuna risposta dal collegamento privato)
 * dal server spento con PC acceso (risponde il Desktop Bridge su /rescue): in
 * quel caso il server si riaccende dal telefono, dopo biometria e con la firma
 * della chiave hardware su una sfida del Bridge.
 */
final class OfflineGate {
    private final NativeMainActivity host;
    private final ConsoleShell shell;
    private final NexusUi ui;
    private final ConsoleSession session;
    private final DeviceAuthenticator authenticator;
    private final Handler main;
    private int gateKind = PROBING;
    private boolean gateRescueAvailable;
    private boolean gateOwnerStopped;
    private boolean gateProbeInFlight;
    private boolean rescueStartInFlight;
    private String renderedGateKey = "";
    private int renderedGeneration = -1;
    private long lastGateFastReconnectAt;
    private final Runnable gateProbe = this::probeGate;

    OfflineGate(NativeMainActivity host, ConsoleShell shell, NexusUi ui, ConsoleSession session, DeviceAuthenticator authenticator, Handler main) {
        this.host = host;
        this.shell = shell;
        this.ui = ui;
        this.session = session;
        this.authenticator = authenticator;
        this.main = main;
    }

    /** Il varco è la superficie attuale (nessun'altra schermata l'ha sostituito). */
    boolean isRendered() {
        return !renderedGateKey.isEmpty() && renderedGeneration == shell.contentGeneration();
    }

    private boolean gateOnScreen() {
        return isRendered() && host.isForegroundActive();
    }

    void show() {
        renderGate();
        probeGate();
    }

    private void renderGate() {
        if (!host.isForegroundActive()) return;
        String key = gateKind + ":" + gateRescueAvailable + ":" + gateOwnerStopped + ":" + rescueStartInFlight;
        if (key.equals(renderedGateKey) && isRendered() && shell.content.getChildCount() > 0) return;
        shell.swapContent(this::buildGate);
        renderedGateKey = key;
        renderedGeneration = shell.contentGeneration();
    }

    private void buildGate() {
        LinearLayout content = shell.content;
        content.setGravity(Gravity.CENTER);
        boolean server = gateKind == SERVER_OFFLINE || gateKind == SERVER_STARTING;
        NexusGateView gate = new NexusGateView(ui.context(), ui.motion(), gateKind);
        gate.setContentDescription(gateKind == PC_OFFLINE ? "PC non raggiungibile"
            : gateKind == SERVER_STARTING ? "Server in riaccensione" : server ? "Server spento" : "Verifica del collegamento");
        content.addView(gate, new LinearLayout.LayoutParams(-1, ui.dp(212)));

        TextView chip = ui.chip(gateKind == PC_OFFLINE ? "NEXUS · OFFLINE"
                : gateKind == SERVER_STARTING ? "NEXUS · AVVIO" : server ? "NEXUS · SERVER SPENTO" : "NEXUS · VERIFICA",
            server ? Color.rgb(246, 205, 160) : Color.rgb(150, 178, 180),
            server ? Color.rgb(28, 20, 12) : Color.rgb(9, 22, 24),
            server ? Color.argb(70, 246, 190, 128) : Color.argb(40, 132, 190, 192));
        LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(-2, -2);
        chipParams.gravity = Gravity.CENTER_HORIZONTAL;
        chipParams.bottomMargin = ui.dp(14);
        content.addView(chip, chipParams);

        TextView title = ui.bold(ui.text(gateKind == PC_OFFLINE ? "PC non raggiungibile"
            : gateKind == SERVER_STARTING ? "Riaccensione in corso"
            : server ? "Server NexusNXS spento" : "Verifica del collegamento", 23, NexusUi.TEXT));
        title.setGravity(Gravity.CENTER);
        title.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        title.setPadding(ui.dp(8), 0, ui.dp(8), ui.dp(10));
        content.addView(title, new LinearLayout.LayoutParams(-1, -2));

        String message;
        if (gateKind == PC_OFFLINE) message = "Il computer è spento, in sospensione o fuori dalla rete privata. Control si riconnette da solo appena torna disponibile.";
        else if (gateKind == SERVER_STARTING) message = "Il server si sta avviando sul PC. Il primo avvio può richiedere qualche minuto: Control entra da solo appena è pronto.";
        else if (server && !gateRescueAvailable) message = "Il PC è acceso ma il server non risponde e il collegamento desktop non è attivo. Riaccendi il server dal PC.";
        else if (server && gateOwnerStopped) message = "Il server è stato spento di proposito. Riaccenderlo lo rimette in funzione e riattiva il riavvio automatico.";
        else if (server) message = "Il PC è acceso ma il server non risponde. Puoi riaccenderlo da qui.";
        else message = "Sto controllando se il PC e il server sono raggiungibili.";
        TextView detail = ui.text(message, 14, NexusUi.MUTED);
        detail.setGravity(Gravity.CENTER);
        detail.setLineSpacing(ui.dp(2), 1f);
        detail.setPadding(ui.dp(18), 0, ui.dp(18), ui.dp(26));
        content.addView(detail, new LinearLayout.LayoutParams(-1, -2));

        if (server) {
            boolean starting = gateKind == SERVER_STARTING || rescueStartInFlight;
            Button start = ui.action(starting ? "Avvio in corso…" : "Riaccendi il server", "power", Color.rgb(211, 242, 241), true, false);
            start.setEnabled(gateRescueAvailable && !starting);
            start.setContentDescription(starting ? "Avvio del server in corso" : "Riaccendi il server NexusNXS sul PC");
            start.setOnClickListener(v -> startServerFromGate());
            LinearLayout.LayoutParams startParams = new LinearLayout.LayoutParams(-1, ui.dp(56));
            startParams.setMargins(ui.dp(26), 0, ui.dp(26), ui.dp(10));
            content.addView(start, startParams);
        }
        Button retry = ui.action("Riprova", "restart", Color.rgb(142, 211, 211), false, false);
        retry.setOnClickListener(v -> {
            probeGate();
            host.reconnectNow();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(server ? -1 : ui.dp(196), ui.dp(50));
        if (server) retryParams.setMargins(ui.dp(26), 0, ui.dp(26), 0);
        retryParams.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(retry, retryParams);

        TextView lock = ui.text("Le funzioni di Control restano bloccate finché il server non torna online.", 12, Color.rgb(92, 112, 114));
        lock.setGravity(Gravity.CENTER);
        lock.setPadding(ui.dp(24), ui.dp(22), ui.dp(24), 0);
        content.addView(lock, new LinearLayout.LayoutParams(-1, -2));
    }

    private void probeGate() {
        main.removeCallbacks(gateProbe);
        if (gateProbeInFlight || !gateOnScreen()) return;
        gateProbeInFlight = true;
        session.rescueRequest("GET", "/rescue/status", null, (status, result) -> {
            gateProbeInFlight = false;
            if (!gateOnScreen()) return;
            if (status == 200 && result != null && "nexusnxs-rescue".equals(result.optString("service"))) {
                String core = result.optString("core");
                gateOwnerStopped = result.optBoolean("ownerStopped");
                gateRescueAvailable = result.optBoolean("canStart") || "starting".equals(core) || result.optLong("retryAfterMs") > 0;
                if ("online".equals(core)) {
                    // Il server è tornato: si rientra subito, senza attendere il backoff
                    // (al massimo una volta ogni pochi secondi se il Core è lento).
                    long now = SystemClock.elapsedRealtime();
                    if (now - lastGateFastReconnectAt > 5_000L) {
                        lastGateFastReconnectAt = now;
                        host.reconnectNow();
                    }
                    return;
                }
                gateKind = "starting".equals(core) ? SERVER_STARTING : SERVER_OFFLINE;
            } else if (status > 0) {
                // Il collegamento privato risponde (il PC è acceso) ma non il Desktop Bridge.
                gateKind = SERVER_OFFLINE;
                gateRescueAvailable = false;
            } else {
                gateKind = PC_OFFLINE;
                gateRescueAvailable = false;
                gateOwnerStopped = false;
            }
            renderGate();
            long next = gateKind == SERVER_STARTING ? 2_500L : gateKind == SERVER_OFFLINE ? 6_000L : 9_000L;
            main.postDelayed(gateProbe, next);
        });
    }

    private void startServerFromGate() {
        if (rescueStartInFlight || !gateRescueAvailable || gateKind != SERVER_OFFLINE) return;
        authenticator.authenticateThen(() -> {
            if (!gateOnScreen()) return;
            rescueStartInFlight = true;
            renderGate();
            session.rescueRequest("POST", "/rescue/challenge", json("purpose", "server-start"), (status, challenge) -> {
                if (status != 201 || challenge == null) { rescueStartFailed(challenge); return; }
                JSONObject body = new JSONObject();
                try {
                    body.put("deviceProof", new JSONObject()
                        .put("challengeId", challenge.optString("challengeId"))
                        .put("signature", session.signPayload(challenge.optString("payload"))));
                } catch (Exception error) { rescueStartFailed(null); return; }
                session.rescueRequest("POST", "/rescue/start", body, (startStatus, result) -> {
                    rescueStartInFlight = false;
                    if (startStatus == 202 || startStatus == 200) {
                        shell.content.performHapticFeedback(android.os.Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CONTEXT_CLICK);
                        gateKind = SERVER_STARTING;
                        renderGate();
                        main.removeCallbacks(gateProbe);
                        main.postDelayed(gateProbe, 2_000L);
                        return;
                    }
                    rescueStartFailed(result);
                });
            });
        });
    }

    private void rescueStartFailed(JSONObject result) {
        rescueStartInFlight = false;
        String message = result == null ? "" : result.optString("error");
        Toast.makeText(ui.context(), message.isEmpty() ? "Riaccensione non riuscita. Riprova tra poco." : message, Toast.LENGTH_LONG).show();
        renderedGateKey = "";
        renderGate();
        probeGate();
    }
}
