# Stack

Status: implemented
Date: 2026-10-23
Updated: 2026-10-28
Decisions: [0001](../adrs/0001-django-drf-sqlite-backend.md), [0002](../adrs/0002-vue-capacitor-instead-of-expo.md)

- **App: Vue 3 + TypeScript + Vite + Vue Router, wrapped for phones with Capacitor**, one codebase, **mobile app only for now (Android first, iOS later)**; the web build is the dev shell and the base of the phone apps, not a released product. The phone apps are the web app in a WebView plus Capacitor plugins (secure storage, preferences, share, app lifecycle). Same stack as pyobs-web-client, so one person can maintain both
- **UI**: Ionic Vue (app bar, tab bar, page transitions, lists as cards) with Bootstrap's utility classes for layout only; light and dark follow the system or a setting; charts as plain inline SVG in Vue components, so they render the same on web and in the phone apps
- **Backend: Django + Django REST Framework + SQLite, self-hosted**. Why, and what was rejected: [0001](../adrs/0001-django-drf-sqlite-backend.md). Auth uses JWT (`djangorestframework-simplejwt`), the OpenAPI schema (`drf-spectacular`) generates the TypeScript types for the app, and the Django admin gives an admin UI. File storage, invites and sign-in providers are built by us. gunicorn runs behind nginx on the server (Plesk) and behind Caddy locally. If the club grows far beyond a few hundred archers, switch the database to Postgres (a settings change).
- **Builds and hosting**: Android Studio or Gradle (`npx cap sync`, then build) for the Android app, a macOS machine or CI runner with Xcode for the iOS app; the web build is served by your own server ([hosting-backups-cost.md](hosting-backups-cost.md)) for development and testing, a public web app/PWA is not planned for now
- **Languages**: English and German from the start (i18n)
