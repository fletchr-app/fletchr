import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '@/lib/api-types';
import { expiresAt } from '@/lib/jwt';
import { loadTokens, saveTokens, type Tokens } from '@/lib/token-storage';

export type ApiClient = ReturnType<typeof createClient<paths>>;
export type SessionState = { loaded: boolean; tokens: Tokens | null };

// Endpoints that must not carry (or wait for) an access token.
const PUBLIC_PATHS = ['/api/token/', '/api/token/refresh/', '/api/token/blacklist/', '/api/register/', '/api/health/'];
const REFRESH_MARGIN_MS = 30_000;

/** Tokens for one server, kept outside React so the API client can read them at any time. */
export class AuthSession {
  state: SessionState = { loaded: false, tokens: null };
  readonly api: ApiClient;
  private listeners = new Set<() => void>();
  private refreshing: Promise<string | null> | null = null;

  constructor(readonly url: string) {
    this.api = createClient<paths>({ baseUrl: url });
    const auth: Middleware = {
      onRequest: async ({ request, schemaPath }) => {
        if (PUBLIC_PATHS.includes(schemaPath)) return;
        const access = await this.freshAccessToken();
        if (access) request.headers.set('Authorization', `Bearer ${access}`);
        return request;
      },
    };
    this.api.use(auth);
    void loadTokens(url).then((tokens) => this.update({ loaded: true, tokens }, false));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  setTokens(tokens: Tokens | null) {
    this.update({ loaded: true, tokens }, true);
  }

  private update(state: SessionState, persist: boolean) {
    this.state = state;
    if (persist) void saveTokens(this.url, state.tokens);
    this.listeners.forEach((l) => l());
  }

  // One refresh at a time; the server rotates the refresh token on every use.
  freshAccessToken(): Promise<string | null> {
    const current = this.state.tokens;
    if (!current) return Promise.resolve(null);
    if (expiresAt(current.access) - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve(current.access);
    this.refreshing ??= this.refresh(current).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(current: Tokens): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/api/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: current.refresh }),
      });
      if (res.ok) {
        const next = (await res.json()) as Tokens;
        this.setTokens(next);
        return next.access;
      }
      if (res.status === 401 || res.status === 400) this.setTokens(null); // revoked or expired
    } catch {
      // Offline: keep the tokens and let the request fail on its own.
    }
    return current.access;
  }
}
