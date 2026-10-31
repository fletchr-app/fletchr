// The JSON backup of the data of a person without an account (#93): sessions, equipment and notes (with their drawings).
// Photo and video files are not in it (size); the notes about them are, and stay without their picture after an import.
// Pure, so it is tested with `npm test`. Importing adds what the device does not have, matched by the ids the app made,
// and leaves everything the device has as it is.
import { LOCAL_ARCHER } from './local-mode.ts';
import type { LogSession } from './log-model.ts';
import type { QueuedNote } from './note-store.ts';
import type { StoredItem } from './equipment-store.ts';

export const EXPORT_FORMAT = 'fletchr-local';
export const EXPORT_VERSION = 1;

export type LocalExport = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  app_version: string;
  sessions: LogSession[];
  equipment: StoredItem[];
  notes: QueuedNote[];
  /** How many photos and videos the phone had: they are not in the file. */
  media_not_included: number;
};

export type LocalData = { sessions: LogSession[]; equipment: StoredItem[]; notes: QueuedNote[] };

export function buildExport(data: LocalData, mediaCount: number, appVersion: string, now: Date): LocalExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: now.toISOString(),
    app_version: appVersion,
    // What belongs to somebody else's account or to an upload that failed is not part of the person's own data.
    sessions: data.sessions.filter((s) => !s.owner && !s.gone),
    equipment: data.equipment,
    notes: data.notes.map(({ error: _error, ...n }) => n),
    media_not_included: mediaCount,
  };
}

export type ParseFailure = 'notJson' | 'notOurs' | 'newer' | 'broken';
export type Parsed = { ok: true; data: LocalData & { exportedAt: string; mediaNotIncluded: number } } | { ok: false; reason: ParseFailure };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && v !== '';

const validSession = (s: unknown): s is LogSession =>
  isObject(s) && text(s.id) && text(s.started_at) && Array.isArray(s.ends) && Array.isArray(s.volume) &&
  s.ends.every((e) => isObject(e) && text(e.id) && Array.isArray(e.shots)) && s.volume.every((v) => isObject(v) && text(v.id));
const validItem = (i: unknown): i is StoredItem =>
  isObject(i) && (i.kind === 'bow' || i.kind === 'arrowSet') && text(i.uid) && isObject(i.values) && Array.isArray(i.revisions) && i.revisions.every((r) => isObject(r) && text(r.uid));
const validNote = (n: unknown): n is QueuedNote => isObject(n) && text(n.uid) && typeof n.body === 'string' && text(n.created_at);

export function parseExport(raw: string): Parsed {
  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  if (!isObject(file) || file.format !== EXPORT_FORMAT) return { ok: false, reason: 'notOurs' };
  if (typeof file.version !== 'number' || file.version > EXPORT_VERSION) return { ok: false, reason: 'newer' };
  const { sessions, equipment, notes } = file;
  if (!Array.isArray(sessions) || !Array.isArray(equipment) || !Array.isArray(notes)) return { ok: false, reason: 'broken' };
  if (!sessions.every(validSession) || !equipment.every(validItem) || !notes.every(validNote)) return { ok: false, reason: 'broken' };
  return {
    ok: true,
    data: {
      // The data is the person's own: whatever account ids a file might carry are dropped.
      sessions: sessions.map(({ owner: _o, owner_name: _n, opened_by: _b, opened_by_name: _bn, gone: _g, noResults: _r, ...s }) => s as LogSession),
      equipment: equipment.map((i) => ({ ...i, id: undefined, revisions: i.revisions.map((r) => ({ ...r, id: undefined })) })),
      notes: notes.map(({ error: _e, ...n }) => ({ ...n, archer: LOCAL_ARCHER, team: null })),
      exportedAt: typeof file.exported_at === 'string' ? file.exported_at : '',
      mediaNotIncluded: typeof file.media_not_included === 'number' ? file.media_not_included : 0,
    },
  };
}

export type ImportPlan = { add: LocalData; added: { sessions: number; equipment: number; notes: number }; kept: { sessions: number; equipment: number; notes: number } };

/** What an import would add: items whose id the device does not know. The rest stays as it is on the device. */
export function planImport(file: LocalData, device: LocalData): ImportPlan {
  const sessions = file.sessions.filter((s) => !device.sessions.some((d) => d.id === s.id));
  const equipment = file.equipment.filter((i) => !device.equipment.some((d) => d.kind === i.kind && d.uid === i.uid));
  const notes = file.notes.filter((n) => !device.notes.some((d) => d.uid === n.uid));
  return {
    add: { sessions, equipment, notes },
    added: { sessions: sessions.length, equipment: equipment.length, notes: notes.length },
    kept: { sessions: file.sessions.length - sessions.length, equipment: file.equipment.length - equipment.length, notes: file.notes.length - notes.length },
  };
}
