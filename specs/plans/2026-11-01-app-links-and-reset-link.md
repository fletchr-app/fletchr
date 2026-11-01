# App Links and a reset link in the mail (#56, #19)

Status: implemented in the app, server and website; **open for Tim**: the Play fingerprints in `assetlinks.json`, publishing the site, `DJANGO_SITE_URL`, a phone test with the Play build.
Date: 2026-11-01

## Decisions

- The mail carries `https://fletchr.de/reset/<CODE>` (the code without the dash). No custom-scheme link in the mail: many mail apps do not make those clickable. The custom scheme is only used by the "Open in the app" button of the website page.
- The confirm endpoint needs the email address and the link does not carry it (no personal data in URLs or server logs). The app keeps the address on the device for the hour the code works (`src/lib/pending-reset.ts`, localStorage key `pendingReset`). Without it (another phone, cleared storage) the reset screen asks for the address.
- The mail has the link only when `DJANGO_SITE_URL` is set (production: `https://fletchr.de`). Empty, the mail is as before: right for a self-hosted server, because the official app only verifies `fletchr.de`.
- The fallback page `site/reset/index.html` shows the code and an "Open in the app" button. It asks the server nothing, so a mail program that looks at the link in advance uses nothing up.
- Links in the invite and claim share texts only on the official server (`useServer().isOverride` is false): a code of a custom server means nothing on fletchr.de.
- A reset link tapped while signed in shows a short hint and does nothing else.
- The Dev app (`de.fletchr.app.dev`) has its own URL scheme, so the website's button no longer opens a chooser on a phone with both apps. Its debug key is in `assetlinks.json`, so App Links can be tested without a Play build.
- The code is in the path (`/reset/<code>`), like `/join/<code>`. It shows in the website's access log (kept up to 7 days); it works for one hour with five tries and only together with the address.

## Checklist

- [x] `src/lib/app-link.ts` (was `invite-link.ts`): `parseAppLink`, `joinUrl`, `resetUrl`, tests
- [x] Manifest: `/reset/` in the verified filter, `reset` host for the custom scheme; debug scheme `de.fletchr.app.dev`
- [x] `useAppLinks` (all links, `pendingResetCode`), reset screen takes the code and the saved address, tests for the saved address
- [x] Share texts with the link on the official server (`teams.inviteTextLink`, `teams.claimTextLink`)
- [x] Server: `SITE_URL`, mail text with the link (English and German), tests
- [x] Website: `site/reset/index.html`, `.htaccess`, nginx example, SELFHOSTING.md section 7
- [x] Phone check with the Dev app (`adb shell am start -a android.intent.action.VIEW -d "de.fletchr.app.dev://reset/ABCD1234"`): signed in shows the hint, signed out opens the reset screen on the code step with the code filled in
- [ ] **Tim**: SHA-256 of the app signing key and of the upload key (Play Console, App integrity) into `site/.well-known/assetlinks.json` (a statement for `de.fletchr.app`; today only the Dev app is listed). Read the certificate of the installed Play build too (`adb shell pm path de.fletchr.app`, pull `base.apk`, `apksigner verify --print-certs`), as with the SHA-1 in `specs/design/accounts.md`
- [ ] **Tim**: publish the site (`deploy/site.sh`), check `curl -i https://fletchr.de/.well-known/assetlinks.json`, then on the phone `adb shell pm verify-app-links --re-verify de.fletchr.app` and `pm get-app-links de.fletchr.app` (`fletchr.de: verified`)
- [ ] **Tim**: `DJANGO_SITE_URL=https://fletchr.de` in `deploy/.env.prod` on the server, **after** the reset page is live
- [ ] **Tim**: with the Play build: an invite link from a messenger opens the app; a real reset mail in Gmail opens the reset screen with the code, with the app running and closed; with the app uninstalled the link shows the page
- [ ] Release (new manifest filter, so a new app version), changelog entry
- [ ] Later: a Play Store button on the pages once the listing is public

## Risks

- A wrong or missing fingerprint fails silently: the links open the browser. Check with `pm verify-app-links`.
- Link wrappers in mail clients (redirectors, Safe Links) can stop the hand-off to the app. The button on the page covers that.
- Old app versions do not know `/reset/`: the link opens the page, which still shows the code.
- An app signed in to a custom server that receives a fletchr.de invite link pushes the code to that server's join screen. Existing gap, not changed here.
