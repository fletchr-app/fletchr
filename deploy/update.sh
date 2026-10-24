#!/usr/bin/env bash
# Updates the server to a release tag: deploy/update.sh v0.6.0
# CI runs it over SSH with a key that can do nothing else (docs/deploy.md, step 9): in authorized_keys the key has
#   command="/home/<you>/fletchr/deploy/update.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding
# and the tag arrives as the command CI asked for (SSH_ORIGINAL_COMMAND).
#
# What it does, in this order:
#   1. checks: a tag that exists, is on main, and a clean checkout that is on main
#   2. a database backup (deploy/backup.sh); if that fails, nothing is changed
#   3. moves the checkout to the tag (fast-forward only) and rebuilds and restarts the container
#   4. waits until /api/health/ reports the version of the tag
#   5. if that does not happen: puts back the database copy from step 2 and the previous version, and exits with an error
# The website (deploy/site.sh) is copied too where passwordless sudo is available.
# What step 5 cannot see: a migration that works but is wrong. The backup of step 2 is for that.
set -euo pipefail
trap 'echo "update: stopped unexpectedly at line $LINENO" >&2' ERR

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${1:-${SSH_ORIGINAL_COMMAND:-}}"
health_url="${HEALTH_URL:-http://127.0.0.1:8000/api/health/}"
wait_seconds="${WAIT_SECONDS:-90}"

say() { echo "update: $*"; }
fail() { echo "update: $*" >&2; exit 1; }
compose() { (cd "$repo/deploy" && docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"); }
git_() { git -C "$repo" "$@"; }

# The tag comes from outside: only this shape is accepted, nothing is passed on to a shell.
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "give a release tag like v0.6.0, not '${tag:0:40}'"
version="${tag#v}"

mkdir -p "$repo/deploy/data"
exec 9>"$repo/deploy/data/update.lock"
flock -n 9 || fail "another update is running"

healthy() { # the server answers with this version
    local body
    body="$(curl -fsS --max-time 3 "$health_url" 2>/dev/null)" || return 1
    [[ "$body" == *"\"version\":\"$1\""* ]]
}
wait_healthy() {
    for _ in $(seq 1 "$wait_seconds"); do
        healthy "$1" && return 0
        sleep 1
    done
    return 1
}

git_ fetch --quiet --tags origin
git_ rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null || fail "there is no tag $tag"
git_ merge-base --is-ancestor "refs/tags/$tag" origin/main || fail "$tag is not on main: only releases are deployed"
[ "$(git_ symbolic-ref --short HEAD)" = main ] || fail "the checkout is not on main"
[ -z "$(git_ status --porcelain --untracked-files=no)" ] || fail "the checkout has changes: nothing is touched"
previous="$(git_ rev-parse HEAD)"

say "backup first"
"$repo/deploy/backup.sh" || fail "the backup failed: nothing was changed"

say "from ${previous:0:7} to $tag"
git_ merge --ff-only --quiet "refs/tags/$tag" || fail "the checkout cannot be moved to $tag without a merge: nothing was changed"
if compose up -d --build && wait_healthy "$version"; then
    say "$tag is running"
else
    echo "update: $tag did not start as version $version (within ${wait_seconds} s): going back" >&2
    compose stop django || true
    # The newest database copy is the one from step 2. It is restored inside the container: the files belong to its user.
    compose run --rm --no-deps -T django sh -c 'f=$(ls -1 /data/backups/db-*.sqlite3 | sort | tail -n 1) && cp "$f" /data/db.sqlite3 && rm -f /data/db.sqlite3-wal /data/db.sqlite3-shm && echo "database restored from $f"' || echo "update: the database could not be restored: do it by hand (docs/deploy.md, step 6)" >&2
    git_ reset --hard --quiet "$previous"
    compose up -d --build
    echo "update: the version from before is started again; anything written since the backup is gone" >&2
    exit 1
fi

if sudo -n true 2>/dev/null; then
    "$repo/deploy/site.sh" --yes || say "the website was not copied (deploy/site.sh failed): run it by hand"
else
    say "the website is not copied here (no passwordless sudo): run deploy/site.sh when it changed"
fi
