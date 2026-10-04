#!/usr/bin/env python3
"""Render the app icons into site/ (needs pillow). Uses the Blender shell sprite on a teal water tile."""
import os, math
from PIL import Image, ImageDraw
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SITE = os.path.join(ROOT, "site")
shell = Image.open(os.path.join(SITE, "shell_1x.png")).convert("RGBA")

def tile(size, safe):
    """safe = fraction of the tile the artwork may use (maskable icons need about 0.62)."""
    S = size * 2
    im = Image.new("RGB", (S, S))
    px = im.load()
    for y in range(S):
        t = y / S
        c = (int(11 + 8 * t), int(110 - 30 * t), int(130 - 28 * t))
        for x in range(S):
            px[x, y] = c
    g = ImageDraw.Draw(im, "RGBA")
    for i in range(5):  # wake lines
        y = S * (0.2 + 0.15 * i)
        g.arc([S * -0.2, y, S * 1.2, y + S * 0.5], 200, 340, fill=(255, 255, 255, 34), width=max(2, S // 90))
    h = int(S * safe)
    sp = shell.resize((int(shell.width * h / shell.height), h), Image.LANCZOS).rotate(-35, expand=True, resample=Image.BICUBIC)
    shadow = Image.new("RGBA", sp.size, (0, 0, 0, 0)); shadow.putalpha(sp.getchannel("A").point(lambda a: a * 0.35))
    im = im.convert("RGBA")
    cx, cy = (S - sp.width) // 2, (S - sp.height) // 2
    im.alpha_composite(shadow, (cx + S // 60, cy + S // 60)); im.alpha_composite(sp, (cx, cy))
    return im.convert("RGB").resize((size, size), Image.LANCZOS)

def rounded(im, r):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, *im.size], r, fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), m); return out

for name, size, safe, rnd in [("icon-192.png", 192, 0.78, True), ("icon-512.png", 512, 0.78, True),
                              ("icon-maskable-512.png", 512, 0.56, False), ("apple-touch-icon.png", 180, 0.72, False)]:
    im = tile(size, safe)
    (rounded(im, size // 5) if rnd else im).save(os.path.join(SITE, name))
    print(name)
