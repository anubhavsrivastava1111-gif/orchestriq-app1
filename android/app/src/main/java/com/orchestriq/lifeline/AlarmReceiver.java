package com.orchestriq.lifeline;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Shows an EMI reminder. On the lock screen only a generic line is visible; details appear after unlocking the phone. */
public class AlarmReceiver extends BroadcastReceiver {

    static final String CHANNEL = "emi_reminders";

    @Override
    public void onReceive(Context c, Intent intent) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return;
        ensureChannel(nm);

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int id = intent.getIntExtra("id", 1);

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification publicVersion = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_lifeline)
                .setContentTitle("Lifeline")
                .setContentText("You have an EMI reminder")
                .setColor(0xFF1B3F8F)
                .build();

        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_lifeline)
                .setContentTitle(title == null ? "EMI reminder" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
                .setColor(0xFF1B3F8F)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        nm.notify(id, n);
    }

    static void ensureChannel(NotificationManager nm) {
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "EMI reminders", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Reminders to fund your account before each EMI and on the due date");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        nm.createNotificationChannel(ch);
    }
}
