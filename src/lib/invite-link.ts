// Invite links: https://fletchr.de/join/<code>, or de.fletchr.app://join/<code> from the join page's button.

/** The code in an invite link, upper-case, or null when the address is not one. */
export function codeFromUrl(url: string): string | null {
  const match = /^(?:https:\/\/fletchr\.de\/|de\.fletchr\.app:\/\/)join\/([A-Za-z0-9]{1,20})\/?(?:[?#].*)?$/.exec(url.trim());
  return match ? match[1]!.toUpperCase() : null;
}
