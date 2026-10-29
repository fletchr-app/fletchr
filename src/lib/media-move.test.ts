import assert from 'node:assert/strict'
import { test } from 'vitest'

import { isNear, nearWindow, pickerOrder } from './media-move.ts'

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 24, hour, minute)).toISOString()
const done = { started_at: at(10), ended_at: at(12) }
const open = { started_at: at(10), ended_at: null }

test('the window of a finished session is an hour either side', () => {
  assert.deepEqual(nearWindow(done), { from: Date.parse(at(9)), to: Date.parse(at(13)) })
  assert.equal(isNear(at(9), done), true, 'the start of the window is in')
  assert.equal(isNear(at(8, 59), done), false)
  assert.equal(isNear(at(12, 59), done), true)
  assert.equal(isNear(at(13), done), false, 'the end of the window is out')
})

test('an unfinished session counts as four hours', () => {
  assert.equal(nearWindow(open).to, Date.parse(at(15)))
  assert.equal(isNear(at(14, 30), open), true)
  assert.equal(isNear(at(15), open), false)
})

test('the picker puts the session the photo was taken in first, then the newest', () => {
  const sessions = [
    { id: 'old', started_at: at(6), ended_at: at(7) },
    { id: 'mid', ...done },
    { id: 'new', started_at: at(18), ended_at: at(19) },
  ]
  assert.deepEqual(pickerOrder(sessions, at(11)).map((s) => s.id), ['mid', 'new', 'old'])
})

test('without a session around the time, the closest comes first', () => {
  const sessions = [
    { id: 'old', started_at: at(1), ended_at: at(2) },
    { id: 'near', started_at: at(16), ended_at: at(17) },
    { id: 'new', started_at: at(23), ended_at: null },
  ]
  assert.deepEqual(pickerOrder(sessions, at(13)).map((s) => s.id), ['near', 'new', 'old'])
  assert.deepEqual(pickerOrder([], at(13)), [])
})
