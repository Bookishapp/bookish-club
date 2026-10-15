"""Build the Lunair sticker images in public/img/ from the existing cut-outs.
Only scales the source art (no mirroring, no repainting). Oxblood theme
(10-14): no white die-cut border, matching the locked r2 renders; set
border=True on a job to get the sticker edge back. The soft shadow is CSS.
Usage: python3 scripts/stickers.py
"""
import os
from PIL import Image, ImageFilter

SRC = os.path.expanduser("~/ted-screenshots/fictora-official/lunair-bible")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "img")
JOBS = [  # (source, output name, [target heights])
    ("expressions/fangirl/fangirl-06-hugging-a-book-tightly-ecstatic.webp", "lunair-hug", [300, 600]),
    ("expressions/gossip/gossip-01-whisper.webp", "lunair-gossip", [220, 440]),
    ("poses/canonical/lunair-pose-presenting.png", "lunair-host", [440, 880]),
    ("poses/canonical/lunair-pose-waving.png", "lunair-wave", [360, 720]),
    ("poses/canonical/lunair-pose-peeking.png", "lunair-peek", [130, 260]),
    ("expressions/confused/confused-12-confused-shrug.webp", "lunair-shrug", [260, 520]),
    ("expressions/reading/reading-01-peek-over-book.webp", "lunair-reading", [200, 400]),
]

def sticker(im, h, border=False):
    im = im.convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox())
    w = round(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    if not border:
        return im
    r = max(3, round(h * 0.014))  # border thickness
    pad = r + 2
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    a = canvas.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    # Round dilation: blur the silhouette, then threshold low (no square corners).
    grown = a.filter(ImageFilter.GaussianBlur(r * 0.75)).point(lambda v: 255 if v > 22 else 0)
    grown = grown.filter(ImageFilter.GaussianBlur(0.6))
    white = Image.new("RGBA", canvas.size, (255, 255, 255, 255))
    white.putalpha(grown)
    white.alpha_composite(canvas)
    return white

os.makedirs(OUT, exist_ok=True)
for src, name, heights in JOBS:
    base = Image.open(os.path.join(SRC, src))
    for h in heights:
        out = sticker(base, h)
        path = os.path.join(OUT, f"{name}-{h}.webp")
        out.save(path, "WEBP", quality=82, method=6)
        print(path, out.size, os.path.getsize(path) // 1024, "KB")
