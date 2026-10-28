# Offline logging and session upload

Status: implemented
Date: 2026-10-23

- **Offline**: session logging works without signal from the start (saved on the device, uploaded when online), since ranges often have poor reception; video uploads are queued the same way
- **Upload of sessions**: the app creates the ids (UUIDs) for sessions, ends, shots and volume entries, and uploads with idempotent `PUT`s: the session once, then each end with all its shots as soon as it is shot (so a coach sees results live, or as soon as the phone has signal again), so a retry never duplicates anything. The last write wins. The server recomputes every score from the position and returns its own values, which the app then shows. Coaches read sessions, they cannot change them, except for the sessions they log for an archer without an account. A coach's live view polls the session list (`/api/sessions/?updated_after=...`); push updates are not planned
