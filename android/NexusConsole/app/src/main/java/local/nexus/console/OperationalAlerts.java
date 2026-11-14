package local.nexus.console;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;

/**
 * Avvisi locali di sicurezza, server e alimentazione. Le notifiche delle
 * conversazioni e dei consensi passano invece da ConsoleNotifications.
 */
final class OperationalAlerts {
    private static final String NOTIFICATION_CHANNEL = "nexus_console_alerts";
    private static final int NOTIFICATION_SECURITY = 3101;
    private static final int NOTIFICATION_SERVER = 3102;
    private static final int NOTIFICATION_POWER = 3103;
    private final Activity activity;

    OperationalAlerts(Activity activity) {
        this.activity = activity;
    }

    void prepareNotifications() {
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        manager.deleteNotificationChannel("nexus_console");
        NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL, "Avvisi operativi", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Sicurezza e operazioni richieste da NexusNXS Control");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
        ConsoleNotifications.ensureChannels(activity);
        if (android.os.Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            activity.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 88);
    }

    void notifyUser(String kind, String message) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        String clean = message.length() > 120 ? message.substring(0, 120) + "…" : message;
        String title = "security".equals(kind) ? "Sicurezza NexusNXS" : "server".equals(kind) ? "Server NexusNXS" : "Alimentazione PC";
        int notificationId = "security".equals(kind) ? NOTIFICATION_SECURITY : "server".equals(kind) ? NOTIFICATION_SERVER : NOTIFICATION_POWER;
        Intent launch = new Intent(activity, NativeMainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(activity, notificationId, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification value = new Notification.Builder(activity, NOTIFICATION_CHANNEL)
            .setSmallIcon(R.drawable.ic_control_monochrome)
            .setContentTitle(title)
            .setContentText(clean)
            .setStyle(new Notification.BigTextStyle().bigText(clean))
            .setContentIntent(contentIntent)
            .setCategory("security".equals(kind) ? Notification.CATEGORY_ERROR : Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .build();
        activity.getSystemService(NotificationManager.class).notify(notificationId, value);
    }
}
