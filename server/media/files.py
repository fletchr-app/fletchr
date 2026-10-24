"""Checks on uploaded files, signed links for the player, and answering Range requests."""

import re

from django.conf import settings
from django.core import signing
from django.http import HttpResponse, StreamingHttpResponse

LINK_SALT = "media-link"
CHUNK = 64 * 1024


def is_jpeg(upload) -> bool:
    upload.seek(0)
    head = upload.read(3)
    upload.seek(0)
    return head == b"\xff\xd8\xff"


def is_mp4(upload) -> bool:
    """An MP4 (or MOV) file starts with a box whose type is 'ftyp'."""
    upload.seek(0)
    head = upload.read(12)
    upload.seek(0)
    return head[4:8] == b"ftyp"


def sign_link(media_id, user_id) -> str:
    """A token for the <video> and <img> elements, which cannot send the sign-in header. Valid for one user and one clip."""
    return signing.dumps({"m": str(media_id), "u": user_id}, salt=LINK_SALT)


def read_link(token, media_id):
    """The user id in the token, or None if it is wrong, for another clip, or too old."""
    try:
        data = signing.loads(token, salt=LINK_SALT, max_age=settings.MEDIA_LINK_SECONDS)
    except signing.BadSignature:
        return None
    return data["u"] if data.get("m") == str(media_id) else None


def serve(request, field, content_type):
    """The file with support for the Range header (the player seeks with it). Django's FileResponse has none."""
    size = field.size
    start, end, status = 0, size - 1, 200
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", request.headers.get("Range", "").strip())
    if match and match.group(0) != "bytes=-":
        first, last = match.groups()
        if first == "":
            start = max(size - int(last), 0)
        else:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        if start > end or start >= size:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{size}"
            return response
        status = 206
    length = end - start + 1

    def chunks():
        with field.storage.open(field.name, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                data = f.read(min(CHUNK, left))
                if not data:
                    break
                left -= len(data)
                yield data

    response = StreamingHttpResponse(chunks(), status=status, content_type=content_type)
    response["Content-Length"] = length
    response["Accept-Ranges"] = "bytes"
    if status == 206:
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
    response["Cache-Control"] = "private, max-age=3600"
    response["X-Content-Type-Options"] = "nosniff"
    return response
