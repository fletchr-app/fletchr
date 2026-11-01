// Links that open the app: https://fletchr.de/join/<code> (invite) and https://fletchr.de/reset/<code> (password reset),
// or de.fletchr.app://join/<code> and de.fletchr.app://reset/<code> from the website page's button
// (the debug app, de.fletchr.app.dev, answers to de.fletchr.app.dev:// so both can be installed).

export const SITE = 'https://fletchr.de';

export type AppLink = { kind: 'join' | 'reset'; code: string };

/** What a link asks for, with the code upper-case, or null when the address is not one of ours. */
export function parseAppLink(url: string): AppLink | null {
  const match = /^(?:https:\/\/fletchr\.de\/|de\.fletchr\.app(?:\.dev)?:\/\/)(join|reset)\/([A-Za-z0-9]{1,20})\/?(?:[?#].*)?$/.exec(url.trim());
  return match ? { kind: match[1] as AppLink['kind'], code: match[2]!.toUpperCase() } : null;
}

/** The code in an invite link, or null. */
export function codeFromUrl(url: string): string | null {
  const link = parseAppLink(url);
  return link?.kind === 'join' ? link.code : null;
}

const plain = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const joinUrl = (code: string) => `${SITE}/join/${plain(code)}`;
export const resetUrl = (code: string) => `${SITE}/reset/${plain(code)}`;
