// Throwaway prototype for #35: can the Android WebView step through a slow-motion clip frame by frame?
// Not part of the app: the page that uses it is only built with VITE_PROTOTYPE=1.

export type Frame = { mediaTime: number; presentedFrames: number };

/** Wait for the next frame the video presents (after a seek, a play or a step). null on timeout. */
export function nextFrame(video: HTMLVideoElement, timeoutMs = 3000): Promise<Frame | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    video.requestVideoFrameCallback((_now, meta) => {
      clearTimeout(timer);
      resolve({ mediaTime: meta.mediaTime, presentedFrames: meta.presentedFrames });
    });
  });
}

export async function loadVideo(video: HTMLVideoElement, url: string): Promise<{ duration: number; width: number; height: number }> {
  video.src = url;
  video.muted = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(video.error?.message || `video error ${video.error?.code}`));
  });
  return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
}

/** Play slowly and read the frame times the player reports: the frame duration and the frames it dropped. */
export async function measurePlayback(video: HTMLVideoElement, seconds = 2): Promise<{ frames: number; medianMs: number; gaps: number; rate: number }> {
  video.currentTime = 0;
  await nextFrame(video);
  const times: number[] = [];
  let stop = false;
  video.playbackRate = 0.5;
  const loop = () => {
    if (stop) return;
    video.requestVideoFrameCallback((_n, meta) => {
      times.push(meta.mediaTime);
      loop();
    });
  };
  loop();
  await video.play();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  stop = true;
  video.pause();
  const deltas = times.slice(1).map((t, i) => t - times[i]!).filter((d) => d > 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const gaps = deltas.filter((d) => d > median * 1.5).length;
  return { frames: times.length, medianMs: median * 1000, gaps, rate: video.playbackRate };
}

export type StepRow = { want: number; got: number | null; time: number | null; ms: number };

/**
 * Seek to the middle of frame `index` (using the true frame times when known) and see which frame the player shows.
 * `truth` is the list of frame times of the file (from ffprobe); without it frames are assumed `frameSec` apart.
 */
export async function seekToFrame(video: HTMLVideoElement, index: number, frameSec: number, truth?: number[], fraction = 0.5): Promise<StepRow> {
  const start = truth ? truth[index]! : index * frameSec;
  const end = truth ? (truth[index + 1] ?? start + frameSec) : start + frameSec;
  const target = start + (end - start) * fraction;
  const t0 = performance.now();
  const frame = nextFrame(video, 5000);
  video.currentTime = target;
  const shown = await frame;
  const ms = performance.now() - t0;
  if (!shown) return { want: index, got: null, time: null, ms };
  const got = truth ? nearest(truth, shown.mediaTime) : Math.round(shown.mediaTime / frameSec);
  return { want: index, got, time: shown.mediaTime, ms };
}

function nearest(times: number[], t: number): number {
  let best = 0;
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i]! - t) < Math.abs(times[best]! - t)) best = i;
  return best;
}

export type Summary = { steps: number; exact: number; repeated: number; skipped: number; timeouts: number; medianMs: number; maxMs: number };

export function summarise(rows: StepRow[]): Summary {
  const timeouts = rows.filter((r) => r.got === null).length;
  const ok = rows.filter((r) => r.got !== null);
  const exact = ok.filter((r) => r.got === r.want).length;
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  return {
    steps: rows.length,
    exact,
    repeated: ok.filter((r) => r.got! < r.want).length,
    skipped: ok.filter((r) => r.got! > r.want).length,
    timeouts,
    medianMs: Math.round(ms[Math.floor(ms.length / 2)] ?? 0),
    maxMs: Math.round(ms[ms.length - 1] ?? 0),
  };
}

/** One step per frame, forward from `from`, then back again: what pressing the step buttons does. */
export async function stepTest(video: HTMLVideoElement, from: number, count: number, frameSec: number, truth?: number[], fraction = 0.5) {
  video.pause();
  const forward: StepRow[] = [];
  for (let i = from; i < from + count; i++) forward.push(await seekToFrame(video, i, frameSec, truth, fraction));
  const backward: StepRow[] = [];
  for (let i = from + count - 2; i >= from; i--) backward.push(await seekToFrame(video, i, frameSec, truth, fraction));
  return { forward: summarise(forward), backward: summarise(backward), worst: [...forward, ...backward].filter((r) => r.got !== r.want).slice(0, 8) };
}

/** Jumps to frames spread over the whole clip (across keyframes), like dragging the jog strip. */
export async function jumpTest(video: HTMLVideoElement, frames: number, frameSec: number, n: number, truth?: number[], fraction = 0.5) {
  video.pause();
  const rows: StepRow[] = [];
  for (let k = 0; k < n; k++) rows.push(await seekToFrame(video, Math.floor(((k * 7919) % frames) * 0.999), frameSec, truth, fraction));
  return { ...summarise(rows), worst: rows.filter((r) => r.got !== r.want).slice(0, 8) };
}

export function memoryMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

/** Upload a blob and report progress; used to see what happens to a long upload when the app goes to the background. */
export function uploadBlob(url: string, blob: Blob, onProgress: (sent: number) => void): Promise<{ ok: boolean; ms: number; status: number; sent: number; error?: string }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let sent = 0;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      sent = e.loaded;
      onProgress(sent);
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, ms: Math.round(performance.now() - t0), status: xhr.status, sent });
    xhr.onerror = () => resolve({ ok: false, ms: Math.round(performance.now() - t0), status: 0, sent, error: 'network error' });
    xhr.ontimeout = () => resolve({ ok: false, ms: Math.round(performance.now() - t0), status: 0, sent, error: 'timeout' });
    xhr.send(blob);
  });
}
