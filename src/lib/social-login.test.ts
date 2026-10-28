import { beforeEach, describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const login = vi.fn();
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize, login } }));

const { googleIdToken, isCancelled } = await import('./social-login');

beforeEach(() => {
  initialize.mockReset().mockResolvedValue(undefined);
  login.mockReset();
});

describe('googleIdToken', () => {
  it('returns the ID token and initialises the plugin once', async () => {
    login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: 'abc' } });
    expect(await googleIdToken()).toBe('abc');
    expect(await googleIdToken()).toBe('abc');
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('returns null when the person cancels', async () => {
    login.mockRejectedValue(Object.assign(new Error('Google Sign-In cancelled by user'), { code: 'USER_CANCELLED' }));
    expect(await googleIdToken()).toBeNull();
  });

  it('throws on other failures and on a missing token', async () => {
    login.mockRejectedValue(new Error('network'));
    await expect(googleIdToken()).rejects.toThrow('network');
    login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: null } });
    await expect(googleIdToken()).rejects.toThrow();
  });
});

it('recognises a cancel by its code', () => {
  expect(isCancelled({ code: 'USER_CANCELLED' })).toBe(true);
  expect(isCancelled(new Error('x'))).toBe(false);
  expect(isCancelled(null)).toBe(false);
});
