package local.nexus.console;

import static local.nexus.console.ConsoleSession.json;

import local.nexus.console.ui.NexusGlyphDrawable;
import local.nexus.console.ui.NexusUi;
import local.nexus.motion.NexusMotion;

import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Controllo delle app sul PC dalla sezione App: catalogo autorizzato,
 * apertura/chiusura firmate con la chiave hardware (presence-plan →
 * presence-execute), verifica dell'esito quando la risposta non arriva e
 * chiusura dell'app in primo piano. Un solo comando alla volta.
 */
final class DesktopApps {
    interface Host {
        /** Activity in primo piano con la dashboard come schermata corrente. */
        boolean onDashboard();
        void setState(String value);
        /** Conteggio delle app aperte cambiato: aggiornare il riepilogo del nucleo. */
        void onApplicationsChanged();
    }

    private static final long PRESENCE_REFRESH_MS = 2_500L;
    private static final String[][] CATALOG = new String[][] {
        { "nexusnxs", "NexusNXS" }, { "claude", "Claude" },
        { "brave", "Brave" }, { "terminal", "Terminale" },
        { "supremo", "Supremo" }, { "notepad", "Note" }
    };

    private final NexusUi ui;
    private final ConsoleSession session;
    private final SafeActionHistory history;
    private final Host host;
    private final Handler main;
    private View container;
    private Boolean nexusAppOpen;
    private Boolean claudeAppOpen;
    private final Map<String, Boolean> applicationStates = new HashMap<>();
    private final Map<String, Boolean> applicationAvailability = new HashMap<>();
    private final Map<String, Boolean> applicationAdminReady = new HashMap<>();
    private boolean launchCommandInFlight;
    private boolean foregroundCommandLookupInFlight;
    private String pendingApplicationId = "";
    private boolean pendingApplicationOpening;
    private boolean presenceStatusInFlight;
    private long lastPresenceStatusAt;

    DesktopApps(NexusUi ui, ConsoleSession session, SafeActionHistory history, Handler main, Host host) {
        this.main = main;
        this.ui = ui;
        this.session = session;
        this.history = history;
        this.host = host;
    }

    private void toast(String message) {
        Toast.makeText(ui.context(), message, Toast.LENGTH_SHORT).show();
    }

    // #region Sezione App

    /** Riempie la sezione App; le tessere si ritrovano poi per tag dentro {@code root}. */
    void renderApplicationsPanel(LinearLayout panel, View root) {
        container = root;
        panel.removeAllViews();
        TextView heading = ui.eyebrow("LE TUE APP");
        heading.setPadding(0, ui.dp(16), 0, ui.dp(9));
        panel.addView(heading);
        panel.addView(applicationGrid());
        panel.addView(foregroundCloseAction(), ui.wrapBlock());
    }

    private LinearLayout applicationGrid() {
        LinearLayout grid = new LinearLayout(ui.context());
        grid.setOrientation(LinearLayout.VERTICAL);
        boolean singleColumn = ui.context().getResources().getConfiguration().screenWidthDp < 360
            || ui.context().getResources().getConfiguration().fontScale >= 1.25f;
        int columns = singleColumn ? 1 : 2;
        for (int index = 0; index < CATALOG.length; index += columns) {
            LinearLayout row = new LinearLayout(ui.context());
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setBaselineAligned(false);
            row.setGravity(Gravity.TOP);
            for (int column = 0; column < columns && index + column < CATALOG.length; column++) {
                String[] application = CATALOG[index + column];
                LinearLayout.LayoutParams params = column == 0
                    ? new LinearLayout.LayoutParams(0, -1, 1)
                    : ui.spaced(0, -1, 1, 8);
                row.addView(applicationTile(application[0], application[1]), params);
            }
            grid.addView(row, ui.wrapBlock());
        }
        return grid;
    }

    private Button applicationTile(String id, String label) {
        Button tile = ui.button("", false, false);
        tile.setTag("app-tile:" + id);
        tile.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        tile.setPadding(ui.dp(16), ui.dp(10), ui.dp(12), ui.dp(10));
        tile.setMinHeight(ui.dp(80));
        tile.setTextSize(14);
        tile.setMaxLines(2);
        tile.setEllipsize(android.text.TextUtils.TruncateAt.END);
        tile.setCompoundDrawablePadding(ui.dp(12));
        tile.setContentDescription(label + ", stato in verifica");
        tile.setOnClickListener(v -> {
            if (launchCommandInFlight) return;
            Boolean open = knownState(id);
            if ("nexusnxs".equals(id)) { if (Boolean.TRUE.equals(open)) closeNexusNxs(); else openNexusNxs(); return; }
            if ("claude".equals(id)) { if (Boolean.TRUE.equals(open)) closeClaude(); else openClaude(); return; }
            controlCatalogApplication(id, label);
        });
        updateApplicationTile(tile, id, label, knownState(id), knownAvailability(id));
        return tile;
    }

    private Boolean knownState(String id) {
        return "nexusnxs".equals(id) ? nexusAppOpen : "claude".equals(id) ? claudeAppOpen : applicationStates.get(id);
    }

    private Boolean knownAvailability(String id) {
        return "nexusnxs".equals(id) || "claude".equals(id) ? Boolean.TRUE : applicationAvailability.get(id);
    }

    private void updateApplicationTile(String id, String label, Boolean open, Boolean available) {
        View target = container == null ? null : container.findViewWithTag("app-tile:" + id);
        if (target instanceof Button) updateApplicationTile((Button) target, id, label, open, available);
    }

    private void updateApplicationTile(Button tile, String id, String label, Boolean open, Boolean available) {
        boolean pending = launchCommandInFlight && id.equals(pendingApplicationId);
        boolean enabled = !Boolean.FALSE.equals(available) && !launchCommandInFlight;
        boolean supremo = "supremo".equals(id);
        boolean adminReady = Boolean.TRUE.equals(applicationAdminReady.get(id));
        String status = pending ? (pendingApplicationOpening ? "Apertura…" : "Chiusura…")
            : Boolean.TRUE.equals(open) ? (supremo ? (adminReady ? "Aperta · UAC pronto" : "Aperta · UAC limitato") : "Aperta")
            : Boolean.FALSE.equals(open) ? (supremo && !adminReady ? "Chiusa · configura UAC sul PC" : "Chiusa") : "Stato in verifica…";
        String next = label + "\n" + status;
        if (!next.contentEquals(tile.getText())) {
            SpannableString styled = new SpannableString(next);
            int statusStart = label.length() + 1;
            styled.setSpan(new RelativeSizeSpan(.78f), statusStart, next.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            styled.setSpan(new ForegroundColorSpan(pending || Boolean.TRUE.equals(open) ? NexusUi.ACCENT : NexusUi.MUTED), statusStart, next.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            tile.setText(styled);
        }
        tile.setEnabled(enabled);
        tile.setAlpha(enabled ? 1f : .42f);
        String actionHint = enabled && !pending && open != null ? (open ? ", tocca per chiudere" : ", tocca per aprire") : "";
        tile.setContentDescription(label + ", " + status.toLowerCase(Locale.getDefault()).replace("·", "") + actionHint);
        boolean active = Boolean.TRUE.equals(open);
        int fill = active ? Color.rgb(6, 31, 32) : NexusUi.SURFACE;
        int stroke = active ? Color.argb(92, 101, 220, 216) : Color.argb(25, 128, 188, 190);
        tile.setBackground(ui.ripple(ui.withEdgeLight(ui.rounded(fill, 19, stroke), 19, active)));
        tile.setTextColor(active ? Color.rgb(226, 247, 246) : Color.rgb(190, 211, 211));
        ui.glow(tile, active);
        Drawable icon = new NexusGlyphDrawable(ui.motion(), applicationGlyph(id), active ? NexusUi.ACCENT : Color.rgb(151, 190, 191), ui.dp(24));
        tile.setCompoundDrawables(icon, null, null, null);
        if (pending && ui.motion().enabled()) tile.animate().alpha(.58f).setDuration(ui.motion().duration(NexusMotion.STATUS_PULSE)).withEndAction(() -> {
            if (launchCommandInFlight && id.equals(pendingApplicationId) && tile.isAttachedToWindow()) tile.animate().alpha(1f).setDuration(ui.motion().duration(NexusMotion.STATUS_PULSE)).start();
        }).start();
    }

    private String applicationGlyph(String id) {
        switch (id) {
            case "nexusnxs": return "nexus";
            case "claude": return "chat";
            case "brave": return "browser";
            case "notepad": return "note";
            case "terminal": case "supremo": return id;
            default: return "apps";
        }
    }

    private Button foregroundCloseAction() {
        Button close = ui.action("Chiudi app in primo piano", "close-app", Color.rgb(151, 190, 191), false, false);
        close.setTag("foreground-close");
        close.setContentDescription("Chiudi sul PC l'ultima applicazione autorizzata lasciata in primo piano");
        close.setOnClickListener(v -> closeForegroundApplication());
        return close;
    }

    private void setForegroundCloseBusy(boolean busy) {
        View target = container == null ? null : container.findViewWithTag("foreground-close");
        if (!(target instanceof Button)) return;
        Button button = (Button) target;
        button.setEnabled(!busy && !launchCommandInFlight);
        button.setAlpha(button.isEnabled() ? 1f : .42f);
        button.setText(busy ? "Rilevo l’app in primo piano…" : "Chiudi app in primo piano");
    }

    // #endregion

    // #region Comandi

    private void openNexusNxs() {
        controlDesktopApp("open-full-app", "Apro NexusNXS…", "NexusNXS è già aperto", "NexusNXS aperto sul PC");
    }

    private void closeNexusNxs() {
        controlDesktopApp("close-full-app", "Chiudo NexusNXS…", "NexusNXS è già chiuso", "NexusNXS chiuso sul PC");
    }

    private void openClaude() {
        controlDesktopApp("open-claude", "Apro Claude sul PC…", "Claude è già aperto", "Claude aperto sul PC");
    }

    private void closeClaude() {
        controlDesktopApp("close-claude", "Chiudo Claude sul PC…", "Claude è già chiuso", "Claude chiuso sul PC");
    }

    private void closeForegroundApplication() {
        if (launchCommandInFlight || foregroundCommandLookupInFlight) {
            toast("Comando già in corso");
            return;
        }
        foregroundCommandLookupInFlight = true;
        setForegroundCloseBusy(true);
        host.setState("Rilevo l’app in primo piano…");
        session.request("GET", "/api/presence/status", null, true, result -> {
            foregroundCommandLookupInFlight = false;
            setForegroundCloseBusy(false);
            String applicationId = result.optString("foregroundApplicationId");
            String label = foregroundApplicationLabel(result, applicationId);
            if (applicationId.isEmpty() || label.isEmpty()) {
                host.setState("Online");
                toast("L’app in primo piano non è controllabile da NexusNXS");
                return;
            }
            controlDesktopApp("close-application", applicationId,
                "Chiudo " + label + "…", label + " è già chiusa", label + " chiusa sul PC");
        }, true, () -> {
            foregroundCommandLookupInFlight = false;
            setForegroundCloseBusy(false);
            host.setState("Online");
            toast("Non riesco a rilevare l’app in primo piano");
        });
    }

    /** Solo un'app del catalogo, disponibile e aperta, può essere chiusa in primo piano. */
    private String foregroundApplicationLabel(JSONObject status, String applicationId) {
        if (applicationId == null || applicationId.isEmpty()) return "";
        JSONArray applications = status.optJSONArray("applications");
        if (applications == null) return "";
        for (int index = 0; index < applications.length(); index++) {
            JSONObject application = applications.optJSONObject(index);
            if (application != null && applicationId.equals(application.optString("id"))
                && application.optBoolean("available") && "open".equals(application.optString("state"))) {
                return application.optString("label", applicationId);
            }
        }
        return "";
    }

    private void controlCatalogApplication(String id, String label) {
        boolean open = Boolean.TRUE.equals(applicationStates.get(id));
        String action = open ? "close-application" : "open-application";
        controlDesktopApp(action, id,
            (open ? "Chiudo " : "Apro ") + label + "…",
            label + (open ? " è già chiusa" : " è già aperta"),
            label + (open ? " chiusa sul PC" : " aperta sul PC"));
    }

    private void controlDesktopApp(String action, String progress, String unchanged, String completed) {
        controlDesktopApp(action, "", progress, unchanged, completed);
    }

    private void controlDesktopApp(String action, String applicationId, String progress, String unchanged, String completed) {
        if (launchCommandInFlight) {
            toast("Comando già in corso");
            return;
        }
        launchCommandInFlight = true;
        pendingApplicationId = applicationId.isEmpty() ? applicationIdForAction(action) : applicationId;
        pendingApplicationOpening = action.startsWith("open-");
        applyDesktopControlState();
        host.setState(progress);
        Runnable recover = () -> verifyDesktopCommandOutcome(action, applicationId, completed);
        JSONObject command = applicationId.isEmpty() ? json("action", action) : json("action", action, "applicationId", applicationId);
        session.requestCommandWithProof("presence-plan", "/api/presence/plan", command, plan -> {
            if (!plan.optBoolean("changed", true)) {
                finishDesktopCommand();
                host.setState("Online");
                updateDesktopControlState(action);
                if (!applicationId.isEmpty()) applicationStates.put(applicationId, "open-application".equals(action));
                history.record(unchanged);
                toast(unchanged);
                return;
            }
            JSONObject proposal = plan.optJSONObject("proposal");
            if (proposal == null || proposal.optString("id").isEmpty()) {
                finishDesktopCommand();
                host.setState("Online");
                return;
            }
            session.requestCommandWithProof("presence-execute", "/api/presence/execute",
                json("ticketId", proposal.optString("id"), "approved", true), result -> {
                    finishDesktopCommand();
                    host.setState("Online");
                    updateDesktopControlState(action);
                    if (!applicationId.isEmpty()) applicationStates.put(applicationId, "open-application".equals(action));
                    history.record(completed);
                    toast(completed);
                    refreshDesktopControlStatus(true);
                }, recover);
        }, recover);
    }

    /** Risposta persa: si verifica lo stato reale prima di dichiarare l'esito. */
    private void verifyDesktopCommandOutcome(String action, String applicationId, String completed) {
        if (!host.onDashboard()) { finishDesktopCommand(); return; }
        host.setState("Verifico il comando…");
        main.postDelayed(() -> session.request("GET", "/api/presence/status", null, true, result -> {
            boolean confirmed = desktopCommandMatches(result, action, applicationId);
            applyPresenceStatus(result);
            finishDesktopCommand();
            host.setState("Online");
            if (confirmed) {
                history.record(completed);
                toast(completed);
                return;
            }
            String operation = action.startsWith("open-") ? "apertura" : "chiusura";
            toast("Impossibile confermare la " + operation + ". Riprova.");
        }, true, () -> {
            finishDesktopCommand();
            host.setState("Online");
            toast("Verifica non disponibile. La connessione resta attiva.");
        }), 650);
    }

    private boolean desktopCommandMatches(JSONObject result, String action, String applicationId) {
        if (!result.optBoolean("available", false)) return false;
        boolean expectedOpen = action.startsWith("open-");
        if (action.endsWith("full-app")) return expectedOpen == "open".equals(result.optString("fullApp"));
        if (action.endsWith("claude")) return expectedOpen == "open".equals(result.optString("claude"));
        JSONArray applications = result.optJSONArray("applications");
        if (applications == null) return false;
        for (int index = 0; index < applications.length(); index++) {
            JSONObject application = applications.optJSONObject(index);
            if (application != null && applicationId.equals(application.optString("id"))) {
                return expectedOpen == "open".equals(application.optString("state"));
            }
        }
        return false;
    }

    private String applicationIdForAction(String action) {
        if (action.endsWith("full-app")) return "nexusnxs";
        if (action.endsWith("claude")) return "claude";
        return "";
    }

    private void finishDesktopCommand() {
        launchCommandInFlight = false;
        pendingApplicationId = "";
        applyDesktopControlState();
        setForegroundCloseBusy(false);
    }

    // #endregion

    // #region Stato dal PC

    void refreshDesktopControlStatus(boolean force) {
        long now = System.currentTimeMillis();
        if (presenceStatusInFlight || !session.signedIn() || !host.onDashboard()) return;
        if (!force && now - lastPresenceStatusAt < PRESENCE_REFRESH_MS) return;
        presenceStatusInFlight = true;
        session.request("GET", "/api/presence/status", null, true, result -> {
            presenceStatusInFlight = false;
            lastPresenceStatusAt = System.currentTimeMillis();
            if (!host.onDashboard()) return;
            applyPresenceStatus(result);
        }, true, () -> presenceStatusInFlight = false);
    }

    private void applyPresenceStatus(JSONObject result) {
        applicationStates.clear();
        applicationAvailability.clear();
        applicationAdminReady.clear();
        if (!result.optBoolean("available", false)) {
            nexusAppOpen = null;
            claudeAppOpen = null;
        } else {
            nexusAppOpen = stateValue(result.optString("fullApp"));
            claudeAppOpen = stateValue(result.optString("claude"));
            JSONArray applications = result.optJSONArray("applications");
            if (applications != null) for (int index = 0; index < applications.length(); index++) {
                JSONObject application = applications.optJSONObject(index);
                if (application == null) continue;
                String id = application.optString("id");
                if (id.isEmpty()) continue;
                applicationStates.put(id, "open".equals(application.optString("state")));
                applicationAvailability.put(id, application.optBoolean("available"));
                if ("supremo".equals(id)) applicationAdminReady.put(id, application.optBoolean("adminReady"));
            }
        }
        applyDesktopControlState();
    }

    private Boolean stateValue(String value) {
        if ("open".equals(value)) return Boolean.TRUE;
        if ("closed".equals(value)) return Boolean.FALSE;
        return null;
    }

    private void updateDesktopControlState(String action) {
        if ("open-full-app".equals(action)) nexusAppOpen = Boolean.TRUE;
        else if ("close-full-app".equals(action)) nexusAppOpen = Boolean.FALSE;
        else if ("open-claude".equals(action)) claudeAppOpen = Boolean.TRUE;
        else if ("close-claude".equals(action)) claudeAppOpen = Boolean.FALSE;
        applyDesktopControlState();
    }

    void applyDesktopControlState() {
        for (String[] application : CATALOG)
            updateApplicationTile(application[0], application[1], knownState(application[0]), knownAvailability(application[0]));
        host.onApplicationsChanged();
    }

    /** Riepilogo del nucleo nella Panoramica: AI, app aperte, flussi live. */
    String corePulseSummary(JSONObject nexusService) {
        int open = 0;
        int known = 0;
        if (nexusAppOpen != null) { known++; if (Boolean.TRUE.equals(nexusAppOpen)) open++; }
        if (claudeAppOpen != null) { known++; if (Boolean.TRUE.equals(claudeAppOpen)) open++; }
        for (Boolean state : applicationStates.values()) {
            if (state == null) continue;
            known++;
            if (Boolean.TRUE.equals(state)) open++;
        }
        int streams = nexusService == null ? 0 : nexusService.optInt("connectedStreams");
        String apps = known == 0 ? "app in verifica" : open + (open == 1 ? " app aperta" : " app aperte");
        String aiState = "AI " + Formats.aiAvailability(nexusService).toLowerCase(Locale.ROOT);
        return aiState + "  ·  " + apps + "  ·  " + streams + (streams == 1 ? " flusso live" : " flussi live");
    }

    // #endregion
}
