#!/bin/sh
# Nightly backup of a production install; run from cron (docs/self-hosting.md, section 4).
#  1. A consistent copy of the database in data/django/backups/ (the last 14 stay on the disk).
#  2. If deploy/.env.backup exists: a restic backup of those copies and of the uploads (data/django/media) to
#     the repository named there, encrypted, off the server. Then old snapshots go: 30 daily and 12 monthly stay.
# The live database file is not copied by restic: a file that is being written is not a safe backup.
# Exit status 0 only if everything that is set up worked.
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

if [ ! -f .env.backup ]; then
    echo "No .env.backup: only the copy on this disk was made. Set up the off-site copy (docs/self-hosting.md, section 4)." >&2
    exit 0
fi
command -v restic >/dev/null || { echo "restic is not installed" >&2; exit 1; }
set -a
. ./.env.backup  # RESTIC_REPOSITORY and RESTIC_PASSWORD (or RESTIC_PASSWORD_FILE)
set +a

cd data/django
paths="backups"
[ -d media ] && paths="$paths media"
# shellcheck disable=SC2086  # the list is meant to split
restic backup --tag fletchr --host fletchr --quiet $paths
restic forget --tag fletchr --host fletchr --keep-daily 30 --keep-monthly 12 --prune --quiet
# On Sundays read a few percent of the stored data back: a damaged repository should show before the day it is needed.
[ "$(date +%u)" = 7 ] && restic check --read-data-subset=3% --quiet
echo "restic: backed up and cleaned up"
