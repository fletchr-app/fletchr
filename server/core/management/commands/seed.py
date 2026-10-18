from django.core.management.base import BaseCommand

from core.models import Invite, Role, Team, TeamMember, User


class Command(BaseCommand):
    help = "Create a team with one admin and print an archer invite code. Safe to run again."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--name", default="Coach")
        parser.add_argument("--team", default="Demo Club")

    def handle(self, *args, email, password, name, team, **options):
        user, created = User.objects.get_or_create(email=email.lower())
        if created:
            user.set_password(password)
            user.save()
            user.profile.name = name
            user.profile.save()
        team_obj, _ = Team.objects.get_or_create(name=team)
        TeamMember.objects.get_or_create(team=team_obj, user=user, defaults={"role": Role.ADMIN})
        invite = Invite.objects.create(team=team_obj, role=Role.ARCHER, created_by=user)
        self.stdout.write(f"Team '{team_obj}', admin {user.email} ({'created' if created else 'existing'})")
        self.stdout.write(f"Archer invite code (valid until {invite.expires_at:%Y-%m-%d}): {invite.code}")
