import { SocialLogin } from '@capgo/capacitor-social-login';

// The plugin wrapper (a storage-style exception to "no Capacitor in lib", like token-storage.ts).
// The web client ID is a build setting and public; the server checks the token's audience against the same ID.
export const GOOGLE_WEB_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '';

let ready: Promise<void> | null = null;

function initialise(): Promise<void> {
  ready ??= SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } }).catch((e) => {
    ready = null; // try again next time
    throw e;
  });
  return ready;
}

/** The person closed the account chooser: that is not an error. */
export function isCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'USER_CANCELLED';
}

/** The Google ID token of the account the person picks, or null when they cancel. Other failures throw. */
export async function googleIdToken(): Promise<string | null> {
  try {
    await initialise();
    const { result } = await SocialLogin.login({ provider: 'google', options: {} });
    if (result.responseType !== 'online' || !result.idToken) throw new Error('Google returned no ID token');
    return result.idToken;
  } catch (e) {
    if (isCancelled(e)) return null;
    throw e;
  }
}
