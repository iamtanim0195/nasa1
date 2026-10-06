"""Generates the six cube faces of the skybox starfield.

Run once, commit the PNGs:

    python .tools/make-skybox.py

Why generate rather than ship a photo: the skybox is 6 x 1024², mostly empty
black, so it compresses to a few hundred KB — and a procedural field lets the
density and colour be tuned without hunting for a licence-free panorama.

Seams are handled by insetting every star from the face border; a star straddling
an edge would appear sliced, because each face is a separate texture.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
INSET = 8
OUT = Path(__file__).resolve().parent.parent / "public" / "skybox"

# (filename, seed) — one deterministic face per cube direction.
FACES = [
    ("px.png", 101),
    ("nx.png", 202),
    ("py.png", 303),
    ("ny.png", 404),
    ("pz.png", 505),
    ("nz.png", 606),
]

# Star tints: mostly white, a few cool and a few warm, as real skies look.
TINTS = [
    ((255, 255, 255), 0.72),
    ((200, 220, 255), 0.16),
    ((255, 238, 210), 0.09),
    ((255, 200, 200), 0.03),
]


def pick_tint(rng: random.Random) -> tuple[int, int, int]:
    roll = rng.random()
    cumulative = 0.0
    for colour, weight in TINTS:
        cumulative += weight
        if roll <= cumulative:
            return colour
    return (255, 255, 255)


def draw_star(
    canvas: Image.Image,
    rng: random.Random,
    x: float,
    y: float,
    radius: float,
    brightness: float,
) -> None:
    """One star: a bright core plus a soft halo, drawn additively-ish."""
    draw = ImageDraw.Draw(canvas)
    r, g, b = pick_tint(rng)
    scale = brightness / 255.0

    core = (int(r * scale), int(g * scale), int(b * scale))

    if radius <= 1.0:
        draw.point((x, y), fill=core)
        return

    # Halo, then core on top. Drawing a filled circle twice is enough at this
    # size and far cheaper than a radial gradient per star.
    halo = (int(r * scale * 0.28), int(g * scale * 0.28), int(b * scale * 0.28))
    draw.ellipse(
        (x - radius * 2.4, y - radius * 2.4, x + radius * 2.4, y + radius * 2.4),
        fill=halo,
    )
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=core)


def build_face(seed: int) -> Image.Image:
    rng = random.Random(seed)

    # A near-black base with a faint blue-to-black vertical falloff, so the sky
    # is not a flat void and the cube reads as depth rather than paper.
    canvas = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    gradient = Image.new("RGB", (1, SIZE))
    for y in range(SIZE):
        # Deepest at the top, a touch of blue-slate toward the bottom.
        t = y / (SIZE - 1)
        gradient.putpixel(
            (0, y),
            (
                int(2 + 4 * t),
                int(3 + 7 * t),
                int(8 + 14 * t),
            ),
        )
    canvas = gradient.resize((SIZE, SIZE))

    # Faint dust: many very dim points, which is what stops the field looking
    # like scattered confetti.
    dust = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    draw_dust = ImageDraw.Draw(dust)
    for _ in range(1400):
        x = rng.uniform(INSET, SIZE - INSET)
        y = rng.uniform(INSET, SIZE - INSET)
        v = rng.randint(10, 30)
        draw_dust.point((x, y), fill=(v, v, min(255, v + 6)))
    dust = dust.filter(ImageFilter.GaussianBlur(0.4))
    canvas = Image.blend(canvas, Image.blend(canvas, dust, 0.55), 0.5)

    # Main field.
    for _ in range(520):
        x = rng.uniform(INSET, SIZE - INSET)
        y = rng.uniform(INSET, SIZE - INSET)
        radius = rng.choice([0.6, 0.6, 0.8, 1.0, 1.0, 1.3])
        brightness = rng.triangular(45, 235, 110)
        draw_star(canvas, rng, x, y, radius, brightness)

    # A handful of bright anchors, with a visible halo and a cross-flare on the
    # brightest, so the field has landmarks as a real sky does.
    for _ in range(9):
        x = rng.uniform(INSET + 12, SIZE - INSET - 12)
        y = rng.uniform(INSET + 12, SIZE - INSET - 12)
        radius = rng.uniform(1.5, 2.3)
        brightness = rng.uniform(215, 255)
        draw_star(canvas, rng, x, y, radius, brightness)

        if rng.random() < 0.45:
            flare = ImageDraw.Draw(canvas)
            length = rng.uniform(7, 15)
            tint = (int(150 * brightness / 255), int(170 * brightness / 255), 255)
            flare.line((x - length, y, x + length, y), fill=tint, width=1)
            flare.line((x, y - length, x, y + length), fill=tint, width=1)

    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    for filename, seed in FACES:
        face = build_face(seed)
        path = OUT / filename
        face.save(path, "PNG", optimize=True)
        print(f"{path.name:8} {path.stat().st_size / 1024:8.1f} KB")

    total = sum((OUT / name).stat().st_size for name, _ in FACES)
    print(f"{'total':8} {total / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
