# PSG Mail — native app

Native client for **Android, Windows, macOS and Linux**, built with Flutter.
It draws its own UI (no embedded browser); only the message body is
rendered from HTML, with native widgets
(`flutter_widget_from_html_core`).

It talks to the same worker API as the web app (`/api/...`), so it works
against any PSG Mail deployment: enter the site address on the login screen.

## What's in this first version

- Sign in (server address, email, password); the session is remembered
- Switch between your addresses
- Folders: Inbox, Starred, Sent, Archive, Spam, Deleted, and your labels
- Mail list with pull-to-refresh, paging, swipe to archive / delete
- Reader: HTML body, attachments, star, archive, spam, mark unread, delete
- Compose, reply, reply all, forward, with attachments
- Search (same syntax as the web app)
- Layout adapts: phones use a drawer, wide windows show folders, list and
  message side by side
- Desktop shortcuts: Ctrl/⌘+N compose, Ctrl/⌘+F search, F5 refresh,
  Esc closes the message, Ctrl/⌘+Enter sends
- Chinese and English, light and dark theme

Admin pages, system settings, analytics and the other workspace pages are
still web-only.

## Develop

```sh
cd mail-app
flutter pub get
flutter run -d linux        # or windows / macos / an Android device
flutter analyze && flutter test
```

To use a local worker (`wrangler dev` on port 8787), enter
`http://127.0.0.1:8787` as the server address.

## Builds

`.github/workflows/native-app.yml` builds an APK, a Windows folder, a macOS
`.app` (zipped) and a Linux bundle on every change to `mail-app/`, and
attaches them to the workflow run. The APK is release-signed when the
`ANDROID_KEYSTORE` / `ANDROID_KEY_ALIAS` / `ANDROID_STORE_PASSWORD` /
`ANDROID_KEY_PASSWORD` secrets are set.

The Android application id is `com.psg.psg_mail`, so it installs beside the
current app (`com.psg.mail`) while it covers only the core screens.
