package com.orchestriq.lifeline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.view.WindowManager;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;
import org.robolectric.shadows.ShadowWebView;

import java.util.List;

/** Runs Lifeline's real Android code on the JVM with Robolectric (Android 15 framework). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class NativeTest {

    private MainActivity launch() {
        return Robolectric.buildActivity(MainActivity.class).setup().get();
    }

    @Test
    public void activityIsLockedDown() {
        MainActivity a = launch();
        int flags = a.getWindow().getAttributes().flags;
        assertTrue("FLAG_SECURE (no screenshots / recents preview)", (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
        WebView w = a.web;
        assertFalse("no file:// access", w.getSettings().getAllowFileAccess());
        assertFalse("no content:// access", w.getSettings().getAllowContentAccess());
        assertEquals(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW, w.getSettings().getMixedContentMode());
        ShadowWebView sw = shadowOf(w);
        assertEquals(MainActivity.START_URL, sw.getLastLoadedUrl());
        assertNotNull("bridge exposed", sw.getJavascriptInterface("LifelineNative"));
    }

    @Test
    public void servesBundledAssetsWithCsp() throws Exception {
        MainActivity a = launch();
        WebResourceResponse html = a.serveAsset("/money/index.html");
        assertEquals(200, html.getStatusCode());
        assertEquals("text/html", html.getMimeType());
        assertTrue(html.getResponseHeaders().get("Content-Security-Policy").contains("script-src 'self'"));
        byte[] body = new byte[200];
        int n = html.getData().read(body);
        assertTrue("real app HTML", new String(body, 0, n, "UTF-8").contains("<!doctype html>"));
        assertEquals(404, a.serveAsset("/money/missing.js").getStatusCode());
        assertEquals("path traversal blocked", 400, a.serveAsset("/../AndroidManifest.xml").getStatusCode());
    }

    @Test
    public void neverNavigatesAwayFromTheApp() {
        MainActivity a = launch();
        assertTrue(MainActivity.isAppUrl(Uri.parse("https://appassets.androidplatform.net/money/index.html")));
        assertFalse(MainActivity.isAppUrl(Uri.parse("https://evil.example/money/index.html")));
        assertFalse(MainActivity.isAppUrl(Uri.parse("http://appassets.androidplatform.net/")));
        a.openExternal(Uri.parse("https://cms.rbi.org.in"));
        Intent i = shadowOf(a).getNextStartedActivity();
        assertNotNull("https opens in browser", i);
        assertEquals(Intent.ACTION_VIEW, i.getAction());
        a.openExternal(Uri.parse("intent://evil#Intent;component=x/y;end"));
        a.openExternal(Uri.parse("javascript:alert(1)"));
        a.openExternal(Uri.parse("file:///data/data/com.orchestriq.lifeline/x"));
        assertNull("dangerous schemes ignored", shadowOf(a).getNextStartedActivity());
    }

    @Test
    public void bridgeRefusesUntrustedPages() throws Exception {
        MainActivity a = launch();
        Bridge b = a.bridge;
        b.setTrusted(false);
        assertEquals("{}", b.info());
        assertEquals("[]", b.installedPackages("[\"com.openai.chatgpt\"]"));
        assertFalse(b.openApp("com.openai.chatgpt"));
        b.setTrusted(true);
        JSONObject info = new JSONObject(b.info());
        assertEquals("android", info.getString("platform"));
    }

    @Test
    public void detectsOnlyKnownInstalledApps() throws Exception {
        MainActivity a = launch();
        PackageInfo chat = new PackageInfo(); chat.packageName = "com.openai.chatgpt";
        PackageInfo other = new PackageInfo(); other.packageName = "com.random.spy";
        shadowOf(a.getPackageManager()).installPackage(chat);
        shadowOf(a.getPackageManager()).installPackage(other);
        a.bridge.setTrusted(true);
        JSONArray found = new JSONArray(a.bridge.installedPackages("[\"com.openai.chatgpt\",\"com.random.spy\",\"com.anthropic.claude\"]"));
        assertEquals(1, found.length());
        assertEquals("com.openai.chatgpt", found.getString(0));
    }

    @Test
    public void sharesDirectlyToChosenAiApp() {
        MainActivity a = launch();
        a.bridge.setTrusted(true);
        a.bridge.shareText("My summary", "Question", "com.openai.chatgpt");
        org.robolectric.shadows.ShadowLooper.idleMainLooper();
        Intent i = shadowOf(a).getNextStartedActivity();
        assertNotNull(i);
        assertEquals(Intent.ACTION_SEND, i.getAction());
        assertEquals("com.openai.chatgpt", i.getPackage());
        assertEquals("My summary", i.getStringExtra(Intent.EXTRA_TEXT));
    }

    private JSONArray reminders(long... offsets) throws Exception {
        JSONArray arr = new JSONArray();
        int id = 100;
        for (long off : offsets) {
            arr.put(new JSONObject().put("id", id++).put("at", System.currentTimeMillis() + off).put("title", "Fund SBI for Bike loan").put("body", "₹3,400 on 3 Dec"));
        }
        return arr;
    }

    @Test
    public void schedulesOnlyFutureRemindersAndReplacesOldOnes() throws Exception {
        Context c = RuntimeEnvironment.getApplication();
        ShadowAlarmManager am = shadowOf((AlarmManager) c.getSystemService(Context.ALARM_SERVICE));
        Reminders.schedule(c, reminders(3_600_000L, 86_400_000L, -60_000L).toString());
        assertEquals("past reminder skipped", 2, am.getScheduledAlarms().size());
        Reminders.schedule(c, reminders(7_200_000L).toString());
        assertEquals("old alarms cancelled", 1, am.getScheduledAlarms().size());
        Reminders.schedule(c, "not json");
        assertEquals("bad input schedules nothing", 0, am.getScheduledAlarms().size());
    }

    @Test
    public void rearmsAfterReboot() throws Exception {
        Context c = RuntimeEnvironment.getApplication();
        Reminders.schedule(c, reminders(3_600_000L, 7_200_000L).toString());
        ShadowAlarmManager am = shadowOf((AlarmManager) c.getSystemService(Context.ALARM_SERVICE));
        // simulate reboot: alarms wiped
        for (ShadowAlarmManager.ScheduledAlarm s : am.getScheduledAlarms()) ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(s.operation);
        assertEquals(0, am.getScheduledAlarms().size());
        new BootReceiver().onReceive(c, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(2, am.getScheduledAlarms().size());
    }

    @Test
    public void reminderNotificationHidesDetailsOnLockScreen() {
        Application c = RuntimeEnvironment.getApplication();
        Intent i = new Intent(c, AlarmReceiver.class).putExtra("id", 7).putExtra("title", "EMI today: Bike loan").putExtra("body", "₹3,400 from SBI");
        new AlarmReceiver().onReceive(c, i);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        List<Notification> all = shadowOf(nm).getAllNotifications();
        assertEquals(1, all.size());
        Notification n = all.get(0);
        assertEquals(Notification.VISIBILITY_PRIVATE, n.visibility);
        assertNotNull("public (lock-screen) version", n.publicVersion);
        assertFalse("no amount on lock screen", String.valueOf(n.publicVersion.extras.getCharSequence(Notification.EXTRA_TEXT)).contains("₹"));
        assertNotNull(nm.getNotificationChannel(AlarmReceiver.CHANNEL));
    }

    @Test
    public void httpHelperOnlyTalksToAllowListedHosts() {
        assertTrue(Bridge.HTTP_ALLOW.contains("api.mfapi.in"));
        assertTrue(Bridge.HTTP_ALLOW.contains("www.alphavantage.co"));
        assertFalse(Bridge.HTTP_ALLOW.contains("evil.example"));
        assertEquals(2, Bridge.HTTP_ALLOW.size());
    }
}
