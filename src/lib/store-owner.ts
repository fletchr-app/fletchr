// Whose data a store holds. An account on a server today; a person without an account or server later (#93).
// Pure, so the keys can be tested. The account form is the one the log and the media queue have always used,
// so what is already on a phone loads without a migration.
export type StoreOwner = { kind: 'account'; server: string; userId: string } | { kind: 'local'; id: string };

export type StoreName = 'log' | 'media' | 'equipment' | 'notes' | 'library' | 'note-library';

export const ownerKey = (owner: StoreOwner): string => (owner.kind === 'account' ? `${owner.server}:${owner.userId}` : `local:${owner.id}`);

export const storeKey = (name: StoreName, owner: StoreOwner): string => `${name}:${ownerKey(owner)}`;
