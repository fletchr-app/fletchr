# A photo as the evidence for an evaluation criterion

Issue: #161. Today only a frame of a clip can be linked to a criterion. A photo (the stance, say) cannot. Found while planning #159.

Status: implemented, not yet checked on a phone. Decisions below settled with Tim on 2026-11-07 (question 4 is my pick, not confirmed).

## Decisions

1. **Server refuses a frame or time on a photo.** A photo is linked with `media` only; `frame` and `time_ms` must be empty. A clip still needs a frame. Refusing makes an app bug visible instead of storing a meaningless number.
2. **The evidence shows the photo's drawing too**, read only, as the player shows it. (Notes with a drawing on that media.)
3. **Where it shows:** the score row in the evaluation form and the evaluation view, where the frame link is today.
4. **Old server:** the app does not hide "Use this photo". An old server answers with its error ("Say which frame the rating is about"), which the form already shows. The `serverOlder` warning exists for the rest. (Pick, to confirm: a version check is coarse and would hide the button on a patch-level difference only by accident.)
5. **Pick mode in the grid:** photos are no longer dimmed (the #159 rule goes away).

## Steps

### Server (`server/evaluations/serializers.py`, around line 228)

- [ ] In the score check, branch on `media.kind`:
  - `video`: as now (frame required, below `frame_count`).
  - `photo`: `frame` and `time_ms` must be `None`, else `ValidationError` with a new `gettext` message ("A photo has no frame").
- [ ] Add the message to `server/locale/` (de), see `specs/steering/i18n.md`.
- [ ] Tests in `server/evaluations/tests`: photo with no frame accepted; photo with a frame refused; clip without a frame still refused; clip with a frame still accepted; a photo of another archer still refused.
- [ ] Check the serializer's `frame` and `time_ms` output for a photo is `null`; run `npm run types:api` (no schema change expected, confirm the diff is empty).

### App: choosing

- [ ] `src/composables/useEvaluationDraft.ts`: `picked` and `finishPick` take `frame: number | null`, `timeMs: number | null` (a photo passes null).
- [ ] `MediaPlayerView.vue`: when `choosing` and the item is a photo, show "Use this photo" (new key `evaluations.usePhoto`), calling `finishPick(currentId, null, null)`. The video button stays as is.
- [ ] `MediaView.vue`: `pickable` is `true` while picking, and the dimmed class for photos goes away.
- [ ] Swipe to a neighbour while choosing keeps working (the button follows the shown item).

### App: showing

- [ ] `EvaluationEditView.vue`: `frameText` returns the new text for a photo ("Photo", key `evaluations.photoLinked`), the frame text for a clip. Rows loaded from the server keep `frame: null` for photos.
- [ ] `EvaluationView.vue`: `frameLink` and `frameText` do the same; the link opens `/media/:id` without `frame` for a photo.
- [ ] Drawing on the evidence: opening the link lands in the player, which already shows the drawing of a note. Check that the drawing of a photo with notes is visible there, and that no extra view is needed. If a thumbnail with the drawing in the score row is wanted, that is a follow-up (not in this plan).
- [ ] Upload of an evaluation (check the payload code that sends `frame` and `time_ms`): send nothing for a photo.

### Texts and docs

- [ ] `en.ts` and `de.ts`: `evaluations.usePhoto`, `evaluations.photoLinked`.
- [ ] `specs/design/` doc for evaluations (find it, or `media-and-video-player.md`): evidence can be a clip frame or a photo.
- [ ] `CHANGELOG.md`: entry for #161, "Needs the new server".
- [ ] `specs/plans/index.md`: add this plan.

### Checks

- [ ] `npm run type-check`, `npm test`, `npm run build-only`, `cd server && uv run pytest`.
- [ ] Phone: needs a team template with criteria (the Dev server account has none, so create a team and a template first). Pick a photo for a criterion, save, open the evaluation, follow the link; pick a clip frame still works; old photo tiles are not dimmed.

## Not in this plan

- A thumbnail of the evidence inside the score row.
- Several photos or frames per criterion.
- Using a photo with a drawing as a separate "annotated" evidence record.
