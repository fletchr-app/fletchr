# Sign-in methods are separate accounts, no linking and no email matching

status: proposed
date: 2026-10-28

## Context and Problem Statement

Google sign-in (#78) comes next to email and password, Sign in with Apple later. The same person can end up with two ways in. Should the server connect them?

Every automatic connection is an account-takeover risk. Matching by email trusts the provider's `email_verified` and the old account's address (which may have been changed or reused). Linking from Settings needs a second proof of identity (password of the old account plus a Google token), and a password-less account has no second proof. The user base is small (clubs), accounts are invite-only, and an admin is close at hand.

## Considered Options

- Match by email: a Google token with the address of an existing account signs in to that account.
- Link in Settings: signed in with one method, the person attaches the other.
- Separate accounts, no automatic connection. An admin can attach a Google identity to an existing account (one row), or move the data to the new account (`transfer_account`).

## Decision Outcome

Separate accounts. A Google `sub` belongs to exactly one account (`SocialIdentity`, unique on provider and subject); an unknown `sub` never signs in to an existing account, even when the verified address is the same (the call is refused with a clear message). Only an admin connects things, by hand.

## Consequences

- No takeover through a provider that returns a wrong or recycled address, and no code for linking, unlinking and "last method" rules.
- A person who changes method needs an admin once. Cheap case: attach the identity or change the email (nothing moves). Expensive case: `transfer_account`.
- Someone who registers twice by mistake has two accounts; the admin resolves it with the transfer.
- Accounts made with Google have no password: change password, change email and reset do not apply to them.
- Sign in with Apple follows the same rule, and its private relay addresses make email matching impossible anyway.

Plan: [2026-10-28-google-sign-in.md](../plans/2026-10-28-google-sign-in.md).
