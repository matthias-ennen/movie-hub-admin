package de.matthiasennen.moviehubadmin;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.net.URI;

public final class MainActivity extends Activity {
    private WebView webView;
    private LinearLayout errorView;
    private boolean pageFailed;

    private boolean isAdminOrigin(String url) {
        try {
            URI allowed = URI.create(BuildConfig.ADMIN_URL);
            URI candidate = URI.create(url);
            return "https".equalsIgnoreCase(candidate.getScheme())
                && allowed.getHost().equalsIgnoreCase(candidate.getHost())
                && candidate.getPort() == -1;
        } catch (IllegalArgumentException | NullPointerException ignored) {
            return false;
        }
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 20, 27));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Without a WebChromeClient, WebView silently returns false from JavaScript confirm().
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageFailed = false;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAdminOrigin(request.getUrl().toString());
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) { pageFailed = true; showConnectionError(); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed && isAdminOrigin(url)) { errorView.setVisibility(View.GONE); webView.setVisibility(View.VISIBLE); }
            }
        });

        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setPadding(40, 50, 40, 40);
        errorView.setBackgroundColor(Color.rgb(16, 20, 27));
        TextView message = new TextView(this);
        message.setText("Movie Hub Admin ist gerade nicht erreichbar.");
        message.setTextColor(Color.WHITE);
        message.setTextSize(20);
        errorView.addView(message);
        Button retry = new Button(this);
        retry.setText("Erneut versuchen");
        retry.setOnClickListener(v -> { errorView.setVisibility(View.GONE); webView.setVisibility(View.VISIBLE); webView.loadUrl(BuildConfig.ADMIN_URL); });
        errorView.addView(retry);
        errorView.setVisibility(View.GONE);

        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        root.addView(errorView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (savedInstanceState == null) webView.loadUrl(BuildConfig.ADMIN_URL);
        else webView.restoreState(savedInstanceState);
    }

    private void showConnectionError() {
        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
