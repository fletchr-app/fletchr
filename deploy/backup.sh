#!/bin/sh
# Nightly backup of the database (and the uploads) of a production install; run from cron.
# Keeps the last 14 copies in deploy/data/django/backups/. Copy that folder off the server as well
# (rsync, or the provider's backup): a backup on the same disk does not survive the disk.
set -eu
cd "$(dirname "$0")"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T django python - <<'PY'
import datetime, pathlib, sqlite3
backups = pathlib.Path("/data/backups")
backups.mkdir(exist_ok=True)
target = backups / f"db-{datetime.date.today().isoformat()}.sqlite3"
source, copy = sqlite3.connect("/data/db.sqlite3"), sqlite3.connect(target)
source.backup(copy)  # a consistent copy, also while the server is writing
copy.close(); source.close()
for old in sorted(backups.glob("db-*.sqlite3"))[:-14]:
    old.unlink()
print("backup:", target)
PY
