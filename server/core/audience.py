"""The ordered scale of who may see something. The order is defined here and nowhere else: code compares levels
through `at_least`, never by listing values. `core.access` re-exports these (this module has no model imports, so
models can take their choices from it)."""

AUDIENCES = ("me", "coaches", "team", "everyone")
# Only these are accepted by the serializers until the wider levels are built.
ACCEPTED = ("me", "coaches")
DEFAULT = "coaches"


def at_least(level):
    """The levels from `level` up: who is included when something is shared at `level` or wider."""
    return AUDIENCES[AUDIENCES.index(level) :]


def clamp(level):
    """`level` if it is accepted, else the widest accepted level below it (`me` for an unknown one)."""
    if level in ACCEPTED:
        return level
    if level in AUDIENCES:
        return [a for a in ACCEPTED if AUDIENCES.index(a) < AUDIENCES.index(level)][-1]
    return ACCEPTED[0]


CHOICES = [(a, a) for a in AUDIENCES]
