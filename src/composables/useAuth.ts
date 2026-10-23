import { computed, shallowRef, watch } from 'vue';

import type { components } from '@/lib/api-types';
import { type ApiClient, AuthSession } from '@/lib/auth-session';
import { currentLanguage, t } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { userIdOf } from '@/lib/jwt';
import { useServer } from '@/composables/useServer';

export type RegisterBody = components['schemas']['RegisterRequest'];

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

const { url } = useServer();

// A new session per server address, so switching servers signs out.
const session = shallowRef(new AuthSession(url.value, currentLanguage));
const state = shallowRef(session.value.getState());
let unsubscribe = session.value.subscribe(() => (state.value = session.value.getState()));
watch(url, (next) => {
  unsubscribe();
  session.value = new AuthSession(next, currentLanguage);
  state.value = session.value.getState();
  unsubscribe = session.value.subscribe(() => (state.value = session.value.getState()));
});

// The client of the current session, so screens can keep one `api` for as long as the app runs.
const api = new Proxy({} as ApiClient, {
  get: (_, key) => Reflect.get(session.value.api, key),
});

const status = computed<AuthStatus>(() => (!state.value.loaded ? 'loading' : state.value.tokens ? 'signedIn' : 'signedOut'));
/** Id of the signed-in user, read from the access token so it is known offline. */
const userId = computed(() => (state.value.tokens ? userIdOf(state.value.tokens.access) : null));

/** Resolves once the stored tokens have been read, so the first route is not chosen too early. */
export function authReady(): Promise<void> {
  if (status.value !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(status, (s) => {
      if (s !== 'loading') {
        stop();
        resolve();
      }
    });
  });
}

// The sign-in functions return an error message, or null on success.
async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await api.POST('/api/token/', { body: { email: email.trim(), password } });
    if (!data) return errorMessage(error);
    session.value.setTokens({ access: data.access, refresh: data.refresh });
    return null;
  } catch {
    return t('common.serverNotReachable');
  }
}

async function register(body: RegisterBody): Promise<string | null> {
  try {
    const { data, error } = await api.POST('/api/register/', {
      body: { ...body, email: body.email.trim(), invite_code: body.invite_code.trim() },
    });
    if (!data) return errorMessage(error);
    session.value.setTokens({ access: data.access, refresh: data.refresh });
    return null;
  } catch {
    return t('common.serverNotReachable');
  }
}

async function signOut(): Promise<void> {
  const refresh = session.value.getState().tokens?.refresh;
  session.value.setTokens(null);
  if (refresh) {
    // Revoke the refresh token on the server; ignore failures (offline).
    await api.POST('/api/token/blacklist/', { body: { refresh } }).catch(() => {});
  }
}

/** After a password change the server hands out new tokens (every other session is signed out): keep these. */
function replaceTokens(tokens: { access: string; refresh: string }) {
  session.value.setTokens(tokens);
}

export function useAuth() {
  return { status, api, userId, signIn, register, signOut, replaceTokens };
}
