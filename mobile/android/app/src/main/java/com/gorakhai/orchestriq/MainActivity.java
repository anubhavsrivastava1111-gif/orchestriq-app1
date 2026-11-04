package com.gorakhai.orchestriq;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Collections;

/**
 * OrchestrIQ Android shell.
 *
 * The app loads the live site (see capacitor.config.json), so login, AI calls and data
 * behave exactly as on the web. This activity adds the three things a plain WebView lacks:
 *  1. Android back button walks back through the app's pages instead of closing it.
 *  2. Exports created in the browser (Excel, CSV, Word, PDF, images) are saved to Downloads.
 *  3. Regular file links from the server go through Android's DownloadManager.
 */
public class MainActivity extends BridgeActivity {

    private static final String APP_ORIGIN = "https://orchestriq.gorakhai.com";
    private static final String APP_HOST = "orchestriq.gorakhai.com";

    // Last page URL, recorded on the UI thread so the JS bridge (background thread) can check it.
    private volatile String currentUrl = "";

    // Runs inside the page. Catches <a download> clicks on blob:/data: links, which a WebView
    // ignores, reads the file and hands it to the native saveFile() below.
    private static final String DOWNLOAD_SHIM =
        "(function(){" +
        "if(window.__oiqDownloadShim)return;window.__oiqDownloadShim=true;" +
        "function save(href,name){" +
        "  if(!window.OrchestrIQNative||!href)return false;" +
        "  if(href.indexOf('blob:')!==0&&href.indexOf('data:')!==0)return false;" +
        "  fetch(href).then(function(r){return r.blob();}).then(function(b){" +
        "    var fr=new FileReader();" +
        "    fr.onload=function(){var s=String(fr.result);" +
        "      OrchestrIQNative.saveFile(name||'download',b.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};" +
        "    fr.readAsDataURL(b);" +
        "  }).catch(function(){OrchestrIQNative.toast('Download failed. Please try again.');});" +
        "  return true;" +
        "}" +
        "var orig=HTMLAnchorElement.prototype.click;" +
        "HTMLAnchorElement.prototype.click=function(){" +
        "  if(this.hasAttribute('download')&&save(this.href,this.getAttribute('download')))return;" +
        "  return orig.apply(this,arguments);" +
        "};" +
        "document.addEventListener('click',function(e){" +
        "  var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;" +
        "  if(a&&save(a.href,a.getAttribute('download'))){e.preventDefault();e.stopPropagation();}" +
        "},true);" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        WebView webView = bridge.getWebView();

        webView.addJavascriptInterface(new NativeBridge(), "OrchestrIQNative");

        // Preferred: inject before any page script runs (supported on all current Android WebViews).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, DOWNLOAD_SHIM, Collections.singleton(APP_ORIGIN));
        }
        // Always also inject after load: covers the very first page and older WebViews.
        // The shim guards itself, so running twice is harmless.
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                currentUrl = view.getUrl() == null ? "" : view.getUrl();
                if (isAppPage(currentUrl)) view.evaluateJavascript(DOWNLOAD_SHIM, null);
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
            try {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setMimeType(mimeType);
                req.addRequestHeader("User-Agent", userAgent);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) req.addRequestHeader("Cookie", cookies);
                req.setTitle(name);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(req);
                toast("Downloading " + name);
            } catch (Exception e) {
                openExternally(Uri.parse(url));
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = bridge.getWebView();
                if (wv.canGoBack()) {
                    wv.goBack();
                } else {
                    // Keep the app (and the user's session) alive, like other Android apps do.
                    moveTaskToBack(true);
                }
            }
        });
    }

    private static boolean isAppPage(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return "https".equals(u.getScheme()) && APP_HOST.equals(u.getHost());
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            toast("No app found to open this file.");
        }
    }

    private static String safeFileName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "download";
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }

    /** Methods callable from the page as window.OrchestrIQNative.* */
    private class NativeBridge {

        @JavascriptInterface
        public void toast(String msg) {
            if (isAppPage(currentUrl)) MainActivity.this.toast(msg);
        }

        @JavascriptInterface
        public void saveFile(String fileName, String mimeType, String base64) {
            if (!isAppPage(currentUrl)) return; // only the OrchestrIQ site may save files
            String name = safeFileName(fileName);
            String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                Uri saved;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Android 10+: public Downloads folder, no storage permission needed.
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    saved = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (saved == null) throw new IllegalStateException("Could not create file");
                    try (OutputStream out = cr.openOutputStream(saved)) {
                        if (out == null) throw new IllegalStateException("Could not open file");
                        out.write(data);
                    }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    cr.update(saved, v, null, null);
                } else {
                    // Android 7–9: the app's own Downloads folder, opened via a secure link.
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) dir = new File(getFilesDir(), "Download");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File f = new File(dir, name);
                    try (FileOutputStream out = new FileOutputStream(f)) {
                        out.write(data);
                    }
                    saved = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", f);
                }
                MainActivity.this.toast("Saved to Downloads: " + name);
                final Uri fileUri = saved;
                runOnUiThread(() -> {
                    Intent view = new Intent(Intent.ACTION_VIEW);
                    view.setDataAndType(fileUri, mime);
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        startActivity(Intent.createChooser(view, "Open " + name));
                    } catch (ActivityNotFoundException ignored) {
                        // File is saved; there is just no app installed to open this type.
                    }
                });
            } catch (Exception e) {
                MainActivity.this.toast("Could not save " + name);
            }
        }
    }
}
