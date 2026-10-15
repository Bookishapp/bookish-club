"""Trim the rendered wordmark (public/img/bookish-wordmark.png) to its ink and
write the web sizes. Usage: python3 scripts/wordmark-sizes.py"""
import os
from PIL import Image

IMG = os.path.join(os.path.dirname(__file__), "..", "public", "img")
src = os.path.join(IMG, "bookish-wordmark.png")
im = Image.open(src).convert("RGBA")
im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 4 else 0).getbbox())
im.save(src, optimize=True)  # high-res transparent master
print(src, im.size)
for w in (160, 320, 480):
    h = round(im.height * w / im.width)
    out = os.path.join(IMG, f"wordmark-{w}.webp")
    im.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=90, method=6)
    print(out, (w, h), os.path.getsize(out) // 1024, "KB")
