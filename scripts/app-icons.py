"""Regenerate native and web icons from Sebastian's selected 11a artwork.

Run with Python 3 and Pillow: python3 scripts/app-icons.py
The checked-in outputs let web and release builds run without Pillow.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "app/assets/icon-only.png"
CATALOG = ROOT / "app/ios/App/App/Assets.xcassets/AppIcon.appiconset"
image = Image.open(SOURCE)
assert image.size == (1024, 1024) and image.mode == "RGB", "Source must be a 1024px RGB PNG"


def png(destination, size):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if size == 1024:
        destination.write_bytes(SOURCE.read_bytes())
    else:
        image.resize((size, size), Image.Resampling.LANCZOS).save(destination)


images = []
for idiom, slots in [
    ("iphone", [(20, [2, 3]), (29, [2, 3]), (40, [2, 3]), (60, [2, 3])]),
    ("ipad", [(20, [1, 2]), (29, [1, 2]), (40, [1, 2]), (76, [1, 2]), (83.5, [2])]),
    ("ios-marketing", [(1024, [1])]),
]:
    for points, scales in slots:
        for scale in scales:
            pixels = int(points * scale)
            filename = f"AppIcon-{pixels}.png"
            png(CATALOG / filename, pixels)
            images.append({"filename": filename, "idiom": idiom, "size": f"{points}x{points}", "scale": f"{scale}x"})
(CATALOG / "Contents.json").write_text(json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n")

manifest = {
    "name": "Bookish", "short_name": "Bookish", "start_url": "./", "scope": "./",
    "display": "standalone", "background_color": "#33101a", "theme_color": "#4a1420",
    "icons": [{"src": f"icons/icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any"} for size in (192, 512)],
}
for public in [ROOT / "public", ROOT / "app/public"]:
    for filename, size in [("favicon-32x32.png", 32), ("apple-touch-icon.png", 180), ("icons/icon-192.png", 192), ("icons/icon-512.png", 512)]:
        png(public / filename, size)
    image.save(public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    (public / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Generated {len(images)} Xcode slots and both web icon sets from {SOURCE.relative_to(ROOT)}")
