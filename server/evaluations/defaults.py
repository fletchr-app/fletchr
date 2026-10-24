"""The form a team starts with: the shot of a recurve archer in four positions and as a whole, in the structure the
DSB uses for its squad technique check (Haidn et al., Bundeskader Bogen Recurve 2024, Anlage 3), worded freshly here."""

from django.utils.translation import gettext

# (key, text) per group; the texts are listed so the translation catalog has them.
GROUPS = [
    ("pre", lambda: gettext("Pre-tension"), [
        ("pre_back", lambda: gettext("Upright back, hips tilted, shoulders low")),
        ("pre_head", lambda: gettext("Head still and facing the target")),
        ("pre_hook", lambda: gettext("Draw fingers sit deep in the hook")),
        ("pre_bow_arm", lambda: gettext("Bow arm turned in, bow hand set at the pressure point")),
    ]),
    ("raise", lambda: gettext("Raising the bow"), [
        ("raise_height", lambda: gettext("Both arms come up to eye height")),
        ("raise_shoulders", lambda: gettext("Shoulder line points at the target")),
        ("raise_draw_hand", lambda: gettext("Draw hand and forearm stay straight in line")),
        ("raise_bow_arm", lambda: gettext("Bow arm is extended")),
    ]),
    ("hold", lambda: gettext("Holding"), [
        ("hold_anchor", lambda: gettext("Solid anchor that is the same every shot")),
        ("hold_transfer", lambda: gettext("The load is visibly taken over by the back")),
        ("hold_triangle", lambda: gettext("Small, stable force triangle")),
        ("hold_balance", lambda: gettext("Push and pull are in balance")),
    ]),
    ("follow", lambda: gettext("Follow-through"), [
        ("follow_expansion", lambda: gettext("Visible expansion through the shot")),
        ("follow_draw_hand", lambda: gettext("Draw hand opens with a quick, relaxed move")),
        ("follow_bow_hand", lambda: gettext("Bow hand stays relaxed")),
        ("follow_hold", lambda: gettext("The position is held after the release")),
    ]),
    ("flow", lambda: gettext("Whole sequence"), [
        ("flow_t", lambda: gettext("Arms and shoulders stay in a T")),
        ("flow_repeat", lambda: gettext("Every shot repeats the same elements")),
        ("flow_fluid", lambda: gettext("The movement is fluid")),
        ("flow_timing", lambda: gettext("The timing is steady from shot to shot")),
    ]),
]


def default_name() -> str:
    return gettext("Shooting technique")


def default_criteria() -> list[dict]:
    return [
        {"key": key, "label": label(), "group": group(), "description": "", "low": "", "high": ""}
        for _, group, items in GROUPS
        for key, label in items
    ]


def _both(text):
    """The same text in every language the app has: how it reads in English and in German."""
    from django.utils import translation

    out = set()
    for lang in ("en", "de"):
        with translation.override(lang):
            out.add(text())
    return out


_BUILTIN = {key: (group, label) for _, group, items in GROUPS for key, label in items}


def localize(criteria: list[dict]) -> list[dict]:
    """The criteria with the texts of the built-in form (as the team got it, in whatever language) shown in the language of the
    request. A text a coach changed is shown as written. Nothing is stored: the same form reads right for every member."""
    shown = []
    for c in criteria:
        c = dict(c)
        group, label = _BUILTIN.get(c["key"], (None, None))
        if label and c["label"] in _both(label):
            c["label"] = label()
        if group and c["group"] in _both(group):
            c["group"] = group()
        shown.append(c)
    return shown


def localize_name(name: str) -> str:
    return default_name() if name in _both(default_name) else name
