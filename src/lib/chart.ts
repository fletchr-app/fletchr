// Axis and shape helpers for the charts. No React, so they are tested with `npm test`.

/** A round top value and ticks from 0 to it, with about `target` steps (1, 2 or 5 times a power of ten). */
export function niceTicks(max: number, target = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks };
}

/** 950, 1K, 1.2K, 12.5K, 100K: short enough for an axis. */
export function compact(n: number): string {
  if (Math.abs(n) < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}K`;
}

/**
 * The visible range of a score chart: a little wider than the data, within 0 and the best ring,
 * never narrower than two points so one session does not look like a trend.
 */
export function scoreDomain(values: number[], best: number): { lo: number; hi: number; ticks: number[] } {
  let lo = Math.max(0, Math.floor(Math.min(...values) - 0.5));
  let hi = Math.min(best, Math.ceil(Math.max(...values) + 0.5));
  if (hi - lo < 2) {
    lo = Math.max(0, hi - 2);
    hi = Math.min(best, lo + 2);
  }
  const step = hi - lo > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

/** A column with a rounded top and a square foot, as an SVG path. The foot is the baseline. */
export function columnPath(x: number, baseline: number, width: number, height: number, radius = 4): string {
  const r = Math.min(radius, width / 2, height);
  const top = baseline - height;
  return `M${x},${baseline} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${baseline} Z`;
}
