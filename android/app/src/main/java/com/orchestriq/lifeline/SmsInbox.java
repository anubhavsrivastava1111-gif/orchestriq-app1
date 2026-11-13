package com.orchestriq.lifeline;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Bank SMS capture.
 * - Only messages from bank / business senders that mention money are kept. Personal SMS are never read.
 * - Messages with a one-time password are dropped and never stored.
 * - Kept messages are scrubbed (OTP-like codes masked, links removed) and wait in a queue encrypted with the hardware Keystore key until the app is unlocked,
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
            o.put("body", redact(body));
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
                    JSONObject o = new JSONObject(new String(plain, Bridge.UTF8));
                    if (System.currentTimeMillis() - o.optLong("ts") < 30L * 86400000L) out.put(o);
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

    private static final Pattern DIGITS = Pattern.compile("\\d{4,8}");
    private static final Pattern KEEP_BEFORE = Pattern.compile("(rs\\.?|inr|₹|card|a/c|ac|acct|account|ending|end|with|no\\.?|by|of|for|x|\\*)\\s*[:.#-]?\\s*$");
    private static final Pattern LINK1 = Pattern.compile("(?i)\\b(?:https?://|www\\.)\\S+");
    private static final Pattern LINK2 = Pattern.compile("(?i)\\b[a-z0-9-]+\\.(?:com|in|co|me|ly|link|info|xyz|app)/\\S*");

    /**
     * Masks anything that could be a one-time password and removes links, before a message is stored.
     * Same rules as redactSms() in the app: amounts and account / card digits are kept.
     */
    static String redact(String body) {
        String s = LINK2.matcher(LINK1.matcher(body).replaceAll("[link removed]")).replaceAll("[link removed]");
        java.util.regex.Matcher m = DIGITS.matcher(s);
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (m.find()) {
            int at = m.start(), end = m.end();
            char prev = at > 0 ? s.charAt(at - 1) : ' ';
            char next = end < s.length() ? s.charAt(end) : ' ';
            char next2 = end + 1 < s.length() ? s.charAt(end + 1) : ' ';
            boolean keep = Character.isDigit(prev) || Character.isDigit(next)
                    || (next == '.' && Character.isDigit(next2))
                    || next == ',' || prev == ',' || prev == '.'
                    || "-/:".indexOf(prev) >= 0 || "-/:".indexOf(next) >= 0
                    || KEEP_BEFORE.matcher(s.substring(Math.max(0, at - 14), at).toLowerCase(Locale.ROOT)).find();
            out.append(s, last, at).append(keep ? m.group() : "••••");
            last = end;
        }
        out.append(s.substring(last));
        return out.toString();
    }
}
