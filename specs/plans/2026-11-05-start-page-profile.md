# Start page: the archer profile for every user (#143)

Status: implemented, with the recommended answers to all open questions
Date: 2026-11-05

Design: [screens.md](../design/screens.md) (archer page), [local-mode.md](../design/local-mode.md), [offline-sync.md](../design/offline-sync.md). Follows "Archer page as a profile for the coach" (377f35a).

Markers: [fact] read in the code, [inference] follows from the code, [check] verify while building.

## Recommendation

Split `ArcherProfileView` into a page shell and one profile component that takes its data from a composable with two sources: `useOwnProfile()` (device first: `useLog`, `useEquipment`, media queue plus `useMediaLibrary`, `useNoteLibrary`, stats from `fromLog` + `computeStats`; server only for picture, profile line, evaluations, goals, teams) and `useArcherProfile(id)` (today's server reads, unchanged). The section components become presentational (props in, no `api` calls). `HomeView` renders the profile with the own source; `ArcherProfileView` with the archer source. The pure parts (which bow and arrow set are current, the six latest tiles from queue plus library, which plus and arrow show) go to `src/lib/profile.ts` and get Vitest tests. No server change, no migration, no API schema change.

## What the code does today

- [fact] `HomeView.vue`: greeting from `/api/me/`, version banner, error, arrows this week and last session from `sessionRows(local, remote)`, `LatestGoals`, `LatestNotes` (shared coach notes), links to media and evaluations, team list. Reloads on `onIonViewWillEnter` and `useOnReconnect`; clears `me` when `isLocal` turns true.
- [fact] `ArcherProfileView.vue`: cover or initials, profile line (hand, eye, age), consent, then `ArcherEquipmentSummary`, latest training (`useArcherSessions`), `ArcherEvaluations`, `ArcherStatsSummary`, `ArcherPhotos`, latest coach note; `ArcherMenu` in the app bar; `AvatarEditor bare` for managed archers. Every section calls the server itself through `useRemote`.
- [fact] Own data on the device: `useLog().sessions` holds the whole own history after the first pull (offline-sync.md:12); `useEquipment().bows/arrowSets` are the device store (`is_active` per item); `useMedia().items` is the upload queue, `useMediaLibrary().known()` plus `thumbnails` the kept server list (works offline); `useNoteLibrary().list({ archer, visibility: 'shared' })` reads the kept copy; `StatsView` already computes stats from `fromLog(useLog().sessions)` in local mode (`src/lib/stats.ts`).
- [fact] Server only, no device copy: `/api/me/` (name, picture, hand, eye, birth), `/api/evaluations/` (evaluations and goals), `/api/teams` (via `useTeams`).
- [fact] Own self-assessment: `/evaluate?archer=<me>&kind=self` (`EvaluationListView.vue`, key `evaluations.newSelf` "Rate myself"). Evaluations routes are `auth: 'account'`.
- [fact] `ArcherNotesView` with the own id shows `NotesSection` in own mode: private notes you write for yourself plus the shared coach notes [check the list part], not read-only.
- [fact] `MediaView.open`: queued item in local mode opens `/local-media/:id`; clips (also queued) open `/media/:id`; a photo opens in place on the media page.

## Plan

### 1. Pure helpers (`src/lib/profile.ts`, no Vue)

- [x] `currentGear(bows, arrowSets)`: first active bow and arrow set, taking either the device shape (`values`) or the server shape [check the `itemsOf` shape in `equipment-store.ts`]; move `summary()` from `ArcherEquipmentSummary.vue` here (it takes field specs and a label function, returns the "38 lb · Shibuya" parts, no sentences).
- [x] `latestTiles(queue, library, n)`: queued first, then the library newest first, no duplicates by id, max `n`; each tile with `src`, `kind`, and the target route (local: `/local-media/:id`; queued clip or library item: `/media/:id`; queued photo signed in: `/media` [check what MediaPlayerView does with a queued photo]).
- [x] `sectionLinks(...)`: for each section whether plus and arrow show, from `own`, `isLocal`, `hasAccount`, `count`, `canWrite`. One table, so the "no arrow without content, plus only when allowed" rule is tested once.
- [x] Tests `src/lib/profile.test.ts`: gear from both shapes, inactive skipped; tiles merge and order, queued item also in the library shows once; links per mode (own signed in, own local, coach with and without note rights, empty sections).

### 2. Data composables (`src/composables/useProfile.ts`)

- [x] One return type `ProfileData`: `name`, `avatarUrl`, `profileLine`, `sessionRows`, `gear`, `volume` (`this_week`, `this_month`, `total`), `tiles`, `evaluations`, `goals`, `latestNote`, `teams`, `links`, `errors`, `reload()`.
- [x] `useArcherProfile(id)`: today's reads moved out of `ArcherProfileView` and the `Archer*` components, same endpoints and polling. No behaviour change for coaches.
- [x] `useOwnProfile()`:
  - [x] sessions: the `HomeView` code (`sessionRows(local own, remote, gone, [], undefined, visibility)`), remote skipped in local mode.
  - [x] gear from `useEquipment`, volume from `computeStats(fromLog(sessions), now, tz, 1).volume`, watched on `sessions`.
  - [x] tiles from `useMedia().items` (own only, `owner` empty or me) and `useMediaLibrary()`; local mode: queue only.
  - [x] latest note from `useNoteLibrary().list({ archer: me, visibility: 'shared' })` (works offline); none in local mode.
  - [x] `/api/me/`, evaluations and teams only when `status === 'signedIn'`; evaluations fetched once and passed to goals (today `LatestGoals` fetches the same list again).
  - [x] Follows `isLocal` and `userId` (sign-in, sign-out, account change): the Home screen stays alive, so nothing is read once in setup. Reload on `onIonViewWillEnter` (not the first) and `useOnReconnect`, as `HomeView` does now.
- [x] Tests `src/composables/useProfile.test.ts` (pattern of `usePush.test.ts`, `vi.mock` for `useAuth`, `useLog`, `useEquipment`, `useMedia`, `useMediaLibrary`, `useNoteLibrary`): own + local makes no `api` call and fills sessions, gear, volume, tiles from the mocks; own + signed in offline (api rejects) still fills them; archer source calls the server endpoints with `owner=<id>`. This is the "data source switch" test the issue asks for.

### 3. Components

- [x] `src/components/ArcherProfile.vue`: the body of today's `ArcherProfileView` (cover, initials, profile line, consent, sections), props `data: ProfileData`, `own: boolean`.
- [x] Sections take props instead of fetching: `ArcherEquipmentSummary` (gear, link), `ArcherEvaluations` (list, links), `ArcherStatsSummary` (volume, link), `ArcherPhotos` (tiles, links). Latest training and coach note stay inline or become `ProfileTraining.vue` / `ProfileNote.vue` [inference: cleaner, since both differ per source].
- [x] `LatestGoals` takes the evaluation list as a prop; placed right after Evaluations (open question 3). `LatestNotes` is no longer used: remove it if nothing else imports it [check].
- [x] Own differences:
  - [x] Equipment arrow: `/equipment` (editable); plus: none, or `/equipment` new bow [open question 4].
  - [x] Latest training plus `/training/new`, arrow `/training` when more than one.
  - [x] Evaluations plus `/evaluate?archer=<me>&kind=self` (`evaluations.newSelf` as label), arrow `/archers/<me>/evaluations`. Hidden in local mode.
  - [x] Statistics arrow `/stats`.
  - [x] Photos plus `/media?add=1`, arrow `/media`.
  - [x] Notes: heading `notes.fromCoaches`, read only, no plus; arrow per open question 5. Hidden in local mode.
  - [x] Team list as the last section (account only), with `home.noTeam` when there is none.
  - [x] `VersionBanner` and the error at the top.
- [x] `src/components/ProfileMenu.vue` for the own app bar menu: "Change picture" / "Add picture" (`avatar.change`/`avatar.add`, through `AvatarEditor bare` without `archer`), "Hand, eye, date of birth" to `/profile`. Account only; in local mode no menu [open question 2].
- [x] `HomeView.vue`: `AppPage` title per open question 1, `ArcherProfile` with `useOwnProfile()`, `:back="false"` stays.
- [x] `ArcherProfileView.vue`: shell with `useArcherProfile(id)` and `ArcherMenu`.

### 4. Texts (en and de)

- [x] Remove keys only Home used: `home.hello`, `home.thisWeek`, `home.arrowsShot`, `home.lastSession` [check no other user with grep]; keep `home.noTeam`, `home.yourTeams`, `home.noSessions`.
- [x] New keys as needed, e.g. `profile.offlineEvaluations` ("Evaluations need a connection.") [check wording with Tim], a title for the own menu. Both `src/locales/en.ts` and `de.ts`; `npm test` has the key parity check [check it exists, otherwise compare by hand].

### 5. Docs

- [x] `specs/design/screens.md`: Home (Archer 1) becomes the own profile; a paragraph "Start page" next to "Archer page (coach)", with the own differences and the offline and local rules; the "Without an account" paragraph updated.
- [x] `specs/design/local-mode.md`: Home is the profile without evaluations, notes, picture and team.
- [x] This plan's status, and `specs/plans/index.md`.

### 6. Checks

- [x] `npm run type-check`, `npm test`.
- [x] `cd server && uv run pytest`: no server change, run to confirm.
- [x] `npm run types:api`: not needed (no serializer or view change).
- [x] No Capacitor plugin: `npx cap sync android` only as part of the normal build.
- [ ] Phone (Dev app against the :8080 stack): archer, coach, local mode, airplane mode with sessions and photos waiting, sign-out and sign-in while Home is alive in the stack.

## Risks

- **Statistics numbers differ.** The own tiles come from the device (also sessions not uploaded), the Statistics tab for a signed-in user from the server. After an upload they match (shared `stats-vectors.json`), before that the tiles are higher. [inference] Acceptable; the alternative is open question 6.
- **First pull not done** (new phone, offline): device history is incomplete, tiles and latest training show less. Same as the Training tab today.
- **Coach page regressions.** Moving the fetches out of the `Archer*` components touches the coach page that just shipped in 0.23.0. Keep `useArcherProfile` a move, not a rewrite; check polling (`REFRESH_MS`) and the managed-archer menu on a phone.
- **Screen kept alive.** Home is the first screen in the stack and lives across sign-in, sign-out and account changes; every source must follow `status` and `userId` (today `HomeView` clears `me` on `isLocal`).
- **Picture offline.** `avatar_url` is a signed link that runs out; offline or expired the cover falls back to initials (the `coverBroken` handling). The name offline is unknown unless cached (open question 1).
- **No data migration, no API or version change, no new Capacitor plugin.**

## Open questions

1. **Title.** Own name instead of "Fletchr"? Recommended: the name from `/api/me/`, kept on the device (small cache next to the log, so it shows offline), "Fletchr" until known and in local mode (`local.homeTitle` stays as the empty-state text). Tab label stays "Home".
2. **Picture and menu in local mode.** `AvatarEditor` uploads to the server, so local mode has no picture. Recommended: initials only, no menu; the cover appears after sign-in. A local picture would need a new store and a part in the upload on sign-in; not worth it now.
3. **Goals placement.** Recommended: directly under the latest evaluation, inside the Evaluations section, with the "Progress" link; no separate heading.
4. **Equipment plus for yourself.** Recommended: plus opens `/equipment` (where bows and arrow sets are added), arrow only when there is equipment, also to `/equipment`. Both to the same screen is a little odd; the alternative is no plus.
5. **Notes arrow.** `/archers/<me>/notes` is `NotesSection` in own mode (also private notes and a form). Recommended: use it as is (it already lists what coaches shared with you) and call the section "Notes" for yourself; a new read-only list only of coach notes is more code for little gain. If you want strictly coach notes, the arrow goes away.
6. **Statistics source for yourself.** Recommended: tiles from the device as the issue says, Statistics tab unchanged. Switching the tab to device numbers for signed-in users would make them match but drops server-only fields [check which].
7. **Evaluations offline.** No device copy exists. Recommended: show the last loaded list while the screen lives, else one muted line ("Evaluations need a connection."), no error text. A kept copy of evaluations is a separate issue.
8. **Coach who also shoots.** Same own profile, no coach sections (team overview stays on the Team tab). Recommended: yes, no special case.
