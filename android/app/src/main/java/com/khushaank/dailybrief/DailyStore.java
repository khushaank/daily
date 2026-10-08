package com.khushaank.dailybrief;

import android.content.Context;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class DailyStore {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private DailyStore() {}

    static String scope(Context context) {
        return context.getSharedPreferences("daily-account", Context.MODE_PRIVATE).getString("scope", "guest");
    }

    static boolean validScope(String scope) {
        return "guest".equals(scope) || (scope != null && scope.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"));
    }

    static synchronized String select(Context context, String scope) {
        if (!validScope(scope)) throw new IllegalArgumentException("Invalid account");
        context.getSharedPreferences("daily-account", Context.MODE_PRIVATE).edit().putString("scope", scope).commit();
        return read(context, scope);
    }

    private static AtomicFile file(Context context, String scope) {
        if (!validScope(scope)) throw new IllegalArgumentException("Invalid account");
        String name = "guest".equals(scope) ? "my-daily-brief.json" : "my-daily-brief-" + scope + ".json";
        return new AtomicFile(new File(context.getFilesDir(), name));
    }

    static String read(Context context) { return read(context, scope(context)); }

    static synchronized String read(Context context, String scope) {
        try (FileInputStream input = file(context, scope).openRead();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                if (output.size() > MAX_BYTES) return "";
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException error) {
            return "";
        }
    }

    static boolean valid(String json) {
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return false;
        try {
            JSONObject state = new JSONObject(json);
            return state.opt("tasks") instanceof JSONArray
                && state.opt("habits") instanceof JSONArray
                && state.opt("completions") instanceof JSONObject;
        } catch (Exception error) {
            return false;
        }
    }

    static boolean write(Context context, String json) { return write(context, scope(context), json); }

    static synchronized boolean write(Context context, String scope, String json) {
        if (!validScope(scope) || !valid(json)) return false;
        AtomicFile target = file(context, scope);
        FileOutputStream output = null;
        try {
            output = target.startWrite();
            output.write(json.getBytes(StandardCharsets.UTF_8));
            target.finishWrite(output);
            return true;
        } catch (IOException error) {
            if (output != null) target.failWrite(output);
            return false;
        }
    }
}
