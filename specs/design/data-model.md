# Data model (Django models, SQLite)

Status: implemented, except where marked planned (checked against the models 2026-10-28)
Date: 2026-10-23
Updated: 2026-10-28

- **profiles**: id, name, avatar (one JPEG of at most 512 px, `avatars/<user id>/<random>.jpg`) and `avatar_updated_at`, dominant hand/eye, date of birth (optional), preferred units, video consent (`video_consent_at`, `video_consent_by`). A profile picture is planned, there is no field yet
- **teams** (with `show_ranking`), **team_members** (team_id, profile_id, role: archer | coach | admin, also-shoots flag)
- **bows**: owner, name, type (recurve, compound, barebow, longbow, traditional), riser, limbs, draw weight, draw length, brace height, tiller, plunger, sight, stabilisers, release/tab, notes, active flag
- **arrow_sets**: owner, shaft model, spine, length, point weight, nock, fletching, count
- **setups**: a bow + arrow set combination with a snapshot of its settings, so old sessions keep the setup as it was then
- **sessions**: archer, date/time, location, indoor/outdoor, weather/wind, type (scoring, volume, technique, competition), setup_id, physical/mental rating (1 to 5), goals, notes
- **target faces**: not a table. A built-in catalogue in `shared/target-faces.json` (see [arrow-plotting.md](arrow-plotting.md)), read by the server and bundled in the app, so it works offline. Per face: slug, name, ring diameters and values, X ring, spot layout, compound flag. Sessions refer to a face by its slug
- **ends**: session_id, index, distance, target_face_id, arrows per end
- **shots**: end_id, x/y position (per spot: centre = 0,0, x to the right, y up, the outer edge of the outermost scoring ring = 1, so any face size works), spot index for multi-spot faces, score value and is_x derived from the position, is_miss, optional arrow number (to find a bad arrow in the set), manual-override flag
- **volume_entries**: session_id, distance, arrow count (for blank-bale/no-score training)
- **media**: owner, uploaded_by, session_id (optional), kind (photo | video), file, thumbnail, size, taken_at, width/height, note; for videos also duration, capture frame rate and frame count. There is no processing status: the phone converts the file before the upload, so the server only stores what is ready
- **notes**: author (coach), archer_id, optional session_id / media_id + frame number, optional drawing (lines/angles as JSON), body, visibility (shared | coach_only)
- **evaluation_templates**: team_id, name, version, criteria (grouped list: key, label, group, scale, description of what a 1 and a 5 look like). Editing a template creates a new version, so old evaluations stay comparable
- **evaluations**: archer_id, coach_id (or the archer for self-assessments), template version, date, kind (coach | self), overall comment, goals until next evaluation, visibility (shared | coach_only)
- **evaluation_scores**: evaluation_id, criterion key, rating, comment, optional link to a media item and frame
- **pose_analyses** (planned, milestone 5, [skeleton-detection.md](skeleton-detection.md)): media_id, model and version, status, per-frame body points (compressed JSON), derived metrics per shot
- **comments** (planned, #25): threaded replies on notes and media, so archer and coach can talk about a clip
