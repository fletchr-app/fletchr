# Evaluations

Status: implemented except trends and averages (#46), see [milestone 2](../plans/2026-10-23-milestone-2-media-and-evaluations.md)
Date: 2026-10-23
Updated: 2026-10-28

- **Default form** (editable per team): the shooting technique form, 20 criteria in 5 groups, in the structure of the DSB squad technique sheet with our own wording. A team gets it when first needed, in the language of whoever asks first. Each criterion is rated **1 to 5** with an optional comment. Editing a form makes a new version; criteria keep their keys, so old evaluations stay comparable.
- **Coach-only by default**, the coach decides to share an evaluation with the archer (and can take it back), so a poor rating does not discourage an archer by accident. Archers can fill in a **self-assessment** on the same form, so coach and self ratings can be compared side by side.
- **Sharing notifies the archer**: when a coach shares an evaluation (at creation or later), the archer's phone gets a generic push if they allowed it ([push-notifications.md](push-notifications.md)). A self-assessment does not notify the coaches yet.
- **Relation to notes**: notes are quick, free-text, any time; evaluations are structured check-ups (e.g. monthly or per season). An evaluation can link to video frames as evidence, and its goals should show on the archer's home screen until the next one (planned, #46).
- **Tracking over time (planned, #46)**: per archer, a chart per criterion and per group, a radar chart comparing the latest evaluation with an earlier one, and "biggest improvements / needs attention" lists. Team view: average per criterion across archers. Later, criteria can be shown next to related measured stats (e.g. "anchor" rating next to anchor consistency from skeleton detection, or "aiming" next to group size).
