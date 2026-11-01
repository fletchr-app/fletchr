import { Capacitor } from '@capacitor/core';
import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import type { components } from '@/lib/api-types';
import { type ApiClient, AuthSession } from '@/lib/auth-session';
import { type AuthStatus, authStatus, needsLocal } from '@/lib/auth-status';
import { currentLanguage, t } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { jwtPayload, userIdOf } from '@/lib/jwt';
import { beforeRequest, type ClaimGate, type Decision, decide, enter } from '@/lib/claim-flow';
import type { Tokens } from '@/lib/token-storage';
import { useServer } from '@/composables/useServer';
import { googleErrorKey } from '@/lib/google-errors';
import { GOOGLE_WEB_CLIENT_ID, googleIdToken } from '@/lib/social-login';
import { useLocalMode } from '@/composables/useLocalMode';
import type { StoreOwner } from '@/lib/store-owner';

export type RegisterBody = components['schemas']['RegisterRequest'];

const { url, isOverride, setUrl } = useServer();

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

/** Make `address` (or the default, for null) the server and wait until the session for it has loaded its tokens. */
async function switchServer(address: string | null): Promise<void> {
  setUrl(address);
  await nextTick(); // the watcher above builds the new session
  if (state.value.loaded) return;
  await new Promise<void>((resolve) => {
    const stop = watch(state, (s) => {
      if (s.loaded) {
        stop();
        resolve();
      }
    });
  });
}

// The client of the current session, so screens can keep one `api` for as long as the app runs.
const api = new Proxy({} as ApiClient, {
  get: (_, key) => Reflect.get(session.value.api, key),
});

// Local mode: the flag and the owner id are kept on the device. Signing in turns the flag off (the id and the data stay).
const local = useLocalMode();
const localOn = local.on;
const localId = local.id;
const localLoaded = local.loaded;

// Set when starting local mode failed, so the person gets the sign-in screen instead of waiting for ever.
const localFailed = ref(false);
const facts = computed(() => ({
  loaded: state.value.loaded && localLoaded.value,
  hasTokens: !!state.value.tokens,
  localOn: localOn.value,
  localFailed: localFailed.value,
}));
/** `local`: no account and no server, everything stays on the phone (#93). */
const status = computed<AuthStatus>(() => authStatus(facts.value));
const isLocal = computed(() => status.value === 'local');

/** Id of the signed-in user, read from the access token so it is known offline. */
const userId = computed(() => (state.value.tokens ? userIdOf(state.value.tokens.access) : null));

/** Whose data the stores on the device hold: the signed-in account on this server, or the local owner. Null while signed out. */
const storeOwner = computed<StoreOwner | null>(() =>
  userId.value !== null
    ? { kind: 'account', server: url.value, userId: String(userId.value) }
    : isLocal.value && localId.value
      ? { kind: 'local', id: localId.value }
      : null,
);

watch(
  () => state.value.tokens,
  (tokens) => {
    if (tokens && localOn.value) void local.leave();
  },
  { immediate: true },
);

/** Use the app without an account or server. Data of an earlier local use comes back. */
const enterLocal = local.enter;

// A phone with no tokens and no flag (first launch, or tokens revoked by the server) starts in local mode. `status` stays
// `loading` until that is done, so the router never sees a signed-out phone and the first screen is Home.
watch(
  () => needsLocal(facts.value),
  (needed) => {
    if (needed) enterLocal().catch(() => (localFailed.value = true));
  },
  { immediate: true },
);

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

// Whoever holds local data is asked once, before it goes to the account (#93). The confirmation and the move need the
// stores, which build on this file, so `useLocalClaim` registers them here. Without a gate nothing is asked or moved.
let claimGate: ClaimGate | null = null;
export function setClaimGate(gate: ClaimGate) {
  claimGate = gate;
}
const NO_GATE: ClaimGate = { counts: async () => null, ask: async () => ({ kind: 'keep' }), upload: async () => false };

/** Revoke a refresh token on the server; failures (offline) are ignored. */
const revoke = (refresh: string) => api.POST('/api/token/blacklist/', { body: { refresh } }).then(() => {}, () => {});

/** The email of the account the tokens belong to, for the confirmation; `fallback` when the server cannot say. */
async function accountEmail(access: string, fallback: string): Promise<string> {
  try {
    const { data } = await api.GET('/api/me/', { headers: { Authorization: `Bearer ${access}` } });
    return data?.email || fallback;
  } catch {
    return fallback;
  }
}

/** The server accepted the credentials. Asks about local data when there is some (unless it was asked before the request), then keeps the tokens. */
async function accept(tokens: Tokens, email: string, asked: Decision | { kind: 'none' } | null, registered: boolean): Promise<string | null> {
  const gate = claimGate ?? NO_GATE;
  const id = userIdOf(tokens.access);
  const commit = () => session.value.setTokens(tokens);
  if (id === null) {
    commit();
    return null;
  }
  const decision = asked ?? (await decide(gate, localId.value, () => accountEmail(tokens.access, email)));
  const account = { owner: { kind: 'account', server: url.value, userId: id } as StoreOwner, userId: Number(id) };
  const result = await enter(gate, decision, localId.value, account, { commit, revoke: () => revoke(tokens.refresh) });
  return result.kind === 'failed' ? t(registered ? 'claim.failedRegistered' : 'claim.failed') : null;
}

// The sign-in functions return an error message, or null on success (and when the person cancelled the confirmation).
async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await api.POST('/api/token/', { body: { email: email.trim(), password } });
    if (!data) return errorMessage(error);
    return await accept({ access: data.access, refresh: data.refresh }, email.trim(), null, false);
  } catch {
    return t('common.serverNotReachable');
  }
}

async function register(body: RegisterBody): Promise<string | null> {
  try {
    const email = body.email.trim();
    const sent = await beforeRequest(claimGate ?? NO_GATE, localId.value, async () => email, () =>
      api.POST('/api/register/', { body: { ...body, email, invite_code: body.invite_code.trim() } }),
    );
    if (sent.kind === 'cancelled') return null;
    const { data, error } = sent.result;
    if (!data) return errorMessage(error);
    return await accept({ access: data.access, refresh: data.refresh }, email, sent.decision, true);
  } catch {
    return t('common.serverNotReachable');
  }
}

/** Google sign-in is offered by the official server only (its Google project is tied to the app): not with another server address, not in the browser. */
const googleAvailable = computed(() => GOOGLE_WEB_CLIENT_ID !== '' && !isOverride.value && Capacitor.isNativePlatform());

export type GoogleResult = { error: string | null; noAccount?: boolean };

/** Sign in with Google, or register with an invite or claim code. `error` is null on success and also when the person cancels the chooser. */
async function signInWithGoogle(inviteCode?: string): Promise<GoogleResult> {
  try {
    const idToken = await googleIdToken();
    if (!idToken) return { error: null };
    const code = inviteCode?.trim();
    const post = () => api.POST('/api/auth/google/', { body: { id_token: idToken, ...(code ? { invite_code: code } : {}) } });
    // A code makes it a registration: ask before the request. Without one it can only sign in: ask after.
    const sent = code
      ? await beforeRequest(claimGate ?? NO_GATE, localId.value, async () => String(jwtPayload(idToken)?.email ?? ''), post)
      : { kind: 'sent' as const, result: await post(), decision: null };
    if (sent.kind === 'cancelled') return { error: null };
    const { data, error } = sent.result;
    if (!data) {
      const key = googleErrorKey(error);
      return { error: key ? t(key) : errorMessage(error), noAccount: key === 'auth.google.noAccount' };
    }
    return { error: await accept({ access: data.access, refresh: data.refresh }, '', sent.decision, !!code) };
  } catch (e) {
    // A plugin failure (Google not set up for this build, no Play services) is not the same as no network.
    return { error: e instanceof TypeError ? t('common.serverNotReachable') : t('auth.google.failed') };
  }
}

// Work that needs the tokens and so has to be done before they go: `usePush` removes the phone from the server here.
let beforeSignOut: (() => Promise<void>) | null = null;
export function setBeforeSignOut(hook: () => Promise<void>) {
  beforeSignOut = hook;
}

async function signOut(): Promise<void> {
  await beforeSignOut?.().catch(() => {});
  const refresh = session.value.getState().tokens?.refresh;
  await enterLocal(); // before the tokens go, so the app never shows a signed-out state and lands on Home
  session.value.setTokens(null);
  if (refresh) await revoke(refresh);
}

/** After a password change the server hands out new tokens (every other session is signed out): keep these. */
function replaceTokens(tokens: { access: string; refresh: string }) {
  session.value.setTokens(tokens);
}

export function useAuth() {
  return { status, isLocal, switchServer, enterLocal, api, userId, storeOwner, signIn, register, googleAvailable, signInWithGoogle, signOut, replaceTokens };
}
