// Do the ratings an archer gives a session (physical and mental form, 1 to 5) go with the score? No Vue, so it is tested
// with `npm test`.

export type RatedSession = { arrows: number; average: number; physical_rating?: number | null; mental_rating?: number | null };
export type RatingKey = 'physical_rating' | 'mental_rating';

export type RatingBar = {
  rating: number;
  sessions: number;
  arrows: number;
  /** Points per arrow over the sessions with this rating (every arrow counts the same, like the average of a face). */
  average: number;
};

/** One entry for each rating from 1 to `scale` that at least one session has, lowest first. */
export function byRating(sessions: RatedSession[], key: RatingKey, scale = 5): RatingBar[] {
  const bars: RatingBar[] = [];
  for (let rating = 1; rating <= scale; rating++) {
    const rated = sessions.filter((s) => s[key] === rating && s.arrows > 0);
    if (rated.length === 0) continue;
    const arrows = rated.reduce((sum, s) => sum + s.arrows, 0);
    bars.push({ rating, sessions: rated.length, arrows, average: rated.reduce((sum, s) => sum + s.average * s.arrows, 0) / arrows });
  }
  return bars;
}

/** A comparison needs sessions with at least two different ratings. */
export const comparable = (bars: RatingBar[]) => bars.length >= 2;
