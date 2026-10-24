#!/usr/bin/env bash
# Tries deploy/update.sh against a fake server: a git remote, a fake `docker` and a fake `curl`.
# The fake docker "runs" whatever version the file VERSION in the checkout says; a VERSION of "broken" never answers.
#   deploy/tests/update_test.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export WAIT_SECONDS=2 HEALTH_URL=http://fake/health
failures=0
check() { # description, command that must succeed
    if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; failures=$((failures + 1)); fi
}

mkdir -p "$work/bin"
# docker: "up" starts what VERSION says, "pull" fails when PULL_FAILS is set, "run" records the restore, "stop" stops
cat > "$work/bin/docker" <<'D'
#!/usr/bin/env bash
case " $* " in
  *" pull "*) echo "pull $FLETCHR_IMAGE" >> "$FAKE_LOG"; [ -z "${PULL_FAILS:-}" ] ;;
  *" up "*)   echo "up $*" >> "$FAKE_LOG"; cp "$PWD/../VERSION" "$FAKE_STATE" ;;
  *" run "*)  echo restore >> "$FAKE_LOG" ;;
  *" stop "*) echo stop >> "$FAKE_LOG"; rm -f "$FAKE_STATE" ;;
esac
D
cat > "$work/bin/curl" <<'C'
#!/usr/bin/env bash
v="$(cat "$FAKE_STATE" 2>/dev/null)" || exit 7
[ "$v" != broken ] || exit 7
echo "{\"status\":\"ok\",\"version\":\"$v\",\"min_app_version\":\"0.1.0\"}"
C
chmod +x "$work/bin/docker" "$work/bin/curl"
export PATH="$work/bin:$PATH" FAKE_LOG="$work/log" FAKE_STATE="$work/state"

new_server() { # builds origin + checkout, with the real update.sh and a fake backup.sh
    rm -rf "$work/origin" "$work/server"; : > "$FAKE_LOG"; rm -f "$FAKE_STATE"
    git init -q --bare -b main "$work/origin"
    git clone -q "$work/origin" "$work/seed" 2>/dev/null
    (cd "$work/seed" && git config user.email t@t && git config user.name t
     mkdir deploy && cp "$here/deploy/update.sh" deploy/ && chmod +x deploy/update.sh
     printf '#!/bin/sh\necho backup >> "$FAKE_LOG"\n[ -z "${BACKUP_FAILS:-}" ]\n' > deploy/backup.sh && chmod +x deploy/backup.sh
     : > deploy/docker-compose.prod.yml; : > deploy/.env.prod
     echo 0.1.0 > VERSION; git add -A; git commit -qm one; git tag v0.1.0; git push -q origin main v0.1.0)
    rm -rf "$work/seed"
    git clone -q "$work/origin" "$work/server" 2>/dev/null
    echo 0.1.0 > "$FAKE_STATE"
    mkdir -p "$work/server/deploy/data"
}
release() { # version content-of-VERSION: a new commit and tag on main
    git clone -q "$work/origin" "$work/seed" 2>/dev/null
    (cd "$work/seed" && git config user.email t@t && git config user.name t
     echo "$2" > VERSION; git commit -qam "$1"; git tag "v$1"; git push -q origin main "v$1")
    rm -rf "$work/seed"
}
update() { (cd "$work/server" && deploy/update.sh "$@") > "$work/out" 2>&1; }

echo "-- a good update"
new_server; release 0.2.0 0.2.0
check "it succeeds" 'update v0.2.0'
check "the checkout is at the tag" '[ "$(git -C $work/server describe --tags --exact-match)" = v0.2.0 ]'
check "backup before the build" '[ "$(head -n 1 $FAKE_LOG)" = backup ] && grep -q "^up" $FAKE_LOG'
check "no restore" '! grep -q restore $FAKE_LOG'
check "the image of the tag is pulled and nothing is built here" 'grep -q "^pull ghcr.io/fletchr-app/fletchr-server:v0.2.0$" $FAKE_LOG && ! grep -q -- "--build" $FAKE_LOG'

echo "-- no image for the tag: it is built here"
new_server; release 0.2.0 0.2.0
check "it succeeds" 'PULL_FAILS=1 update v0.2.0'
check "built on the machine" 'grep -q -- "--build" $FAKE_LOG && grep -q "no image" $work/out'

echo "-- an empty IMAGE_BASE builds here without trying to pull"
new_server; release 0.2.0 0.2.0
check "it succeeds" 'IMAGE_BASE= update v0.2.0'
check "no pull" '! grep -q "^pull" $FAKE_LOG && grep -q -- "--build" $FAKE_LOG'

echo "-- an update that never answers goes back"
new_server; release 0.2.0 broken
before="$(git -C "$work/server" rev-parse HEAD)"
check "it fails" '! update v0.2.0'
check "the old commit is back" '[ "$(git -C $work/server rev-parse HEAD)" = "$before" ]'
check "the database is restored and the old version started again" 'grep -q restore $FAKE_LOG && [ "$(grep -c "^up" $FAKE_LOG)" = 2 ] && [ "$(cat $FAKE_STATE)" = 0.1.0 ]'
check "from the image of the old tag" '[ "$(grep -c "^pull" $FAKE_LOG)" = 2 ] && tail -n 3 $FAKE_LOG | grep -q "^pull ghcr.io/fletchr-app/fletchr-server:v0.1.0$"'

echo "-- refused before anything is touched"
new_server; release 0.2.0 0.2.0
before="$(git -C "$work/server" rev-parse HEAD)"
check "a tag that is not a release tag" '! update "v0.2.0; rm -rf /"'
check "no tag" '! update'
check "a tag that does not exist" '! update v9.9.9'
echo dirty >> "$work/server/VERSION"
check "a checkout with changes" '! update v0.2.0'
git -C "$work/server" checkout -q VERSION
check "nothing changed in any of these" '[ "$(git -C $work/server rev-parse HEAD)" = "$before" ] && ! grep -q "^up" $FAKE_LOG'
git -C "$work/server" switch -q -c other
check "a checkout that is not on main" '! update v0.2.0'
git -C "$work/server" switch -q main

echo "-- a tag that is not on main"
new_server
git -C "$work/server" switch -q -c side; git -C "$work/server" config user.email t@t; git -C "$work/server" config user.name t
echo x > "$work/server/x"; git -C "$work/server" add x; git -C "$work/server" commit -qm side; git -C "$work/server" tag v0.3.0; git -C "$work/server" push -q origin v0.3.0; git -C "$work/server" switch -q main
check "it is refused" '! update v0.3.0 && grep -q "not on main" $work/out'

echo "-- a failing backup stops everything"
new_server; release 0.2.0 0.2.0
before="$(git -C "$work/server" rev-parse HEAD)"
check "it fails" '! BACKUP_FAILS=1 update v0.2.0'
check "nothing was moved or built" '[ "$(git -C $work/server rev-parse HEAD)" = "$before" ] && ! grep -q "^up" $FAKE_LOG'

echo "-- two at once"
new_server; release 0.2.0 0.2.0
( exec 9<"$work/server/deploy"; flock 9; sleep 3 ) & sleep 0.5
check "the second is refused" '! update v0.2.0 && grep -q "another update" $work/out'
wait

[ "$failures" -eq 0 ] && echo "all fine" || { echo "$failures failed"; exit 1; }
