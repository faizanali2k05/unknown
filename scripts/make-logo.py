"""
Generates the Unknown app mark: a phosphor-green chat bubble with an audio
waveform inside — messaging and calling in one shape.

Everything is drawn at 4x and downsampled, which is what keeps the curves and
the thin strokes clean at launcher sizes. Re-run after changing any constant:

    python scripts/make-logo.py

Outputs (git-tracked, consumed by app.json):
    apps/mobile/assets/icon.png              1024  full-bleed launcher icon
    apps/mobile/assets/adaptive-icon.png     1024  Android foreground layer
    apps/mobile/assets/splash-icon.png        512  transparent, for the splash
    apps/mobile/assets/favicon.png            196  small-size variant
"""

from pathlib import Path
from PIL import Image, ImageDraw

# --- palette (must match apps/mobile/src/theme/tokens.ts) --------------------
BG_DEEP = (7, 18, 12)  # near-black green
BG_TOP = (14, 38, 25)  # slightly lifted top for a subtle vertical sheen
GREEN = (74, 222, 128)  # accent.default — retro phosphor green
GREEN_DIM = (34, 197, 94)

SS = 4  # supersample factor


def vertical_gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    """A plain top-to-bottom blend. Cheaper and sharper than a radial glow."""
    grad = Image.new("RGB", (1, size))
    px = grad.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return grad.resize((size, size), Image.Resampling.BILINEAR)


def draw_mark(size: int, with_background: bool, padding_ratio: float) -> Image.Image:
    """
    Draws the bubble + waveform.

    padding_ratio leaves breathing room around the mark. Android's adaptive
    icon crops to a circle and masks aggressively, so its foreground layer
    needs far more padding than a full-bleed icon does.
    """
    s = size * SS
    if with_background:
        img = vertical_gradient(s, BG_TOP, BG_DEEP).convert("RGBA")
        # Squircle-ish rounded corners so it looks right un-masked too.
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.235), fill=255)
        img.putalpha(mask)
    else:
        img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # The bubble is drawn on its own layer so the waveform can be punched
    # straight out of it. A solid shape with a knockout stays legible at
    # launcher sizes, where a thin outline would turn to mush.
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    pad = s * padding_ratio
    box_w = s - pad * 2
    b_left = pad
    b_top = pad + box_w * 0.04
    b_right = s - pad
    b_bottom = b_top + box_w * 0.70
    radius = box_w * 0.24

    d.rounded_rectangle([b_left, b_top, b_right, b_bottom], radius=radius, fill=GREEN)

    # Tail hangs off the lower-left, overlapping the body so there is no seam.
    tail_x = b_left + box_w * 0.20
    d.polygon(
        [
            (tail_x, b_bottom - box_w * 0.08),
            (tail_x + box_w * 0.22, b_bottom - box_w * 0.08),
            (tail_x + box_w * 0.03, b_bottom + box_w * 0.17),
        ],
        fill=GREEN,
    )

    # Waveform knocked out of the bubble: five bars rising then falling, so it
    # reads as speech rather than a generic equaliser.
    cx = (b_left + b_right) / 2
    cy = (b_top + b_bottom) / 2
    bar_w = box_w * 0.062
    gap = box_w * 0.050
    half_heights = [0.055, 0.115, 0.165, 0.100, 0.048]
    total_w = len(half_heights) * bar_w + (len(half_heights) - 1) * gap
    x = cx - total_w / 2
    for h in half_heights:
        half = box_w * h
        d.rounded_rectangle(
            [x, cy - half, x + bar_w, cy + half],
            radius=bar_w / 2,
            fill=(0, 0, 0, 0),
        )
        x += bar_w + gap

    img.alpha_composite(layer)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "apps" / "mobile" / "assets"
    out.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon.png", 1024, True, 0.20),
        # Android masks the foreground to a circle and scales it up ~1.5x, so
        # the mark has to sit well inside the safe zone.
        ("adaptive-icon.png", 1024, False, 0.30),
        ("splash-icon.png", 512, False, 0.16),
        ("favicon.png", 196, True, 0.18),
    ]
    for name, size, bg, pad in targets:
        img = draw_mark(size, bg, pad)
        img.save(out / name)
        print(f"  {name:22} {size}x{size}")

    print(f"\nWrote {len(targets)} files to {out}")


if __name__ == "__main__":
    main()
