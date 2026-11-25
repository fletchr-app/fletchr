# Competitions: official point counting

Status: proposed (#173)
Date: 2026-11-25

A competition is a tournament or championship with organizers, judges and a list of archers, where scores are counted officially. Every end is confirmed by someone other than the archer who shot it.

## Naming

"Event" is taken: a `TrainingEvent` is a label for a team training, a one-off one may have kind `competition`, and there is no shared session ([schedule-and-events.md](schedule-and-events.md), ADR 0008). To avoid a collision this feature is called **Competition** in code and UI. A `TrainingEvent` of kind `competition` stays a label and has nothing to do with official counting. Open: whether a competition may point at a team's `TrainingEvent` (for the schedule), or the two stay unrelated.

## Model (sketch)

- **Competition**: name, dates, location, rounds, settings (see below), `status` (`draft | open | closed`).
- **CompetitionMember**: competition, user (or a profile without an account), role `organizer | judge | archer`, optional class/division. One user may hold several roles (a judge may shoot too, but never confirms their own ends).
- **Round**: distance, face, ends, arrows per end, order. Fixed by the organizer, so an archer does not choose them.
- **TargetGroup**: round, target number, the archers on it (2 to 4). Assigned by the organizer. This is the "pair" of the discussion: per competition, not per training.
- **Session**: an archer's competition scores are an ordinary `TrainingSession` (type `competition`) linked to the round, so plotting, offline logging and upload stay as they are ([offline-sync.md](offline-sync.md)). The competition adds a **confirmation** per end.
- **EndConfirmation**: end, confirmer (a member), `state` (`accepted | rejected`), time. Append-only, so there is a history.

## Confirmation

- Per **end**. The confirmer can only **accept or reject**, never edit. Both editing would be confusing, so only the archer edits their own arrows.
- Who confirms is an organizer setting: another archer of the target group, a judge, or either. (Open: assigned ahead by the organizer, or chosen at the target.)
- A rejected end goes back to the archer, who corrects it and sends it again. A new send makes the old confirmation void.
- An end is **final** when it has the needed confirmation. A **judge can always change** an end, also a final one. Every judge change is stored with who, when and the old arrows, and the archer sees it.
- If the target mate and the archer cannot agree, a judge decides (the rule above gives them that power; no separate dispute flow in v1).
- The confirmer may not be the archer. A judge cannot confirm their own ends either.

## Results

Only final ends count. Per round and per competition: total, X/10 counts, by class. Organizers can export (CSV, PDF). An end that is not final is shown as "pending" and not counted. A live leaderboard is optional and follows the visibility rules below.

## Access

- Organizers: manage members, rounds, groups, settings; see everything in the competition.
- Judges: see and change ends of every archer in the competition.
- Archers: see their own ends and, for results, the published results of the competition. Competition ends are visible to the organizers and judges whatever the session's `visibility` (joining is the consent); coaches follow the existing rules ([session-visibility.md](session-visibility.md)). This needs a check against [roles-and-access.md](roles-and-access.md).
- Joining: invite link or code, or the organizer adds archers (also profiles without an account).

## Offline at the venue

Archery fields often have no signal. Logging stays offline-first. Confirmation needs the confirmer to see the end, which is the problem. Options:

1. **Server only (v1).** The end is uploaded, the confirmer's phone loads and confirms it. An accept or reject made offline is queued and sent later (idempotent, like session upload). Works if the organizer provides a hotspot or the field has signal.
2. **QR hand-over (later).** The archer's phone shows a QR code with the end (a few dozen bytes). The confirmer scans it, sees the arrows, taps accept, and the confirmation is queued and uploaded later. No network needed at the target, but a confirmation made offline must be checked against what the archer uploads later (hash of the end).
3. Bluetooth or NFC: not recommended, platform differences and permissions cost more than they save.

Recommendation: 1 for v1, designed so that 2 can be added (confirmation stores a hash of the end it refers to).

## Open questions

- Judge confirmation: replaces the archer-side confirmation, or only adds to it? Can a judge confirm a whole target group at once?
- Pairing outside competitions (training sessions with a witness): wanted if easy. It would reuse `EndConfirmation` with a "witness" instead of a competition member. Not part of v1.
- Trust: a self-built app cannot make scores tamper-proof. The confirmation, the history and the judge override are the integrity story. Whether federations accept that is a question for the organizers, not for the app.
- Classes, ties and shoot-offs, rankings per class.
- Which parts need a release gate (legal: results are personal data, names published to others).
