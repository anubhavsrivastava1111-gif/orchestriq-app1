package com.orchestriq.lifeline;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Lifeline interface in a locked-down WebView.
 * The UI ships inside the APK (assets/www) and is served from a reserved, offline-only origin,
 * so the app works without internet and no remote page can ever load inside it.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST;
    static final String START_URL = ORIGIN + "/money/index.html";

    /** Content-Security-Policy applied to every page: scripts only from the app itself,
     *  network only to the listed HTTPS services the user chooses to connect. */
    static final String CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data: blob:; font-src 'self' data:; manifest-src 'self'; "
            + "connect-src 'self' https://api.anthropic.com https://www.alphavantage.co https://api.mfapi.in; "
            + "worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

    static final int REQ_SAVE = 101;
    static final int REQ_OPEN = 102;
    static final int REQ_NOTIF = 103;

    WebView web;
    FrameLayout root;
    Bridge bridge;
    boolean darkTheme;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(Bridge.PREFS, MODE_PRIVATE);
        applySecureScreen(prefs.getBoolean("secure_screen", true));

        root = new FrameLayout(this);
        darkTheme = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        root.setBackgroundColor(darkTheme ? 0xFF070B14 : 0xFFF3F5F9);

        web = new WebView(this);
        bridge = new Bridge(this);
        configureWebView(web);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupInsets();
        applySystemBars();

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }
    }

    void configureWebView(WebView w) {
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " Lifeline/" + Bridge.versionName(this));

        w.setBackgroundColor(Color.TRANSPARENT);
        w.addJavascriptInterface(bridge, "LifelineNative");
        w.setWebViewClient(new AppClient());
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // no camera / microphone / etc.
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
        });
    }

    /** Keeps content clear of the status bar, navigation bar and keyboard (Android 15 draws edge-to-edge). */
    void setupInsets() {
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int l, t, r, b;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    l = bars.left; t = bars.top; r = bars.right; b = Math.max(bars.bottom, ime.bottom);
                } else {
                    l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                    r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
                }
                v.setPadding(l, t, r, b);
                return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
            }
        });
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
    }

    void applySystemBars() {
        root.setBackgroundColor(darkTheme ? 0xFF070B14 : 0xFFF3F5F9);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(darkTheme ? 0 : light, light);
            }
        } else {
            View d = getWindow().getDecorView();
            int flags = d.getSystemUiVisibility();
            if (darkTheme) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            d.setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(darkTheme ? 0xFF070B14 : 0xFFF3F5F9);
            getWindow().setNavigationBarColor(darkTheme ? 0xFF0F1625 : 0xFFFFFFFF);
        }
    }

    void setDarkTheme(boolean dark) {
        darkTheme = dark;
        applySystemBars();
    }

    /** FLAG_SECURE hides the app in the recent-apps screen and blocks screenshots / screen recording. */
    void applySecureScreen(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    /** Opens links outside the app; only safe, well-known schemes are allowed. */
    void openExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!(scheme.equals("https") || scheme.equals("http") || scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("upi"))) {
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, uri);
        i.addCategory(Intent.CATEGORY_BROWSABLE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    static boolean isAppUrl(Uri u) {
        return u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost());
    }

    class AppClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isAppUrl(u)) return false;
            openExternal(u);
            return true; // the WebView itself never leaves the app's own origin
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            bridge.setTrusted(isAppUrl(Uri.parse(url)));
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!isAppUrl(u)) return null; // HTTPS API calls go out normally (restricted by CSP)
            return serveAsset(u.getPath());
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Recover instead of crashing if the system kills the renderer.
            if (web != null) {
                root.removeView(web);
                web.destroy();
            }
            web = new WebView(MainActivity.this);
            configureWebView(web);
            root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.loadUrl(START_URL);
            return true;
        }
    }

    WebResourceResponse serveAsset(String path) {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("Cache-Control", "no-cache");
        if (path == null || path.isEmpty() || path.equals("/")) path = "/money/index.html";
        if (path.contains("..") || path.contains("\\")) {
            return new WebResourceResponse("text/plain", "utf-8", 400, "Bad Request", headers, new ByteArrayInputStream(new byte[0]));
        }
        if (path.endsWith("/")) path = path + "index.html";
        String mime = mimeFor(path);
        if (mime.equals("text/html")) headers.put("Content-Security-Policy", CSP);
        try {
            InputStream in = getAssets().open("www" + path);
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
        }
    }

    static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".map")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        // Let the app close an open sheet or return to Home first.
        web.evaluateJavascript("(window.LifelineOnBack && window.LifelineOnBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if ("\"1\"".equals(value)) return;          // the app handled it (closed a sheet / went Home)
                if ("\"0\"".equals(value)) { moveTaskToBack(true); return; } // on Home: leave the app
                if (web.canGoBack()) web.goBack();           // page not ready: plain history
                else MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        bridge.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        bridge.onPermissionResult(requestCode, grantResults);
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("LifelineNative");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Sends an async result back to the page. */
    void callback(final String id, final boolean ok, final String payload) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web == null) return;
                String js = "window.__lifelineCb && window.__lifelineCb(" + org.json.JSONObject.quote(id) + "," + ok + ","
                        + org.json.JSONObject.quote(payload == null ? "" : payload) + ")";
                web.evaluateJavascript(js, null);
            }
        });
    }
}
