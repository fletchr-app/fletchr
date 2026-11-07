// What the archer profile shows, as plain functions (no Vue), so the rules can be tested: the current gear, the latest photo tiles,
// and which plus and arrow a section gets. The profile is the start page for yourself and the archer page for a coach.
import type { FieldSpec } from './equipment-fields.ts';

export type GearItem = { name: string; values: Record<string, unknown> };

/** An item as the device stores it (`values`) or as the server lists it (the values at the top level). */
type AnyGear = { is_active?: boolean; values?: Record<string, unknown> } & Record<string, unknown>;

function gearItem(item: AnyGear): GearItem {
  const values = item.values ?? item;
  return { name: String(values.name ?? ''), values };
}

/** The first active bow and the first active arrow set (an item without the flag counts as active). */
export function currentGear(bows: AnyGear[], arrowSets: AnyGear[]): { bow?: GearItem; arrows?: GearItem } {
  const first = (list: AnyGear[]) => {
    const item = list.find((i) => i.is_active !== false);
    return item && gearItem(item);
  };
  return { bow: first(bows), arrows: first(arrowSets) };
}

/** The first filled values of an item, as "38 lb · Shibuya". `choice` words a value of a choice field. */
export function gearSummary(item: GearItem, fields: FieldSpec[], keys: string[], choice: (key: string, value: string) => string): string {
  return keys
    .map((key) => fields.find((f) => f.key === key))
    .filter((f): f is FieldSpec => !!f && item.values[f.key] !== undefined && item.values[f.key] !== null && item.values[f.key] !== '')
    .map((f) => (f.kind === 'choice' ? choice(f.key, String(item.values[f.key])) : `${item.values[f.key]}${f.unit ? ` ${f.unit}` : ''}`))
    .join(' · ');
}

export type Tile = { id: string; src: string; kind: 'photo' | 'video'; to: string; queued: boolean };
type MediaStub = { id: string; kind: 'photo' | 'video'; taken_at: string };

const newestFirst = <T extends MediaStub>(list: T[]) => [...list].sort((a, b) => b.taken_at.localeCompare(a.taken_at));

/**
 * The latest photos and clips of yourself: what waits for its upload first, then what the server has, never one twice.
 * A photo or clip opens in the player; without an account what waits is on the device.
 */
export function latestTiles(queue: MediaStub[], library: MediaStub[], src: (id: string, queued: boolean) => string, isLocal: boolean, n: number): Tile[] {
  const queuedIds = new Set(queue.map((q) => q.id));
  const queued = newestFirst(queue).map((m) => ({ m, queued: true }));
  const known = newestFirst(library)
    .filter((m) => !queuedIds.has(m.id))
    .map((m) => ({ m, queued: false }));
  return [...queued, ...known].slice(0, n).map(({ m, queued: q }) => ({
    id: m.id,
    kind: m.kind,
    src: src(m.id, q),
    queued: q,
    to: q && isLocal ? `/local-media/${m.id}` : `/media/${m.id}`,
  }));
}

export type SectionCounts = { sessions: number; evaluations: number; tiles: number; notes: number; gear: boolean; arrows: number };
export type SectionLinks = {
  gearPlus: boolean;
  gearArrow: boolean;
  trainingArrow: boolean;
  evaluationsPlus: boolean;
  evaluationsArrow: boolean;
  statsArrow: boolean;
  photosArrow: boolean;
  notesPlus: boolean;
  notesArrow: boolean;
};

/** Which plus and arrow each section shows: an arrow only where there is something to open, a plus only where the viewer may add. */
export function sectionLinks(o: { own: boolean; isLocal: boolean; canEvaluate: boolean; canNote: boolean; counts: SectionCounts }): SectionLinks {
  const { counts } = o;
  const account = !(o.own && o.isLocal); // evaluations and coach notes need an account
  return {
    gearPlus: o.own,
    gearArrow: counts.gear,
    trainingArrow: counts.sessions > 1,
    evaluationsPlus: o.own ? account : o.canEvaluate,
    evaluationsArrow: account && counts.evaluations > 0,
    statsArrow: counts.arrows > 0,
    photosArrow: counts.tiles > 0,
    notesPlus: !o.own && o.canNote,
    notesArrow: account && counts.notes > 0,
  };
}

/** Whole years on `now`, from a date of birth (YYYY-MM-DD); null if there is none. */
export function ageOn(dateOfBirth: string | null | undefined, now: Date): number | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y || !m || !d) return null;
  const years = now.getFullYear() - y;
  return now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? years - 1 : years;
}

export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
