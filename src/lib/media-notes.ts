import { type Shape, readDrawing } from '@/lib/drawing'

// Which notes belong to which picture: a photo has its notes as a whole, a clip has them per frame.
export type MediaNote = { id: number; media?: string | null; frame?: number | null; drawing?: unknown; created_at: string }

/** A note on a photo: it has a photo or clip, but no frame. (Whether that media is a photo is for `picture.kind`.) */
export const isPhotoNote = (note: Pick<MediaNote, 'media' | 'frame'>) => !!note.media && (note.frame === null || note.frame === undefined)

/** The notes to show with the picture: for a photo (`frame` null) all of them, for a clip those on that frame. */
export function notesOnPicture<T extends MediaNote>(notes: T[], frame: number | null): T[] {
  const mine = notes.filter((n) => (frame === null ? isPhotoNote(n) : n.frame === frame))
  return mine.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
}

/** All shapes of these notes, in order. */
export const drawnShapes = (notes: Pick<MediaNote, 'drawing'>[]): Shape[] => notes.flatMap((n) => readDrawing(n.drawing).shapes)

/** Where a note opens: its photo, or its clip at its frame. Null for a note without media. */
export function noteLink(note: Pick<MediaNote, 'media' | 'frame'>): string | null {
  if (!note.media) return null
  return note.frame === null || note.frame === undefined ? `/media/${note.media}` : `/media/${note.media}?frame=${note.frame}`
}
