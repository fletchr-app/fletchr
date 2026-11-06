# Move the points of a drawing, and a loupe while drawing

Issue: a line or angle is hard to place with a thick finger, and a wrong point meant undo and redraw.

## Done

- [x] `Mode` (`Tool` or `move`) in `src/lib/drawing.ts`, with `nearestPoint` (screen-pixel reach) and `movedPoint` (returns a new shape, the saved one is not changed). Tests in `drawing.test.ts`.
- [x] `DrawingLayer`: tool `move` takes hold of the point within 28 px of the touch (keeping the offset, so the point does not jump) and emits `change(index, shape)`. Handles are shown in that mode.
- [x] Loupe (3x, above the finger, below it near the top edge) while a finger is down, for drawing and moving. The view passes `loupe`, a function giving the `<img>`, `<video>` or frame `<canvas>`.
- [x] Toolbar: fourth tool "Move" / "Verschieben". Wired in `MediaPlayerView` and `LocalMediaView`.
- [x] Design doc `media-and-video-player.md` updated.

## Not done

- Deleting a single shape from the middle (undo still removes the last one only).
- No loupe for a clip that shows only its thumbnail (no frame yet).
- Not tried on a phone yet; reach (28 px), loupe size and lift are guesses.
