package local.nexus.console;

import static local.nexus.console.ConsoleSession.json;
import static local.nexus.console.NativeMainActivity.SCREEN_POWER;

import local.nexus.console.ui.NexusGateView;
import local.nexus.console.ui.NexusUi;

import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Comandi sensibili con conferma esplicita: Riavvia, Spegni e Arresta server.
 *
 * Il flusso è sempre lo stesso: piano firmato dalla chiave hardware → schermata
 * di conferma con l'emblema rosso → biometria → esecuzione firmata del ticket.
 * Una risposta tardiva non riapre mai la conferma dopo Indietro o in background.
 */
final class PowerConfirmations {
    private final NativeMainActivity host;
    private final NexusUi ui;
    private final ConsoleSession session;
    private final DeviceAuthenticator authenticator;
    private final SafeActionHistory history;
    private final OperationalAlerts alerts;
    private ConsoleShell shell;

    PowerConfirmations(NativeMainActivity host, NexusUi ui, ConsoleSession session,
                       DeviceAuthenticator authenticator, SafeActionHistory history, OperationalAlerts alerts) {
        this.host = host;
        this.ui = ui;
        this.session = session;
        this.authenticator = authenticator;
        this.history = history;
        this.alerts = alerts;
    }

    /** La shell nasce col dock costruito qui: si collega subito dopo. */
    void attach(ConsoleShell shell) { this.shell = shell; }

    /** Dock della dashboard: Riavvia e Spegni portano sempre alla conferma. */
    LinearLayout powerActions() {
        LinearLayout row = new LinearLayout(ui.context());
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button restart = ui.action("Riavvia", "restart", Color.rgb(142, 211, 211), false, false);
        restart.setOnClickListener(v -> planPower("restart"));
        Button shutdown = ui.action("Spegni", "power", NexusUi.DANGER_TEXT, false, true);
        shutdown.setOnClickListener(v -> planPower("shutdown"));
        row.addView(restart, new LinearLayout.LayoutParams(0, ui.dp(58), 1));
        row.addView(shutdown, ui.spaced(0, ui.dp(58), 1, 8));
        return row;
    }

    private void planPower(String action) {
        host.enterCommandScreen();
        session.requestWithProof("power-plan", "/api/system/power/plan", json("action", action), result -> {
            if (host.screen() != SCREEN_POWER) return;
            JSONObject proposal = result.optJSONObject("proposal");
            if (proposal == null) return;
            shell.materializeNext();
            shell.swapContent(() -> renderConfirmation(action, proposal));
            host.setState("Da confermare", false);
        });
    }

    void planServerStop() {
        host.enterCommandScreen();
        session.requestWithProof("service-plan", "/api/system/service/plan", json("action", "stop"), result -> {
            if (host.screen() != SCREEN_POWER) return;
            JSONObject proposal = result.optJSONObject("proposal");
            if (proposal == null) return;
            shell.materializeNext();
            shell.swapContent(() -> renderServerStopConfirmation(proposal));
            host.setState("Da confermare", false);
        });
    }

    /**
     * Struttura unica per conferme sensibili ed esiti: emblema Nexus animato,
     * chip di stato, titolo, spiegazione e azioni. Stesso linguaggio del varco.
     */
    private void renderEmblemScreen(int emblem, String chip, String titleText, String detailText, Button primary, Button secondary) {
        LinearLayout content = shell.content;
        content.setGravity(Gravity.CENTER);
        boolean danger = emblem == NexusGateView.CONFIRM;
        NexusGateView mark = new NexusGateView(ui.context(), ui.motion(), emblem);
        mark.setContentDescription(titleText);
        content.addView(mark, new LinearLayout.LayoutParams(-1, ui.dp(196)));
        TextView badge = ui.chip(chip, danger ? NexusUi.DANGER_TEXT : Color.rgb(150, 220, 218),
            danger ? Color.rgb(33, 15, 13) : Color.rgb(7, 30, 31),
            danger ? Color.argb(70, 232, 153, 132) : Color.argb(60, 101, 221, 218));
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(-2, -2);
        badgeParams.gravity = Gravity.CENTER_HORIZONTAL;
        badgeParams.bottomMargin = ui.dp(14);
        content.addView(badge, badgeParams);
        TextView title = ui.bold(ui.text(titleText, 26, NexusUi.TEXT));
        title.setGravity(Gravity.CENTER);
        title.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        title.setPadding(ui.dp(8), 0, ui.dp(8), ui.dp(10));
        content.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView detail = ui.text(detailText, 14, NexusUi.MUTED);
        detail.setGravity(Gravity.CENTER);
        detail.setLineSpacing(ui.dp(2), 1f);
        detail.setPadding(ui.dp(18), 0, ui.dp(18), ui.dp(26));
        content.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        for (Button action : new Button[] { primary, secondary }) {
            if (action == null) continue;
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, ui.dp(action == primary ? 56 : 50));
            params.setMargins(ui.dp(26), 0, ui.dp(26), ui.dp(10));
            content.addView(action, params);
        }
    }

    private Button cancelButton() {
        Button cancel = ui.button("Annulla", false, false);
        cancel.setOnClickListener(v -> host.cancelPowerConfirmation());
        return cancel;
    }

    private void renderServerStopConfirmation(JSONObject proposal) {
        Button confirm = ui.action("Arresta server", "stop", NexusUi.DANGER_TEXT, true, true);
        confirm.setOnClickListener(v -> authenticator.authenticateThen(() -> executeServerStop(proposal.optString("id"))));
        renderEmblemScreen(NexusGateView.CONFIRM, "CONFERMA RICHIESTA", "Arrestare il server?",
            "NexusNXS resterà offline finché non lo riaccendi da qui o dal PC.", confirm, cancelButton());
    }

    private void executeServerStop(String ticket) {
        host.setState("Arresto server…", false);
        session.requestWithProof("service-execute", "/api/system/service/execute",
            json("ticketId", ticket, "approved", true), result -> {
                String message = result.optString("message", "Server NexusNXS in arresto.");
                history.record("Arresto server autorizzato");
                alerts.notifyUser("server", message + " Le app torneranno online al prossimo avvio del servizio.");
                if (!host.isForegroundActive() || host.screen() != SCREEN_POWER) return;
                Toast.makeText(ui.context(), message, Toast.LENGTH_LONG).show();
                host.showOfflineAfter(900);
            });
    }

    private void renderConfirmation(String action, JSONObject proposal) {
        boolean shutdown = "shutdown".equals(action);
        Button confirm = ui.action(shutdown ? "Spegni il computer" : "Riavvia il computer", shutdown ? "power" : "restart",
            shutdown ? NexusUi.DANGER_TEXT : Color.rgb(211, 242, 241), true, shutdown);
        confirm.setOnClickListener(v -> authenticator.authenticateThen(() -> executePower(proposal.optString("id"), shutdown)));
        renderEmblemScreen(NexusGateView.CONFIRM, "CONFERMA RICHIESTA", shutdown ? "Spegnere il PC?" : "Riavviare il PC?",
            "Salva prima il lavoro aperto. L’azione parte soltanto dopo la conferma.", confirm, cancelButton());
    }

    private void executePower(String ticket, boolean shutdown) {
        host.setState("Invio…", false);
        session.requestWithProof("power-execute", "/api/system/power/execute", json("ticketId", ticket, "approved", true), result -> {
            String message = result.optString("message", shutdown ? "Spegnimento programmato." : "Riavvio programmato.");
            history.record(shutdown ? "Spegnimento PC autorizzato" : "Riavvio PC autorizzato");
            alerts.notifyUser("power", message);
            if (host.screen() != SCREEN_POWER || !host.isForegroundActive()) return;
            showScheduled(shutdown, message);
        });
    }

    private void showScheduled(boolean shutdown, String message) {
        shell.materializeNext();
        shell.swapContent(() -> {
            Button back = ui.button("Torna allo stato", false, false);
            back.setOnClickListener(v -> host.cancelPowerConfirmation());
            renderEmblemScreen(NexusGateView.SENT, "COMANDO INVIATO", shutdown ? "Spegnimento inviato" : "Riavvio inviato", message, back, null);
        });
        host.setState("Comando inviato", false);
        host.reconnectAfter(shutdown ? 7000 : 12000);
    }
}
