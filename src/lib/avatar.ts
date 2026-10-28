/** One or two letters for someone without a picture: the first letters of the first and the last word of the name, else of the email. */
export function initials(name: string, email = ''): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const source = words.length > 0 ? words : [email.trim()].filter(Boolean);
  if (source.length === 0) return '?';
  const first = [...source[0]][0] ?? '';
  const last = source.length > 1 ? ([...source[source.length - 1]][0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}
