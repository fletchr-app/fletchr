"""The photos and videos of one user as a zip, streamed so that it never sits in memory, behind a short-lived signed link."""

import datetime
import io
import zipfile

from django.core import signing

from media.models import Media

LINK_SALT = "export-media-link"
LINK_SECONDS = 10 * 60
CHUNK = 256 * 1024


def media_of(user):
    """What belongs to the user, whoever added it: it shows them."""
    return Media.objects.filter(owner=user).order_by("taken_at", "created_at")


AVATAR_NAME = "avatar.jpg"  # media files are named by their id, so no clash


def avatar_of(user):
    """The profile picture as the zip lists it: (size in bytes, when it was set), or None."""
    profile = user.profile
    if not profile.avatar:
        return None
    try:
        return profile.avatar.size, profile.avatar_updated_at or profile.user.date_joined
    except FileNotFoundError:
        return None


def file_name(media) -> str:
    return f"{media.pk}.{'mp4' if media.kind == Media.Kind.VIDEO else 'jpg'}"


def sign_link(user_id) -> str:
    return signing.dumps({"u": user_id}, salt=LINK_SALT)


def read_link(token):
    """The user id in the token, or None if it is wrong or too old."""
    try:
        return signing.loads(token, salt=LINK_SALT, max_age=LINK_SECONDS)["u"]
    except (signing.BadSignature, KeyError):
        return None


class _Sink(io.RawIOBase):
    """What the zip writes to: it keeps the bytes until the stream takes them. It cannot seek, so the zip writes sizes after the data."""

    def __init__(self):
        self.chunks = []
        self.written = 0

    def writable(self):
        return True

    def write(self, data):
        self.chunks.append(bytes(data))
        self.written += len(data)
        return len(data)

    def tell(self):
        return self.written

    def drain(self) -> bytes:
        data, self.chunks = b"".join(self.chunks), []
        return data


def stream(user):
    """The chunks of the zip. The files are stored as they are: a JPEG and an MP4 do not shrink."""
    sink = _Sink()
    with zipfile.ZipFile(sink, "w", zipfile.ZIP_STORED) as archive:
        entries = [(file_name(m), m.file, m.taken_at) for m in media_of(user)]
        if avatar_of(user):
            entries.insert(0, (AVATAR_NAME, user.profile.avatar, user.profile.avatar_updated_at or user.date_joined))
        for name, field, stamp in entries:
            when = stamp.astimezone(datetime.timezone.utc).timetuple()[:6]
            info = zipfile.ZipInfo(name, date_time=(max(when[0], 1980), *when[1:]))
            info.compress_type = zipfile.ZIP_STORED
            try:
                source = field.storage.open(field.name, "rb")
            except FileNotFoundError:
                continue  # the row is there and the file is not: nothing to give
            info.file_size = field.size
            with source, archive.open(info, "w") as target:
                while data := source.read(CHUNK):
                    target.write(data)
                    if sink.written:
                        yield sink.drain()
    yield sink.drain()
