#!/usr/bin/env bash
# Copies site/ to the web root of your domain, as the owner of that folder (for example a panel's system user), using sudo.
# Run it as your normal user from a checkout: cd ~/fletchr && git pull && deploy/site.sh
#
# The web root comes from SITE_ROOT in deploy/.env.prod (SELFHOSTING.md, section 7), for example
#   SITE_ROOT=/var/www/vhosts/example.org/example.org
# It shows what would change, then asks. Files in the web root that are not in site/ are deleted.
#   --yes   do not ask (the changes are still printed)
set -euo pipefail
trap 'echo "site.sh: stopped unexpectedly at line $LINENO" >&2' ERR   # never end without a word

SUDO="${SUDO-sudo}"                        # empty in tests
PREFIX="${SITE_PREFIX:-/var/www/vhosts}"   # the web root must be inside this, and at least two folders below it
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo/deploy/.env.prod"
assume_yes=0
[ "${1:-}" = "--yes" ] && assume_yes=1

fail() { echo "site.sh: $*" >&2; exit 1; }

[ -d "$repo/site" ] || fail "no site/ folder in $repo"
[ -f "$env_file" ] || fail "$env_file is missing"
# Read just this one value: the file also holds secrets, and it is not a shell script.
root="$({ grep -E '^SITE_ROOT=' "$env_file" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
[ -n "$root" ] || fail "set SITE_ROOT in $env_file (the document root of your domain, see SELFHOSTING.md, section 7)"
root="${root%/}"

case "$root" in
  *..*) fail "SITE_ROOT must not contain '..'" ;;
  "$PREFIX"/*/*) ;;
  *) fail "SITE_ROOT must be a folder inside a subscription, like $PREFIX/<subscription>/<document root>, not '$root'" ;;
esac
$SUDO test -d "$root" || fail "$root does not exist (check the document root of the site)"

owner="$($SUDO stat -c %U "$root")"
group="$($SUDO stat -c %G "$root")"
[ "$owner" != root ] || fail "$root belongs to root: that is not a web root of a site"

todo="$({ grep -rIl 'class="todo"' "$repo/site" || true; } | wc -l)"   # grep finds nothing: fine, not an error
echo "From:  $repo/site/"
echo "To:    $root/   (owner $owner:$group)"
[ "$todo" -eq 0 ] || echo "Note:  $todo page(s) still have yellow TODO marks."
echo

changes="$($SUDO rsync -a --delete --itemize-changes --dry-run "$repo/site/" "$root/" | grep -v '^\.' || true)"
if [ -z "$changes" ]; then
  echo "Nothing to change: the web root already matches site/."
  exit 0
fi
echo "$changes"
echo
echo "$(echo "$changes" | grep -c '^\*deleting' || true) file(s) would be deleted."

if [ "$assume_yes" -ne 1 ]; then
  read -r -p "Apply? [y/N] " answer
  [ "$answer" = y ] || [ "$answer" = Y ] || fail "stopped, nothing changed"
fi
$SUDO rsync -a --delete --chown="$owner:$group" "$repo/site/" "$root/"
echo "Done. Check https://fletchr.de/"
