# My Daily Brief

A mobile-first daily planner with study tasks, recurring habits, focus sessions, completion sounds, streaks and Pip, your cheering study companion. The static website is at the repository root; the Android Studio project is in `android/`.

## Connect your new Supabase project

1. Create your **new** Supabase project. Run [`supabase/setup.sql`](supabase/setup.sql) in its SQL Editor. This creates `daily_plans`, owner-only row-level security and a revision-checked save function. It does not import any other project's data.
2. Edit [`supabase-config.js`](supabase-config.js): set `url` to your project URL and `publishableKey` to its **public publishable key** (a legacy `anon` key also works). Never put a secret key, `service_role` key or Google client secret into this repository.
3. Configure a Google **Web application** OAuth client in Google Cloud. Add your website origin under Authorized JavaScript origins, and your project's `https://PROJECT_REF.supabase.co/auth/v1/callback` under Authorized redirect URIs. Put the Google client ID and secret into Supabase's Google Auth provider settings and enable it. Use only the basic profile, email and openid scopes.
4. In Supabase Auth URL Configuration, set your website's Site URL and allow its exact return URL, including any subdirectory. By default the app returns to its current origin + pathname; you can set `redirectUrl` explicitly. For local testing, allow `http://localhost:4173/`. For a future Android build, also allow **`mydailybrief://auth/callback`**.
5. Serve the root over HTTPS (localhost works for development). No build is needed to serve it. Test Google sign-in, save a task, then sign into the same account on another device to check sync. Until configuration is supplied, the login screen offers device-only use and honestly marks Google sign-in unavailable.

Official setup guides: [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [mobile deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

## Data and backups

Device-only use keeps the original `my-daily-brief-v1` plan on this device. Each signed-in account has its own cache and private Supabase document; signing in never silently uploads the guest plan. Use **More → Bring in device plan** to explicitly copy it into your account, or import JSON. Signing out switches away from the account plan. Cached account data remains on that device for offline use; clear site/app storage if handing the device to someone else.

Every edit saves locally first. Cloud saves are debounced; offline edits retry when connectivity returns or the app becomes visible. If another device changed the plan, More asks you to choose the cloud copy or this device. Export a backup first to keep both. Cloud status and retry controls live in More. Sync is checked on app opening, reconnection and return to the app; it is not a live collaboration service.

**More → Save a backup** exports tasks, habits, check-ins, settings and focus state as JSON. Import can merge a plan or replace it from a backup. Export before clearing app/site data, uninstalling or changing phones. Device-only plans and signed-in caches are separate.

## Development

```sh
npm ci
npm test
npx playwright install chromium
npm run test:mobile
python -m http.server 4173
```

The pinned Supabase client bundle is committed in `vendor/`, so no CDN is needed at runtime. After changing its dependency, run `npm run build:vendor`. The accompanying `vendor/THIRD_PARTY_NOTICES.txt` includes third-party notices.

After editing root web files or Supabase config, run **`npm run sync:android`** to update bundled Android source assets. This command only copies files; it never runs Gradle or produces an APK. The existing APK is unchanged. The Android GitHub workflow is **manual-only** while source edits are ongoing; no push or pull request automatically generates an APK.

Automated checks exercise account isolation, offline retries, competing-device conflicts, in-flight edits, and the SQL's owner restrictions, document checks and revision comparisons. Google end-to-end login requires your configured provider and project. Native login/deep-link/notification behavior needs a later emulator or phone check when you choose to build again.
