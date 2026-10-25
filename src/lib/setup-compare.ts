// Compare the equipment setups an archer shot with, on one face and distance. No Vue, so it is tested with `npm test`.
// Works from the session points of /api/stats/: nothing is fetched again.

export type SetupSession = {
  date: string;
  setup?: number | null;
  arrows: number;
  average: number;
  plotted: number;
  centre_x?: number | null;
  centre_y?: number | null;
  spread?: number | null;
};

export type SetupStats = {
  /** The setup id; null for sessions without recorded equipment. */
  setup: number | null;
  sessions: number;
  arrows: number;
  lastDate: string;
  /** Points per arrow, every arrow counting the same. */
  average: number;
  /** Arrows with a position, and what is measured from them (fractions of the spot radius): null without any. */
  plotted: number;
  /** The mean of the spreads of the sessions, plotted arrows weighing the same: how tight the group is on a day, apart from the sight drifting between days. */
  spread: number | null;
  /** Where the groups sit on average; the sight setting. */
  centreX: number | null;
  centreY: number | null;
};

/** One entry per setup, the one used most recently first. */
export function bySetup(sessions: SetupSession[]): SetupStats[] {
  const groups = new Map<number | null, SetupSession[]>();
  for (const s of sessions) groups.set(s.setup ?? null, [...(groups.get(s.setup ?? null) ?? []), s]);
  const stats = [...groups.entries()].map(([setup, list]): SetupStats => {
    const arrows = list.reduce((sum, s) => sum + s.arrows, 0)
    const measured = list.filter((s) => s.plotted > 0 && s.spread != null && s.centre_x != null && s.centre_y != null);
    const plotted = measured.reduce((sum, s) => sum + s.plotted, 0);
    const weighted = (value: (s: SetupSession) => number) => (plotted === 0 ? null : measured.reduce((sum, s) => sum + value(s) * s.plotted, 0) / plotted);
    return {
      setup,
      sessions: list.length,
      arrows,
      lastDate: list.reduce((latest, s) => (s.date > latest ? s.date : latest), ''),
      average: arrows === 0 ? 0 : list.reduce((sum, s) => sum + s.average * s.arrows, 0) / arrows,
      plotted,
      spread: weighted((s) => s.spread!),
      centreX: weighted((s) => s.centre_x!),
      centreY: weighted((s) => s.centre_y!),
    };
  });
  return stats.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));
}

/** A comparison needs two setups. */
export const comparable = (stats: SetupStats[]) => stats.length >= 2;
