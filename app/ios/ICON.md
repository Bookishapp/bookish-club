# Bookish app icon

Sebastian selected `round3/11a-bubble.png` on October 15, 2026. The original
1024 x 1024 RGB PNG is checked in at `../assets/icon-only.png`, the Capacitor
asset source. It has no alpha channel and must remain opaque.

From the repository root, run `python3 scripts/app-icons.py` with Pillow installed
to regenerate every iPhone, iPad, and App Store marketing slot in
`App/App/Assets.xcassets/AppIcon.appiconset/`, its `Contents.json`, and the
website and Capacitor web favicons, touch icons, and manifest icons. All sizes
are derived directly from the selected source, without changing the artwork.
The generated files are checked in, so CI does not need Pillow.

`cd app && npm run check:release` validates native icon files, dimensions,
RGB opacity, and the original marketing artwork before Codemagic releases.
