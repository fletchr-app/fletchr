from django.core.management.base import BaseCommand, CommandError

from core.models import User
from core.transfer import TransferError, transfer_account


class Command(BaseCommand):
    help = "Move the data of one account to another (a person changed how they sign in). Run with --dry-run first. Not undoable: back up before."

    def add_arguments(self, parser):
        parser.add_argument("source", help="Email of the old account (its data moves, it is deactivated)")
        parser.add_argument("target", help="Email of the new account (it must have no data of its own)")
        parser.add_argument("--id", action="store_true", help="The two arguments are user ids, not emails")
        parser.add_argument("--dry-run", action="store_true", help="Show what would move, change nothing")

    def _user(self, value, by_id):
        user = User.objects.filter(pk=value).first() if by_id else User.objects.filter(email__iexact=value).first()
        if user is None:
            raise CommandError(f"No account {value}")
        return user

    def handle(self, *args, source, target, id, dry_run, **options):
        try:
            report = transfer_account(self._user(source, id), self._user(target, id), dry_run=dry_run)
        except TransferError as e:
            self.stderr.write(f"Refused, nothing changed: {e}")
            raise SystemExit(1)
        self.stdout.write(("Dry run, nothing changed. Would move:" if dry_run else "Moved:"))
        for key, n in sorted(report.moved.items()):
            self.stdout.write(f"  {key}: {n}")
        self.stdout.write(f"  team memberships: {report.memberships_moved} moved, {report.memberships_merged} already in the team")
        self.stdout.write(f"  profile picture: {'yes' if report.avatar else 'none'}")
        if not dry_run:
            self.stdout.write(f"{source} is deactivated; delete the empty account later if you like.")
