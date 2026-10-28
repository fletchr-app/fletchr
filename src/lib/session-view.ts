// A session as shown on screen, whether it comes from this device or from the server. No React.
import type { components } from './api-types.ts';
import { groupOf, type Group } from './group.ts';
import type { Gear, LogEnd, LogSession, LogShot, SessionDetails } from './log-model.ts';

export type ViewSession = LogSession & { owner_name?: string; updated_at?: string };

type ServerSession = components['schemas']['Session'];

/** The equipment as the server describes it, in the shape the screens already show. */
function gearOf(info: ServerSession['setup_info']): Gear | null {
  if (!info) return null;
  return {
    bow_id: null,
    bow_revision: info.bow_revision,
    bow_label: `${info.bow_name} (r${info.bow_revision_number})`,
    arrow_set_id: null,
    arrow_set_revision: info.arrow_set_revision ?? null,
    arrow_label: info.arrow_set_name ? `${info.arrow_set_name} (r${info.arrow_set_revision_number})` : '',
  };
}

/** The notes of a session from the server; null when nothing was written. */
function detailsOf(s: ServerSession): SessionDetails | undefined {
  const details = { weather: s.weather ?? '', physical_rating: s.physical_rating ?? null, mental_rating: s.mental_rating ?? null, goals: s.goals ?? '', notes: s.notes ?? '' };
  const empty = !details.weather && details.physical_rating === null && details.mental_rating === null && !details.goals && !details.notes;
  return empty ? undefined : details;
}

export function fromServer(s: ServerSession): ViewSession {
  return {
    details: detailsOf(s),
    gear: gearOf(s.setup_info),
    id: s.id,
    owner_name: s.owner_name,
    updated_at: s.updated_at,
    started_at: s.started_at,
    ended_at: s.ended_at ?? null,
    type: s.type ?? '',
    environment: s.environment ?? '',
    location: s.location ?? '',
    ends: s.ends.map((e) => ({
      id: e.id,
      index: e.index,
      distance_m: e.distance_m,
      face: e.face,
      arrows_per_end: e.arrows_per_end,
      shots: e.shots.map(
        (shot): LogShot => ({
          id: shot.id,
          value: shot.value ?? null,
          is_x: shot.is_x ?? false,
          is_miss: shot.is_miss ?? false,
          ...(shot.arrow_number != null ? { arrow_number: shot.arrow_number } : {}),
          ...(shot.x != null && shot.y != null ? { x: shot.x, y: shot.y, spot: shot.spot ?? 0 } : {}),
        }),
      ),
    })),
    volume: s.volume_entries.map((v) => ({ id: v.id, distance_m: v.distance_m, arrow_count: v.arrow_count })),
  };
}

/** All ends shot at one distance on one face: their arrows are drawn together and grouped. */
export type Block = {
  key: string;
  distance_m: string;
  face: string;
  ends: LogEnd[];
  /** Arrows that have a position. */
  plotted: (LogShot & { x: number; y: number })[];
  /** Arrows entered as a typed score: they count for the score but cannot be drawn. */
  typed: number;
  groups: { spot: number; group: Group }[];
};

const hasPosition = (s: LogShot): s is LogShot & { x: number; y: number } => s.x !== undefined && s.y !== undefined;

export function blocksOf(session: Pick<LogSession, 'ends'>): Block[] {
  const blocks = new Map<string, Block>();
  for (const end of session.ends) {
    const key = `${Number(end.distance_m)}|${end.face}`;
    let block = blocks.get(key);
    if (!block) {
      block = { key, distance_m: end.distance_m, face: end.face, ends: [], plotted: [], typed: 0, groups: [] };
      blocks.set(key, block);
    }
    block.ends.push(end);
    for (const shot of end.shots) {
      if (hasPosition(shot)) block.plotted.push(shot);
      else block.typed += 1;
    }
  }
  for (const block of blocks.values()) {
    const spots = [...new Set(block.plotted.map((s) => s.spot ?? 0))].sort((a, b) => a - b);
    for (const spot of spots) {
      const group = groupOf(block.plotted.filter((s) => (s.spot ?? 0) === spot));
      if (group) block.groups.push({ spot, group });
    }
  }
  return [...blocks.values()];
}
