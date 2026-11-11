package local.nexus.console;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Canali e notifiche opache per gli eventi del server NexusNXS.
 * Titolo e testo sono sempre generici: nessun contenuto di chat o azione
 * arriva sul telefono, solo il tipo di evento e un deep link interno.
 */
final class ConsoleNotifications {
    static final String CHANNEL_RESPONSE = "nexus_response_ready";
    static final String CHANNEL_CONSENT = "nexus_consent_required";
    static final String KIND_RESPONSE = "response-ready";
    static final String KIND_CONSENT = "consent-required";
    static final String LINK_RESPONSE = "nexusnxs-control://open/response";
    static final String LINK_CONSENT = "nexusnxs-control://open/consent";
    private static final int NOTIFICATION_RESPONSE = 3104;
    private static final int NOTIFICATION_CONSENT = 3105;
    private static final String PREFS = "nexus_notification_watch";

    /** Vero mentre l'Activity è in primo piano (stesso processo del JobService). */
    static volatile boolean appInForeground;

    private ConsoleNotifications() { }

    static void ensureChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel response = new NotificationChannel(CHANNEL_RESPONSE, "Risposte pronte", NotificationManager.IMPORTANCE_DEFAULT);
        response.setDescription("Una risposta lunga di NexusNXS è terminata mentre l'app era chiusa");
        response.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        response.setShowBadge(true);
        NotificationChannel consent = new NotificationChannel(CHANNEL_CONSENT, "Consensi richiesti", NotificationManager.IMPORTANCE_HIGH);
        consent.setDescription("Un'azione di NexusNXS attende la tua conferma");
        consent.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        consent.setShowBadge(true);
        manager.createNotificationChannel(response);
        manager.createNotificationChannel(consent);
    }

    static boolean canPost(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    /** Pubblica la notifica per un tipo noto; ignora tipi o link sconosciuti. */
    static boolean show(Context context, String kind) {
        if (!canPost(context)) return false;
        boolean consent = KIND_CONSENT.equals(kind);
        if (!consent && !KIND_RESPONSE.equals(kind)) return false;
        String channel = consent ? CHANNEL_CONSENT : CHANNEL_RESPONSE;
        String title = consent ? "Consenso richiesto" : "Risposta pronta";
        String text = consent ? "Un'azione di NexusNXS attende la tua conferma." : "NexusNXS ha completato la risposta.";
        int id = consent ? NOTIFICATION_CONSENT : NOTIFICATION_RESPONSE;
        Intent launch = new Intent(Intent.ACTION_VIEW, Uri.parse(consent ? LINK_CONSENT : LINK_RESPONSE))
            .setClass(context, NativeMainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(context, id, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification publicVersion = new Notification.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_control_monochrome)
            .setContentTitle("NexusNXS")
            .setContentText(consent ? "Conferma richiesta" : "Nuova risposta")
            .build();
        Notification value = new Notification.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_control_monochrome)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setCategory(consent ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setOnlyAlertOnce(!consent)
            .setAutoCancel(true)
            .setTimeoutAfter(consent ? 10 * 60_000L : 30 * 60_000L)
            .build();
        context.getSystemService(NotificationManager.class).notify(id, value);
        return true;
    }

    static void cancelResponse(Context context) {
        context.getSystemService(NotificationManager.class).cancel(NOTIFICATION_RESPONSE);
    }

    static boolean isKnownLink(Uri data) {
        if (data == null) return false;
        String value = data.toString();
        return LINK_RESPONSE.equals(value) || LINK_CONSENT.equals(value);
    }

    // Cursore condiviso tra Activity e JobService.

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String instance(Context context) { return prefs(context).getString("instance", ""); }

    static long cursor(Context context) { return prefs(context).getLong("cursor", -1L); }

    static synchronized void rememberCursor(Context context, String instance, long cursor) {
        if (instance == null || instance.isEmpty() || cursor < 0) return;
        SharedPreferences preferences = prefs(context);
        String current = preferences.getString("instance", "");
        long known = preferences.getLong("cursor", -1L);
        if (instance.equals(current) && cursor <= known) return;
        preferences.edit().putString("instance", instance).putLong("cursor", cursor).apply();
    }

    static void markBackground(Context context) {
        prefs(context).edit().putLong("backgroundSince", System.currentTimeMillis()).putInt("backoffStep", 0).apply();
    }

    /**
     * Applica un risultato del server: avanza il cursore e notifica.
     * In primo piano solo il consenso merita un avviso; la risposta pronta
     * viene notificata soltanto se è terminata dopo che l'app è andata in background.
     */
    static int deliver(Context context, JSONObject result, boolean foreground) {
        if (result == null) return 0;
        String instance = result.optString("instance", "");
        JSONArray events = result.optJSONArray("events");
        long serverTime = result.optLong("serverTime", 0L);
        long skew = serverTime > 0 ? serverTime - System.currentTimeMillis() : 0L;
        long backgroundSince = prefs(context).getLong("backgroundSince", 0L);
        boolean sameInstance = instance.equals(instance(context));
        long known = sameInstance ? cursor(context) : -1L;
        int shown = 0;
        boolean responseShown = false, consentShown = false;
        if (events != null) {
            for (int index = 0; index < events.length(); index++) {
                JSONObject event = events.optJSONObject(index);
                if (event == null) continue;
                if (sameInstance && event.optLong("cursor", 0L) <= known) continue;
                String kind = event.optString("kind", "");
                if (KIND_CONSENT.equals(kind) && !consentShown) {
                    consentShown = show(context, KIND_CONSENT);
                    if (consentShown) shown++;
                } else if (KIND_RESPONSE.equals(kind) && !foreground && !responseShown) {
                    long finishedLocally = event.optLong("createdAt", 0L) - skew;
                    if (finishedLocally >= backgroundSince) {
                        responseShown = show(context, KIND_RESPONSE);
                        if (responseShown) shown++;
                    }
                }
            }
        }
        rememberCursor(context, instance, result.optLong("cursor", -1L));
        return shown;
    }
}
