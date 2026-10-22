# Archery Coach

Vue 3 + TypeScript app (Vite, Ionic Vue with its router). Mobile app only for now (Android first, iOS later), the web build is wrapped with Capacitor; no separate web product. Backend: Django REST Framework in `server/`. Plan and decisions: `docs/plan.md`. The old Expo (React Native) version is the git tag `expo-final`.

## Commands

```bash
npm run dev            # Vite dev server, http://localhost:5173
npm run type-check     # vue-tsc --build
npm test               # Vitest (src/**/*.test.ts)
npm run build-only     # web build into dist/ (Caddy serves it)
npx cap sync android   # after a build or after adding a Capacitor plugin
npm run types:api      # regenerate src/lib/api-types.ts after changing a serializer or view
cd server && uv run pytest
```

Run `type-check` and `test` before declaring a task done.

## Layout and conventions

- `src/views/`: one file per route (routes are listed in `src/router/index.ts`, with `meta.title` and `meta.auth`: `'in'` signed in only, `'out'` signed out only).
- `src/components/`: reusable pieces. Form basics are `FormField`, `ChipGroup`, `AppButton`, `ErrorText`.
- `src/composables/`: app-wide state as module-level singletons (`useAuth`, `useServer`, `useLog`), plus `useRemote` (load, poll and reload data from the server) and `usePageTitle`.
- `src/lib/`: logic without Vue, tested with Vitest (scoring, plotting, the local log and its upload queue). Keep it free of Vue and Capacitor imports, except the storage files (`token-storage.ts`, `local-store.ts`, `export-file.ts`).
- Ionic keeps the screens of the navigation stack alive, so a screen in the background must not follow the route: read `route.params` and `route.query` once in setup, never in a `computed`. Every screen is wrapped in `AppPage` (app bar, back button, content; `fixed` for a screen that must not scroll). The tab bar (Home, Training, Statistics, More) is in `App.vue` and shows on routes with `meta.tab`.
- Components are Ionic (`IonButton`, `IonInput`, `IonList`, ...); layout helpers (`d-flex`, `gap-2`, ...) come from Bootstrap's utilities only. Styling is in `src/assets/main.css`. Theme: System/Light/Dark from Settings (`useTheme`; `data-bs-theme` and `ion-palette-dark` on `<html>`). Chart colours are CSS variables there.
- Call the server through `useAuth().api` (a typed `openapi-fetch` client that adds and refreshes the token). Do not call `fetch` directly for API routes.
- Sessions are logged on the device first (`useLog`) and uploaded from a queue; see `src/lib/log-sync.ts`. Screens that show other people's data read from the server with `useRemote`.
- The Android project in `android/` is committed; its build output is not. The app version comes from `package.json`.

## Rules

- Never commit or push unless asked.
- Capacitor plugins are native: after `npm install @capacitor/...` run `npx cap sync android` and rebuild the APK.
- The app on the phone is served from `https://localhost`: the server's `DJANGO_CORS_ORIGINS` must contain it (see README).
