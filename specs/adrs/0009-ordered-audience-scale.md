# One ordered audience scale for who sees what

status: accepted
date: 2026-10-30

## Context and Problem Statement

An archer wants to keep some sessions from their coaches (and, without an account, decide at upload whether old sessions are shared). Profile name and picture will get a visibility setting (#80), and a feed of other archers' training may come later (#77). Today access is per archer: a coach sees all training of the archers they coach (`archers_visible_to`). How is "who sees this" stored and checked, so the three subjects do not each invent their own rules?

## Considered Options

- **A boolean per session** (`private`). Enough for now, but #80 and #77 need more levels, and a second field would follow for each.
- **Separate enums per subject** with their own values. Each subject reads well alone, but the server would compare them in different ways, and a check that mixes subjects (a feed showing training to the team) has no common order.
- **A set of audiences per item** (coaches, team, followers, each on or off). Most flexible, but allows combinations that make no sense (team without coaches) and every route has to evaluate sets.
- **One ordered scale of strings** (`me` < `coaches` < `team` < `everyone`), a separate field per subject, each with its own default, and one filter on the server.

## Decision Outcome

The last option. The order is defined once in `server/core/access.py`; a wider level includes every narrower one. Sessions get `visibility` (default from the archer's `training_visibility`, `coaches` for new accounts; existing sessions `coaches`); media follow their session. Only `me` and `coaches` are accepted until the others are built; the server clamps. Every coach-facing route reads through `visible_to(viewer)` / `can_view`. Notes keep their own `private | coach_only | shared` field, which answers a different question.

## Consequences

- Strings in the database, compared through the order in `access.py`, never by listing values in a route.
- A new level (`followers` for #77) is inserted in one place; stored values do not change.
- Several teams per archer are not covered: a level cannot say "the coaches of team A, not of team B". A later team list beside the level is possible; the level must not encode teams.
- Every route that shows training data needs the filter. The stats and team views query shots by owner, so they need it added by hand, and a test matrix per route guards it.
