# Profile picture, visible to coaches (#79)

Status: planned, not started
Date: 2026-10-28

## Scope

- One JPEG per profile, square, about 256 px, made on the phone. Server limit 512 KB.
- `PUT` and `DELETE` on `/api/me/avatar/`; the file is served at `/api/users/<id>/avatar/` behind a signed link, like media.
- Set on the profile screen (take a photo or choose from the gallery). `AppAvatar` (picture or initials) on the profile screen and in the members list.
- Visible to the person and to the coaches and admins of the teams they are in. Everybody else gets 404, and `avatar_url` is empty for them.
- Export (JSON and zip), "Delete my data" and account deletion cover the file. Privacy pages and in-app texts say so.
- Out of scope: archers seeing each other's pictures (#80), pictures on other screens (archer page, notes, Home), a picture for a profile without an account (see decision 3).

## What is there already (checked in the code)

- `specs/design/data-model.md` lists `avatar` under profiles; `core.models.Profile` has no such field (milestone 1 plan: "not even a field").
- `src/lib/pick-media.ts`: `pickMedia('photo' | 'gallery')` with `@capacitor/camera`, returns a `Blob`. No new plugin needed.
- `src/lib/image.ts`: `prepareImage` scales to fit (no crop) and re-encodes through a canvas, which drops EXIF. It cannot make a square; it needs a sibling `prepareAvatar`. (`image.ts` has an uncommitted comment change in the working tree.)
- `server/media/files.py`: `is_jpeg` (first three bytes only), `sign_link`/`read_link` (salt `media-link`, payload media id + user id, `MEDIA_LINK_SECONDS` = 1 h), `serve()` with Range and `Cache-Control: private, max-age=3600`.
- `server/media/signals.py`: `post_delete` on `Media` removes the files in `transaction.on_commit`.
- `core.access.members_visible_to`: coaches and admins see every member, archers see the staff and themselves. So the name of a coach is visible to the archers of the team; the issue's rule for pictures is narrower (see decision 1).
- `MemberSerializer` is built without `context` in `MemberDetailView`, `ManagedArcherListView` and `ManagedArcherDetailView`. It needs the request for `avatar_url`.
- `privacy.services.delete_my_data` keeps the profile; `delete_account` calls `user.delete()`, which cascades to `Profile`. `claims.delete_team` deletes managed users with a queryset `.delete()`, which also cascades.
- `privacy.export` has a `profile` block and `FORMAT_VERSION = 1`; `privacy.media_zip` has `media_of`, `file_name`, `stream`; the export view counts `files` and `bytes` from `media_of`, and the app shows "You have no photos or videos" when `files == 0`.
- Pillow is not a server dependency.
- Version: `package.json`, `server/pyproject.toml` and `SPECTACULAR_SETTINGS["VERSION"]` are 0.9.2 and change only at release (`specs/steering/releasing.md`). The change is additive, so `MIN_APP_VERSION` stays.

## Decisions

1. **Who sees a coach's picture.** The issue says "the archer and the coaches and admins of the teams they are in (same rule as the name)". In the code the name rule (`members_visible_to`) also shows coaches and admins to the archers of their team. Recommendation: implement the issue's rule as written (self, or the viewer is coach/admin in a team the person is in), so an archer sees initials for their coach. **Open question 1:** should archers see the pictures of their coaches and admins? It is one more condition in the check and one more test; it is not #80 (archers among each other).
2. **Rule in code.** One function `core.access.can_see_avatar(viewer, person)`: `viewer == person` or a team exists where the viewer has a role in `COACH_ROLES` and the person is a member (any role). It is used by the file view. In `MemberSerializer` the team is known (`member.team`), so the check there is "self, or viewer is coach in this team", with the viewer's role read once per request (no query per row).
3. **Profiles without an account.** Recommendation: no picture for them in this issue. A coach can already add photos for such an archer, but a portrait set by the coach is a different thing, often of a child, and #63 is still open. If wanted later: `PUT /api/teams/<t>/archers/<id>/avatar/`, and `claim_profile` must keep the file (move it to the new user's profile). **Open question 2.**
4. **Under 18.** Today photos of a minor need no consent; only video does (`Profile.video_allowed`). Recommendation: treat the avatar like a photo for now (no gate), add the question to #63, and keep the check in one place (`set_avatar`) so a gate on `video_allowed` (or a new `photo_allowed`) is one line plus a test. Unsure: whether a face picture shown to coaches needs parental consent under Art. 8 GDPR (age 16 in Germany, verify) or under the German art copyright act (KUG, right to one's own picture); that is for the legal review. **Open question 3:** ship without a gate, or hold the feature for minors until #63 answers?
5. **Server re-encode with Pillow.** The app strips metadata, but any client with a token can PUT a JPEG with GPS EXIF, or a file that only starts with `FF D8 FF`. The privacy pages say metadata is removed. Recommendation: add Pillow, open the upload with `Image.open` (format must be `JPEG`, `Image.MAX_IMAGE_PIXELS` low, e.g. 4 MP), refuse anything larger than 1024 px on a side, and save it again as JPEG (quality 85, no `exif`, no ICC) at most 512 px. Cheap for 256 px pictures, and the stored file is then known to be a clean JPEG. Cost: a compiled dependency in the Docker image (check that the `python:3.14` image gets a wheel). Without Pillow: keep `is_jpeg`, check the size, and accept that the metadata claim only holds for the app. **Open question 4:** add Pillow (and later use it for media photos too)?
6. **Storage.** `Profile.avatar = FileField(upload_to=avatar_path, blank=True, max_length=200)` and `Profile.avatar_updated_at = DateTimeField(null=True, blank=True)`. Path `avatars/<user_id>/<random 12 hex>.jpg`: a new name on every replace, so a cached file never shows the old picture under the new name, and a deleted user's id in a path does not matter. Not an `ImageField` (that pulls in Pillow for the model even if decision 5 says no).
7. **Quota.** The avatar does not count against `MEDIA_QUOTA_BYTES`: one file, at most 512 KB, replaced not added.
8. **Signed link.** `files.sign_link`/`read_link` take a media id; add `sign_avatar_link(person_id, viewer_id)` / `read_avatar_link(token, person_id)` with their own salt (`avatar-link`) and the same `MEDIA_LINK_SECONDS`. The file view checks `can_see_avatar` again with the viewer from the token (rights can change within the hour) and answers 404 for a bad token, no right, or no picture.
9. **Caching and cache busting.** Every serialization signs a new token (the signature has a timestamp), so the URL changes on every fetch: after a replace the next fetch shows the new picture, and nobody sees a stale one for long. Cost: the members list downloads the pictures again on each load (about 20 to 40 KB each). Accept that; a stable cacheable URL (token by time bucket) is not worth it now. `serve()` already sends `private, max-age=3600`.
10. **How the `<img>` gets the file.** As media: the signed URL in `src`, no header needed. The app runs at `https://localhost` and loads images from the server's origin, which needs no CORS. When the token has expired (a screen kept alive over an hour), `@error` on the image falls back to initials, and the next reload gives a new URL.
11. **Upload path.** Direct `PUT` with `FormData` (as `media-queue.ts` does with `bodySerializer`), not through the offline queue: one small file, and the person waits for it on the profile screen. Offline gives the usual "server not reachable" error.
12. **Export.** JSON: `profile.avatar` is `"avatar.jpg"` or `null`, plus `profile.avatar_updated_at`. Zip: `avatar.jpg` at the root, dated `avatar_updated_at`; media files are named `<uuid>.jpg`, so no clash. `FORMAT_VERSION` stays 1 (a new key, nothing removed); `test_export.py` checks the key set, update it. The export view's `files` and `bytes` include the picture, so a person with only a picture still gets a zip.

## Server steps

1. `pyproject.toml`: add Pillow if decision 5 says yes (`uv add pillow`).
2. `config/settings.py`: `AVATAR_MAX_BYTES = 512 * 1024`, `AVATAR_MAX_SIDE = 512` (what is stored), `AVATAR_MAX_INPUT_SIDE = 1024`.
3. `core/models.py`: `avatar`, `avatar_updated_at`, `avatar_path()`. Migration `core/0007_profile_avatar` (two blank/null fields, no data migration).
4. `core/avatar.py` (new): `set_avatar(profile, upload)` (check size, then type, re-encode if Pillow, save under a new name, remember the old name, delete the old file in `transaction.on_commit`), `remove_avatar(profile)` (clear both fields, delete the file on commit), `sign_avatar_link`, `read_avatar_link`. Errors through `gettext`: "The picture must be a JPEG", "The picture is larger than 512 KB".
5. `core/signals.py` or in `core/models.py`: `post_delete` on `Profile` deletes the file on commit (covers `user.delete()`, `delete_team`, admin deletions). Check that `core/apps.py` loads it.
6. `core/access.py`: `can_see_avatar(viewer, person)`.
7. `core/views.py`: `MyAvatarView` (`PUT` multipart with `file`, returns `{avatar_url}`; `DELETE` 204, also 204 when there is none) and `AvatarFileView` (`AllowAny`, token or sign-in header, `serve(request, profile.avatar, "image/jpeg")`). `extend_schema` as in `MediaFileView`. URLs `me/avatar/` and `users/<int:user_id>/avatar/` in `core/urls.py`. A throttle scope `avatar` (e.g. 30/hour) against someone filling the disk with replace loops; the old file is deleted, so this is mild.
8. `core/serializers.py`: `ProfileSerializer` gets read-only `avatar_url` (own picture, for `/api/me/`); `MemberSerializer` gets `avatar_url` (empty if no picture or not allowed). Pass `context={"request": request}` in `MemberDetailView`, `ManagedArcherListView`, `ManagedArcherDetailView`.
9. `privacy/services.py`: `delete_my_data` calls `remove_avatar(user.profile)` and counts it (`"avatar": 0 | 1`). `delete_account` gets it through `delete_my_data` and the signal.
10. `privacy/export.py` and `privacy/media_zip.py`: decision 12. `privacy/views.py`: count the picture in `files` and `bytes`.
11. `locale/translate_de.py` and `django.pot` for the new messages (`specs/steering/i18n.md`); `core/tests/test_translations.py` must pass.
12. `npm run types:api` (regenerates `src/lib/openapi.yaml` and `src/lib/api-types.ts`).

## App steps

1. `src/lib/image.ts`: `centreSquare(width, height)` (the largest centred square: `{x, y, side}`) and `prepareAvatar(blob)`: crop to that square, draw at `min(side, 256)` px, JPEG quality 0.85. Reuses `render` with a source rectangle (extend `render` with an optional crop). Typical output 15 to 40 KB, well under 512 KB.
2. `src/lib/avatar.ts` (new, no Vue): `initials(name, email)` (two letters, handles one word, empty name, umlauts).
3. `src/components/AppAvatar.vue`: props `name`, `url`, `size`; `IonAvatar` with the `<img>` or the initials on a CSS-variable colour from `main.css` (both themes); falls back to initials on `@error`; `alt` from i18n ("Picture of {name}").
4. `src/views/ProfileView.vue`: `AppAvatar` at the top, a button that opens an action sheet (take photo, choose from gallery, remove picture, cancel; as `MediaView` does with `actionSheetController`), `pickMedia`, `prepareAvatar`, `PUT /api/me/avatar/`, show the returned URL. A line under it from i18n: who sees the picture.
5. `src/components/MembersSection.vue`: `AppAvatar` in the `IonItem` (`slot="start"`), with `m.avatar_url`.
6. `src/locales/en.ts` and `de.ts`: button labels, sheet entries, the "who sees it" line, errors, and the privacy texts below.
7. `npm run type-check`, `npm test`, `npm run build-only`, `npx cap sync android` (no new plugin, so only for the build), and a check on the phone (camera, gallery, rotated picture, dark theme).

## Tests

Server (`server/core/tests/test_avatar.py`, `server/privacy/tests/`):
- Access to the file: self 200; coach and admin of a shared team 200; archer of the same team 404; coach of another team 404; no token and no header 404; token of another viewer or another person 404; token older than `MEDIA_LINK_SECONDS` 404; access ends when the viewer leaves the team (old token, 404).
- Decision 1 if answered yes: archer sees their coach's picture, not another archer's.
- `avatar_url` in `MemberSerializer`: set for a coach viewer, empty for an archer viewer (other archers), set for oneself, empty when there is no picture; also in the responses of `MemberDetailView` and the managed-archer views (context passed).
- Upload limits: not a JPEG (PNG, text with `FF D8 FF` in front) 400; over 512 KB 400; with Pillow: EXIF with GPS is gone after the upload, a large picture is scaled down, a decompression bomb is refused.
- Replace removes the old file (after commit: `django_capture_on_commit_callbacks(execute=True)`); delete removes the file and clears the fields; delete without a picture 204.
- Deletion: "Delete my data" removes the file and keeps the profile; account deletion removes the file; deleting a team with a managed profile does not leave files (only if decision 3 allows pictures there; otherwise the signal is covered by the account test).
- Rollback: a failed transaction keeps the old file.
- Export: `profile.avatar` is `"avatar.jpg"` / `null`; the zip has `avatar.jpg` with the same bytes; `files` counts it; key set in `test_export.py` updated.
- Throttle on `PUT` (if added).

App (Vitest): `centreSquare` (landscape, portrait, square, 1 px), `initials`. `prepareAvatar` needs a canvas, which the Vitest environment may not have; check on the phone instead.

## Privacy and docs

- `site/datenschutz/index.html` and `site/en/privacy/index.html`: a list item for the profile picture: optional, made smaller on the phone without metadata, who sees it (you and the coaches and admins of your teams), in the export, deleted with "Delete my data" and the account, up to about 12 months in backups.
- In-app (`privacy.*` in both locales): `exportText` and `exportMediaText` mention the picture; `deleteDataText1` lists it; `deleteDataText2` says the profile is kept "without the picture"; `noMedia` fits a person with only a picture; the deleted summary gets an entry for it.
- `site/konto-loeschen/` and its English page: mention the picture if they list what goes.
- `specs/design/data-model.md`: `avatar` (file) and `avatar_updated_at`; `specs/design/roles-and-access.md`: who sees the picture; `specs/design/media-and-video-player.md`: a line on the avatar path and its link.
- `CHANGELOG.md`; mark #79 in the milestone plan when done; add the minor question to #63 (decision 4).

## Order

1. Answer the open questions (1 to 4).
2. Server: model, migration, `core/avatar.py`, signal, access check, views, serializers; tests for access, limits, files.
3. Privacy: services, export, zip; their tests.
4. `npm run types:api`; app: `image.ts`, `avatar.ts` with tests, `AppAvatar`, profile screen, members list, locales.
5. Privacy pages and docs.
6. `npm run type-check`, `npm test`, `cd server && uv run pytest`; check on the phone.

## Risks

- **Rule drift.** `can_see_avatar` and the serializer's per-team check are two places for one rule. Tests on both, and a comment pointing from one to the other.
- **Metadata without Pillow.** Only the app strips EXIF; a picture uploaded by another client keeps its location (decision 5).
- **Orphan files.** A crash between writing the new file and the commit leaves a file without a row. Rare and small; a later cleanup command could compare `avatars/` with the table. Not in this issue.
- **Two uploads at once** for the same profile: each deletes "its" old file, one new file can be left over. Same as above; SQLite serializes the writes, so the row stays consistent.
- **Expired links** on screens kept alive by Ionic: initials until the next reload (decision 10).
- **Old server, new app.** `/api/me/avatar/` is 404 on a 0.9.x server; the app must show the server's error and not crash. The version banner already warns when the server is a minor version behind.
- **Legal.** The privacy wording and the under-18 rule wait for #63, as for video.
- **Backups** keep a deleted picture up to about 12 months, as for media; the texts say so already for the rest.
