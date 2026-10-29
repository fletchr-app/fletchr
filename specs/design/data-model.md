# Data model (Django models, SQLite)

Status: implemented, except where marked planned (checked against the models 2026-10-28)
Date: 2026-10-23
Updated: 2026-10-29

- **profiles**: id, name, avatar (one JPEG of at most 512 px, `avatars/<user id>/<random>.jpg`) and `avatar_updated_at`, dominant hand/eye, date of birth (optional), preferred units, video consent (`video_consent_at`, `video_consent_by`). A profile picture is planned, there is no field yet
- **teams** (with `show_ranking`), **team_members** (team_id, profile_id, role: archer | coach | admin, also-shoots flag)
- **bows**: owner, name, type (recurve, compound, barebow, longbow, traditional), riser, limbs, draw weight, draw length, brace height, tiller, plunger, sight, stabilisers, release/tab, notes, active flag
- **arrow_sets**: owner, shaft model, spine, length, point weight, nock, fletching, count
- **uid**: bows, arrow sets, their revisions and notes have a `uid` (UUID, unique, read-only for clients) next to the integer id. It is the id an item can have before the server has seen it, so the app can make one offline and upload it with a repeatable `PUT` (#84). The integer id stays the primary key and the one in all routes for now; routes by uid and an app-chosen uid come with the upload path. Bows and arrow sets also return `revision_uid`, the uid of their current revision
- **setups**: a bow + arrow set combination with a snapshot of its settings, so old sessions keep the setup as it was then
- **sessions**: archer, date/time, location, indoor/outdoor, weather/wind, type (scoring, volume, technique, competition; empty for a session a coach opened, the archer chooses it with the first results and it cannot change once there are any), opened_by (the user who created it; empty on old rows, meaning the owner), setup_id, physical/mental rating (1 to 5), goals, notes
- **session tombstones**: id of a session that is gone, owner, `merged_into` (the session that took its place, empty if it was deleted), time. They let a phone replace or drop its copy, and make a write to a merged id land in the winning session. See [offline-sync.md](offline-sync.md)
- **target faces**: not a table. A built-in catalogue in `shared/target-faces.json` (see [arrow-plotting.md](arrow-plotting.md)), read by the server and bundled in the app, so it works offline. Per face: slug, name, ring diameters and values, X ring, spot layout, compound flag. Sessions refer to a face by its slug
- **ends**: session_id, index, distance, target_face_id, arrows per end
- **shots**: end_id, x/y position (per spot: centre = 0,0, x to the right, y up, the outer edge of the outermost scoring ring = 1, so any face size works), spot index for multi-spot faces, score value and is_x derived from the position, is_miss, optional arrow number (to find a bad arrow in the set), manual-override flag
- **volume_entries**: session_id, distance, arrow count (for blank-bale/no-score training)
- **media**: owner, uploaded_by, session_id (optional), kind (photo | video), file, thumbnail, size, taken_at, width/height, note; for videos also duration, capture frame rate and frame count. There is no processing status: the phone converts the file before the upload, so the server only stores what is ready
- **notes**: author (coach), archer_id, optional session_id / media_id (+ frame number for a video; a note on a photo has none; deleted with the media), optional drawing (lines/angles as JSON), body, visibility (shared | coach_only)
- **evaluation_templates**: team_id, name, version, criteria (grouped list: key, label, group, scale, description of what a 1 and a 5 look like). Editing a template creates a new version, so old evaluations stay comparable
- **evaluations**: archer_id, coach_id (or the archer for self-assessments), template version, date, kind (coach | self), overall comment, goals until next evaluation, visibility (shared | coach_only)
- **evaluation_scores**: evaluation_id, criterion key, rating, comment, optional link to a media item and frame
- **pose_analyses** (planned, milestone 5, [skeleton-detection.md](skeleton-detection.md)): media_id, model and version, status, per-frame body points (compressed JSON), derived metrics per shot
- **comments** (planned, #25): threaded replies on notes and media, so archer and coach can talk about a clip
