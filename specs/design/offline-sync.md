# Offline logging and session upload

Status: implemented
Date: 2026-10-23
Updated: 2026-10-29

- **Offline**: session logging works without signal from the start (saved on the device, uploaded when online), since ranges often have poor reception; video uploads are queued the same way
- **Upload of sessions**: the app creates the ids (UUIDs) for sessions, ends, shots and volume entries, and uploads with idempotent `PUT`s: the session once, then each end with all its shots as soon as it is shot (so a coach sees results live, or as soon as the phone has signal again), so a retry never duplicates anything. The last write wins. The server recomputes every score from the position and returns its own values, which the app then shows. Coaches read sessions, they cannot change them, except for the sessions they log for an archer without an account. A coach's live view polls the session list (`/api/sessions/?updated_after=...`); push updates are not planned

## Sessions a coach opens, and two sessions for one training

- **Pull**: the phone also reads from the server (`pull` in `src/lib/log-sync.ts`) after sign-in, when the app comes back and when the connection returns, before it uploads. It takes `GET /api/sessions/gone/` (merged or deleted ids) and, from the session list, only your own sessions that someone else opened and that have no results. They are stored without an upload (`keep`, so an empty one is not removed on leaving the screen). Other sessions are not copied: results edited on two devices are a separate problem (#84). `updated_after` is the newest time the server sent, not the phone's clock.
- **Merge**: a coach can open an empty session for an archer (no type, no results) and the archer may start their own seconds later. The server merges the two (`server/training/merge.py`, [ADR 0004](../adrs/0004-merging-sessions.md)): media and notes move to the winner, empty fields of the winner are filled from the loser, the loser's id becomes a tombstone pointing at the winner. Only a session opened by someone other than the owner and without results can lose. Archer against coach: the archer's wins. Two coaches: the one with results, else the earlier start. Two sessions the archer opened never merge. A session with more than one possible partner is left alone.
- **Old ids**: `PUT`, ends, volume, media and notes under a merged id go to the winner; the `PUT` answers with the winner's `id`, and the phone renames its copy (and its queue, and queued media). A `PUT` to a deleted id answers 410 and the phone drops the session. `DELETE` of a merged id answers 204 and deletes nothing.
- **Coach writes**: a coach who opened a session may change its times and notes (not type, ratings or equipment). After a merge their repeated `PUT` only fills empty fields. The results stay the archer's.
