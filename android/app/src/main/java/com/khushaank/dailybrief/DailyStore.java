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

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getFilesDir(), "my-daily-brief.json"));
    }

    static synchronized String read(Context context) {
        try (FileInputStream input = file(context).openRead();
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

    static synchronized boolean write(Context context, String json) {
        if (!valid(json)) return false;
        AtomicFile target = file(context);
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
