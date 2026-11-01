# Push notifications through FCM's HTTP v1 API, sent after the commit

status: accepted
date: 2026-11-01

## Context and Problem Statement

Archers should hear when a coach shares a note or an evaluation (#26, #27). Android needs Firebase Cloud Messaging for that. The server has no job queue, runs three gunicorn workers and is self-hosted by others, who may not want Google involved. How does the server send, and what happens when Firebase is slow or down?

## Considered Options

- **firebase-admin.** The official library. It pulls in Firestore, Storage, grpc and protobuf (tens of MB, native wheels that can lag a new Python) to send one POST.
- **HTTP v1 with `google-auth` and `requests`.** Both are already dependencies (Google sign-in). `AuthorizedSession` with the service account key refreshes the OAuth token itself. About 80 lines of our own code.
- **A queue (Celery, a table and a worker).** Sends outside the request, survives restarts. A new moving part for a server that has none.
- **In the request, after the commit, with short timeouts.** Simple. A slow Firebase adds seconds to a save, bounded by a budget.

## Decision Outcome

HTTP v1 with the libraries we have, sent in the request thread from `transaction.on_commit`, with a connect/read timeout of 2 and 3 seconds per call and 5 seconds per event; every failure is caught and logged, so saving a note works whatever Firebase does. Devices that Firebase calls gone (`UNREGISTERED`, `SENDER_ID_MISMATCH`) are deleted. Push is off unless `DJANGO_FCM_CREDENTIALS` names a readable key, and the settings per type live on the profile, so the server sends nothing to Google for a type that is off. Texts are generic and follow the language each phone reported.

## Consequences

- A slow Firebase can add up to about 5 seconds to a save that notifies. If that shows in practice, `core/mail.py`'s `run_in_background` thread is a one-line switch, at the price of a push lost when a worker is recycled.
- A message is sent once per change from "unreadable" to "readable" for the archer, so the offline queue repeating a request never repeats a push.
- Self-hosters need their own Firebase project and app build, or leave push off. The official app only offers push on the official server.
- A message that fails for a reason that may pass is dropped, not retried.
