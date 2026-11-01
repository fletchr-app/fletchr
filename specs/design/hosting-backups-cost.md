# Self-hosted deployment, backups and cost

Status: implemented; push notifications are described in [push-notifications.md](push-notifications.md)
Date: 2026-10-23
Updated: 2026-10-28

The step-by-step operator guide is [SELFHOSTING.md](../../SELFHOSTING.md).

- **Server**: a Linux virtual server running Docker. `app.fletchr.de` is Django in Docker behind the web server; `fletchr.de` is the static website in `site/` (`SELFHOSTING.md`). Any Linux box with Docker works too. The server lives in `deploy/docker-compose.prod.yml` (Django only, on `127.0.0.1:8000`); nginx, Apache or a panel such as Plesk ends HTTPS.
- **Setup**: on the server only Django runs in Docker (gunicorn; no ffmpeg is needed: the phone converts videos). For local trials `deploy/docker-compose.yml` adds Caddy, which also serves the web build. Milestone 5 would add the Python pose worker. A release tag updates the server from CI (`deploy/update.sh`: backup, pull the image, restart, health check, rollback), see [releasing.md](../steering/releasing.md).
- **Domain**: `fletchr.de`; `app.fletchr.de` is what the app talks to.
- **Backups** (`deploy/backup.sh`): nightly, first a consistent snapshot of the database (14 daily SQLite copies kept on the disk), then, with `deploy/.env.backup` set up, an encrypted restic backup of the copies and the uploads to a storage box. restic is incremental, so each video is copied only once. 30 daily and 12 monthly copies kept. Data an archer has deleted stays in older backups until they rotate out (at most about a year); the privacy texts say so. The script was tested against a local repository, including a restore; the off-site setup on the real server is still open.
- **Monitoring**: a free uptime check (e.g. Uptime Kuma or a hosted pinger) and unattended security updates on the server.
- **Email**: the password-reset code and the "password was changed" notice are sent by the server itself through a mailbox of the domain. Sign-in uses password and email only.
- **Push notifications**: Android through Firebase Cloud Messaging's HTTP v1 API (`@capacitor/push-notifications` in the app), sent by the server for a new shared note, a shared evaluation and a used invite or claim code; see [push-notifications.md](push-notifications.md). Off without a Firebase key. Apple's push service (iOS) and standard Web Push are not built.

**Same setup locally and on the server.** Local and server differ in the compose file (`docker-compose.yml` with Caddy, `docker-compose.prod.yml` behind your web server) and the `.env` file:

| | Local (your laptop/PC or home server) | Virtual server |
|---|---|---|
| Start | `docker compose up` in `deploy/` | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`, or a release tag |
| Address | `http://localhost:8080` (web app + API), Django admin at `/admin/` | `https://archery.example.de` |
| HTTPS | Off (or Caddy's local certificate) | Automatic via Let's Encrypt |
| Data | `./data` folder next to the compose file | Same, on the server's disk |
| Backups | Optional (e.g. to an external disk) | Nightly off-site (above) |
| Phones | Debug build on the same Wi-Fi uses `http://<your PC's LAN IP>:8080` (needs `androidScheme: 'http'`, see the README); from outside, a tunnel (e.g. Tailscale or Cloudflare Tunnel) | Public domain |

Without Docker, the server also runs with `uv run python manage.py runserver` in `server/`. Moving from local to the server is copying the `data` folder (or restoring a backup) and starting the production compose file there. The app's server address is a setting, so one build can point at either.

Rough running cost:

| Item | Cost |
|---|---|
| VPS (2 vCPU, 4 GB, 40 GB) | about €5/month |
| Off-site backup storage (storage box or object storage) | about €3 to €4/month |
| Extra video storage if needed (100 GB volume or object storage) | about €5/month, only once the disk fills |
| Domain | about €1/month |
| Apple Developer account (needed for iOS App Store) | $99/year |
| Google Play developer account | $25 once |

So roughly **€10/month plus the store accounts**. Videos are the main growth driver: at 720p a 1-minute clip is about 40 to 80 MB, so the roughly 30 GB left on a 40 GB server after the system holds about 400 to 700 clips before extra storage is needed.
