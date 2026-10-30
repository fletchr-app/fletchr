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

## On the device (#93)

A person without an account has no server to compute anything, so `src/lib/stats.ts` computes the same numbers from the sessions on the phone: `computeStats` (volume per week, month and total, scores per face and distance with the points per session), `computeArrowStats` (numbered arrows) and `positionsOf` (the heatmap), plus `fromLog` that turns the log into their input (shots with a position are scored again from the position, as the server does on upload; setups and arrow sets are numbered from the revisions the sessions used). The screens (`StatsView`, `StatsHeatmapView`) use it in local mode; with an account they still read the server.

The two implementations are tied together by `shared/stats-vectors.json`: inputs written by hand, the expected results of the server's functions (reviewed by reading; positions from a plain filter and sort). `server/training/tests/test_stats_vectors.py` runs the server against it, `src/lib/stats.test.ts` the app. If they disagree, the app is changed.

What had to be copied from Python so that numbers are equal, not just close:
- **Rounding**: Python's `round` rounds the exact value and an exact tie to the even digit; `Math.round` rounds ties up. `0.03125` is `0.0312` in Python. `py-math.ts` has `pyRound`.
- **Summing**: since Python 3.12 `sum` of floats uses a running error term, which changes the last bit and so the sign of a value near zero (`-0` in JSON) and some ties. `pySum` does the same; `centred.ts` uses it too.
- **Time**: a session is dated by its day in the viewer's time zone (`Intl`), weeks start on Monday.
- **Not covered**: `math.hypot` (Python) and `Math.hypot` may differ in the last bit; that only matters at a tie of the fourth decimal, none occurs in the fixture. A start time in a daylight-saving gap is handled by the day comparison, not by building the local midnight as the server does.
