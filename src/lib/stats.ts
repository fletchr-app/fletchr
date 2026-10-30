// Statistics of an archer's training, computed on the device (local mode, #93). A port of server/training/stats.py,
// arrow_stats.py and PositionsView; both are tested against shared/stats-vectors.json. No Vue, so it runs under `npm test`.
//
// Differences that would show up as different numbers are removed on purpose: weeks start on Monday, a session is dated by
// its day in the viewer's time zone, and numbers are rounded like Python's `round` (half to even on the exact value).
import type { components } from './api-types.ts';
import { centredScore } from './centred.ts';
import { getFace } from './faces.ts';
import type { LogSession } from './log-model.ts';
import { pyRound, pySum } from './py-math.ts';
import { score } from './scoring.ts';

type Api = components['schemas'];
export type StatsResult = Pick<Api['Stats'], 'volume' | 'scores'>;
export type ArrowStatsGroup = Api['ArrowStatsGroup'];
export type PositionsResult = Omit<Api['Positions'], 'owner'>;

/** The input of every function here (the same shape as the cases of the shared fixture). */
export type StatsShot = { value: number | null; is_x: boolean; is_miss: boolean; x?: number | null; y?: number | null; arrow_number?: number | null };
export type StatsEnd = { index: number; distance_m: string; face: string; shots: StatsShot[] };
export type StatsSession = {
  id: string;
  started_at: string;
  type: string;
  physical_rating: number | null;
  mental_rating: number | null;
  setup: number | null;
  arrow_set: { id: number; name: string } | null;
  ends: StatsEnd[];
  volume: { distance_m: string; arrow_count: number }[];
};

/** As many positions as the heatmap gets, newest first (the server's limit). */
export const MAX_POSITIONS = 5000;
const MIN_ARROWS = 6; // as centred.ts: fewer arrows say too little about where the centre is

/** Distance as the server stores it for grouping: one decimal, "18.0". */
export const quantizeDistance = (distance: string | number): string => pyRound(Number(distance), 1).toFixed(1);

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The day (YYYY-MM-DD) an instant falls on in a time zone. */
export function localDay(instant: string, tz: string): string {
  let format = formatters.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, format);
  }
  return format.format(new Date(instant));
}

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const dayOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Weeks start on Monday. */
export function weekStart(day: string): string {
  const n = dayNumber(day);
  return dayOf(n - ((n + 3) % 7)); // day 0 (1970-01-01) was a Thursday
}

const spotRadiusCm = (rings: { diameter_cm: number }[]) => rings[rings.length - 1]!.diameter_cm / 2;
const mean = (values: number[]) => pySum(values) / values.length;

function groupOf(points: [number, number][]) {
  if (points.length === 0) return { plotted: 0, centre_x: null, centre_y: null, spread: null };
  const cx = mean(points.map((p) => p[0]));
  const cy = mean(points.map((p) => p[1]));
  return {
    plotted: points.length,
    centre_x: pyRound(cx, 4),
    centre_y: pyRound(cy, 4),
    spread: pyRound(mean(points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))), 4),
  };
}

type Row = { session: StatsSession; value: number; is_x: boolean; is_miss: boolean; x: number | null; y: number | null };

/** Volume per week and average score per face and distance. `now` is an ISO instant, `tz` an IANA time zone. */
export function computeStats(sessions: StatsSession[], now: string, tz: string, weeks: number): StatsResult {
  const today = localDay(now, tz);
  const dayOfSession = new Map(sessions.map((s) => [s.id, localDay(s.started_at, tz)]));

  // --- volume: every arrow counts, scored or not
  const firstWeek = dayNumber(weekStart(today)) - 7 * (weeks - 1);
  const perWeek = new Map<string, number>();
  for (let i = 0; i < weeks; i++) perWeek.set(dayOf(firstWeek + 7 * i), 0);
  let thisMonth = 0;
  let total = 0;
  const count = (day: string, n: number) => {
    total += n;
    if (day.slice(0, 7) === today.slice(0, 7)) thisMonth += n;
    const week = weekStart(day);
    if (perWeek.has(week)) perWeek.set(week, perWeek.get(week)! + n);
  };
  for (const s of sessions) {
    const day = dayOfSession.get(s.id)!;
    for (const end of s.ends) count(day, end.shots.length);
    for (const v of s.volume) count(day, v.arrow_count);
  }
  const volume = {
    weeks: [...perWeek.keys()].sort().map((week_start) => ({ week_start, arrows: perWeek.get(week_start)! })),
    this_week: perWeek.get(weekStart(today))!,
    this_month: thisMonth,
    total,
  };

  // --- scores: per face and distance, because points on different faces cannot be compared
  const groups = new Map<string, Row[]>();
  for (const session of sessions) {
    for (const end of session.ends) {
      const face = getFace(end.face);
      if (!face || face.rings.length === 0) continue;
      for (const shot of end.shots) {
        if (shot.value === null && !shot.is_miss) continue; // no score
        const key = `${end.face}|${quantizeDistance(end.distance_m)}`;
        const row: Row = { session, value: shot.is_miss ? 0 : shot.value!, is_x: shot.is_x, is_miss: shot.is_miss, x: shot.x ?? null, y: shot.y ?? null };
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
    }
  }

  const scores: StatsResult['scores'] = [];
  for (const [key, rows] of groups) {
    const [slug, distance] = key.split('|') as [string, string];
    const face = getFace(slug)!;
    const top = face.rings[0]!.value;
    const n = rows.length;
    const perSession = new Map<string, Row[]>();
    for (const row of rows) perSession.set(row.session.id, [...(perSession.get(row.session.id) ?? []), row]);
    const sessionPoints = [...perSession.values()].map((list) => {
      const s = list[0]!.session;
      const plotted = list.filter((r) => r.x !== null && r.y !== null).map((r): [number, number] => [r.x!, r.y!]);
      const centred = centredScore(face, plotted.map(([x, y]) => ({ x, y })));
      return {
        point: {
          session: s.id,
          date: dayOfSession.get(s.id)!,
          competition: s.type === 'competition',
          arrows: list.length,
          average: pyRound(pySum(list.map((r) => r.value)) / list.length, 3),
          physical_rating: s.physical_rating,
          mental_rating: s.mental_rating,
          setup: s.setup,
          ...groupOf(plotted),
          plotted_average: centred ? pyRound(centred.real / centred.n, 3) : null,
          centred_average: centred ? pyRound(centred.centred / centred.n, 3) : null,
        },
        startedAt: Date.parse(s.started_at),
      };
    });
    sessionPoints.sort((a, b) => a.startedAt - b.startedAt);
    const values = [...face.rings.map((r) => r.value), 0];
    scores.push({
      face: slug,
      face_name: face.name,
      distance_m: distance,
      max_value: top,
      arrows: n,
      average: pyRound(pySum(rows.map((r) => r.value)) / n, 3),
      top_rate: pyRound(rows.filter((r) => !r.is_miss && r.value === top).length / n, 4),
      x_rate: face.x_diameter_cm ? pyRound(rows.filter((r) => r.is_x).length / n, 4) : null,
      miss_rate: pyRound(rows.filter((r) => r.is_miss).length / n, 4),
      radius_cm: spotRadiusCm(face.rings),
      distribution: values.map((value) => ({ value, count: rows.filter((r) => r.value === value).length })),
      sessions: sessionPoints.map((p) => p.point),
    });
  }
  scores.sort((a, b) => b.arrows - a.arrows || (a.face < b.face ? -1 : a.face > b.face ? 1 : 0) || (a.distance_m < b.distance_m ? -1 : a.distance_m > b.distance_m ? 1 : 0));
  return { volume, scores };
}

/** Which numbered arrows group away from the rest (per face and distance and arrow set); see arrow_stats.py for the rule. */
export function computeArrowStats(sessions: StatsSession[]): ArrowStatsGroup[] {
  type R = { session: string; set: StatsSession['arrow_set']; number: number | null; x: number; y: number };
  const blocks = new Map<string, Map<string, R[]>>();
  for (const s of sessions) {
    for (const end of s.ends) {
      const face = getFace(end.face);
      if (!face || face.rings.length === 0) continue;
      const key = `${end.face}|${quantizeDistance(end.distance_m)}`;
      const block = blocks.get(key) ?? new Map<string, R[]>();
      blocks.set(key, block);
      for (const shot of end.shots) {
        if (shot.x == null || shot.y == null) continue;
        block.set(s.id, [...(block.get(s.id) ?? []), { session: s.id, set: s.arrow_set, number: shot.arrow_number ?? null, x: shot.x, y: shot.y }]);
      }
    }
  }

  const groups: (ArrowStatsGroup & { shots: number })[] = [];
  for (const [key, bySession] of blocks) {
    const [slug, distance] = key.split('|') as [string, string];
    const offsets = new Map<string, { set: StatsSession['arrow_set']; number: number; items: { dx: number; dy: number; session: string }[] }>();
    for (const [sessionId, rows] of bySession) {
      if (rows.length < MIN_ARROWS) continue;
      const cx = mean(rows.map((r) => r.x));
      const cy = mean(rows.map((r) => r.y));
      for (const r of rows) {
        if (r.number === null) continue;
        const k = JSON.stringify([r.set?.id ?? null, r.set?.name ?? null, r.number]);
        const entry = offsets.get(k) ?? { set: r.set, number: r.number, items: [] };
        entry.items.push({ dx: r.x - cx, dy: r.y - cy, session: sessionId });
        offsets.set(k, entry);
      }
    }
    if (offsets.size === 0) continue;
    const sets = new Map<string, { set: StatsSession['arrow_set']; arrows: ArrowStatsGroup['sets'][number]['arrows'] }>();
    for (const { set, number, items } of offsets.values()) {
      const n = items.length;
      const ox = mean(items.map((i) => i.dx));
      const oy = mean(items.map((i) => i.dy));
      const k = JSON.stringify([set?.id ?? null, set?.name ?? null]);
      const entry = sets.get(k) ?? { set, arrows: [] };
      entry.arrows.push({
        number,
        shots: n,
        sessions: new Set(items.map((i) => i.session)).size,
        offset_x: pyRound(ox, 4),
        offset_y: pyRound(oy, 4),
        offset: pyRound(Math.hypot(ox, oy), 4),
        spread: pyRound(mean(items.map((i) => Math.hypot(i.dx - ox, i.dy - oy))), 4),
      });
      sets.set(k, entry);
    }
    const face = getFace(slug)!;
    const byName = (a: { set: StatsSession['arrow_set'] }, b: { set: StatsSession['arrow_set'] }) => {
      const an = a.set?.name ?? '';
      const bn = b.set?.name ?? '';
      return an < bn ? -1 : an > bn ? 1 : (a.set?.id ?? 0) - (b.set?.id ?? 0);
    };
    const ordered = [...sets.values()].sort(byName);
    groups.push({
      face: slug,
      face_name: face.name,
      distance_m: distance,
      radius_cm: spotRadiusCm(face.rings),
      sets: ordered.map(({ set, arrows }) => ({
        arrow_set: set?.id ?? null,
        arrow_set_name: set?.name ?? null,
        arrows: [...arrows].sort((a, b) => b.offset - a.offset || a.number - b.number),
      })),
      shots: ordered.reduce((sum, { arrows }) => sum + arrows.reduce((s, a) => s + a.shots, 0), 0),
    });
  }
  groups.sort((a, b) => b.shots - a.shots || (a.face < b.face ? -1 : a.face > b.face ? 1 : 0) || (a.distance_m < b.distance_m ? -1 : a.distance_m > b.distance_m ? 1 : 0));
  return groups.map(({ shots: _shots, ...group }) => group);
}

export type PositionsQuery = { face: string; distance_m: string | number; from?: string; to?: string; tz: string };

/** Where the arrows of one face at one distance landed, newest first, for the heatmap. `from` and `to` are days (YYYY-MM-DD), `to` included. */
export function positionsOf(sessions: StatsSession[], query: PositionsQuery, limit = MAX_POSITIONS): PositionsResult | null {
  const face = getFace(query.face);
  if (!face || face.rings.length === 0) return null;
  const distance = quantizeDistance(query.distance_m);
  const found: { started: number; end: number; shot: number; point: [number, number] }[] = [];
  for (const s of sessions) {
    const day = localDay(s.started_at, query.tz);
    if ((query.from && day < query.from) || (query.to && day > query.to)) continue;
    for (const end of s.ends) {
      if (end.face !== query.face || quantizeDistance(end.distance_m) !== distance) continue;
      end.shots.forEach((shot, i) => {
        if (shot.x != null && shot.y != null) found.push({ started: Date.parse(s.started_at), end: end.index, shot: i, point: [shot.x, shot.y] });
      });
    }
  }
  found.sort((a, b) => b.started - a.started || b.end - a.end || b.shot - a.shot);
  return {
    face: face.slug,
    distance_m: distance,
    radius_cm: spotRadiusCm(face.rings),
    arrows: found.length,
    limited: found.length > limit,
    points: found.slice(0, limit).map((f) => f.point),
  };
}

// --- from the log on the device ---------------------------------------------------------------------------------

export type FromLog = {
  sessions: StatsSession[];
  /** Label of each equipment setup used, by the id the statistics refer to it with. */
  setupLabels: Record<number, string>;
};

/** Sessions on the device in the shape of the functions above. Shots with a position are scored again from it, as the server does on upload. */
export function fromLog(log: LogSession[]): FromLog {
  const setupIds = new Map<string, number>();
  const setupLabels: Record<number, string> = {};
  const arrowSetIds = new Map<string, number>();
  const idOf = (ids: Map<string, number>, key: string) => {
    if (!ids.has(key)) ids.set(key, ids.size + 1);
    return ids.get(key)!;
  };
  const sessions = [...log]
    .filter((s) => !s.owner && !s.gone)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((s): StatsSession => {
      const gear = s.gear;
      const bow = gear?.bow_revision_uid ?? (gear?.bow_revision != null ? String(gear.bow_revision) : null);
      const arrows = gear?.arrow_set_revision_uid ?? (gear?.arrow_set_revision != null ? String(gear.arrow_set_revision) : null);
      let setup: number | null = null;
      if (gear && bow) {
        setup = idOf(setupIds, `${bow}|${arrows ?? ''}`);
        setupLabels[setup] = [gear.bow_label, gear.arrow_label].filter(Boolean).join(' · ');
      }
      const arrowSetKey = gear?.arrow_set_key ?? (gear?.arrow_set_id != null ? String(gear.arrow_set_id) : null);
      return {
        id: s.id,
        started_at: s.started_at,
        type: s.type,
        physical_rating: s.details?.physical_rating ?? null,
        mental_rating: s.details?.mental_rating ?? null,
        setup,
        arrow_set: gear && arrowSetKey ? { id: idOf(arrowSetIds, arrowSetKey), name: gear.arrow_label.replace(/ \(r\d+\)$/, '') } : null,
        ends: s.ends.map((e) => {
          const face = getFace(e.face);
          return {
            index: e.index,
            distance_m: e.distance_m,
            face: e.face,
            shots: e.shots.map((shot): StatsShot => {
              const plotted = shot.x !== undefined && shot.y !== undefined;
              const scored = plotted && face && face.rings.length > 0 ? score(face, shot.x!, shot.y!) : null;
              return {
                value: scored ? scored.value : shot.value,
                is_x: scored ? scored.is_x : shot.is_x,
                is_miss: scored ? scored.is_miss : shot.is_miss,
                x: plotted ? shot.x : null,
                y: plotted ? shot.y : null,
                arrow_number: shot.arrow_number ?? null,
              };
            }),
          };
        }),
        volume: s.volume.map((v) => ({ distance_m: v.distance_m, arrow_count: v.arrow_count })),
      };
    });
  return { sessions, setupLabels };
}
