import { describe, expect, it } from 'vitest';
import { askSince } from './sync-overlap';

describe('askSince', () => {
  it('asks from a minute before the stamp', () => {
    expect(askSince('2026-11-07T10:14:29.880329Z')).toBe('2026-11-07T10:13:29.880Z');
  });
  it('asks for everything the first time', () => {
    expect(askSince(undefined)).toBeUndefined();
  });
  it('takes the overlap as a parameter', () => {
    expect(askSince('2026-11-07T10:00:30.000Z', 30_000)).toBe('2026-11-07T10:00:00.000Z');
  });
  it('leaves a stamp it cannot read alone', () => {
    expect(askSince('not a date')).toBe('not a date');
  });
});
