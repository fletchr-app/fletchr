# Video prototype (#35): results and how to repeat it

Tested 2026-10-23 on a Motorola edge 50 neo (Android 16, system WebView Chrome 155) with one 120 fps slow-motion clip
recorded with the phone's camera app. The aim was to decide whether the frame-by-frame player and the video upload can
stay in Capacitor (WebView) or need native code ([media-and-video-player.md](media-and-video-player.md)).

**Decision: the player stays in the WebView. The conversion is done on the phone** (second part of this document, #70), so only a small file is uploaded and no server-side conversion is needed.

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

So a video of this size cannot be uploaded from the page when the person puts the phone away. That is one more reason to convert on the phone first (below): the file to upload is then a few MB.

## Converting on the phone (#70)

Instead of uploading the original and converting on the server, the app converts the clip right after it is picked.
A throwaway Capacitor plugin (the first version of `android/app/src/main/java/de/fletchr/app/VideoConverterPlugin.java`, Media3 Transformer 1.8.0)
was tested with the same clip. **It works.**

| | Result |
|---|---|
| Speed | 872 frames (7.3 s of real time) in 4.5 s on the phone, about 190 frames/s; a 60 s clip at 120 fps would take about 40 s (extrapolated, not measured) |
| Output | H.264 High, 720p (portrait, with the rotation tag), no audio, **no B-frames**, **all 872 frames, one frame per input frame**, no duplicates |
| Timeline | real time, 120 fps (the plugin reads the capture rate from the file with `MediaMetadataRetriever` and speeds the timestamps up by capture rate / file rate, here 4.03); frame spacing 8.18 to 8.46 ms (mean 8.33; not exactly constant, because the source timestamps are not) |
| Keyframes | exactly every 10 frames, **if the interval is counted with the frame rate of the source file** (about 30 fps for slow motion): the encoder was configured with that rate, so asking for 10 frames at 120 fps gave a keyframe every 2 frames |
| Bitrate | the encoder also counts against the source's timeline: 6 Mbit/s requested gave 24 Mbit/s on the real timeline (20.8 MB). So request `wanted / speed`; for a normal clip (speed 1) the requested value is what you get. 1.5 Mbit/s requested (about 6 Mbit/s real) gave 5.3 MB. Use a rule like 0.07 bits per pixel per frame |
| Metadata | **no GPS position**; the device model, manufacturer and Android version tags stay (harmless) |
| Stepping in the WebView | frame-exact on the output: 120/120 forward, 119/119 back, 40/40 jumps, 33 to 65 ms per step (real and stretched timeline; aiming at 25% or 50% of the frame) |
| Normal clip (30 fps, no slow-motion tag) | speed 1, converted correctly: 218 frames, constant 33.3 ms, keyframe every 10 frames |
| Broken file | "cannot read the video" as an error to the page, no crash (the message needs cleaning up) |
| Not measured | battery and heat, a clip of a minute or more, other phones, the size of the Media3 library in the app |

Because the frame times are not exactly `i / 120`, the player should step relative to the frame it shows: read the `mediaTime` of the current frame (from `requestVideoFrameCallback`) and aim at `mediaTime + 1.25 * frame_duration` for the next one.

The prototype plugin became the real one (#39); the rules moved into `src/lib/video-plan.ts`. The test page `src/prototype/` and the scripts
`scripts/video-prototype/` (stepping checks, background upload, the file server) were removed with that change. They are in the git history
(commit `5efc4f6` and before) and the steps to repeat the checks were:

1. Record a 120 fps slow-motion clip with the camera app, copy it to the PC.
2. Build the app with the page (`VITE_PROTOTYPE=1`), install it, serve the folder over `adb reverse`.
3. Run the stepping checks through the WebView's debugger (Playwright over `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`).
