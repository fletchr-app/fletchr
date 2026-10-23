# Video prototype (#35): results and how to repeat it

Tested 2026-10-23 on a Motorola edge 50 neo (Android 16, system WebView Chrome 155) with one 120 fps slow-motion clip
recorded with the phone's camera app. The aim was to decide whether the frame-by-frame player and the video upload can
stay in Capacitor (WebView) or need native code (plan section 6).

**Decision: the player stays in the WebView. The upload of large files needs a small native plugin.**

## What the phone writes

A 120 fps slow-motion clip is a normal H.264 file (1920x1080, 20 Mbit/s, 872 frames, 70 MB for 7.3 s of real time) with
- **the real capture rate in a tag:** `com.android.capture.fps = 120.000000` (the server can read it with ffprobe);
- **a stretched timeline:** the frames sit about 33.6 ms apart, so the file runs 29 s and says "30 fps" (stretch factor
  about 4). The frame count is right; time must be divided by the factor to get real time;
- **one keyframe every 4 seconds** (every 120 frames);
- **no audio track, a rotation tag (portrait) and the GPS position in its metadata.** The conversion must strip the metadata;
- the file picker hands the app the clip as a normal `File` (video/mp4, name replaced by an id), not copied into the page's memory.

## Frame stepping in the WebView

Method: `requestVideoFrameCallback` reports the `mediaTime` of the frame shown after a seek; it is compared with the
true frame times from ffprobe. Each run was 60 to 120 steps forward, as many back, and 20 to 40 jumps across the clip.

| File | Step (median) | Exact |
|---|---|---|
| Original (1080p, keyframe every 4 s) | 240 to 390 ms, up to 700 ms | all exact (aiming at the middle of the frame) |
| 720p, keyframe every 10 frames, stretched timeline (33.6 ms) | 66 to 83 ms | all exact (aiming at 25% or 75%) |
| 720p, keyframe every 10 frames, **real timeline (8.33 ms, 1/120 time base)** | 34 to 50 ms | all exact when aiming at **25%**; 3% wrong at 50% and 75% (shows the next frame at keyframe boundaries) |

So:
- **Aim the seek at 25% into the frame**, not the middle (`frame_start + 0.25 * frame_duration`). The plan said the middle; that is wrong for the real-timeline file.
- **The original file is too slow to step** (a seek has to decode up to 120 frames). The re-encode with a keyframe every 10 frames is needed, and it is fast enough (a step in well under 100 ms).
- **Convert to the real timeline** (constant frame rate equal to the capture rate, so 1x is real time and a step is 8.33 ms): timings of the shot (set-up, draw, release) come out in real seconds, and the player's speeds (0.1x to 2x) mean what they say.
  Recipe (ffmpeg), with `CAPTURE_FPS` from the tag and `-bf 0` (no B-frames, so frame order equals display order):

```bash
ffmpeg -i clip.mp4 -vf "setpts=N/(CAPTURE_FPS*TB),scale=-2:720" -fps_mode passthrough \
  -enc_time_base 1/CAPTURE_FPS -video_track_timescale CAPTURE_FPS \
  -c:v libx264 -preset medium -crf 23 -g 10 -keyint_min 10 -sc_threshold 0 -bf 0 \
  -an -map_metadata -1 -movflags +faststart out.mp4
```
  A first try with `-r 120` duplicated frames and with the default time base gave duplicate time stamps; the options above give exactly one frame per frame (872 in, 872 out).
- **Size:** the converted clip is 1.5 MB (real timeline) to 2.5 MB, from 70 MB. This clip hardly moves, so a real archery clip will be larger, but the plan's estimate of 40 to 80 MB per minute is probably too high.
- Playback: at 0.5x the WebView showed 117 of 120 expected frames per 2 s on the real-timeline file.
- Memory: the JS heap stayed at 10 MB with the 70 MB clip loaded (the file is not in the page's memory).

## Taking a video

- **Choose from gallery works** (`<input type="file" accept="video/*">`).
- **`capture` does not open the camera:** `<input type="file" accept="video/*" capture>` opens the gallery again on this phone.
  The button of that field read "Bild auswählen" (choose image), so the WebView seems to treat a field with `capture` as an image field (observed on screen; the cause is not verified).
  The app should not offer "Take video"; it offers "Choose video" and tells the user to record in the phone's camera app
  (slow motion is a mode of that app anyway, which a built-in camera screen could not match).
  Photos can use the Capacitor Camera plugin.

## Uploading a large file

209 MB sent from the page (XMLHttpRequest, 3 MB/s on purpose) with the app sent to the background after 12 seconds:
**the upload stalled about 13 seconds later at 74 MB and did not continue**, not in the next 140 seconds in the background and not after the app was brought
back to the front (48 seconds). The app process stayed alive. (Test through `adb reverse`; a plain mobile connection
could behave differently, but stalls in the background are what Android does to WebViews.)

So a video upload from the page is not reliable when the person puts the phone away. The plan's fallback is right: a small **native Capacitor
plugin** (Kotlin, WorkManager with a foreground notification) that uploads a file in chunks, and a server that
tells how much it already has so that an interrupted upload resumes. Not tested here (it needs the media endpoint, #36).

## How to repeat it

1. Convert the clip as above (keep the original too) and write the sorted frame times of each file:
   `ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 clipX.mp4 | tr -d ',' | python3 -c "import sys,json;print(json.dumps(sorted(float(x) for x in sys.stdin.read().split())))" > truthX.json`
2. Build the app with the page: `VITE_PROTOTYPE=1 VITE_SERVER_URL=https://app.fletchr.de npm run build-only`, `npx cap sync android`, debug build, install.
3. `python3 scripts/video-prototype/serve.py <folder>`, `adb reverse tcp:8765 tcp:8765`, `adb reverse tcp:8766 tcp:8766`, start the app.
4. `uv run --with playwright python scripts/video-prototype/run_checks.py <folder> B C` (the stepping checks) and `background_upload.py <folder>`.
5. The page `/dev/video` in the app also has the picker tests, done by hand.

The page and its library are `src/prototype/` (only in a build made with `VITE_PROTOTYPE=1`); delete them when the real player exists.
