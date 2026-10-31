# Calendar view for team trainings and events (#106)

Status: decided (2026-10-31), not started: build it (a coach asked), month view, week starts by locale, no iCal, defaults for Q3 to Q5
Date: 2026-10-31

Markers: **[fact]** checked in the code, **[inferred]** my reading, not checked by running anything, **[check]** verify before relying on it.

## Context and decisions so far

- #104 shipped the schedule (slots, events, lazy materialisation) and one screen for it: `AgendaView.vue` (`/team/:id/agenda`), a list by day of the last 4 and the next 8 weeks of one team **[fact]**. Out of scope there: "calendar grid and iCal (#106, #107)" (`specs/design/schedule-and-events.md`, "Not built") **[fact]**.
- #106 asks for a month and week grid on top of the agenda, possibly an iCal feed, and whether archers see it **[fact]**.
- Recommended direction (not decided by Tim):
  - **No iCal feed.** Calendar apps cannot send our token, so a feed needs a secret per-team URL: a new access path, revocation, and a link that leaks when shared. #107 (write trainings into the device calendar) covers "see my trainings in my calendar app" without a new access path. Close the iCal part of #106 with a pointer to #107.
  - **No server change** if `GET /api/events/agenda/` is enough. It takes `from`, `to` (dates or instants, at most 120 days apart, `MAX_RANGE` in `training/schedule.py`) and an optional `team`; without `team` it returns every team of the user **[fact]** (`team_param` in `training/schedule_views.py`). It returns items that overlap the range, so a camp that started before `from` is included **[fact]** (`agenda()`: `start__lt=end, end__gt=start`). A month view needs at most 42 days, well under 120 **[inferred]**.
  - **Phone first, month view (decided):** a compact month (4 to 6 rows of 7 day cells, a number and up to 3 dots per day), which selects a day; below it that day's list, built from the same agenda items. Tapping an item opens the same actions and `EventView` as `AgendaView`. No full grid with text in cells: on a 360 px wide phone a 7-column grid leaves about 50 px per day **[inferred]**.

What is there already:
- `AgendaView.vue`: fetches `/api/events/agenda/?team=&from=&to=` with `useRemote` (now minus 28 days to plus 56 days) **[fact]**. Groups with `groupByDay` from `src/lib/schedule.ts` **[fact]**. Tapping an item does not open a sheet: it expands an inline action block under the row (archer chips, Add note, Add photo or video, Open, Move, Cancel/Reinstate), coach-only actions behind `isCoach` from `team.my_role` **[fact]**. "Open" and "Add note" first make a virtual occurrence a row (`row()` via `useSchedule().putEvent`), then push `/events/<id>` **[fact]**.
- `groupByDay` keys items by `toLocalInput(item.start).slice(0, 10)`, i.e. the start date on the device's clock, and puts a multi-day event only on its first day **[fact]**. `dayTitle` formats `${day}T12:00` with `toLocaleDateString` **[fact]**. No time-zone arithmetic in the app: the server computes occurrence instants with the slot's zone and DST **[fact]**.
- `useAgenda.ts`: a shared singleton of all the user's teams from yesterday to plus 56 days, for suggestions; 5 minutes max age **[fact]**. Not suited as the calendar's data source (fixed window) **[inferred]**.
- Archers read the agenda already: the server lets every member read (`test_the_agenda_lists_occurrences_for_every_member`, `get_agenda(archer1)` 200, another team 404) **[fact]**, and the app links `/team/:id/agenda` from `TeamManageView.vue`, which archers reach from the team list on `HomeView.vue` **[fact]**. In `AgendaView` an archer only gets "Open" **[fact]**.
- Tab bar (`App.vue`): Home, Training, Statistics, Team (`v-if="isCoach"`), Settings; shown on routes with `meta.tab` **[fact]**. `/team/:id/agenda` has `meta: { title: 'Schedule', auth: 'account' }` and no `tab` **[fact]**.
- Vitest runs with the machine's time zone; `vitest.config.ts` sets no `TZ` **[fact]**.

## Open questions for Tim

Decided (Tim, 2026-10-31):
1. **Build it:** yes, a coach asked for it.
2. **Month view,** not a week strip.
6. **First day of the week:** from the locale.
7. **iCal:** dropped in favour of #107; comment on #106.

Defaults accepted by Tim (2026-10-31):
3. **Where does it live?** Default: a mode of the existing agenda screen (toggle "List | Month"), so one route and one data path. Alternatives: a new route `/team/:id/calendar`; or an all-teams calendar `/calendar` linked from `HomeView` (endpoint without `team`), which matters for coaches and archers in two teams.
4. **Archers?** Default: the same read-only view (only "Open"), cancelled trainings struck through as in the list. No extra server work.
5. **Multi-day events** (camp, tournament weekend): default a dot on every day they cover in the month, first day only in the list with "until <date>".

## Design

Screen (default variant: mode of `AgendaView`):
- A `ChipGroup` or segment "List | Month" at the top of `AgendaView.vue`; the choice remembered per device (`localStorage` key `agenda:mode`, wrapped in try/catch) **[inferred]** optional.
- Month mode: `MonthGrid.vue` shows a header (month and year, arrows previous/next, "Today"), the weekday row, and the days of the month padded to whole weeks (4 to 6 rows). A cell has the day number and up to 3 dots (cancelled dots hollow, today outlined, selected filled, days of the neighbouring months dimmed). No text in cells (about 50 px per cell on 360 px **[inferred]**). Arrows change the month; swipe is optional, with arrows as the fallback.
- Below: the selected day's items through the extracted day list (same rows and actions as the list mode). Empty day: `schedule.nothingThisDay`.
- Tap an item: same inline actions as now (coach) or "Open" (archer), from the shared component.

Shared code (no duplicate of `AgendaView`):
- `src/components/AgendaDayList.vue`: props `items: AgendaItem[]`, `isCoach`, `members`; renders the `IonList` of one day with the inline action block; emits `changed` (reload). Holds the move form and the archer chips now in `AgendaView`.
- `src/composables/useAgendaActions.ts`: `row(item)`, `open(item, path)`, `change(item, changes)`, `addMedia(item, archer, name)` around `useSchedule().putEvent`; returns `error`. Moved from `AgendaView`, no new behaviour.
- `AgendaView.vue` keeps the page, the one-off form and the data loading; list mode loops `AgendaDayList` per day, month mode uses `MonthGrid` plus one `AgendaDayList`.

Date logic (`src/lib/calendar.ts`, no Vue):
- `dayKey(iso)`: the device-local date of an instant, `YYYY-MM-DD`; same as `groupByDay` uses today. Move it into `schedule.ts` and let `groupByDay` call it so both agree **[inferred]**.
- `addDays(day, n)`, `monthGrid(month, firstWeekday)` (the 28 to 42 dates of the month padded to whole weeks): calendar-date arithmetic on `YYYY-MM-DD` with `new Date(y, m - 1, d + n)` (local midnight, so DST days stay one date step) and no millisecond arithmetic.
- `rangeOf(days)`: `{ from, to }` as instants of local midnight of the first day and of the day after the last, for the request.
- `daysOf(item)`: the local dates an item covers from `start` up to, not including, `end` (multi-day dots; Q5).
- `dotsByDay(items)`: map day to `{ count, cancelled }` for the grid.
- `firstWeekday(locale)`: from `new Intl.Locale(locale).getWeekInfo?.().firstDay` (or the older `weekInfo` property); falls back to 1 (Monday) when the WebView has neither **[check]**. German gives Monday, `en-US` Sunday **[inferred]**; the app's locale is `en` or `de`, so decide whether English follows the device region or means Monday **[check]**.
- No time-zone names, no offsets: the device's own clock only, like `groupByDay` **[fact]** for the existing code.

Loading:
- The visible grid drives the request: `rangeOf` of the padded month (at most 42 days), refetched when the user changes month; `useRemote` with `watch: [month]`. One request per month, well under 120 days.
- Alternative: keep the current 84-day load and fetch only outside it. Simpler on the first screen, but two windows to reason about **[inferred]**; recommend one window.
- List mode keeps its range (minus 28 to plus 56 days).
- Server stays as is. One month needs at most 42 days; the 120-day limit is not reached.

Multiple teams: `AgendaView` stays per team (`?team=`). If Q3 picks an all-teams `/calendar`, rows show `team_name` and coach actions depend on `my_role` of `item.team` from `useTeams()`, so `AgendaDayList` takes `canPlan(item)` instead of one `isCoach` **[inferred]**; plan for that prop now.

Time zones and DST: the server returns instants; the app shows them on the device clock and groups by device-local date, like now. A phone in another zone sees the training on that zone's date and time; acceptable and consistent with the list **[inferred]**.

Routes and tab bar: no new tab (Team is coach-only and the bar has five entries). The default variant needs no new route. If Q3 picks a new route: `/team/:id/calendar` or `/calendar` with `meta: { title: 'Calendar', auth: 'account' }`, no `tab`, linked from `TeamOverview.vue`, `TeamManageView.vue` (and `HomeView.vue` for `/calendar`).

i18n (`src/locales/en.ts`, `de.ts`, block `schedule`; German to check with Tim; see `specs/steering/i18n.md`):
- `listMode` "List" / "Liste", `monthMode` "Month" / "Monat", `today` "Today" / "Heute", `previousMonth`, `nextMonth` (aria labels), `nothingThisDay` "Nothing on this day." / "An diesem Tag ist nichts geplant.", `until` "until {date}" / "bis {date}" (Q5), `calendar` "Calendar" / "Kalender" only if a new route.
- Weekday and month names from `toLocaleDateString(locale, ...)`, not from the locale files.
- `src/lib/calendar.ts` returns dates and counts, no text.

## Checklist by phase (small PRs)

### Phase 0: decide

- [x] Q1, Q2, Q6, Q7 answered (see above). [x] Q3 to Q5 (defaults). [ ] Comment on #106: iCal dropped for #107, month view chosen.

### Phase 1: extract the day list from AgendaView (no behaviour change)

- [x] `src/composables/useAgendaActions.ts` from the selection state, `row`, `open`, `change`, `move`, `addMedia` in `AgendaView.vue`; it takes the members and a `changed` callback.
- [x] `src/components/AgendaDayList.vue` with the rows, inline actions, move form, archer chips; props `days` (all days in one component, so one training is selected at a time), `canPlan(item)`, `members`; emits `changed`.
- [x] `AgendaView.vue` uses the component; the one-off form and the data loading stay (it has its own `start`, `end`, `location`, `error`).
- [x] `npm run type-check`, `npm test`. [ ] Phone: agenda unchanged for coach and archer.

### Phase 2: date logic

- [ ] `dayKey` in `src/lib/schedule.ts`, `groupByDay` uses it.
- [ ] `src/lib/calendar.ts`: `addDays`, `monthGrid`, `firstWeekday`, `rangeOf`, `daysOf`, `dotsByDay`.
- [ ] `src/lib/calendar.test.ts` (see Tests).

### Phase 3: month grid

- [ ] `src/components/MonthGrid.vue` (props `month`, `days`, `dots`, `selected`, `today`, `firstWeekday`; emits `select`, `shift(±1)`); colours from CSS variables in `src/assets/main.css`.
- [ ] Mode toggle and month mode in `AgendaView.vue`; month-driven `useRemote`; read `route.params` once in setup (already so **[fact]**).
- [ ] Locale keys in `en.ts` and `de.ts`.
- [ ] `type-check`, `npm test`, phone test.

### Phase 4 (only if Q3 says so): all-teams calendar

- [ ] Route `/calendar`, view `CalendarView.vue` with the strip and `AgendaDayList`, no `team` query, `canPlan` from `useTeams()`; link from `HomeView.vue`.
- [ ] Server test: an archer in two teams gets both teams' items without `team` (add if `test_schedule.py` has none **[check]**; the `club` fixture has no member in two teams **[inferred]**).

## Tests

Vitest (`npm test`):
- [ ] `calendar.test.ts`: `addDays` across month and year ends; `monthGrid` pads to whole weeks for Monday and Sunday starts (a 28-day February, a month that needs 6 rows); `firstWeekday` falls back to Monday; `rangeOf` gives local midnights; `daysOf` for a one-day training, an event ending at midnight (not on the next day), a three-day camp; `dotsByDay` counts cancelled apart.
- [ ] DST: the same cases with `TZ=Europe/Berlin` around 2026-03-29 and 2026-10-25 (a 23-hour and a 25-hour day stay one date step). Set `test.env.TZ` in `vitest.config.ts` or `process.env.TZ` at the top of the test file **[check]** which one Node picks up before the first `Date`; changing it for all tests may shift other tests.
- [ ] `schedule.test.ts`: `groupByDay` unchanged after the `dayKey` move.
- [ ] Locale parity test covers the new keys.

Server: none for Phases 1 to 3 (no server change). Phase 4: the two-team agenda test above.

Phone:
- [ ] Coach: list and month mode show the same items; changing to the next and previous month loads; cancel, move, add note from month mode; virtual occurrence opens `EventView` after it is made a row.
- [ ] Archer: month mode read-only, "Open" works, no coach actions.
- [ ] The months with the DST change (October 2026, March 2027): trainings stay at their local time and on the right day.
- [ ] A camp over a weekend: dots per Q5. A day with three or more items. Dark theme.
- [ ] 360 px wide phone: grid fits, no horizontal scroll.

## Docs to update

- [ ] `specs/design/schedule-and-events.md`: Agenda section (month mode, shared day list); "Not built" drops the calendar grid and says iCal was dropped for #107.
- [ ] `specs/design/screens.md`: agenda modes (and `/calendar` if Phase 4).
- [ ] `specs/plans/index.md`: status of this plan.
- [ ] ADR only if iCal is dropped for good: `specs/adrs/NNNN-no-ical-feed.md` (next free number **[check]**), short; else a line in the design doc is enough.
- [ ] `CHANGELOG.md`: month view in the schedule.

## Risks

- **A second screen mode to maintain** next to the list. A coach asked for it; check with that coach after Phase 3 that the month grid is what they meant.
- **Refactor regressions**: Phase 1 moves the coach actions; the inline action block has several states (move form, archer chips, error). Phone-test before Phase 3.
- **Device-local days**: grouping by the phone's zone means a traveller sees trainings on shifted dates; same as the list today, not new.
- **DST in date helpers**: any `+ 86_400_000` in calendar code would put a day twice or skip one around a DST change; the helpers must step local dates (`AgendaView` itself uses `DAY_MS` for `from`/`to`, harmless there since the server overlaps by a day **[inferred]**).
- **Swipe conflicts** with Ionic's back swipe on iOS (later) **[check]**; arrows as the fallback.
- **Two data paths** if Q3 picks `/calendar` next to the per-team agenda: keep both on `AgendaDayList` and `useAgendaActions`.
