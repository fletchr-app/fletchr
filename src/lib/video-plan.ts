// What to do with a chosen video before it is uploaded (docs/video-prototype.md). The rules live here, not in the
// native plugin, so they can be tested; the plugin only reads the file and does what the plan says.

/** What the plugin finds in the file. `width` and `height` are as the video is shown (rotation applied). */
export type VideoInfo = {
  width: number;
  height: number;
  durationMs: number;
  frames: number;
  /** Frames per second of the file's own timeline (a slow-motion clip says about 30). */
  fileFps: number;
  /** The rate the phone recorded at, 0 if the file does not say (120 for slow motion). */
  captureFps: number;
};

export type VideoLimits = { maxSeconds: number; maxBytes: number };
/** The same as the server's (MEDIA_MAX_VIDEO_SECONDS and MEDIA_MAX_VIDEO_BYTES). */
export const VIDEO_LIMITS: VideoLimits = { maxSeconds: 60, maxBytes: 50 * 1024 * 1024 };

export const SHORT_SIDE = 720;
export const KEYFRAME_EVERY = 10;
const BITS_PER_PIXEL = 0.08;
const MIN_BITRATE = 300_000;
const SIZE_MARGIN = 0.8; // aim for this share of the size limit
const DEFAULT_FPS = 30;
const SLOW_MOTION_FACTOR = 1.5;

export type VideoPlan = {
  /** Height of the result as shown, and the width that goes with it. */
  height: number;
  width: number;
  /** 1 for a normal clip; capture rate / file rate for slow motion, so the result runs on the real timeline. */
  speed: number;
  /** The frame rate of the result on its real timeline. */
  fps: number;
  realDurationMs: number;
  /** What the encoder is asked for. It counts against the source's timeline, so this is the wanted rate divided by `speed`. */
  bitrate: number;
  /** A keyframe every KEYFRAME_EVERY frames, counted with the source file's rate. */
  keyframeSeconds: number;
};

export type PlanResult = ({ ok: true } & VideoPlan) | { ok: false; reason: 'unreadable' } | { ok: false; reason: 'tooLong'; seconds: number; maxSeconds: number };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function planConversion(info: VideoInfo, limits: VideoLimits = VIDEO_LIMITS): PlanResult {
  if (!(info.width > 0 && info.height > 0 && info.durationMs > 0)) return { ok: false, reason: 'unreadable' };
  const fileFps = info.fileFps > 0 ? info.fileFps : info.frames > 0 ? (info.frames * 1000) / info.durationMs : DEFAULT_FPS;
  const slow = info.captureFps > fileFps * SLOW_MOTION_FACTOR;
  const speed = slow ? info.captureFps / fileFps : 1;
  const fps = fileFps * speed;
  const realDurationMs = info.durationMs / speed;
  if (realDurationMs > limits.maxSeconds * 1000) return { ok: false, reason: 'tooLong', seconds: realDurationMs / 1000, maxSeconds: limits.maxSeconds };

  const scale = Math.min(1, SHORT_SIDE / Math.min(info.width, info.height)); // never enlarge
  const width = even(info.width * scale);
  const height = even(info.height * scale);
  // The wanted bitrate on the real timeline, held down so that a long clip stays under the size limit.
  const wanted = Math.min(BITS_PER_PIXEL * width * height * fps, (limits.maxBytes * SIZE_MARGIN * 8) / (realDurationMs / 1000));
  return {
    ok: true,
    width,
    height,
    speed,
    fps,
    realDurationMs,
    bitrate: Math.max(MIN_BITRATE, Math.round(wanted / speed)),
    keyframeSeconds: KEYFRAME_EVERY / fileFps,
  };
}
