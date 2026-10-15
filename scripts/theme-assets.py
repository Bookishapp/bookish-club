"""Build the Oxblood Reading Room theme assets in public/ (fonts, gouache
backgrounds, paper grain, props). Sources are the locked colour pass r2
(~/ted-screenshots/bookish-club/color-1014-r2). Lunair art comes from
scripts/stickers.py; the wordmark from scripts/wordmark.mjs.
Usage: python3 scripts/theme-assets.py   (needs Pillow + numpy)
"""
import os, shutil
import numpy as np
from PIL import Image

R2 = os.path.expanduser("~/ted-screenshots/bookish-club/color-1014-r2/assets")
PUB = os.path.join(os.path.dirname(__file__), "..", "public")
FONTS = ["Unbounded-400_900.woff2", "YoungSerif-400.woff2", "Manrope-400_800.woff2"]
PROPS = ["prop-sun-240.webp", "prop-daisy-240.webp", "prop-washi2-240.webp", "prop-washi3-240.webp"]

# Palette 05 "Oxblood Reading Room": gouache blocks [gap, block1..block4]
OXBLOOD = ["#4a1420", "#621c26", "#4a1530", "#3a0f18", "#5a2028"]
# Recolour of the raw gouache (same maths as color-1014-r2/src/build.py)
CENT = np.array([[242, 232, 211], [230, 189, 176], [242, 224, 173], [191, 209, 215], [204, 218, 204]], float)

def gouache(raw, cols, crop, size, out, detail=1.6, flip=False, q=72):
    x0, y0, x1, y1 = crop
    a = raw[y0:y1, x0:x1]
    d2 = ((a[..., None, :] - CENT[None, None]) ** 2).sum(-1)
    w = np.exp(-np.minimum(d2 / (2 * 11.0 ** 2), 60.0)); w /= w.sum(-1, keepdims=True) + 1e-9
    resid = (a - w @ CENT).mean(-1, keepdims=True)
    C = np.array([[int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)] for c in cols], float)
    im = Image.fromarray((w @ C + resid * detail).clip(0, 255).astype(np.uint8))
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.resize(size, Image.LANCZOS)
    im.save(out, "WEBP", quality=q, method=6)
    print(out, im.size, os.path.getsize(out) // 1024, "KB")

os.makedirs(os.path.join(PUB, "fonts"), exist_ok=True)
os.makedirs(os.path.join(PUB, "img"), exist_ok=True)
for f in FONTS:
    shutil.copy(os.path.join(R2, "fonts", f), os.path.join(PUB, "fonts", f.lower()))
for f in PROPS + ["tx-paper-900.webp"]:
    shutil.copy(os.path.join(R2, f), os.path.join(PUB, "img", f))
raw = np.asarray(Image.open(os.path.join(R2, "gouache-raw.png")).convert("RGB")).astype(np.float32)
# Tall crop for phones (as the r2 lander), wide crop for desktop.
gouache(raw, OXBLOOD, (200, 0, 1200, 2048), (720, 1474), os.path.join(PUB, "img", "bg-oxblood-m.webp"), flip=True)
gouache(raw, OXBLOOD, (0, 384, 2048, 1664), (1600, 1000), os.path.join(PUB, "img", "bg-oxblood-d.webp"))
