import { describe, expect, it } from 'vitest';

import { pushTarget } from './push-target';

const context = { userId: 7, hasLocalSession: (id: string) => id === 'mine' };
const base = { user: '7' };

describe('pushTarget', () => {
  it('opens the photo or clip a note is about', () => {
    expect(pushTarget({ ...base, type: 'note', note: '3', media: '12', session: 'mine' }, context)).toBe('/media/12');
  });

  it('opens my own session from the log, another one from the server', () => {
    expect(pushTarget({ ...base, type: 'note', session: 'mine' }, context)).toBe('/training/mine');
    expect(pushTarget({ ...base, type: 'note', session: '5f0c-aa' }, context)).toBe('/sessions/5f0c-aa');
  });

  it('opens the event of a note, or the training list when it is about nothing', () => {
    expect(pushTarget({ ...base, type: 'note', event: '9' }, context)).toBe('/events/9');
    expect(pushTarget({ ...base, type: 'note' }, context)).toBe('/training');
  });

  it('opens an evaluation and a team', () => {
    expect(pushTarget({ ...base, type: 'evaluation', evaluation: '4' }, context)).toBe('/evaluations/4');
    expect(pushTarget({ ...base, type: 'evaluation' }, context)).toBeNull();
    expect(pushTarget({ ...base, type: 'team', team: '2' }, context)).toBe('/team/2');
    expect(pushTarget({ ...base, type: 'team' }, context)).toBe('/team');
  });

  it('ignores a notification for another account, or when nobody is signed in', () => {
    expect(pushTarget({ type: 'note', user: '8' }, context)).toBeNull();
    expect(pushTarget({ type: 'note' }, context)).toBeNull();
    expect(pushTarget({ ...base, type: 'note' }, { ...context, userId: null })).toBeNull();
  });

  it('puts nothing odd into a route', () => {
    expect(pushTarget({ ...base, type: 'note', media: '../settings' }, context)).toBe('/training');
    expect(pushTarget({ ...base, type: 'evaluation', evaluation: '4/../x' }, context)).toBeNull();
    expect(pushTarget({ ...base, type: 'other' }, context)).toBeNull();
    expect(pushTarget({ ...base, type: 'note', media: 12 }, context)).toBe('/training');
  });
});
