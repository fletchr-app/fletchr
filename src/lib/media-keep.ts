// Photos and clips of yours that the phone keeps after they went up, so they open without a connection (#83, #84). The
// files wait in their own folder (media-files.ts); this is the list of them and the rule for what goes when the phone
// holds too much. Photos and clips that still wait to upload are never here, the queue has them. No Vue, so it can be tested.

export type KeptItem = {
  id: string;
  /** Bytes of the file and the thumbnail together. */
  size: number;
  /** When the phone started keeping it. */
  keptAt: string;
  /** When it was last opened (or kept), the older the sooner it goes. */
  usedAt: string;
};

export type KeptState = { items: KeptItem[] };

export const EMPTY_KEPT: KeptState = { items: [] };

export type KeptAction =
  | { type: 'kept'; id: string; size: number; at: string }
  | { type: 'used'; id: string; at: string }
  | { type: 'forget'; ids: string[] }
  | { type: 'clear' };

export function reduceKept(state: KeptState, action: KeptAction): KeptState {
  switch (action.type) {
    case 'kept':
      return { items: [...state.items.filter((i) => i.id !== action.id), { id: action.id, size: action.size, keptAt: action.at, usedAt: action.at }] };
    case 'used':
      return state.items.some((i) => i.id === action.id) ? { items: state.items.map((i) => (i.id === action.id ? { ...i, usedAt: action.at } : i)) } : state;
    case 'forget': {
      const gone = new Set(action.ids);
      return state.items.some((i) => gone.has(i.id)) ? { items: state.items.filter((i) => !gone.has(i.id)) } : state;
    }
    case 'clear':
      return EMPTY_KEPT;
  }
}

export const keptBytes = (state: KeptState): number => state.items.reduce((sum, i) => sum + i.size, 0);

/** What the cap can be set to, in MB. 0: keep nothing, null: no limit. */
export const CAP_CHOICES_MB: (number | null)[] = [0, 250, 1000, 4000, null];
export const DEFAULT_CAP_MB = 1000;

/** The items to delete so that no more than `capMb` are held: the least recently used first. `keep` is never chosen (what is open right now). */
export function evictions(state: KeptState, capMb: number | null, keep: ReadonlySet<string> = new Set()): string[] {
  if (capMb === null) return [];
  const cap = capMb * 1024 * 1024;
  let total = keptBytes(state);
  const out: string[] = [];
  for (const item of [...state.items].sort((a, b) => a.usedAt.localeCompare(b.usedAt) || a.keptAt.localeCompare(b.keptAt))) {
    if (total <= cap) break;
    if (keep.has(item.id)) continue;
    out.push(item.id);
    total -= item.size;
  }
  return out;
}
