// Invite and claim codes: 12 characters without look-alikes (no 0, O, 1, I, L), shown in groups of four.

/** ABCDEFGHJKMN as ABCD-EFGH-JKMN. Older codes (10 characters) are grouped the same way. */
export function formatCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}
