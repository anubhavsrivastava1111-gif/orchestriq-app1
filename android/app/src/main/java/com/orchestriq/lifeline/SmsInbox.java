package com.orchestriq.lifeline;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Bank SMS capture.
 * - Only messages from bank / business senders that mention money are kept. Personal SMS are never read.
 * - Messages with a one-time password are dropped and never stored.
 * - Kept messages wait in a queue encrypted with the hardware Keystore key until the app is unlocked,
 *   then the app reads them into its encrypted vault and the queue is emptied.
 */
final class SmsInbox {

    static final String PREFS = "lifeline_sms";
    private static final String KEY_ON = "on";
    private static final String KEY_Q = "q";
    private static final int MAX_QUEUE = 300;

    private static final Pattern PHONE = Pattern.compile("^\\+?\\d[\\d\\s-]{6,}$");
    private static final Pattern MONEY = Pattern.compile("(rs\\.?|inr|₹)\\s*[\\d,]+|(debited|credited)\\s+(by|with|for|of)\\s+[\\d,]+");
    private static final Pattern ACTION = Pattern.compile("\\b(debited|credited|spent|withdrawn|withdrawal|received|paid|sent|debit|credit|purchase|txn|transaction|deposited|refund|transferred|deducted|amt due|amount due|payment)\\b");
    private static final Pattern OTP1 = Pattern.compile("\\b(otp|one[\\s-]?time\\s+pass(word|code)?|verification code|security code|auth(entication)? code)\\b[\\s:=#-]{0,4}\\d{4,8}\\b");
    private static final Pattern OTP2 = Pattern.compile("\\b(otp|one[\\s-]?time\\s+pass(word|code)?|code)\\b.{0,80}?\\bis\\s*:?\\s*\\d{4,8}\\b");
    private static final Pattern OTP3 = Pattern.compile("\\b\\d{4,8}\\b[^0-9]{0,30}\\b(is|as)\\s+(your|the)\\s+(otp|one[\\s-]?time|verification)");

    private SmsInbox() {
    }

    static boolean isOtp(String body) {
        String t = body.toLowerCase(Locale.ROOT);
        return OTP1.matcher(t).find() || OTP2.matcher(t).find() || OTP3.matcher(t).find();
    }

    /** True for a bank / card message about money that does not carry a one-time password. */
    static boolean isMoneySms(String from, String body) {
        if (from == null || body == null || body.length() < 15) return false;
        String f = from.trim();
        if (f.isEmpty() || PHONE.matcher(f).matches()) return false;
        if (!f.matches(".*[A-Za-z].*")) return false;
        if (isOtp(body)) return false;
        String t = body.toLowerCase(Locale.ROOT);
        return MONEY.matcher(t).find() && ACTION.matcher(t).find();
    }

    static boolean isOn(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ON, false);
    }

    static void setOn(Context c, boolean on) {
        SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON, on);
        if (!on) e.remove(KEY_Q);
        e.apply();
    }

    /** Adds one message to the encrypted queue (called by the SMS receiver). */
    static synchronized void enqueue(Context c, String from, String body, long ts) {
        if (!isOn(c) || !isMoneySms(from, body)) return;
        try {
            JSONObject o = new JSONObject();
            o.put("from", from);
            o.put("body", body);
            o.put("ts", ts);
            String sealed = DeviceKey.encrypt(Base64.encodeToString(o.toString().getBytes(Bridge.UTF8), Base64.NO_WRAP));
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray q = new JSONArray(p.getString(KEY_Q, "[]"));
            q.put(sealed);
            JSONArray trimmed = new JSONArray();
            for (int i = Math.max(0, q.length() - MAX_QUEUE); i < q.length(); i++) trimmed.put(q.get(i));
            p.edit().putString(KEY_Q, trimmed.toString()).apply();
        } catch (Exception ignored) {
            // A message that can't be stored is skipped; the bank SMS stays in the phone's inbox.
        }
    }

    static synchronized int queued(Context c) {
        try {
            return new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_Q, "[]")).length();
        } catch (Exception e) {
            return 0;
        }
    }

    /** Returns the waiting messages (decrypted) and empties the queue. */
    static synchronized String drain(Context c) {
        JSONArray out = new JSONArray();
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray q = new JSONArray(p.getString(KEY_Q, "[]"));
            for (int i = 0; i < q.length(); i++) {
                try {
                    byte[] plain = Base64.decode(DeviceKey.decrypt(q.getString(i)), Base64.NO_WRAP);
                    out.put(new JSONObject(new String(plain, Bridge.UTF8)));
                } catch (Exception ignored) {
                    // unreadable entry (e.g. key reset) is dropped
                }
            }
        } catch (Exception ignored) {
            // corrupt queue → start fresh
        }
        p.edit().remove(KEY_Q).apply();
        return out.toString();
    }

    /** Reads bank messages from the phone's inbox for the last `days` days (needs READ_SMS). */
    static String scan(Context c, int days) {
        JSONArray out = new JSONArray();
        long since = System.currentTimeMillis() - Math.max(1, Math.min(days, 365)) * 86400000L;
        Cursor cur = null;
        try {
            cur = c.getContentResolver().query(Uri.parse("content://sms/inbox"), new String[]{"address", "body", "date"},
                    "date > ?", new String[]{String.valueOf(since)}, "date ASC");
            if (cur == null) return out.toString();
            while (cur.moveToNext() && out.length() < 3000) {
                String from = cur.getString(0), body = cur.getString(1);
                if (!isMoneySms(from, body)) continue;
                JSONObject o = new JSONObject();
                o.put("from", from);
                o.put("body", body);
                o.put("ts", cur.getLong(2));
                out.put(o);
            }
        } catch (Exception ignored) {
            // permission revoked or provider unavailable → whatever was read so far
        } finally {
            if (cur != null) cur.close();
        }
        return out.toString();
    }
}
