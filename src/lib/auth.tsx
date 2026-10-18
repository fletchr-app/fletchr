import { createContext, ReactNode, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

import type { components } from '@/lib/api-types';
import { ApiClient, AuthSession } from '@/lib/auth-session';
import { errorMessage } from '@/lib/errors';
import { userIdOf } from '@/lib/jwt';
import { useServer } from '@/lib/server';

export type RegisterBody = components['schemas']['RegisterRequest'];

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  api: ApiClient;
  /** Id of the signed-in user, read from the access token so it is known offline. */
  userId: string | null;
  // The sign-in functions return an error message, or null on success.
  signIn: (email: string, password: string) => Promise<string | null>;
  register: (body: RegisterBody) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { url } = useServer();
  // A new session per server address, so switching servers signs out.
  const session = useMemo(() => new AuthSession(url), [url]);
  const { loaded, tokens } = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const api = session.api;

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await api.POST('/api/token/', { body: { email: email.trim(), password } });
        if (!data) return errorMessage(error);
        session.setTokens({ access: data.access, refresh: data.refresh });
        return null;
      } catch {
        return 'Server not reachable';
      }
    },
    [api, session],
  );

  const register = useCallback(
    async (body: RegisterBody) => {
      try {
        const { data, error } = await api.POST('/api/register/', {
          body: { ...body, email: body.email.trim(), invite_code: body.invite_code.trim() },
        });
        if (!data) return errorMessage(error);
        session.setTokens({ access: data.access, refresh: data.refresh });
        return null;
      } catch {
        return 'Server not reachable';
      }
    },
    [api, session],
  );

  const signOut = useCallback(async () => {
    const refresh = session.getState().tokens?.refresh;
    session.setTokens(null);
    if (refresh) {
      // Revoke the refresh token on the server; ignore failures (offline).
      await api.POST('/api/token/blacklist/', { body: { refresh } }).catch(() => {});
    }
  }, [api, session]);

  const status: AuthStatus = !loaded ? 'loading' : tokens ? 'signedIn' : 'signedOut';
  const userId = tokens ? userIdOf(tokens.access) : null;
  const value = useMemo(
    () => ({ status, api, userId, signIn, register, signOut }),
    [status, api, userId, signIn, register, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
