# My Daily Brief for Android

This Android Studio project packages the current My Daily Brief website as an offline Android app. Open the **android** folder in Android Studio, let Gradle sync, then press **Run** with an emulator or connected phone. Android Studio uses its bundled JDK 17; install Android SDK Platform 36 if prompted.

To make an installable APK, choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. The repository's Android APK workflow also builds that APK and offers it as a downloadable GitHub Actions artifact. A Play Store release needs your own signing key.

The app creates `my-daily-brief.json` in its private internal storage when it first opens. Tasks, habits, check-ins, focus state, and app settings are written there after each change. The normal website and the Android app have separate storage; use **More → Save a backup** on one and **Import your plan** or **Restore a backup** on the other to move data.

**More → Save a backup** opens Android's document picker so you choose a location for a complete JSON backup. **Restore a backup** reads a selected JSON file and asks before replacing the current plan. Private app storage is removed on uninstall, so save a backup before uninstalling or changing phones. Android's automatic cloud/device backups are disabled; the app has no internet permission or account sync. A cloud location is used only if you explicitly choose one in Android's document picker.

**More → Task reminders** asks for notification permission and reminds you when an unfinished task with a time begins. The phone may delay alarms to save battery. Reminders are off until you enable them. The app reschedules reminders when the plan changes, when the phone reboots, and daily. Buttons give system-respecting vibration feedback.

All web files are bundled in `app/src/main/assets/www`; the website source at the repository root stays independent.
