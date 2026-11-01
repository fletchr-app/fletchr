# Trainings in the phone's calendar, Android (#107)

Status: implemented (phases 1 to 3), spike done on a phone 2026-10-31 (see "Spike result"). Decided (issue #107): Android only, a calendar the app creates and owns, plugin `@ebarooni/capacitor-calendar`, **one entry per training** (changed from repeating series after the spike), every entry tagged with our id, permission asked only when the user turns the feature on
Date: 2026-10-31

Markers: **[fact]** checked in the code or in the plugin's published package, **[inferred]** my reading, not checked by running anything, **[check]** verify before relying on it.

## Context

- #104 is still open, but its phases 1 to 5 are implemented; only phase 6 (offline) is open **[fact]** (`specs/plans/index.md`, `specs/design/schedule-and-events.md`). Everything this plan reads exists on `develop`: `TrainingSlot`, `TrainingEvent`, `GET /api/slots/` and `GET /api/events/agenda/` **[fact]**. #107 does not need phase 6. If #104 changes the agenda or slot schema before closing, this plan follows.
- #106 dropped the iCal feed in favour of this issue **[fact]** (`2026-10-31-calendar-view.md`, design doc "Not built").
- Out of scope: iOS (separate path later), two-way sync (edits in the calendar app are not read back), cross-device sync (the iCal feed would have done that, see Risks).

What is there already:
- The slots are not used: the agenda already has every occurrence with its times **[fact]**.
- `GET /api/events/agenda/?from=&to=` without `team` returns every team of the user, at most 120 days **[fact]**. `AgendaItem`: `id` (uuid5 for a virtual occurrence), `virtual`, `slot`, `date`, `team`, `team_name`, `kind`, `name`, `start`, `end`, `location`, `time_zone`, `cancelled` **[fact]**. A paused occurrence is not in the agenda; a cancelled one is, with `cancelled` **[fact]**. A moved occurrence is a real row with the same `slot` and `date` and new `start`/`end` **[fact]** (trainer-session plan, API).
- `useAgenda.ts` (yesterday to plus 56 days, for suggestions) and `useTeams.ts` are module-level singletons that reload on sign-in **[fact]**. `useSchedule.ts` calls `agenda.load(true)` after every write **[fact]**. Leaving a team is `TeamLeaveDelete.vue` (`DELETE /api/teams/{id}/membership/`) **[fact]**.
- Per-device settings follow `useUploadSettings.ts`: a ref plus `localStore` key **[fact]**. Resume hooks: `App.addListener('appStateChange', ...)` in several composables **[fact]**.
- `src/lib` may import Capacitor only in the storage files (`token-storage.ts`, `local-store.ts`, `export-file.ts`) **[fact]** (AGENTS.md).

## Plugin: @ebarooni/capacitor-calendar (chosen)

Checked in the npm package 8.10.0 (published 2026-10-17, MIT), not on a device:
- Peer dependency `@capacitor/core >=8.0.0`; the app has `^8.5.3` **[fact]**. Android `minSdkVersion` 24 **[fact]**.
- Its `AndroidManifest.xml` declares no permissions **[fact]**: we add `READ_CALENDAR` and `WRITE_CALENDAR` to `android/app/src/main/AndroidManifest.xml`.
- `requestFullCalendarAccess()` asks for both, `checkPermission({ scope })` reads the state **[fact]**.
- `createCalendar({ title, color, accountName, ownerAccount })`: on Android `ACCOUNT_TYPE_LOCAL`, inserted as sync adapter **[fact]**. `listCalendars()` gives `accountName` and `visible` **[fact]**. `deleteCalendar({ id })` **[fact]**.
- `createEvent`: `calendarId`, `title`, `startDate`/`endDate` (ms), `location`, `description`, `alerts` **[fact]** (it also has `recurrence`, which we do not use, see "Spike result"). **No time-zone option**: Android stores `TimeZone.getDefault()` as `EVENT_TIMEZONE`; with explicit instants per entry this does not matter **[fact]**. **No custom field**: `url` is iOS only, so our tag goes into `description` **[fact]**.
- `listEventsInRange({ from, to })`: entries of all calendars (no calendar filter), each with `id`, `calendarId`, `description`, `startDate` **[fact]**.
- `deleteEvent({ id })` deletes an entry **[fact]**. (The single-occurrence delete, `span: THIS_EVENT` with `instanceDate`, inserts a cancelled exception that the phone's provider rejects, see "Spike result".)
- `modifyEvent` has `span` on iOS only **[fact]**. We do not use it: a changed entry is deleted and created again.

## Design

### The calendar

- One calendar per device, title "Fletchr" (`deviceCalendar.calendarName`, same in both languages **[inferred]**), colour from the app theme's primary, `accountName` and `ownerAccount` both `fletchr` (fixed, no email).
- Found by `accountName === 'fletchr'` in `listCalendars()`, not by a stored id alone: after a reinstall the local storage is gone but the calendar may still be there (spike). The stored id is only a shortcut. Two calendars with our account name: keep the one with the most of our entries, delete the others.
- Contains only our entries. An entry without our tag in that calendar (the user added one by hand) is left alone.

### Spike result (phone, 2026-10-31, own throwaway server)

- Works: permission prompt on turning the switch on; a local calendar "Fletchr" (`account_type=LOCAL`, visible); entries with description and location; every instance of a series carries the tag in `description` (provider level); a second sync changes nothing; a changed entry is deleted and created again; turning off deletes the calendar and its entries.
- **Does not work: cancelling one occurrence of a series.** The provider throws a `NullPointerException` in `CalendarProvider2.handleInsertException` (line 2067) when a cancelled exception is inserted on a local calendar's series. The same happens when the exception is inserted directly through `adb shell content insert`, so it is Android, not the plugin. Cancelled, moved and paused trainings are exactly what a schedule has, so the app does not use series.
- Display: the "Fletchr" calendar shows up in the calendar app on Tim's phone without any setup (checked by Tim, 2026-10-31).
- **Uninstall**: the calendar and all its entries stay on the phone (nobody owns them any more, and their reminders still fire). After a reinstall the app finds the calendar by its account name, reuses it and ends with the same number of entries, no duplicates (entries are rewritten when the reminder setting differs, which is the diff working as meant). Nothing can be done at uninstall time; the user can remove an orphaned calendar in the calendar app's settings.
- Not checked: Samsung Calendar, whether Google's own default notifications attach to a local calendar.

### Tags

- Every entry's `description` ends with a line `fletchr:event:<agenda id>:<hash>`; above it a short human line ("Team <team>, from the Fletchr app"; it goes on every kind of entry, so it does not say "Training"). `hash` is a short hash (FNV-1a, 8 hex) of everything we write: title, location, start, end, the reminder, the note. A different hash means "changed".
- So the device holds the whole state; the app stores only `enabled`, `reminder` and the calendar id. Sync is a diff, safe to repeat and safe after a crash halfway.

### What should be in the calendar (desired)

From `GET /api/events/agenda/` for yesterday to plus 119 days (the 120-day maximum), all teams: **every item that is not cancelled**, virtual occurrences of a slot as well as rows (one-offs, competitions, camps, moved occurrences). The server has worked out the times (time zones and DST), so the app does no date arithmetic. Title `<name or kind> · <team name>`, location, `alerts` from the reminder setting (Q3). A paused occurrence is not in the agenda, a cancelled one is marked: neither is written. `GET /api/slots/` is not needed. Trainings before the feature was turned on do not appear (Q2).

### Sync algorithm (`src/lib/device-calendar.ts`, no Vue, no Capacitor)

`plan(desired, existing)` returns `{ create, remove }`:
1. Group `existing` (listed from the window, filtered to our calendar id) by tag key; entries without a tag are ignored.
2. A key not desired (cancelled, moved to another time, deleted, left team): remove.
3. A key desired with another hash: remove, then create.
4. A key desired and missing: create.
5. More than one entry for one key (duplicates): keep one with the right hash, remove the rest.
6. Nothing outside the window is touched: past entries stay as they were.

### Composable and native wrapper

- `src/lib/device-calendar-native.ts` (Capacitor allowed, like `local-store.ts`): a small `CalendarBackend` interface (`permission`, `requestPermission`, `findOrCreateCalendar`, `deleteCalendar`, `listInstances(calendarId, from, to)`, `createEntry`, `deleteEntry`, `deleteOccurrence`) over the plugin. Tests use a fake backend. Add the file to the exception list in AGENTS.md.
- `src/composables/useDeviceCalendar.ts`, singleton: `enabled` (`localStore` key `deviceCalendar`, `'1'`/`'0'`), `reminder` (key `deviceCalendarReminder`, minutes before as a string, `'0'` is none, default none), `calendarId` (key `deviceCalendarId`), `status` (`'off' | 'syncing' | 'ok' | 'noPermission' | 'offline' | 'error'`), `lastSync`, `enable()`, `disable()`, `sync(force?)`. One sync at a time: a running sync and at most one queued after it (a second parallel `create` would make duplicates).
- Only on `Capacitor.getPlatform() === 'android'` and signed in with an account (`!isLocal`).

### Triggers

- **Turn on**: permission, find or create the calendar, sync.
- **Schedule edits on this phone**: `useSchedule` calls `deviceCalendar.sync(true)` after each successful `putEvent`, `addEvent`, `deleteEvent`, `putSlot`, `deleteSlot` (cancel, move, reinstate, one-off, slot edit, "change from").
- **Leave a team**: `TeamLeaveDelete` reloads `useTeams()`, then `sync(true)`; the team's slots and events are no longer returned, so its entries are removed.
- **App start and resume** (`appStateChange`, `isActive`): `sync()` unless the last sync is younger than 15 minutes (Q4). This is how changes by another coach arrive.
- **Turn off**: `deleteCalendar` (all entries go with it), clear both keys.
- **Sign out**: delete the calendar like turning off, so the next account on the phone does not see the old team's trainings (Q1).
- Offline: nothing is changed, `status = 'offline'`, the calendar keeps the last state.

### Settings UI

- `SettingsView.vue`, list "Teams" (only with an account, on Android): `IonToggle` "Trainings in the phone's calendar", under it a hint (status: last updated, or the problem). While on, an `IonSelect` "Reminder": None, 30 minutes, 1 hour, 1 day before (proposed choices, change if you want others). Changing it calls `sync(true)`.
- Turning on: `requestFullCalendarAccess()`. Granted: calendar, sync, toggle on. Denied: toggle back off, hint `deviceCalendar.denied` ("Allowed in Android's settings: Apps, Fletchr, Permissions, Calendar."). No settings deep link: no plugin for it in the app **[fact]**; `capacitor-native-settings` would be one more native plugin, not worth it now (Q6).
- Permission withdrawn later in Android settings: `sync()` checks the permission first; `status = 'noPermission'`, toggle stays on, hint with the same text; the next sync after the user allows it works again.
- Plugin error: `status = 'error'`, hint `deviceCalendar.failed`, next trigger tries again.

### i18n

`src/locales/en.ts` and `de.ts`, new block `deviceCalendar` (German reviewed against the style in `specs/steering/i18n.md`):
- `toggle` "Trainings in the phone's calendar" / "Trainings im Kalender des Handys", `reminder` "Reminder" / "Erinnerung" with the four choices, `hint` "In a calendar of its own, on this phone only." / "In einem eigenen Kalender, nur auf diesem Handy.", `denied`, `failed`, `offline`, `updated` "Updated {time}" / "Aktualisiert {time}", `calendarName` "Fletchr", `entryNote` "Team {team}, from the Fletchr app" / "Team {team}, aus der Fletchr-App".
- Entry titles use `schedule`/`event.kind` keys that exist. `device-calendar.ts` takes the texts as parameters (words in, no sentences built in `src/lib`). A language change changes the hash, so the next sync rewrites the entries.

## Checklist by phase (small PRs)

### Phase 0: spike on a real device (throwaway branch, no merge)

- [x] `npm install @ebarooni/capacitor-calendar@8.10.0`, permissions in the manifest, `npx cap sync android`, debug APK.
- [x] Done through the real feature on a phone against a throwaway server (calendar, weekly series, a one-off, cancelling an occurrence: fails, see "Spike result").
- [ ] Google Calendar (Pixel or any phone with it) and Samsung Calendar: is the local calendar listed and shown without the user doing anything? If hidden: can the user switch it on, and where?
- [ ] Does Google Calendar sync it to the web or another phone? Expected: no **[inferred]**; write down what happens.
- [ ] A cancelled training: gone in both apps (one entry per training, so a plain delete).
- [x] Tag on every entry: yes at provider level; the plugin's own listing is proven by a second sync that changes nothing.
- [ ] Uninstall the app: does the calendar and its entries stay? Reinstall: does `listCalendars()` find it by `accountName`?
- [ ] A training after 2026-10-25 shows at the same local time as one before (explicit instants from the server).
- [ ] Result as a short note in this plan; if a point fails badly (local calendars hidden in Samsung Calendar with no way to show them), stop and talk to Tim before Phase 1.

### Phase 1: logic

- [x] `src/lib/device-calendar.ts`: `tagLine(key, hash)`, `parseTag(description)`, `hash(entry)`, `desiredEntries(agenda, texts, reminder)`, `plan(desired, existing)`, `syncCalendar(backend, calendarId, input)`.
- [x] `src/lib/device-calendar.test.ts` (fake data, `process.env.TZ = 'Europe/Berlin'` at the top like `calendar.test.ts`).

### Phase 2: native and composable

- [x] `npm install @ebarooni/capacitor-calendar`, `READ_CALENDAR` and `WRITE_CALENDAR` in `android/app/src/main/AndroidManifest.xml`.
- [x] `src/lib/device-calendar-native.ts`, AGENTS.md exception list updated.
- [x] `src/composables/useDeviceCalendar.ts` with the queue, the permission check and the triggers (resume listener, sign-out).
- [x] Hooks in `useSchedule.ts`, `TeamLeaveDelete.vue`; sign-out is handled in `useDeviceCalendar.ts` by watching the auth status (leaving `signedIn` deletes the calendar), nothing in `useAuth`.

### Phase 3: settings

- [x] Toggle, hint and reminder select in `SettingsView.vue`, locale keys in `en.ts` and `de.ts`.
- [x] `npm run type-check`, `npm test`.
- [x] `npx cap sync android` (done); [ ] rebuild the APK (native plugin: a web build alone is not enough).

## Tests

Vitest:
- [x] `parseTag`: our line found at the end; other text, no tag, a tag-like line in the middle ignored.
- [x] `hash` changes with title, location, times, `valid_until`, the reminder, the language's text; not with `updated_at`.
- [x] `desiredEntries`: every item that is not cancelled becomes one entry (virtual or row); camp over three days one entry; local time kept across the time change.
- [x] `plan`: a cancelled, moved or paused training is removed (moved: removed and created again), the others stay.
- [x] `plan`: empty device creates all; same state does nothing (idempotent, run twice); changed hash removes and creates; removed slot and left team remove; two masters with the same key keep one; untagged entries untouched.
- [x] `useDeviceCalendar` with a fake backend: denied permission keeps it off; two syncs at once run one after the other; offline changes nothing.
- [x] Locale parity test covers the new keys.

Server: none (no server change).

Phone (Android, after Phase 3):
- [ ] Turn on, allow: calendar appears with the team's trainings in Google Calendar and Samsung Calendar.
- [ ] Turn on, deny: toggle off, hint shown. Allow in Android settings, turn on again: works.
- [ ] Coach cancels, moves, reinstates, adds a one-off and a tournament: calendar follows at once. Another coach's change: arrives on resume.
- [ ] Slot "change from <day>": the old trainings go, the new ones appear, no doubles.
- [ ] Set a reminder: the calendar app shows it on an entry; with "None", check whether Google Calendar adds its own default notification to a local calendar.
- [ ] Leave a team: its entries go. Turn off: the calendar is gone. Sign out: the calendar is gone.
- [ ] Kill the app during a sync, start again: no duplicates.
- [ ] Withdraw the permission in Android settings: hint, no crash.

## Docs to update

- [x] `specs/design/schedule-and-events.md`: section "Device calendar" (calendar, tags, sync rules, triggers); remove #107 from "Not built".
- [x] `specs/design/screens.md`: the settings toggle.
- [x] `specs/plans/index.md`: status of this plan.
- [x] AGENTS.md: `device-calendar-native.ts` in the list of `src/lib` files that may import Capacitor.
- [x] `CHANGELOG.md`: trainings in the phone's calendar (Android).
- [x] No ADR: the decision is in #107 and a line in the design doc is enough (like #106).

## Risks

- **Duplicates**: two syncs at once (queue in the composable), or a sync that misses existing entries (only if instances lack the tag: spike). Idempotent diff plus the duplicate rule in `plan` repairs it on the next sync.
- **Stale entries**: changes by another coach only arrive on start or resume; an entry that was removed on the server stays while the phone is offline. Accepted; the hint shows the last update.
- **Time zone**: each entry has the server's instants, so a training is at the right moment everywhere. The calendar app shows it in the phone's zone.
- **Many entries**: about 17 per weekly slot for 119 days, so a few dozen to a few hundred for a person in several teams. A sync is one list, then only the differences.
- **Hidden local calendar**: some calendar apps may not show local calendars. Tim's calendar app shows it; Samsung Calendar is not checked.
- **Orphaned calendar after uninstall**: the calendar stays with its entries and reminders until the user removes it in the calendar app; a reinstall adopts it again.
- **No cross-device sync**: an app-owned local calendar stays on the phone **[inferred]**, so the trainings are not on a tablet or on calendar.google.com. The iCal feed was dropped (#106); if users ask for it, it needs a new decision.
- **Past entries**: only entries from yesterday on are written, and entries before the window are never touched, so past trainings stay as the calendar had them; only a changed entry is deleted and written again, so a renamed slot rewrites the future trainings only.
- **Plugin from a personal repo** (~52 stars per the issue): pinned to an exact version; the wrapper keeps the rest of the app away from it, so a swap touches one file.
- **One more native plugin**: every plugin update needs `npx cap sync android` and an APK, like Camera and Filesystem.

## Decisions (Tim, 2026-10-31)

1. **Sign-out**: delete the calendar.
2. **Past trainings**: only from the window start (when the feature is turned on).
3. **Reminders**: a setting (None, 30 minutes, 1 hour, 1 day before; default None). **[check]** in the spike whether Google Calendar adds default notifications to a local calendar.
4. **Resume interval**: 15 minutes.
5. **Which kinds**: trainings, competitions and camps of all the user's teams.
6. **Denied permission**: text only, no `capacitor-native-settings`.
7. **Materialised occurrences**: nothing special any more, every item is one entry.
