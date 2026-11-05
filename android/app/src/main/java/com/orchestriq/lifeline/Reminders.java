package com.orchestriq.lifeline;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Schedules EMI reminders with the system alarm service, so they fire even when Lifeline is closed.
 * The app sends the full upcoming list each time data changes; old alarms are cancelled first.
 */
final class Reminders {

    private static final String PREF_LIST = "reminders";
    private static final int MAX = 400;

    private Reminders() {
    }

    static void schedule(Context c, String json) {
        SharedPreferences p = c.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE);
        cancelAll(c, p.getString(PREF_LIST, "[]"));
        JSONArray clean = new JSONArray();
        try {
            JSONArray in = new JSONArray(json == null ? "[]" : json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < in.length() && clean.length() < MAX; i++) {
                JSONObject r = in.optJSONObject(i);
                if (r == null) continue;
                long at = r.optLong("at", 0);
                if (at <= now) continue;
                JSONObject o = new JSONObject();
                o.put("id", r.optInt("id"));
                o.put("at", at);
                o.put("title", trim(r.optString("title", "EMI reminder"), 80));
                o.put("body", trim(r.optString("body", ""), 240));
                clean.put(o);
            }
        } catch (Exception ignored) {
            // invalid input → nothing scheduled
        }
        p.edit().putString(PREF_LIST, clean.toString()).apply();
        arm(c, clean);
    }

    /** Re-creates alarms after a reboot, app update or time change. */
    static void rearm(Context c) {
        try {
            JSONArray list = new JSONArray(c.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE).getString(PREF_LIST, "[]"));
            arm(c, list);
        } catch (Exception ignored) {
            // nothing to re-arm
        }
    }

    private static void arm(Context c, JSONArray list) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null || r.optLong("at") <= now) continue;
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.optLong("at"), pending(c, r.optInt("id"), r.optString("title"), r.optString("body"), true));
        }
    }

    private static void cancelAll(Context c, String json) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            JSONArray list = new JSONArray(json);
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r == null) continue;
                PendingIntent pi = pending(c, r.optInt("id"), null, null, false);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            }
        } catch (Exception ignored) {
            // nothing to cancel
        }
    }

    private static PendingIntent pending(Context c, int id, String title, String body, boolean create) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("com.orchestriq.lifeline.REMINDER." + id);
        if (title != null) i.putExtra("title", title);
        if (body != null) i.putExtra("body", body);
        i.putExtra("id", id);
        int flags = PendingIntent.FLAG_IMMUTABLE | (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE);
        return PendingIntent.getBroadcast(c, id, i, flags);
    }

    private static String trim(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
