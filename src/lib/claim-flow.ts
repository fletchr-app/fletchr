// The order of steps when someone signs in or registers while the phone holds local data (#93). Pure, with the
// confirmation, the move and the session passed in, so each path (upload, keep, cancel, failure) is tested with `npm test`.
import { countTotal, type LocalCounts } from './local-claim.ts';
import type { StoreOwner } from './store-owner.ts';

export type Decision = { kind: 'upload'; share: boolean } | { kind: 'keep' } | { kind: 'cancel' };

export type ClaimGate = {
  /** What the local owner holds; null when it holds nothing or cannot be read (then nothing is asked and nothing is moved). */
  counts: (localId: string) => Promise<LocalCounts | null>;
  /** The one confirmation. */
  ask: (info: { email: string; counts: LocalCounts }) => Promise<Decision>;
  /** Moves the local data into the account's stores on the device; false when that failed (the local data is then untouched). */
  upload: (args: { localId: string; account: StoreOwner; userId: number; share: boolean }) => Promise<boolean>;
};

/** Asks, unless the local owner holds nothing. `none`: no question was needed. */
export async function decide(gate: ClaimGate, localId: string | null, email: () => Promise<string>): Promise<Decision | { kind: 'none' }> {
  if (!localId) return { kind: 'none' };
  const counts = await gate.counts(localId);
  if (!counts || countTotal(counts) === 0) return { kind: 'none' };
  return gate.ask({ email: await email(), counts });
}

export type Entered = { kind: 'signedIn' } | { kind: 'cancelled' } | { kind: 'failed' };

type Account = { owner: StoreOwner; userId: number };

/**
 * The server has accepted the credentials; the tokens are not kept yet. Upload: move the data, then keep the tokens.
 * Keep on this phone only: keep the tokens, the local data stays under its key. Cancel (or a failed move): the refresh token
 * is revoked and the person stays in local mode.
 */
export async function enter(
  gate: ClaimGate,
  decision: Decision | { kind: 'none' },
  localId: string | null,
  account: Account,
  session: { commit: () => void; revoke: () => Promise<void> },
): Promise<Entered> {
  if (decision.kind === 'cancel') {
    await session.revoke();
    return { kind: 'cancelled' };
  }
  if (decision.kind === 'upload' && localId) {
    const moved = await gate.upload({ localId, account: account.owner, userId: account.userId, share: decision.share }).catch(() => false);
    if (!moved) {
      await session.revoke();
      return { kind: 'failed' };
    }
  }
  session.commit();
  return { kind: 'signedIn' };
}

/** A registration: the question comes before the request, so Cancel sends nothing and leaves no account behind. */
export async function beforeRequest<T>(
  gate: ClaimGate,
  localId: string | null,
  email: () => Promise<string>,
  send: () => Promise<T>,
): Promise<{ kind: 'cancelled' } | { kind: 'sent'; result: T; decision: Decision | { kind: 'none' } }> {
  const decision = await decide(gate, localId, email);
  if (decision.kind === 'cancel') return { kind: 'cancelled' };
  return { kind: 'sent', result: await send(), decision };
}
