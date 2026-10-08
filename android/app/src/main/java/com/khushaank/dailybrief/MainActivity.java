package com.khushaank.dailybrief;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int WEB_FILE = 10, EXPORT_FILE = 11, RESTORE_FILE = 12, NOTIFICATION_PERMISSION = 13;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(248, 247, 242));
        getWindow().setNavigationBarColor(Color.rgb(248, 247, 242));
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setBackgroundColor(Color.rgb(248, 247, 242));
        webView.addJavascriptInterface(new NativeBridge(), "DailyNative");
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())
                    && uri.getPath() != null && uri.getPath().startsWith("/assets/www/")) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                        FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), WEB_FILE);
                    return true;
                } catch (Exception error) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    return false;
                }
            }
        });
        setContentView(webView);
        Reminders.createChannel(this);
        Reminders.sync(this);
        webView.loadUrl(START);
    }

    @Override @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == WEB_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == EXPORT_FILE) {
            try (OutputStream stream = getContentResolver().openOutputStream(uri)) {
                if (stream == null) throw new IllegalStateException("No writable file");
                stream.write(DailyStore.read(this).getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Backup saved", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Could not save the backup", Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == RESTORE_FILE) {
            try (InputStream stream = getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                if (stream == null) throw new IllegalStateException("No readable file");
                byte[] chunk = new byte[8192];
                int count;
                while ((count = stream.read(chunk)) != -1) {
                    buffer.write(chunk, 0, count);
                    if (buffer.size() > 8 * 1024 * 1024) throw new IllegalArgumentException("Backup is too large");
                }
                String json = buffer.toString(StandardCharsets.UTF_8.name());
                if (!DailyStore.valid(json)) throw new IllegalArgumentException("Invalid backup");
                new AlertDialog.Builder(this).setTitle("Restore this backup?")
                    .setMessage("This replaces the plan and progress on this phone.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Restore", (dialog, which) -> {
                        if (DailyStore.write(this, json)) {
                            Reminders.sync(this);
                            webView.loadUrl(START);
                            Toast.makeText(this, "Backup restored", Toast.LENGTH_SHORT).show();
                        } else {
                            Toast.makeText(this, "Could not restore the backup", Toast.LENGTH_LONG).show();
                        }
                    }).show();
            } catch (Exception error) {
                Toast.makeText(this, "Choose a valid My Daily Brief JSON backup", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void setReminders(boolean enable) {
        if (enable && Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
            return;
        }
        Reminders.setEnabled(this, enable);
        updateReminderControl(false);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATION_PERMISSION) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            Reminders.setEnabled(this, granted);
            updateReminderControl(!granted);
        }
    }

    private void updateReminderControl(boolean denied) {
        webView.evaluateJavascript("window.dailyNativeRemindersChanged("
            + Reminders.enabled(this) + "," + denied + ")", null);
    }

    @Override @SuppressWarnings("deprecation")
    public void onBackPressed() {
        webView.evaluateJavascript(
            "(function(){var dialog=document.querySelector('#modal');"
                + "if(dialog&&dialog.open){dialog.close();return true}return false})()",
            result -> { if ("false".equals(result)) MainActivity.super.onBackPressed(); });
    }

    private final class NativeBridge {
        @JavascriptInterface public String read() { return DailyStore.read(MainActivity.this); }

        @JavascriptInterface public boolean save(String json) {
            boolean saved = DailyStore.write(MainActivity.this, json);
            if (saved && Reminders.enabled(MainActivity.this)) Reminders.sync(MainActivity.this);
            return saved;
        }

        @JavascriptInterface public boolean remindersEnabled() {
            return Reminders.enabled(MainActivity.this);
        }

        @JavascriptInterface public void setReminders(boolean enabled) {
            runOnUiThread(() -> MainActivity.this.setReminders(enabled));
        }

        @JavascriptInterface public void haptic(String kind) {
            runOnUiThread(() -> {
                if (Settings.System.getInt(getContentResolver(), Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) return;
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    vibrator.vibrate(VibrationEffect.createOneShot("success".equals(kind) ? 40 : 12,
                        "success".equals(kind) ? 165 : 80));
                }
            });
        }

        @JavascriptInterface public void exportBackup() {
            runOnUiThread(() -> {
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                String date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                save.putExtra(Intent.EXTRA_TITLE, "my-daily-brief-" + date + ".json");
                startActivityForResult(save, EXPORT_FILE);
            });
        }

        @JavascriptInterface public void restoreBackup() {
            runOnUiThread(() -> {
                Intent open = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                open.putExtra(Intent.EXTRA_MIME_TYPES,
                    new String[]{"application/json", "text/plain", "application/octet-stream"});
                startActivityForResult(open, RESTORE_FILE);
            });
        }
    }
}
