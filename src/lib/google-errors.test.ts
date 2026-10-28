import { describe, expect, it } from 'vitest';

import { googleErrorKey, isNoAccount } from './google-errors';

describe('googleErrorKey', () => {
  it('maps the codes of the server to message keys', () => {
    expect(googleErrorKey({ code: 'no_account', detail: 'x' })).toBe('auth.google.noAccount');
    expect(googleErrorKey({ code: 'email_taken' })).toBe('auth.google.emailTaken');
    expect(googleErrorKey({ code: 'email_unverified' })).toBe('auth.google.emailUnverified');
    expect(googleErrorKey({ code: 'invalid_token' })).toBe('auth.google.failed');
  });

  it('knows nothing of other errors', () => {
    expect(googleErrorKey({ invite_code: ['Invalid'] })).toBeNull();
    expect(googleErrorKey(undefined)).toBeNull();
    expect(googleErrorKey('x')).toBeNull();
  });

  it('tells a missing account from the rest', () => {
    expect(isNoAccount({ code: 'no_account' })).toBe(true);
    expect(isNoAccount({ code: 'email_taken' })).toBe(false);
  });
});
