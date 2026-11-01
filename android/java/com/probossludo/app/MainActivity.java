package com.probossludo.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * PROBOSS LUDO — thin Android wrapper around the deployed player site.
 *
 * Responsibilities:
 *   • load the real site in a full-screen WebView
 *   • keep the user signed in (DOM storage enabled)
 *   • add a "ProbossLudoApp/1.0" User-Agent marker so the website hides the
 *     "Download App" button while the player is already inside the app
 *   • hand non-http(s) schemes (upi://, paytm://, phonepe://, qr deep links)
 *     to the native apps so deposits ring-fence no money client-side
 *   • file chooser + camera for deposit screenshots / KYC uploads
 */
public class MainActivity extends Activity {
    /** Point this at your deployed player site. */
    private static final String SITE_URL = "https://probossludo.com";

    /** Marker injected into the WebView user-agent — the site detects it. */
    private static final String APP_UA_MARKER = "ProbossLudoApp/1.0";

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(0xFF090B10);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    // normal web navigation -> let the WebView handle it
                    view.loadUrl(url);
                    return true;
                }
                // upi:// / paytm:// / phonepe:// / qr deep links -> native app
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // no app installed for this scheme
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                filePathCallback = cb;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                Intent chooser = Intent.createChooser(intent, "Choose file");
                // include the camera as a straight option for photo uploads
                if (params.getMode() == FileChooserParams.MODE_OPEN && Build.VERSION.SDK_INT >= 21) {
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    try {
                        PackageManager pm = getPackageManager();
                        if (cam.resolveActivity(pm) != null) {
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                        }
                    } catch (Exception ignored) {
                        // camera unavailable — chooser still works
                    }
                }
                try {
                    startActivityForResult(chooser, 10001);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // marker so probossludo.com knows it is inside the Android app
        String ua = s.getUserAgentString();
        if (ua == null) ua = "";
        if (!ua.contains("ProbossLudoApp")) {
            s.setUserAgentString(ua + " " + APP_UA_MARKER);
        }

        setContentView(web);

        if (getIntent() != null && getIntent().getData() != null) {
            // deep link (e.g. a UPI callback) — open it in the WebView
            String deep = getIntent().getDataString();
            if (deep != null && deep.startsWith("http")) web.loadUrl(deep);
            else web.loadUrl(SITE_URL);
        } else {
            web.loadUrl(SITE_URL);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 10001 && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }
}