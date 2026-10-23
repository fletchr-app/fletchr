// The weather of a session is one text on the server. The chips (sunny, cloudy, ...) are stored as fixed words in front of
// a ";" and the typed details after it, so a coach with another language still sees them in their own words.
export const WEATHER_TOKENS = ['sunny', 'cloudy', 'rain', 'wind'] as const;
export type WeatherToken = (typeof WEATHER_TOKENS)[number];

export type Weather = { tokens: WeatherToken[]; text: string };

const isToken = (s: string): s is WeatherToken => (WEATHER_TOKENS as readonly string[]).includes(s);

/** "sunny,wind;15 °C, light wind". Without chips: ";15 °C". Without details: "sunny". Empty when there is nothing. */
export function encodeWeather({ tokens, text }: Weather): string {
  const chips = WEATHER_TOKENS.filter((w) => tokens.includes(w)).join(',');
  const details = text.trim();
  if (!details) return chips;
  return `${chips};${details}`;
}

/** Reads what `encodeWeather` wrote. Text from elsewhere (an older entry, another client) is kept as the details. */
export function decodeWeather(stored: string): Weather {
  const semicolon = stored.indexOf(';');
  const head = semicolon === -1 ? stored : stored.slice(0, semicolon);
  const words = head === '' ? [] : head.split(',');
  const chips = words.every(isToken);
  if (semicolon === -1) return chips ? { tokens: words.filter(isToken), text: '' } : { tokens: [], text: stored.trim() };
  if (!chips) return { tokens: [], text: stored.trim() };
  return { tokens: words.filter(isToken), text: stored.slice(semicolon + 1).trim() };
}

/** For display: the chips in the reader's words, then the details. */
export function describeWeather(stored: string, word: (token: WeatherToken) => string): string {
  const { tokens, text } = decodeWeather(stored);
  return [tokens.map(word).join(', '), text].filter(Boolean).join(' · ');
}
