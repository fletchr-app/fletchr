# Custom server login: register, reset password and server address for a self-hosted server

Status: implemented
Date: 2026-10-31
Builds on the uncommitted sign-in change: `/sign-in` always uses `DEFAULT_SERVER_URL` (resets the override in `onIonViewWillEnter`), `/sign-in/custom` (`SignInCustomView.vue`) takes server, email and password.

Markers: **[fact]** checked in the code, **[check]** verify before relying on it, **(decided)** a default Tim has to confirm.

## What is there (checked)

- `useServer().setUrl` stores the override in `localStorage`; `useAuth` builds a new `AuthSession` for every new `url` in a watcher, so changing the address signs out of the account **[fact]**. Tokens are stored with their server and ignored for another (`token-storage.ts`) **[fact]**.
- Changing the address while signed in ends in `signedOut`, not `local` (no `enterLocal`, unlike `signOut()`), and the upload queue of the account stays under the old store owner **[fact for the status, check for the queue]**.
- `/register` and `/reset-password` use whatever `url` is set and go back to `/sign-in` **[fact]**. An invite link opens `/register?code=` (`App.vue`) without passing `/sign-in`, so a stale override from a failed custom attempt is used **[fact]**.
- `invite-link.ts` only knows `fletchr.de` links, so invites of a self-hosted server cannot carry its address **[fact]**.
- `SignInCustomView` calls `setUrl` before `signIn` and relies on `nextTick` for the watcher; a failed sign-in leaves the override set **[fact]**.
- `/settings/server` (`SettingsServerView.vue`) edits the address for signed-in and signed-out users; Settings shows a row with the host for signed-in users **[fact]**.
- `useServerHealth` checks the current `url` only, not a draft **[fact]**. A CORS refusal and an unreachable host look the same to `fetch` **[fact]**.

## Decisions

1. **The custom server has its own small flow: `/sign-in/custom`, `/sign-in/custom/register`, `/sign-in/custom/reset-password`** (decided). The two new routes reuse `RegisterView` and `ResetPasswordView` with a route prop `custom: true` (back link and "back to sign-in" go to `/sign-in/custom`). The address is not passed in the query: the override, set by the custom page, is the one source. This avoids reading a query that changes under a screen Ionic keeps alive, and keeps invite deep links (`/register?code=`) on the official server.
   - Trade-off: two more routes instead of a `?server=` parameter. A query would also work for deep links later, but then every screen has to read and apply it once in setup, and a cached screen keeps an old value.
2. **Official screens reset, custom screens keep** (decided). `/sign-in`, `/register` and `/reset-password` call `setUrl(null)` in `onIonViewWillEnter`; the `/sign-in/custom/*` routes never reset. Rule: the route says which server, not leftover state.
3. **The custom page sets the override only after the address checks out** (decided). On "Sign in", "Register" or "Forgot password?": parse the address, run a one-off health check against the draft, then `setUrl`, then act. Replaces the `nextTick` hack: `signIn` gets the server explicitly or awaits the session swap **[check which is simpler in `useAuth`]**.
4. **A failed sign-in keeps the override** while on the custom screens (needed for register and reset on that server). It is dropped on the next official screen. In local mode the app does not talk to the server (`askServer` skips), so a wrong leftover address costs nothing (decided).
5. **The last custom address is remembered** (`localStorage`, separate key) and prefilled on `/sign-in/custom` (decided). Cheap, saves typing for the few who use it.
6. **Address rules** (decided): trim, strip trailing slashes, add `https://` when no scheme is given, lower-case the host, refuse anything but `http`/`https`, refuse a path, query or fragment. `http://` only in dev builds (`import.meta.env.DEV`); release builds block cleartext anyway (README) and a clear message beats "not reachable". Same address as `DEFAULT_SERVER_URL` after parsing: send the person to `/sign-in` (Google there).
7. **`/settings/server` is removed** (decided). Signed in, the address is not changeable: changing it is a sign-out in disguise (status `signedOut` instead of `local`, unsent items stay behind under the old owner). The Settings row stays as information (host and health status, no link). To use another server: sign out, then `/sign-in/custom`.
   - Trade-off: a coach testing two servers signs out and in. Acceptable for a rare case; a real multi-server switch would need the sign-out checks (unsent items) anyway.
8. **Out of scope**: invite links that carry a self-hosted server's address (follow-up issue: `example.org/join/<code>` on the operator's site, or `?server=`), Google for self-hosted servers (impossible, see SELFHOSTING.md).

## Steps

### Step 1: address parsing in `src/lib`

- [ ] `src/lib/server-address.ts`: `parseServerAddress(input, { allowHttp })` returns `{ url }` or `{ error: key }` (`serverAddress.empty | invalid | scheme | httpNotAllowed | path`). Move `normaliseUrl` there; `useServer` imports it.
- [ ] `src/lib/server-address.test.ts`: no scheme, trailing slashes, upper-case host, port, IPv6/IP addresses, `ftp://`, path/query/fragment, `http://` with and without `allowHttp`, whitespace, equal to default.

### Step 2: health check of a draft

- [ ] `checkServer(address): Promise<'ok' | 'unreachable'>` in `useServer.ts` (one fetch to `/api/health/`, timeout about 8 s). `useServerHealth` uses it for the current `url`.
- [ ] Unreachable message mentions both causes: wrong address, or the server does not allow the app (`DJANGO_CORS_ORIGINS` without `https://localhost`).

### Step 3: custom flow

- [ ] `SignInCustomView`: prefill from the last custom address, parse, check, `setUrl`, sign in. Errors under the address field (parse/health) and under the form (sign-in). Links "Join with invite code" and "Forgot password?" to the new routes, through the same parse and check.
- [ ] Router: `/sign-in/custom/register` and `/sign-in/custom/reset-password` (`auth: 'out'`, `props: { custom: true }`), titles in `meta.title`.
- [ ] `RegisterView`, `ResetPasswordView`: prop `custom`; back href and "back to sign-in" depend on it; show "Server: {url}" when custom. No Google (already off through `googleAvailable`).
- [ ] `SignInView` (done), `RegisterView` and `ResetPasswordView` without `custom`: `setUrl(null)` in `onIonViewWillEnter`.
- [ ] Remember the address after a successful health check (`lastCustomServer`).

### Step 4: Settings

- [ ] Remove `/settings/server` and `SettingsServerView.vue`. Settings row: host plus health (`useServerHealth`), no `router-link`, no `detail`.
- [ ] Remove the now unused keys (`settings.defaultFromBuild`, `overridden`, `save`, `reset`) **[check other users first]**.

### Step 5: texts (en and de)

- [ ] `auth.custom.intro` (short: for a server run by your club; Google is not available there), `auth.custom.remembered` if shown, `auth.custom.register`, `auth.custom.forgot`.
- [ ] `serverAddress.empty`, `invalid`, `scheme`, `httpNotAllowed`, `path`, `unreachable` (with the CORS hint), `isDefault`.
- [ ] `settings.serverRow` with the health state, if the row text changes.

### Step 6: docs

- [ ] `specs/design/accounts.md`: section "Servers": official vs custom, which screens reset, no switch while signed in.
- [ ] `specs/design/screens.md`: the sign-in screens and the Settings row.
- [ ] `SELFHOSTING.md` line 194: replace "Settings, Server address; ... the 'change' link" with "Connect to custom server" on the sign-in screen; add that `DJANGO_CORS_ORIGINS` must contain `https://localhost` for the Play Store app to reach the server.
- [ ] `README.md` "Server address": the per-device change is now on the sign-in screen, not Settings.
- [ ] Comment in `useServer.ts` ("Users can override it in Settings") updated.

### Step 7: check

- [ ] `npm run type-check`, `npm test`.
- [ ] On a phone (release build, `VITE_SERVER_URL=https://app.fletchr.de`): custom sign-in, register, reset against a test server; failed sign-in, then back to `/sign-in` shows the official server and Google; invite link after a failed custom attempt lands on the official server; Settings row shows the custom host.

## Risks

- The `AuthSession` swap is asynchronous (tokens load from storage); signing in right after `setUrl` may race with `loaded` **[check]**. Step 3 must await it, not `nextTick`.
- Removing `/settings/server` takes away the only way to fix a wrong address while signed in. With decision 7 a wrong address cannot be signed in to, so this only matters if a server moves: then sign out and in again (unsent items stay on the phone under the old owner and would not go up, flag in the docs).
