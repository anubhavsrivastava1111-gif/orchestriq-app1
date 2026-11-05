package com.orchestriq.lifeline;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are cleared by a reboot or app update; this puts EMI reminders back. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a)) {
            Reminders.rearm(c);
        }
    }
}
