# Automatic skeleton detection

Status: planned (milestone 5, not started)
Date: 2026-10-23
Updated: 2026-10-28

- **Approach**: server-side, as a background job after video conversion, using **Google MediaPipe Pose Landmarker** (open, Apache 2.0 licence, 33 body points incl. hands, runs on a normal CPU). Running on the server gives every device the same results, including older phones and the web app, and no video leaves your own server. Alternative kept open: **RTMPose** (also Apache 2.0) if MediaPipe's accuracy around the bow arm turns out too weak. YOLO pose models are avoided because of their AGPL licence.
- **Runs on the cheap server**: a small Python worker container (`worker/`) would be added to the Docker Compose setup (works locally too). Rough estimate, to be verified: 1 to 3 minutes of processing per 60-second clip on a 2-vCPU VPS; slow-motion clips are analysed at a reduced rate (e.g. 30 frames per second of real time) to keep this down.
- **Form metrics (from a side view)**:
  - bow arm: elbow angle, shoulder height and shoulder line
  - draw arm: draw-elbow alignment with the arrow line ("line"), elbow height
  - posture: torso lean, head tilt, stance
  - anchor: position of the draw hand relative to chin/face and how consistent it is from shot to shot
  - draw length: relative only (normalised by shoulder width), absolute cm needs a one-time calibration
  - stability: bow-hand and head movement during aiming
  - timing: set-up, draw, anchor, aiming time, release and follow-through, detected from the motion
- **In the player**: a toggle draws the skeleton on every frame while stepping (interpolated between analysed frames for slow-motion clips), with angle labels at the joints; a chart under the video shows a chosen metric over time, synced to the current frame; each shot gets a summary card that can be compared with earlier shots or with a "reference shot" the coach picks.
- **Limits**: one camera gives 2D only, so the camera must be placed square to the side (a "camera setup" guide in the app); the bow and riser can hide the bow hand; fingers and string are not tracked reliably; the metrics support the coach's eye and do not replace it.
- **Privacy and storage**: everything runs on your own server; pose data is small (well under 1 MB per clip) and is deleted together with the video. Analysis only runs on clips the archer or coach starts it for. For archers under 18 the video consent already built applies ([roles-and-access.md](roles-and-access.md)); how it is collected (wording, join flow) waits for the legal review (#63). Analysis would need its own mention in the privacy text.
