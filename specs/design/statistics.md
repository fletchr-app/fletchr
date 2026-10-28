# Statistics

Status: implemented, except the points marked planned; per-feature state in [milestone 3](../plans/2026-10-23-milestone-3-deeper-stats.md)
Date: 2026-10-23
Updated: 2026-10-29

- Arrow volume per day/week/month, by distance
- Average arrow score and score per end, trend over time, per distance and face
- 10/X rate, miss rate, score distribution histogram
- Group centre (mean point of impact) and spread, per end, session, distance and setup, shown on the face; plotted as a trend so a drifting sight mark or a growing group is visible
- Heatmap of all arrows on the target face, filterable by date range, distance and setup
- Per-arrow-number grouping, to find arrows that consistently land away from the group
- Sight correction hint: how far and in which direction the group centre sits from the middle (shown in the session view from six arrows; the rule of thumb is not checked against a coach yet)
- Centred score: the group centre is moved to the middle and every arrow scored again, shown beside the real score. Not an official score. Rule in `src/lib/centred.ts` and `server/targets/centred.py`, tested against `shared/centred-vectors.json`
- Comparison by setup (e.g. before/after a limb change). The group trend has no setup picker in the app yet (the endpoint has the filter)
- Self-ratings vs. score correlation
- Coach: same charts per archer, plus team comparison and "who hasn't trained this week"

Sessions without results (a coach opened one, nothing shot yet) add nothing to any of these: every statistic is built from shots and volume entries. In the team overview such a session counts as the archer's last session, but is not shown as live until something was shot in it.

Stats are computed on the server (`/api/stats/` and friends) so every client shows identical numbers.
