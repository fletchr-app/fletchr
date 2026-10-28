# Running your own Fletchr server

Fletchr is self-hosted: the app talks to a Django server that you run. This guide is for a Linux server with Docker and a web server (nginx, Apache, Caddy, a panel such as Plesk) in front that ends HTTPS. Use your own domain wherever `example.org` stands.

| Address | What | Served by |
|---|---|---|
| `app.example.org` | the server the app talks to (API, Django admin) | your web server in front of Django in Docker |
| `example.org` | the static website in `site/` (landing page, invite links, Impressum, privacy, account deletion) | your web server, plain files |

For a trial on your own machine, `docker compose up` in `deploy/` starts Django behind Caddy on `http://localhost:8080` (see the README). The rest of this guide is for a server on the internet. Django listens only on `127.0.0.1:8000` (`deploy/docker-compose.prod.yml`), so nothing but your web server can reach it.

## 1. DNS and the server

Point `app` (and the bare domain, for the website) to the server's IP with an A record (and AAAA for IPv6). Open only ports 22, 80 and 443 to the outside.

```bash
sudo apt install git                          # Docker is needed too
git clone https://github.com/fletchr-app/fletchr.git ~/fletchr && cd ~/fletchr
git switch main                               # the checkout on a server stays on main: releases only (specs/steering/releasing.md)
```

## 2. The web server in front

It has to: end HTTPS for `app.example.org`; pass everything to `http://127.0.0.1:8000`; set `X-Real-IP` and `X-Forwarded-Proto` (Django uses them for the client address and for rate limits); and allow request bodies of about 60 MB (a video is uploaded in one request of up to about 51 MB). Redirect HTTP to HTTPS. Do not turn on HSTS until everything has worked for a while: it is hard to undo.

Plain nginx with certbot, as a starting point (replace the domain in the files):

```bash
sudo mkdir -p /var/www/letsencrypt
sudo cp deploy/nginx/01-fletchr-http.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name fletchr -d app.example.org
sudo cp deploy/nginx/fletchr-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx/02-fletchr-https.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

In `02-fletchr-https.conf`, allow only your own IP for `/admin/` (the commented `allow`/`deny` lines), or keep the admin off the internet and use an SSH tunnel. certbot renews the certificate by itself; nginx has to reload afterwards (`/etc/letsencrypt/renewal-hooks/deploy/`). With a panel (Plesk and the like) use its screens for the certificate and the domain, and put the contents of `deploy/nginx/fletchr-proxy.conf` and the body size limit into its "additional nginx directives". With Caddy, `deploy/Caddyfile` is a working example.

## 3. Django

```bash
cd deploy
cp .env.prod.example .env.prod      # fill in DJANGO_SECRET_KEY (the command is in the file) and the addresses
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
curl -s https://app.example.org/api/health/        # {"status":"ok","version":"...","min_app_version":"..."}
```

The database and uploads are in `deploy/data/django/` (photos and videos in `media/`). Migrations run on every start. The limits are in `server/config/settings.py` (`MEDIA_MAX_*`, and the quota per archer, `DJANGO_MEDIA_QUOTA_MB`, 2048 by default). The links to media files carry a token in the address, which gunicorn's access log shows; the token works for one user and one clip for an hour.

First account (signup is invite-only):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec django \
  uv run --no-dev python manage.py seed --email you@example.org --password '...' --name "Your Name" --team "Your Club"
```

## 4. Backups

`deploy/backup.sh` does two things each night: a consistent copy of the database in `deploy/data/django/backups/` (the last 14 stay on the disk), and, once `deploy/.env.backup` exists, an encrypted restic backup of those copies and of the uploads (`deploy/data/django/media`) to a place off the server. restic copies a file only once, so a clip that is already there costs nothing on the next night. After each backup it removes old snapshots: 30 daily and 12 monthly stay. On Sundays it also reads back 3 % of the stored data to check the repository.

A copy on the same disk does not survive the disk. Without `.env.backup` the script says so in its log and only makes the local copy.

**Set up the off-site copy (once):**

1. Get storage that is not this server: a storage box or any SFTP server, or an S3 bucket (see [restic: preparing a repository](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)). With SFTP, `ssh USER@HOST` must work from the server without a password question (an SSH key for the user that runs the cron job).
2. Install restic: `sudo apt install restic`.
3. `cp deploy/.env.backup.example deploy/.env.backup`, fill in `RESTIC_REPOSITORY` and a long random `RESTIC_PASSWORD`, `chmod 600 deploy/.env.backup`. **Keep a copy of the password away from the server** (a password manager): without it the backups cannot be read, and restic cannot recover it.
4. Create the repository: `set -a; . deploy/.env.backup; set +a; restic init`
5. Run it by hand once: `deploy/backup.sh`. The last line must say `restic: backed up and cleaned up`; `restic snapshots` (with the same variables set) lists the first snapshot.
6. Run it every night:

```bash
crontab -e      # every night at 03:15; MAILTO=you@example.org at the top mails a failure
15 3 * * * /home/<you>/fletchr/deploy/backup.sh >> /home/<you>/fletchr-backup.log 2>&1
```

Look at the log now and then: a night without the `restic:` line failed.

**Restore.** Try it once after the first backup, on the side and without touching the running server:

```bash
set -a; . deploy/.env.backup; set +a
restic snapshots                                  # what there is
restic restore latest --tag fletchr --target /tmp/restore
find /tmp/restore -name 'db-*.sqlite3' | sort | tail -1     # the newest database copy
find /tmp/restore -type d -name media                       # the uploads
```

Open the database copy with `sqlite3 <file> 'select count(*) from core_user'`, and play one clip from the restored `media` folder. If you restore for real: `docker compose -f docker-compose.prod.yml --env-file .env.prod down`, copy the database copy over `deploy/data/django/db.sqlite3` (delete `db.sqlite3-wal` and `-shm` next to it) and the `media` folder into `deploy/data/django/media`, then `up -d` again. A restore from the 14 local copies works the same way, without restic.

Data a person deleted stays in older snapshots until they are removed (up to about a year with 12 monthly ones). Say so in the privacy text of your installation.

## 5. Updating

By hand, or with the script that CI uses:

```bash
cd ~/fletchr && deploy/update.sh v0.6.0
```

It makes a database backup first (`backup.sh`), moves the checkout to the tag (the tag must be on `main`, the checkout clean and on `main`), pulls the image CI built for the tag (`ghcr.io/fletchr-app/fletchr-server:vX.Y.Z`) and restarts, and waits until `/api/health/` reports that version. If it does not, it puts the database copy from before and the previous version back and exits with an error. Without that image (a fork, or the package is not public yet) it builds the image on the server instead; `IMAGE_BASE` in the environment of the script names another registry path, an empty one always builds here. What it cannot see: a migration that works but is wrong. The backup is for that. It copies the website too where `sudo` works without a password; otherwise run `deploy/site.sh` yourself when `site/` changed. (Do not turn on passwordless `rsync` as root just for this: it can write anywhere.)

### From CI on a release tag

Pushing `vX.Y.Z` (specs/steering/releasing.md) starts `.github/workflows/deploy.yml`: the tests first, then the server image is built and pushed to GHCR, then one SSH command with the tag. The key can do nothing else. The first time a tag builds the image, set the package `fletchr-server` to public (GitHub, your organisation, Packages, the package, Package settings, Change visibility): GitHub makes new packages private, and the server pulls without a login. Once:

1. On your computer: `ssh-keygen -t ed25519 -N "" -C fletchr-ci -f fletchr-deploy`.
2. On the server, in `~/.ssh/authorized_keys` of the user that owns `~/fletchr`, one line (`restrict` switches off the terminal and all forwarding):

   ```
   command="/home/<you>/fletchr/deploy/update.sh",restrict ssh-ed25519 AAAA... fletchr-ci
   ```
3. The checkout on the server must be able to `git fetch`, and the user needs `docker`, `curl` and `flock`.
4. On GitHub: Settings, Environments, New environment `production`. Its secrets:
   - `DEPLOY_SSH_KEY`: the private key file `fletchr-deploy` (then delete it from your computer)
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` (the port only if it is not 22)
   - `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 <host>` from your computer. Compare its fingerprint with the server's: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server, `ssh-keygen -lf -` on the scan. Do not skip that: it is what makes sure CI talks to your server.
   - Optional but advised: a required reviewer on the environment, so every deploy waits for a click, and a rule that only you may push tags (a tag push deploys).
5. Try the failure path once, when nobody uses the app. It points the health check at nothing, so the update must put the old version back (and with it the database copy from the start of the run):

   ```bash
   HEALTH_URL=http://127.0.0.1:9/ WAIT_SECONDS=5 deploy/update.sh v0.6.0   # the tag you are about to deploy
   curl -s http://127.0.0.1:8000/api/health/                               # the version from before
   ```

A failed run mails you from GitHub. The checks for the scripts are `deploy/tests/update_test.sh`; CI runs them on every push.

## 6. Mail (forgotten password)

The server mails a code for "Forgot password?" and a notice when a password was changed. Without a mail host it only prints them to the log (`docker compose logs django`), so nobody receives anything.

1. A mailbox for the sender, for example `noreply@example.org`, on your mail server or an SMTP service.
2. DNS for the sending domain, so the mail is not treated as spam: MX for where the domain receives mail, SPF (for example `v=spf1 a mx ~all`), DKIM (publish the key your mail server gives you) and DMARC (`_dmarc`: start with `v=DMARC1; p=none`, tighten it once SPF and DKIM pass).
3. In `deploy/.env.prod` fill `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT` (465 with `DJANGO_EMAIL_SECURITY=ssl`, or 587 with `starttls`), `DJANGO_EMAIL_USER`, `DJANGO_EMAIL_PASSWORD` and `DJANGO_EMAIL_FROM` (see `.env.prod.example`), then update.
4. Try it: "Forgot password?" in the app with a Gmail address. In Gmail, "Show original" must say `SPF: PASS` and `DKIM: PASS`. If nothing arrives, look in `docker compose logs django` for "Could not send mail".

## 7. The website and invite links

The static site in `site/` has German and English pages: a landing page, Impressum/imprint, privacy policy, the "delete your account" page (Google Play asks for its address) and the invite-link page. It is plain HTML with no build step: copy the files to the web root of your domain. **Before you publish it, replace the operator details (name and address in the Impressum and privacy pages, contact address, hosting text) with your own**, and have the privacy text checked for your installation.

`deploy/site.sh` copies `site/` to a web root owned by another user (a panel's system user) with `sudo rsync`; it takes the folder from `SITE_ROOT` in `deploy/.env.prod` (see the comments in the script) and asks before it deletes anything. Any other way to publish static files works as well.

Invite links need one rewrite: `/join/<code>` must be answered with the page `/join/index.html`, which reads the code from the address. `site/.htaccess` does that on Apache. With nginx alone:

```nginx
location ^~ /join/ {
    try_files /join/index.html =404;
    add_header Cache-Control "no-store";
    add_header Referrer-Policy "no-referrer" always;
}
location = /.well-known/assetlinks.json {
    default_type application/json;
    add_header Cache-Control "public, max-age=3600";
}
error_page 404 /404.html;
```

`deploy/nginx/03-fletchr-site.conf` is a complete nginx example for the site. For the join page to ask the server what a code is for, add the website's origin to `DJANGO_CORS_ORIGINS` in `deploy/.env.prod` (for example `https://localhost,https://example.org`) and update.

### Opening invite links in the app

On a phone with the app, `https://example.org/join/<code>` opens the app (Android App Links) with the code filled in; otherwise the page shows what the code is for. Android checks `https://example.org/.well-known/assetlinks.json` against the key the app is signed with. Fill `site/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "de.fletchr.app",
    "sha256_cert_fingerprints": ["<SHA-256 of the signing certificate>"]
  }
}]
```

The fingerprint comes from `keytool -list -v -keystore release.jks` for your own release key, or from the Play Console (App signing) for a Play Store build. The debug key can be listed as a second entry for testing.

### Web server logs

The only place with visitors' IP addresses is the web server's access log (Django's gunicorn logs the client address too, see `GUNICORN_CMD_ARGS` in `docker-compose.prod.yml`). Rotate them (for example daily, keep 7) and say how long you keep them in your privacy text.

## 8. The app

Build the app with your server address as its default, and sync it as for a release:

```bash
VITE_SERVER_URL=https://app.example.org npm run build-only
npx cap sync android
cd android && ./gradlew assembleRelease     # signed with your release key, see below
```

Users can still type another server in the app (Settings, Server address; on the sign-in screen the "change" link). Release builds need `https://` for that.

### Release signing (Android)

A release APK or bundle must be signed. Create a key once (`keytool -genkey -v -keystore release.jks -alias fletchr -keyalg RSA -keysize 2048 -validity 10000`), keep it and its password somewhere safe and outside the repository (`*.jks` is ignored): without it the app cannot be updated.
