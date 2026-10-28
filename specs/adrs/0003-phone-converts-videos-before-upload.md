# The phone converts videos, not the server

status: accepted
date: 2026-10-23

## Context and Problem Statement

Frame-by-frame stepping needs a frame-steppable file (frequent keyframes, constant frame rate on the real timeline, no GPS metadata). A 120 fps slow-motion original is about 70 MB for 7 seconds, steps in 240 to 390 ms, and cannot be uploaded from the page when the app goes to the background (a 209 MB test stalled at 74 MB).

## Considered Options

- Upload the original, convert on the server (ffmpeg).
- Convert on the phone right after picking (native Media3 Transformer plugin), upload only the result.

## Decision Outcome

Convert on the phone. Tested with a prototype (#35, #70): 872 frames in 4.5 s, frame-exact output, no GPS position, 1.5 to 5 MB from 70 MB. The player stays in the WebView. The server stores and serves the files and checks size, type and permissions; it does no conversion and needs no ffmpeg.

## Consequences

- Needs a native plugin per platform (Android done, `VideoConverterPlugin.java`; iOS WKWebView still untested).
- No "Take video" button: `capture` does not open the camera, so the app offers "Choose video".
- Not measured: battery, heat, clips over a minute, other phones.

Details and numbers: [video-prototype.md](../design/video-prototype.md), [media-and-video-player.md](../design/media-and-video-player.md).
