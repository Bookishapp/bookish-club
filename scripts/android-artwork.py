"""Generate Android resources from the shipped iOS icon and splash, with Pillow."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "app/android/app/src/main/res"
icon = Image.open(ROOT / "app/assets/icon-only.png").convert("RGB")
splash = Image.open(ROOT / "app/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png").convert("RGB")
for density, scale in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]:
    dest = RES / f"mipmap-{density}"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ["ic_launcher", "ic_launcher_round"]:
        icon.resize((int(48 * scale), int(48 * scale)), Image.Resampling.LANCZOS).save(dest / f"{name}.png")
    # Keep all artwork inside the adaptive icon safe zone, with the iOS background.
    foreground = Image.new("RGB", (int(108 * scale), int(108 * scale)), icon.getpixel((0, 0)))
    mark = icon.resize((int(66 * scale), int(66 * scale)), Image.Resampling.LANCZOS)
    foreground.paste(mark, ((foreground.width - mark.width) // 2, (foreground.height - mark.height) // 2))
    foreground.save(dest / "ic_launcher_foreground.png")
# A single density-independent launch image avoids density-specific cropping changes.
for dest in RES.glob("drawable*/splash.png"):
    dest.unlink()
dest = RES / "drawable-nodpi/splash.png"
dest.parent.mkdir(parents=True, exist_ok=True)
splash.resize((1024, 1024), Image.Resampling.LANCZOS).save(dest)
feature = ImageOps.fit(Image.open(ROOT / "app/public/img/bg-oxblood-d.webp").convert("RGB"), (1024, 500))
wordmark = Image.open(ROOT / "public/img/bookish-wordmark.png").convert("RGBA")
wordmark.thumbnail((700, 320), Image.Resampling.LANCZOS)
feature.paste(wordmark, ((1024 - wordmark.width) // 2, (500 - wordmark.height) // 2), wordmark)
feature_path = ROOT / "app/release/android/feature-graphic.png"
feature_path.parent.mkdir(parents=True, exist_ok=True)
feature.save(feature_path)
print("Generated Android icons, splash, and Play feature graphic from existing Bookish artwork")
