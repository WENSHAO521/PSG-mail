package com.psg.mail;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor's core has no back handling (that lives in @capacitor/app,
        // which this app doesn't ship), so the system back button/gesture
        // closed the whole app from any screen. The web app keeps one history
        // entry per open surface (reader, folder sheet, composer, settings
        // detail) and per page, so walking the WebView history closes the top
        // surface first; only with nothing left to go back to does back fall
        // through to the system (leave the app).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
