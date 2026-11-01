import { describe, expect, it } from 'vitest';

import { registrationBody, shouldRegister } from './push-registration';

describe('shouldRegister', () => {
  const all = { available: true, signedIn: true, granted: true };

  it('needs all three', () => {
    expect(shouldRegister(all)).toBe(true);
    expect(shouldRegister({ ...all, available: false })).toBe(false);
    expect(shouldRegister({ ...all, signedIn: false })).toBe(false);
    expect(shouldRegister({ ...all, granted: false })).toBe(false);
  });
});

describe('registrationBody', () => {
  it('names the old token only when it changed', () => {
    expect(registrationBody('new', 'old', 'de.fletchr.app', 'de')).toEqual({ token: 'new', app_id: 'de.fletchr.app', language: 'de', replaces: 'old' });
    expect(registrationBody('same', 'same', 'de.fletchr.app', 'en')).toEqual({ token: 'same', app_id: 'de.fletchr.app', language: 'en' });
    expect(registrationBody('first', null, 'de.fletchr.app.dev', 'en')).toEqual({ token: 'first', app_id: 'de.fletchr.app.dev', language: 'en' });
  });
});
