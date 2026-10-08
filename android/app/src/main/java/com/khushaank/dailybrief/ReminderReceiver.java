package com.khushaank.dailybrief;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if ("com.khushaank.dailybrief.REFRESH".equals(intent.getAction())) {
            Reminders.sync(context);
        } else {
            Reminders.show(context, intent.getStringExtra("taskId"),
                intent.getStringExtra("date"), intent.getStringExtra("title"));
        }
    }
}
