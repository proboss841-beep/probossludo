#!/usr/bin/env python3
"""Generate the PROBOSS LUDO launcher icons (rounded square + PL monogram).

Sizes: mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192.
"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
BG_TOP = (37, 16, 59)      # #25103b
BG_BOTTOM = (26, 8, 42)    # deep purple
PINK = (244, 20, 104)      # #F41468
WHITE = (255, 255, 255)

ROOT = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(ROOT, "res")


def rounded_mask(size, radius_ratio=0.22):
    size = int(size)
    radius = int(size * radius_ratio)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # vertical gradient background
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # pink circular badge
    cx = size / 2
    badge_r = size * 0.4
    d.ellipse([cx - badge_r, cx - badge_r, cx + badge_r, cx + badge_r],
              fill=PINK + (255,))

    # "PL" monogram
    text = "PL"
    font_size = int(size * 0.42)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()
    # measure text with the font
    try:
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        tw = th = font_size
    d.text((cx - tw / 2, cx - th / 2), text, font=font, fill=WHITE + (255,))

    # apply rounded corners
    img.putalpha(rounded_mask(size))
    return img


def main():
    for density, size in SIZES.items():
        folder = os.path.join(RES, f"drawable-{density}")
        os.makedirs(folder, exist_ok=True)
        out = os.path.join(folder, "ic_launcher.png")
        make_icon(size).save(out, "PNG")
        print("wrote", out)


if __name__ == "__main__":
    main()