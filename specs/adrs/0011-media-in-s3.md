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
- The app's `<video>` and `<img>` follow the redirect. Tested on 2026-11-16 with the Dev app on an Android phone against an IONOS bucket (Frankfurt, `eu-central-4`): photos show. The clip that played was the copy cached on the phone, so this did not test the download of a clip from the bucket.
- The app reads clips, thumbnails and photos with `fetch()` (`MediaPlayerView.vue` loads a whole clip into memory, `useMediaLibrary.ts` the thumbnails, the skeleton a photo). After the redirect to the bucket the browser sends `Origin: null`, so the bucket's CORS rule must allow `*`; a list of the app's origins (`https://localhost`) does not match and the player stays on "Loading". `<img>` and `<video>` elements do not need CORS. Found on 2026-11-17, a day after the first release: the first phone test played a clip from the copy cached on the phone.
- The bucket is private and reached with a key of a separate technical user, allowed by a bucket policy on that one bucket (IONOS keys cannot be limited to a bucket themselves).
- Deleting a clip deletes the object through the storage, as before.
