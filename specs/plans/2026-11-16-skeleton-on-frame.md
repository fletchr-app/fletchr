# Skeleton on a photo or a paused frame (#50, first step)

Status: plan, prototype first (decisions of 2026-11-16 below)
Date: 2026-11-16

## Scope

A button in the drawing toolbar runs a pose model on the picture that is shown (a photo, or the paused video frame) on the phone, offline, and adds the body as `line` shapes to the drawing being edited. The coach then moves points (Move), measures angles (Angle) and saves it with a note as today. Nothing new is stored or sent: the result is an ordinary drawing.

Out of scope (later): whole clips, form metrics, charts, timing, the server worker, iOS.

## What is known (checked)

- `@mediapipe/tasks-vision` 1.2.3, Apache-2.0, 31.4 MB unpacked (`npm view`). Most of that is two copies of the wasm (`wasm/vision_wasm_internal.wasm` and `vision_wasm_module_internal.wasm`, 14.7 MB each) plus source maps; the JS bundle is 156 KB. Only one wasm copy is needed. There is no separate no-SIMD wasm in 1.2.3.
- API: `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath | modelAssetBuffer, delegate: 'GPU' | 'CPU' }, runningMode: 'IMAGE', numPoses })`, `detect(image)` takes a `TexImageSource` (`<img>`, `<canvas>`, `<video>`, `ImageBitmap`). Result: 33 landmarks per person, `x`, `y` normalised to the input picture (0..1), with `visibility` and `presence`.
- Models (`content-length` of the official `.task` files): lite 5.8 MB, full 9.4 MB, heavy 30.7 MB.
- The frame canvas in `MediaPlayerView` is drawn with `decoder.transform`, so it already holds the upright picture at `decoder.width` x `decoder.height`, the same box `DrawingLayer` uses. Landmarks of the canvas are therefore drawing fractions as they are. Photos are stored upright (`prepareImage`).
- The photo `<img>` in the player loads `clip.file_url` from the server without `crossorigin`, so it would taint a canvas/WebGL upload. The clip itself is loaded with `fetch(file_url)`, so CORS for media files works today.
- `minSdkVersion` 24. The Move tool moves one point of one shape (`nearestPoint`).

## Not verified (the prototype answers these)

- Whether the GPU delegate (WebGL2) runs in the Android WebView, and how fast lite/full are on a real phone, first call (wasm + model load) and later calls.
- Whether Capacitor's local server gives `.wasm` the `application/wasm` type (otherwise streaming compile fails and Emscripten falls back to `arrayBuffer`, slower but working).
- The exact fields of `WasmFileset` (`wasmLoaderPath`, `wasmBinaryPath` from memory) for loading the wasm from Vite `?url` imports instead of a CDN base path.
- How much the APK grows after compression.
- Whether a `<video>` element (no decoder) gives MediaPipe the rotated or the stored picture.
- Accuracy around the bow arm and with the riser in front of the body.

## Decisions (recommendations)

1. **WebView first, native only if needed.** Try GPU, catch the error and create again with `delegate: 'CPU'`. Good enough: detection under 1 s and first use under 5 s on a mid-range phone. If it fails or is far slower: a small local Capacitor plugin in `android/` using `com.google.mediapipe:tasks-vision` (Android Pose Landmarker), taking the picture as JPEG and returning the same 33 points, so `src/lib/skeleton.ts` stays.
2. **Files in the app, no download.** Offline is the point. The wasm and loader come from the package through Vite `?url` imports (hashed into `dist/assets/`, copied by `npx cap sync android`); only one wasm copy. Decided: the model `pose_landmarker_lite.task` is committed in git in `src/assets/models/` (5.8 MB) and imported with `?url`. Web build and APK grow by about 20 MB uncompressed.
3. **Lazy loading.** All MediaPipe code is in `src/composables/usePose.ts` behind `await import('@mediapipe/tasks-vision')`, created on the first press and kept for the session. Nothing loads at app start.
4. **Lite model first.** Prototype compares lite and full on real archery photos; switch to full if the bow arm is clearly better.
5. **Body skeleton, 15 lines.** Shoulders 11-12, hips 23-24, torso 11-23 and 12-24, arms 11-13, 13-15, 12-14, 14-16, legs 23-25, 25-27, 24-26, 26-28, head: shoulder midpoint to nose (0). No fingers, face, heels or feet. A line is left out when one end has `visibility` below 0.5. All lines in the chosen colour.
6. **No one or several people.** None: error line in the toolbar ("No person found"), nothing added. Several: `numPoses: 3`, take the person with the largest box of visible points (usually the archer in front), no question asked. Pressing again replaces the skeleton added before (the view remembers which shapes it added), so undo is not 15 taps.
7. **Which picture.** Frame: the `<canvas>` when `canvasOn`, else the `<video>` (to be checked, see above). Photo in the player: `fetch(file_url)` then `createImageBitmap(blob)` (no tainted `<img>`). `LocalMediaView`: the photo `<img>` (blob URL, same origin). Landmarks go through `clamp01` and become fractions directly.
8. **Connected lines (decided).** The skeleton stays plain `line` shapes, no new shape type, so old drawings and the server need no change. Two rules in `src/lib/drawing.ts` make them behave as connected: (a) Move takes every point that sits at the grabbed point (same place within about 1 px of the picture) and moves them together, so dragging the elbow moves the end of the upper arm and the start of the forearm; this also works for lines drawn by hand that end at the same place. (b) A new angle point snaps to an existing point within reach (`REACH`), so an angle at the elbow is three taps on shoulder, elbow, wrist, with exact corners. Both are pure functions, tested in `drawing.test.ts`. Not in this step: the angle updating itself when a line is moved (an angle is its own shape of three points).
9. **Consent.** Ignored for now (decided). No new gate; revisit with the legal review (fletchr-ops#5).
10. **i18n.** `media.skeleton: { find, finding, none, failed }`, en "Skeleton" / "Looking for a person" / "No person found" / "Skeleton detection does not work on this phone", de "Skelett" / "Suche eine Person" / "Keine Person gefunden" / "Die Skeletterkennung läuft auf diesem Handy nicht".
11. **iOS later.** Same JS path in WKWebView should work (WebAssembly and WebGL2 exist there), unverified; check when the iOS build exists.

## Checklist

- [ ] **Prototype (throwaway, branch only, not merged).** `npm install @mediapipe/tasks-vision`, the lite model file in `src/assets/models/`, a hidden button in `MediaPlayerView` that runs lite and full on the shown photo/frame with GPU and CPU, logs timings and landmarks, draws them as lines. Run on the user's phone with the Dev app (`adb install -r`, app id `de.fletchr.app.dev`); an older phone only if one is at hand. Note: delegate that works, load time, detect time, wasm MIME warning, `<video>` rotation, APK size before/after, bow arm accuracy on 5 to 10 real photos. Write the numbers into this plan, then decide 1, 2 and 4.
- [ ] `src/lib/drawing.ts`: `movedGroup` (Move takes all points at the grabbed one) and snapping of angle points to existing points; `DrawingLayer.vue` uses them. Tests in `drawing.test.ts`.
- [ ] `src/lib/skeleton.ts` (no Vue, no MediaPipe import): types `Landmark { x, y, visibility? }`, `BONES`, `pickPose(poses)`, `skeletonShapes(pose, colour, minVisibility = 0.5): Shape[]`. Tests in `skeleton.test.ts`: 15 lines for a full pose, line dropped for an invisible end, clamped points, largest pose picked, empty list.
- [ ] `package.json`: `@mediapipe/tasks-vision` pinned to 1.2.3. Model in `src/assets/models/`. Check `dist/` has one wasm copy, no source maps.
- [ ] `src/composables/usePose.ts`: lazy `import()`, `WasmFileset` from `?url` imports, GPU then CPU, singleton landmarker, `detect(source): Promise<Landmark[][]>`, `busy`.
- [ ] `DrawingToolbar.vue`: prop `skeleton?: 'idle' | 'busy'` (button hidden when unset), emit `skeleton`; button disabled while busy.
- [ ] `MediaPlayerView.vue`: picture source per decision 7, replace earlier skeleton shapes in `drawing.shapes`, error to `drawError`. `LocalMediaView.vue`: same for photos.
- [ ] `src/locales/en.ts`, `de.ts`: keys of decision 10. Privacy text: one sentence on on-device detection.
- [ ] `npm run type-check`, `npm test`, `npm run build-only`, `npx cap sync android`, check on the phone: photo, paused frame, portrait clip, no person, two people, offline (flight mode).
- [ ] Docs below.

## Other docs and issues to change

- `specs/design/skeleton-detection.md`: rewrite for "on the phone, single frames"; server worker, metrics and clip analysis move to a "later" section. Update its line in `specs/design/index.md`.
- New ADR `specs/adrs/0012-skeleton-on-the-phone.md` (check the next free number): on the phone, single frames, MediaPipe in the WebView; add to `specs/adrs/index.md`.
- Issue #50: new text (this first step, link to this plan; metrics and clips as later issues).
- `specs/plans/2026-10-23-milestones.md`, milestone 5: "server-side MediaPipe worker" no longer true.
- `specs/design/hosting-backups-cost.md`: "Milestone 5 would add the Python pose worker" no longer true.
- `specs/design/roles-and-access.md`: the #63 reference (status line) is now fletchr-ops#5.
- `specs/design/media-and-video-player.md`: the skeleton button, after landing.
