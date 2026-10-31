# /// script
# requires-python = ">=3.10"
# dependencies = ["resvg-py", "pillow"]
# ///
"""Draws the Fletchr icon and writes every size the app needs: `uv run resources/generate.py`.

The design lives here (one place): a diagonal arrow with orange fletching in front of a target, on navy.
It writes the SVG sources to resources/ and the PNGs to the Android resources and public/.
"""
from pathlib import Path

import io

import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAVY, WHITE, ORANGE = "#1d3557", "#f1faee", "#f4a340"


def mark(arrow=WHITE, fletching=ORANGE, rings=WHITE, ring_opacity=0.28):
    """The picture in a 200 x 200 box (arrow pointing to the top right, rings around its middle)."""
    pairs = "".join(
        f'<polygon points="{x + 20},100 {x},{100 + s * 22} {x + 17},{100 + s * 22} {x + 37},100" fill="{fletching}"/>'
        for x in (26, 54)
        for s in (-1, 1)
    )
    return (
        f'<circle cx="100" cy="100" r="70" fill="none" stroke="{rings}" stroke-width="8" opacity="{ring_opacity}"/>'
        f'<circle cx="100" cy="100" r="36" fill="none" stroke="{rings}" stroke-width="8" opacity="{ring_opacity}"/>'
        f'<g transform="rotate(-45 100 100)">'
        f'<rect x="30" y="95.5" width="128" height="9" rx="4.5" fill="{arrow}"/>'
        f'<polygon points="148,79 194,100 148,121 158,100" fill="{arrow}"/>'
        f"{pairs}</g>"
    )


def svg(viewbox, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">{body}</svg>\n'


# The mark is 188 units wide; in a 108 dp adaptive icon (safe zone 66 dp) it must stay inside the middle, so it is
# drawn on a canvas 1.6 times its box. The same drawing serves the splash icon and the maskable web icon.
PADDED = "-60 -60 320 320"
SOURCES = {
    "icon.svg": svg("0 0 200 200", f'<rect width="200" height="200" rx="44" fill="{NAVY}"/>{mark()}'),
    "icon-round.svg": svg("0 0 200 200", f'<circle cx="100" cy="100" r="100" fill="{NAVY}"/><g transform="translate(100 100) scale(0.9) translate(-100 -100)">{mark()}</g>'),
    "icon-foreground.svg": svg(PADDED, mark()),
    "icon-monochrome.svg": svg(PADDED, mark(WHITE, WHITE, WHITE, 0.5)),
    "icon-square.svg": svg("0 0 200 200", f'<rect width="200" height="200" fill="{NAVY}"/>{mark()}'),
    "icon-maskable.svg": svg(PADDED, f'<rect x="-60" y="-60" width="320" height="320" fill="{NAVY}"/>{mark()}'),
}
for name, text in SOURCES.items():
    (ROOT / "resources" / name).write_text(text)


def png(source, target, size):
    path = ROOT / target
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=SOURCES[source], width=size, height=size)))


res = "android/app/src/main/res"
for density, launcher in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    png("icon.svg", f"{res}/mipmap-{density}/ic_launcher.png", launcher)
    png("icon-round.svg", f"{res}/mipmap-{density}/ic_launcher_round.png", launcher)
    png("icon-foreground.svg", f"{res}/mipmap-{density}/ic_launcher_foreground.png", launcher * 9 // 4)
    png("icon-monochrome.svg", f"{res}/mipmap-{density}/ic_launcher_monochrome.png", launcher * 9 // 4)
for density, splash in {"mdpi": 240, "hdpi": 360, "xhdpi": 480, "xxhdpi": 720, "xxxhdpi": 960}.items():
    png("icon-foreground.svg", f"{res}/drawable-{density}/splash_icon.png", splash)

png("icon.svg", "resources/icon.png", 1024)
png("icon-maskable.svg", "resources/splash.png", 1024)
png("icon.svg", "public/icon-512.png", 512)
png("icon.svg", "public/icon-192.png", 192)
png("icon-maskable.svg", "public/icon-maskable-512.png", 512)
png("icon-square.svg", "public/apple-touch-icon.png", 180)
png("icon.svg", "public/favicon.png", 64)
(ROOT / "public" / "favicon.svg").write_text(SOURCES["icon.svg"])
# Google Play feature graphic, 1024 x 500, without an alpha channel (Play refuses one).
feature = svg(
    "0 0 1024 500",
    f'<rect width="1024" height="500" fill="{NAVY}"/>'
    f'<g transform="translate(560 20) scale(2.3)">{mark()}</g>'
    f'<text x="64" y="285" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="128" font-weight="700" fill="{WHITE}">Fletchr</text>'
    f'<rect x="70" y="322" width="150" height="10" rx="5" fill="{ORANGE}"/>',
)
rendered = bytes(resvg_py.svg_to_bytes(svg_string=feature, width=1024, height=500))
Image.open(io.BytesIO(rendered)).convert("RGB").save(ROOT / "resources" / "feature-graphic.png")
(ROOT / "resources" / "feature-graphic.svg").write_text(feature)
print("icon written")
