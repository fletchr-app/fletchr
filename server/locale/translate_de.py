"""Fills the German catalog (locale/de/LC_MESSAGES/django.po) from the table below, then compile with Babel (docs/i18n.md)."""
from babel.messages.pofile import read_po, write_po

DE = {
    "Invalid or expired invite code": "Ungültiger oder abgelaufener Einladungscode",
    "You are already a member of this team": "Du bist schon Mitglied dieses Teams",
    "Invalid or expired code": "Ungültiger oder abgelaufener Code",
    "You are a coach in this team. A profile of an archer can only be taken over by an archer.": "Du bist in diesem Team Trainer. Das Profil eines Schützen kann nur von einem Schützen übernommen werden.",
    "An account with this email already exists": "Ein Konto mit dieser E-Mail-Adresse gibt es schon",
    "A team needs a name": "Ein Team braucht einen Namen",
    "An archer needs a name": "Ein Schütze braucht einen Namen",
    "Wrong password": "Falsches Passwort",
    "Choose a different password": "Wähle ein anderes Passwort",
    "This address is not available": "Diese Adresse ist nicht verfügbar",
    "You already manage %(n)s teams": "Du verwaltest schon %(n)s Teams",
    "Only team admins can delete the team": "Nur Team-Admins können das Team löschen",
    "Only team admins can rename the team": "Nur Team-Admins können das Team umbenennen",
    "Only team admins can change roles": "Nur Team-Admins können Rollen ändern",
    "A team needs at least one admin": "Ein Team braucht mindestens einen Admin",
    "Only team admins can remove members": "Nur Team-Admins können Mitglieder entfernen",
    "Only team admins can manage invites": "Nur Team-Admins können Einladungen verwalten",
    "Only coaches can manage the archers of a team": "Nur Trainer können die Schützen eines Teams verwalten",
    "Only coaches can choose this: archers' sessions are always visible to their coaches": "Nur Trainer können das wählen: Die Trainings von Schützen sind für ihre Trainer immer sichtbar",
    "You are the only admin. Make someone else an admin first, or delete the team.": "Du bist der einzige Admin. Mach zuerst jemand anderen zum Admin oder lösche das Team.",
    "This account no longer exists": "Dieses Konto gibt es nicht mehr",
    "Not your bow": "Das ist nicht dein Bogen",
    "Not your arrow set": "Das ist nicht dein Pfeilsatz",
    "This has been used in a session. Deactivate it instead of deleting it.": "Das wurde in einem Training benutzt. Deaktiviere es, statt es zu löschen.",
    "A note cannot be empty": "Eine Notiz darf nicht leer sein",
    "This cannot be changed after the note is written": "Das lässt sich nach dem Schreiben der Notiz nicht mehr ändern",
    "Only coaches can write notes": "Nur Trainer können Notizen schreiben",
    "You cannot write notes about this archer in that team": "In diesem Team kannst du keine Notizen über diesen Schützen schreiben",
    "You cannot write notes about this person": "Über diese Person kannst du keine Notizen schreiben",
    "You coach this archer in several teams: say which one": "Du trainierst diesen Schützen in mehreren Teams: Gib an, in welchem",
    "This is not a session of that archer": "Das ist kein Training dieses Schützen",
    "Give the session this end belongs to": "Gib das Training an, zu dem diese Passe gehört",
    "Give the id of the archer": "Gib die ID des Schützen an",
    'Type the words "%(word)s" to confirm': 'Tippe zur Bestätigung "%(word)s" ein',
    "You are the only admin of %(teams)s. Make someone else an admin there first.": "Du bist der einzige Admin von %(teams)s. Mach dort zuerst jemand anderen zum Admin.",
    "Give both x and y, or neither": "Gib x und y an, oder keines von beiden",
    "Position is out of range": "Die Position liegt außerhalb des Bereichs",
    "Unknown target face": "Unbekannte Scheibe",
    "More shots than arrows per end": "Mehr Schüsse als Pfeile pro Passe",
    "Duplicate shot id": "Doppelte Schuss-ID",
    "Shot %(n)s: this face has no spot %(spot)s": "Schuss %(n)s: Diese Scheibe hat keinen Spot %(spot)s",
    "Shot %(n)s: this face has no scores, place the arrow on it": "Schuss %(n)s: Diese Scheibe hat keine Werte, setze den Pfeil auf die Scheibe",
    "Shot %(n)s: %(value)s is not a score on this face": "Schuss %(n)s: %(value)s ist kein Wert auf dieser Scheibe",
    "Shot %(n)s: this face has no X ring": "Schuss %(n)s: Diese Scheibe hat keinen X-Ring",
    "Arrows go with a bow: choose the bow too": "Pfeile gehören zu einem Bogen: Wähle auch den Bogen",
    "Only the archer can change a session": "Nur der Schütze kann ein Training ändern",
    "This end id belongs to another session": "Diese Passen-ID gehört zu einem anderen Training",
    "Another end of this session has this index": "Eine andere Passe dieses Trainings hat diesen Index",
    "A shot id is already used in another end": "Eine Schuss-ID wird schon in einer anderen Passe verwendet",
    "This entry id belongs to another session": "Diese Eintrags-ID gehört zu einem anderen Training",
    "Only coaches can see the team overview": "Nur Trainer können die Teamübersicht sehen",
    "owner and weeks must be numbers": "owner und weeks müssen Zahlen sein",
    "Between 1 and 52": "Zwischen 1 und 52",
    "Unknown time zone": "Unbekannte Zeitzone",
    "Enter a date of birth in the past": "Gib ein Geburtsdatum in der Vergangenheit ein",
    "Fletchr: reset your password": "Fletchr: Passwort zurücksetzen",
    "Someone asked to reset the password of your Fletchr account.\n\nYour code: %(code)s\n\nType it in the app. It works for one hour. If this was not you, ignore this mail: your password stays as it is.": "Jemand hat darum gebeten, das Passwort deines Fletchr-Kontos zurückzusetzen.\n\nDein Code: %(code)s\n\nGib ihn in der App ein. Er gilt eine Stunde. Wenn du das nicht warst, ignoriere diese Mail: Dein Passwort bleibt, wie es ist.",
    "Fletchr: your password was changed": "Fletchr: Dein Passwort wurde geändert",
    "The password of your Fletchr account was changed just now.\n\nIf this was you, there is nothing to do. If not, set a new password in the app (Sign in, then Forgot password?) and check who else knows your email password.": "Das Passwort deines Fletchr-Kontos wurde gerade geändert.\n\nWenn du das warst, musst du nichts tun. Wenn nicht, setze in der App ein neues Passwort (Anmelden, dann Passwort vergessen?) und prüfe, wer sonst dein E-Mail-Passwort kennt.",
    "This session belongs to another archer": "Dieses Training gehört einem anderen Schützen",
    "A video must be an MP4 file": "Ein Video muss eine MP4-Datei sein",
    "The video is larger than %(n)s MB": "Das Video ist größer als %(n)s MB",
    "The video is longer than %(n)s seconds": "Das Video ist länger als %(n)s Sekunden",
    "A photo must be a JPEG file": "Ein Foto muss eine JPEG-Datei sein",
    "The photo is larger than %(n)s MB": "Das Foto ist größer als %(n)s MB",
    "The preview must be a small JPEG file": "Die Vorschau muss eine kleine JPEG-Datei sein",
    "There is no room left for this archer's photos and videos": "Für die Fotos und Videos dieses Schützen ist kein Platz mehr",
    "Only the archer can change their photos and videos": "Nur der Schütze kann seine Fotos und Videos ändern",
}

PATH = "locale/de/LC_MESSAGES/django.po"
with open(PATH, "rb") as f:
    catalog = read_po(f, locale="de")
missing = [m.id for m in catalog if m.id and m.id not in DE]
assert not missing, f"no German text for: {missing}"
for message in catalog:
    if message.id:
        message.string = DE[message.id]
        message.flags.discard("fuzzy")
with open(PATH, "wb") as f:
    write_po(f, catalog, width=100)
print(len([m for m in catalog if m.id]), "texts translated")
