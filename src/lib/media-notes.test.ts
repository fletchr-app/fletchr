import { describe, expect, it } from 'vitest'

import { drawnShapes, isPhotoNote, noteLink, notesOnPicture, waitingOnMedia } from './media-notes'

const line = { v: 1, shapes: [{ t: 'line', p: [[0, 0], [1, 1]], c: '#ff0000' }] }
const note = (id: number, media: string | null, frame: number | null, drawing: unknown = null) => ({ id, media, frame, drawing, created_at: `2026-10-28T10:0${id}:00Z` })

describe('isPhotoNote', () => {
  it('needs media and no frame', () => {
    expect(isPhotoNote(note(1, 'm', null))).toBe(true)
    expect(isPhotoNote(note(1, 'm', 0))).toBe(false)
    expect(isPhotoNote(note(1, null, null))).toBe(false)
  })
})

describe('notesOnPicture', () => {
  const notes = [note(3, 'm', 5), note(2, 'm', null), note(1, 'm', 5), note(4, 'm', null)]
  it('gives a photo all of its notes, oldest first', () => {
    expect(notesOnPicture(notes, null).map((n) => n.id)).toEqual([2, 4])
  })
  it('gives a frame only the notes on it', () => {
    expect(notesOnPicture(notes, 5).map((n) => n.id)).toEqual([1, 3])
    expect(notesOnPicture(notes, 0)).toEqual([])
  })
})

describe('drawnShapes', () => {
  it('flattens, and skips notes without a drawing', () => {
    expect(drawnShapes([{ drawing: line }, { drawing: null }, { drawing: line }])).toHaveLength(2)
    expect(drawnShapes([{ drawing: null }])).toEqual([])
  })
})

describe('waitingOnMedia', () => {
  it('keeps the frames and drawings of the notes that wait on this picture, with ids no server note has', () => {
    const queued = [
      { media: 'm1', frame: 4, drawing: line, created_at: '2026-10-30T10:00:00Z' },
      { media: 'm2', frame: 1, drawing: null, created_at: '2026-10-30T10:01:00Z' },
      { media: 'm1', frame: null, drawing: null, created_at: '2026-10-30T10:02:00Z' },
    ]
    const waiting = waitingOnMedia(queued, 'm1')
    expect(waiting.map((n) => [n.id, n.frame])).toEqual([[-1, 4], [-2, null]])
    expect(notesOnPicture(waiting, 4)).toHaveLength(1)
    expect(notesOnPicture(waiting, null)).toHaveLength(1)
    expect(drawnShapes(notesOnPicture(waiting, 4))).toHaveLength(1)
  })
})

describe('noteLink', () => {
  it('opens a photo, a frame, or nothing', () => {
    expect(noteLink(note(1, 'abc', null))).toBe('/media/abc')
    expect(noteLink(note(1, 'abc', 0))).toBe('/media/abc?frame=0')
    expect(noteLink(note(1, null, null))).toBeNull()
  })
})
