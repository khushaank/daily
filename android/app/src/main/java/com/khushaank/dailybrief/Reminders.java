package com.khushaank.dailybrief;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

final class Reminders {
    private static final String CHANNEL = "study_tasks";
    private static final String PREFS = "daily_reminders";
    private static final String REFRESH = "com.khushaank.dailybrief.REFRESH";
    private static final int MAX_PENDING = 250;
    private Reminders() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean("enabled", false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean("enabled", enabled).apply();
        sync(context);
    }

    static boolean hasPermission(Context context) {
        return Build.VERSION.SDK_INT < 33
            || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void createChannel(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Task reminders", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Reminders for timed study tasks");
        manager.createNotificationChannel(channel);
    }

    private static PendingIntent taskIntent(Context context, String key, String id, String date, String title) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setData(Uri.parse("dailybrief://task/" + Uri.encode(key)));
        intent.putExtra("taskId", id);
        intent.putExtra("date", date);
        intent.putExtra("title", title);
        return PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(REFRESH);
        return PendingIntent.getBroadcast(context, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static synchronized void sync(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences settings = prefs(context);
        Set<String> old = new HashSet<>(settings.getStringSet("scheduled", Collections.emptySet()));
        for (String key : old) alarms.cancel(taskIntent(context, key, "", "", ""));
        alarms.cancel(refreshIntent(context));

        Set<String> scheduled = new HashSet<>();
        if (enabled(context) && hasPermission(context)) {
            try {
                JSONObject state = new JSONObject(DailyStore.read(context));
                JSONArray tasks = state.optJSONArray("tasks");
                JSONObject completions = state.optJSONObject("completions");
                ArrayList<TimedTask> upcoming = new ArrayList<>();
                if (tasks != null) for (int i = 0; i < tasks.length(); i++) {
                    JSONObject task = tasks.optJSONObject(i);
                    if (task == null) continue;
                    String id = task.optString("id"), date = task.optString("date");
                    String time = task.optString("time"), title = task.optString("title");
                    if (id.isEmpty() || time.isEmpty() || (completions != null
                        && completions.optBoolean("t|" + id + "|" + date))) continue;
                    try {
                        long when = LocalDateTime.parse(date + "T" + time)
                            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                        if (when > System.currentTimeMillis()) upcoming.add(new TimedTask(id, date, title, when));
                    } catch (RuntimeException ignored) {
                        // Ignore malformed dates in imported plans.
                    }
                }
                upcoming.sort(Comparator.comparingLong(task -> task.when));
                for (int i = 0; i < Math.min(upcoming.size(), MAX_PENDING); i++) {
                    TimedTask task = upcoming.get(i);
                    String key = task.id + "|" + task.date;
                    try {
                        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, task.when,
                            taskIntent(context, key, task.id, task.date, task.title));
                        scheduled.add(key);
                    } catch (RuntimeException ignored) {
                        // The rest of the plan and its private data file remain usable.
                    }
                }
            } catch (Exception ignored) {
                // The app can still open and restore its plan if the file is unreadable.
            }

            long tomorrow = LocalDate.now().plusDays(1).atTime(0, 10)
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, tomorrow, refreshIntent(context));
        }
        settings.edit().putStringSet("scheduled", scheduled).apply();
    }

    static void show(Context context, String id, String date, String title) {
        if (id == null || date == null || !enabled(context) || !hasPermission(context)) return;
        try {
            JSONObject state = new JSONObject(DailyStore.read(context));
            if (state.optJSONObject("completions").optBoolean("t|" + id + "|" + date)) return;
            JSONArray tasks = state.optJSONArray("tasks");
            boolean present = false;
            if (tasks != null) for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task != null && id.equals(task.optString("id")) && date.equals(task.optString("date"))) {
                    present = true;
                    break;
                }
            }
            if (!present) return;
        } catch (Exception error) {
            return;
        }

        createChannel(context);
        Intent launch = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notice = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Your study time is here")
            .setContentText(title == null ? "Open My Daily Brief" : title)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify((id + date).hashCode(), notice);
    }

    private static final class TimedTask {
        final String id, date, title;
        final long when;
        TimedTask(String id, String date, String title, long when) {
            this.id = id; this.date = date; this.title = title; this.when = when;
        }
    }
}
