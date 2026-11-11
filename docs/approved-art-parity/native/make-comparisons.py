#!/usr/bin/env python3
"""Compose unaltered approved references and native review-host captures for review."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
base = Path(__file__).resolve().parent
font_file = base.parents[2] / 'app/ios/App/BookishMessages/Fonts/Manrope-SemiBold.ttf'
font = ImageFont.truetype(str(font_file), 13)
rows = [
    ('39', '39.jpg', 'stickers.png', 'Regular-sized native stickers keep figures and white caption pills legible. All 14 labels are preserved.'),
    ('40', '40.jpg', 'editor-vote-selected.png', 'Existing single-choice vote, real sample covers, and square selection check.'),
    ('41', '41.jpg', 'transcript-vote.png', 'Actual sample candidates and counts, with compact cover rows and ribbons.'),
    ('42', '42.jpg', 'transcript-rsvp.png', 'No calendar date in v1 payload. Weekday block uses the known Thursday.'),
    ('43', '20-v2.webp', 'transcript-bookmarks.png', 'Screen 43 uses the approved v2 communal shelf. Member order is preserved.'),
]
for number, reference, actual, note in rows:
    canvas = Image.new('RGB', (810, 930), '#fffaf1')
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 8), 'Approved ' + ('20 v2, override for 43' if number == '43' else number), font=font, fill='#2a0f15')
    draw.text((410, 8), 'Built: native simulator review host', font=font, fill='#2a0f15')
    for x, path in [(10, base.parent / 'approved' / reference), (410, base / 'actual' / actual)]:
        screenshot = Image.open(path).convert('RGB').resize((390, 844), Image.Resampling.LANCZOS)
        canvas.paste(screenshot, (x, 34))
    draw.text((10, 888), note, font=font, fill='#2a0f15')
    draw.text((10, 910), 'Review host is outside Messages. Live sending, sticker peeling, and VoiceOver require a device pass.', font=font, fill='#6b4c46')
    target = args.output / f'{number}-native.png'
    canvas.save(target)
    print(target)
