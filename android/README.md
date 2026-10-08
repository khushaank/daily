# My Daily Brief Android source

Open this `android` folder in Android Studio. The existing generated APK is untouched; source edits do not update an installed APK. The GitHub APK workflow is now manual-only. No new APK is produced by the web checks or asset sync script.

Configure the new Supabase project and Google provider as described in [the root README](../README.md), then run `npm run sync:android` at the repository root. Add `mydailybrief://auth/callback` to Supabase's redirect allowlist for the future Android build. Sign-in opens the system browser and exchanges the returned code with PKCE; Google sign-in does not run inside the WebView. Source now declares Internet permission for this optional account flow.

The original device plan is saved atomically as `my-daily-brief.json` in private internal storage. Signed-in accounts use separate `my-daily-brief-USER_UUID.json` files. Tasks, habits, progress, settings and focus state are cached in the active file. The app preserves device-only use and only uploads its plan when you choose **Bring in device plan**. Supabase auth sessions live in private WebView storage; exported plan backups contain no session tokens.

**More → Save a backup** opens Android's document picker. **Restore a backup** asks before replacing the active plan and marks a restored account plan for cloud synchronization. Automatic Android device/cloud backups are disabled; export before uninstalling, clearing app data or changing phones. The website and Android app use separate local storage; account sync or exported JSON can carry plans between them.

**More → Task reminders** requests notification permission and schedules unfinished timed tasks. Reminders are off until enabled, may be delayed by battery-saving rules, and are rescheduled on plan changes, account switches, reboot and daily refresh. Buttons use system-respecting haptics. Scrollbars are hidden while scrolling remains enabled. The launcher vector matches the website's smiling star favicon.

When you decide to build later, Android Studio uses JDK 17, Android SDK Platform 36 and the repository's Gradle wrapper. Test browser sign-in/deep-link return, account switching, backups, haptics and notification permission on a phone or emulator before release. A Play Store release needs your own signing key. Source assets are bundled in `app/src/main/assets/www` and refreshed by the root sync script.
