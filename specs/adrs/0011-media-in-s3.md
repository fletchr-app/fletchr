# Photos, videos and profile pictures in an S3 bucket, served by redirect

status: accepted
date: 2026-11-16

## Context and Problem Statement

Uploads lie on the server's disk (`data/django/media`), which is finite and has to be backed up with the database. A hoster with S3-compatible storage (IONOS, Berlin and Frankfurt) is cheaper per GB and has its own redundancy. Other self-hosters should be able to keep the disk. How does the app reach the files, and how do they stay private?

## Considered Options

- **Public bucket.** Simplest, but anyone with a link sees the files of minors, and the right to see a clip (`visible_media`) would no longer apply.
- **Private bucket, Django proxies every byte.** Keeps the Range code as it is, but every video passes twice through the server (bucket to server to phone), and `django-storages` reads S3 files without efficient seeking.
- **Private bucket, Django checks the right and redirects to a presigned link.** The player talks to the bucket for the bytes and its Range requests. Tested on IONOS: a presigned URL answers `Range` with `206`.

## Decision Outcome

Private bucket and a redirect. `DJANGO_S3_BUCKET` switches the default storage to `storages.backends.s3.S3Storage` (`config/settings.py`); without it nothing changes. `media.files.serve` checks as before (token or sign-in header, `visible_media`), then answers 302 to a link that expires after 5 minutes (`MEDIA_S3_LINK_SECONDS`), with `Cache-Control: no-store`. Avatars use the same function and the same storage. No object has a public ACL.

## Consequences

- A leaked link works for everybody for up to 5 minutes and cannot be revoked earlier.
- Outgoing traffic of the bucket is paid by the hoster's tariff (IONOS: first 2 TB per month free, to be confirmed on their price page).
- Existing files are copied by hand; the restic backup in `deploy/backup.sh` does not cover the bucket.
- The app's `<video>` and `<img>` follow the redirect. Tested on 2026-11-16 with the Dev app on an Android phone against an IONOS bucket (Frankfurt, `eu-central-4`): photos show, a video plays and seeks.
- The app reads thumbnails and photos with `fetch()` (`useMediaLibrary.ts`, the skeleton in `MediaPlayerView.vue`), which needs CORS on the bucket for the app's origins (`https://localhost`, `http://localhost`); `<img>` and `<video>` do not. Without the rule these fetches fail after the redirect, in every app version.
- The bucket is private and reached with a key of a separate technical user, allowed by a bucket policy on that one bucket (IONOS keys cannot be limited to a bucket themselves).
- Deleting a clip deletes the object through the storage, as before.
