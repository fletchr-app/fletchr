// Reading the address of a custom server as a person types it.

export type AddressError = 'empty' | 'invalid' | 'scheme' | 'httpNotAllowed' | 'path';

/** The address without trailing slashes. Used for the default server and for stored overrides. */
export function normaliseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

/** `https://` is added when no scheme is typed. `http://` only with `allowHttp` (dev builds). No path, query or fragment. */
export function parseServerAddress(input: string, { allowHttp = false } = {}): { url: string } | { error: AddressError } {
  const text = input.trim();
  if (text === '') return { error: 'empty' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: 'invalid' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'scheme' };
  if (parsed.protocol === 'http:' && !allowHttp) return { error: 'httpNotAllowed' };
  if (parsed.hostname === '') return { error: 'invalid' };
  if ((!/^\/*$/.test(parsed.pathname)) || parsed.search !== '' || parsed.hash !== '') return { error: 'path' };
  return { url: parsed.origin };
}
