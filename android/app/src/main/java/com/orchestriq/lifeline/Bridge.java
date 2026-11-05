package com.orchestriq.lifeline;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import javax.net.ssl.HttpsURLConnection;

/**
 * The only door between the web interface and Android. Exposed to JavaScript as window.LifelineNative.
 * Every method refuses to work unless the page currently loaded is Lifeline's own bundled origin.
 */
public class Bridge {

    static final String PREFS = "lifeline_native";
    static final Charset UTF8 = Charset.forName("UTF-8");

    /** Hosts the native HTTP helper may contact (market data that may not allow browser CORS). */
    static final Set<String> HTTP_ALLOW = new HashSet<String>(Arrays.asList("api.mfapi.in", "www.alphavantage.co"));

    /** Apps Lifeline can detect and hand off to (must match <queries> in the manifest). */
    static final Set<String> KNOWN_APPS = new HashSet<String>(Arrays.asList(
            "com.google.android.apps.bard", "com.openai.chatgpt", "com.anthropic.claude", "ai.perplexity.app.android",
            "com.microsoft.copilot", "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm",
            "in.org.npci.upiapp", "com.zerodha.kite3", "com.nextbillion.groww", "in.upstox.app", "com.msf.angelmobile",
            "in.indwealth", "com.whatsapp", "com.google.android.calendar"));

    final MainActivity activity;
    private volatile boolean trusted = false;
    private String pendingSaveId, pendingSaveContent, pendingOpenId, pendingNotifId;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    void setTrusted(boolean t) {
        trusted = t;
    }

    static String versionName(Activity a) {
        try {
            PackageInfo pi = a.getPackageManager().getPackageInfo(a.getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "1";
        }
    }

    // ─── Info ───────────────────────────────────────────────────────────────
    @JavascriptInterface
    public String info() {
        if (!trusted) return "{}";
        try {
            JSONObject o = new JSONObject();
            o.put("platform", "android");
            o.put("version", versionName(activity));
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("biometric", BiometricVault.status(activity));
            o.put("biometricEnrolled", BiometricVault.isEnrolled(activity));
            o.put("notifications", notificationsEnabled());
            o.put("secureScreen", activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).getBoolean("secure_screen", true));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    // ─── Sharing & other apps ───────────────────────────────────────────────
    @JavascriptInterface
    public void shareText(final String text, final String subject, final String pkg) {
        if (!trusted || text == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                if (subject != null && !subject.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, subject);
                if (pkg != null && !pkg.isEmpty() && KNOWN_APPS.contains(pkg)) {
                    Intent direct = new Intent(send).setPackage(pkg);
                    try {
                        activity.startActivity(direct);
                        return;
                    } catch (ActivityNotFoundException ignored) {
                        // fall through to the chooser
                    }
                }
                activity.startActivity(Intent.createChooser(send, subject == null || subject.isEmpty() ? "Share" : subject));
            }
        });
    }

    @JavascriptInterface
    public String installedPackages(String jsonArray) {
        JSONArray out = new JSONArray();
        if (!trusted) return out.toString();
        try {
            JSONArray in = new JSONArray(jsonArray);
            PackageManager pm = activity.getPackageManager();
            for (int i = 0; i < in.length(); i++) {
                String p = in.optString(i);
                if (!KNOWN_APPS.contains(p)) continue;
                try {
                    pm.getPackageInfo(p, 0);
                    out.put(p);
                } catch (PackageManager.NameNotFoundException ignored) {
                    // not installed
                }
            }
        } catch (Exception ignored) {
            // malformed input → empty list
        }
        return out.toString();
    }

    @JavascriptInterface
    public boolean openApp(String pkg) {
        if (!trusted || pkg == null || !KNOWN_APPS.contains(pkg)) return false;
        final Intent launch = activity.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) return false;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    activity.startActivity(launch);
                } catch (ActivityNotFoundException ignored) {
                    // uninstalled meanwhile
                }
            }
        });
        return true;
    }

    @JavascriptInterface
    public void openUrl(final String url) {
        if (!trusted || url == null) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.openExternal(Uri.parse(url));
            }
        });
    }

    // ─── Screen & theme ─────────────────────────────────────────────────────
    @JavascriptInterface
    public void setSecureScreen(final boolean on) {
        if (!trusted) return;
        activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit().putBoolean("secure_screen", on).apply();
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.applySecureScreen(on);
            }
        });
    }

    @JavascriptInterface
    public void setTheme(final boolean dark) {
        if (!trusted) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.setDarkTheme(dark);
            }
        });
    }

    // ─── Reminders ──────────────────────────────────────────────────────────
    @JavascriptInterface
    public void scheduleReminders(String json) {
        if (!trusted) return;
        Reminders.schedule(activity, json);
    }

    @JavascriptInterface
    public boolean notificationsEnabled() {
        NotificationManager nm = (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
        boolean channelOk = nm != null && nm.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 33) {
            return channelOk && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return channelOk;
    }

    @JavascriptInterface
    public void requestNotificationPermission(final String cbId) {
        if (!trusted) return;
        if (Build.VERSION.SDK_INT < 33 || notificationsEnabled()) {
            activity.callback(cbId, true, String.valueOf(notificationsEnabled()));
            return;
        }
        pendingNotifId = cbId;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, MainActivity.REQ_NOTIF);
            }
        });
    }

    void onPermissionResult(int requestCode, int[] results) {
        if (requestCode == MainActivity.REQ_NOTIF && pendingNotifId != null) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            activity.callback(pendingNotifId, true, String.valueOf(granted));
            pendingNotifId = null;
        }
    }

    // ─── Files (system file picker; the app needs no storage permission) ────
    @JavascriptInterface
    public void saveFile(final String cbId, final String name, final String mime, final String content) {
        if (!trusted) return;
        pendingSaveId = cbId;
        pendingSaveContent = content;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    activity.startActivityForResult(i, MainActivity.REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    activity.callback(cbId, false, "No file manager available");
                }
            }
        });
    }

    @JavascriptInterface
    public void openFile(final String cbId) {
        if (!trusted) return;
        pendingOpenId = cbId;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    activity.startActivityForResult(i, MainActivity.REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    activity.callback(cbId, false, "No file manager available");
                }
            }
        });
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {
        Uri uri = data == null ? null : data.getData();
        if (requestCode == MainActivity.REQ_SAVE && pendingSaveId != null) {
            String id = pendingSaveId;
            String content = pendingSaveContent;
            pendingSaveId = null;
            pendingSaveContent = null;
            if (resultCode != Activity.RESULT_OK || uri == null) {
                activity.callback(id, false, "cancelled");
                return;
            }
            try {
                OutputStream os = activity.getContentResolver().openOutputStream(uri, "wt");
                if (os == null) throw new Exception("Cannot write file");
                os.write(content.getBytes(UTF8));
                os.close();
                activity.callback(id, true, "saved");
            } catch (Exception e) {
                activity.callback(id, false, String.valueOf(e.getMessage()));
            }
        } else if (requestCode == MainActivity.REQ_OPEN && pendingOpenId != null) {
            String id = pendingOpenId;
            pendingOpenId = null;
            if (resultCode != Activity.RESULT_OK || uri == null) {
                activity.callback(id, false, "cancelled");
                return;
            }
            try {
                InputStream is = activity.getContentResolver().openInputStream(uri);
                if (is == null) throw new Exception("Cannot read file");
                activity.callback(id, true, new String(readAll(is, 10 * 1024 * 1024), UTF8));
            } catch (Exception e) {
                activity.callback(id, false, String.valueOf(e.getMessage()));
            }
        }
    }

    static byte[] readAll(InputStream is, int max) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        int total = 0;
        try {
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > max) throw new Exception("File too large");
                bos.write(buf, 0, n);
            }
        } finally {
            is.close();
        }
        return bos.toByteArray();
    }

    // ─── Network helper (allowlisted market-data hosts only) ────────────────
    @JavascriptInterface
    public void httpGet(final String cbId, final String url) {
        if (!trusted) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL u = new URL(url);
                    if (!"https".equals(u.getProtocol()) || !HTTP_ALLOW.contains(u.getHost())) {
                        activity.callback(cbId, false, "Host not allowed");
                        return;
                    }
                    HttpsURLConnection c = (HttpsURLConnection) u.openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("Accept", "application/json");
                    int status = c.getResponseCode();
                    InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    String body = is == null ? "" : new String(readAll(is, 4 * 1024 * 1024), UTF8);
                    JSONObject o = new JSONObject();
                    o.put("status", status);
                    o.put("body", body);
                    activity.callback(cbId, true, o.toString());
                } catch (Exception e) {
                    activity.callback(cbId, false, String.valueOf(e.getMessage()));
                }
            }
        }, "lifeline-http").start();
    }

    // ─── Fingerprint / face unlock (hardware-backed key) ────────────────────
    @JavascriptInterface
    public String bioStatus() {
        if (!trusted) return "unavailable";
        return BiometricVault.status(activity) + (BiometricVault.isEnrolled(activity) ? ":on" : ":off");
    }

    @JavascriptInterface
    public void bioEnable(final String cbId, final String secretB64) {
        if (!trusted) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                BiometricVault.enable(activity, secretB64, cbId);
            }
        });
    }

    @JavascriptInterface
    public void bioUnlock(final String cbId) {
        if (!trusted) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                BiometricVault.unlock(activity, cbId);
            }
        });
    }

    @JavascriptInterface
    public void bioDisable() {
        if (!trusted) return;
        BiometricVault.disable(activity);
    }

    // ─── Device binding (hardware key, no user prompt) ──────────────────────
    /** Encrypts with a non-exportable Keystore key, so data copied off this phone cannot be decrypted elsewhere. */
    @JavascriptInterface
    public String deviceEncrypt(String plainB64) {
        if (!trusted) return "";
        try {
            return DeviceKey.encrypt(plainB64);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String deviceDecrypt(String sealedB64) {
        if (!trusted) return "";
        try {
            return DeviceKey.decrypt(sealedB64);
        } catch (Exception e) {
            return "";
        }
    }

    /** Clears native-side state (reminders, fingerprint key) when the user resets the app. */
    @JavascriptInterface
    public void wipeNative() {
        if (!trusted) return;
        BiometricVault.disable(activity);
        Reminders.schedule(activity, "[]");
    }
}
