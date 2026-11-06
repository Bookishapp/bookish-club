#!/usr/bin/env python3
"""Port approved native assets, without creating or redrawing character art.
Requires Pillow and fonttools[woff]. Pass the approved full-app-1016 directory.
"""
import argparse
import json
import textwrap
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
dest = root / 'app/ios/App/BookishMessages'
assets = args.source / 'assets'
fonts = dest / 'Fonts'
fonts.mkdir(exist_ok=True)
young = TTFont(assets / 'fonts/YoungSerif-400.woff2')
young.flavor = None
young.save(fonts / 'YoungSerif-Regular.ttf')
for weight, name in [(600, 'SemiBold'), (800, 'ExtraBold')]:
    font = instantiateVariableFont(TTFont(assets / 'fonts/Manrope-400_800.woff2'), {'wght': weight}, inplace=True)
    for record in font['name'].names:
        if record.nameID in [1, 2, 4, 6]:
            text = {1: f'Manrope {name}', 2: 'Regular', 4: f'Manrope {name}', 6: f'Manrope-{name}'}[record.nameID]
            record.string = text.encode(record.getEncoding())
    font.flavor = None
    font.save(fonts / f'Manrope-{name}.ttf')

catalog = dest / 'Assets.xcassets'
for name, source in [('LunairRSVP', 'lunair/b-calendar.png'), ('LunairVote', 'lunair/b-point.png'),
                     ('LunairBookmarks', 'lunair/b-peek.png'), ('BookishWordmark', 'wordmark-320.webp'),
                     ('BookishPaper', 'tx-paper-900.webp'), ('BookishIcon', 'icon.png')]:
    target = catalog / f'{name}.imageset'
    target.mkdir(exist_ok=True)
    image = Image.open(assets / source)
    image.thumbnail((720, 720), Image.Resampling.LANCZOS)
    image.save(target / f'{name}.png', optimize=True)
    (target / 'Contents.json').write_text(json.dumps({'images': [{'idiom': 'universal', 'filename': f'{name}.png'}],
        'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')

for name, value in {'Paper': 'F5EAD8', 'Ink': '2A0F15', 'Pink': 'F4A6BF', 'Butter': 'ECB74E',
                    'Mint': 'DCEBE1', 'Sky': 'F3D9D9', 'Lilac': 'FBE1E8'}.items():
    target = catalog / f'{name}.colorset/Contents.json'
    target.write_text(json.dumps({'colors': [{'idiom': 'universal', 'color': {'color-space': 'srgb',
        'components': {'red': '0x' + value[:2], 'green': '0x' + value[2:4], 'blue': '0x' + value[4:], 'alpha': '1.000'}}}],
        'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')

icons = catalog / 'iMessage App Icon.stickersiconset'
icon = Image.open(assets / 'icon.png')
for item in json.loads((icons / 'Contents.json').read_text())['images']:
    width, height = map(float, item['size'].split('x'))
    scale = int(item['scale'][0])
    size = (round(width * scale), round(height * scale))
    # Match the approved square icon, centered in Apple's required landscape canvas.
    base = Image.new('RGB', size, '#4a1420')
    fitted = icon.resize((size[1], size[1]), Image.Resampling.LANCZOS)
    base.paste(fitted, ((size[0] - size[1]) // 2, 0))
    base.save(icons / item['filename'], optimize=True)

# Both native targets share the same approved sticker artwork.
# Preserve every existing sticker identifier, label meaning, and native peeling behavior.
stickers = [
    ('01-hi-book-club', 'wave', 'Hi, book club'), ('02-im-in', 'cheer', "I'm in"),
    ('03-see-you-thursday', 'calendar', 'See you Thursday'), ('04-no-spoilers', 'shh', 'No spoilers'),
    ('05-i-cannot', 'gasp', 'I cannot'), ('06-swooning', 'swoon', 'Swooning'),
    ('07-not-crying', 'cry', 'Not crying'), ('08-spill-it', 'tea', 'Spill it'),
    ('09-plot-twist', 'gasp', 'Plot twist'), ('10-one-more-chapter', 'sleepy', 'One more chapter'),
    ('11-youre-invited', 'envelope', "You're invited"), ('12-your-turn-to-host', 'point', 'Your turn to host'),
    ('13-on-my-way', 'wave', 'On my way'), ('14-no-peeking', 'peek', 'No peeking')]
sticker_dir = dest / 'Stickers'
sticker_dir.mkdir(exist_ok=True)
for stem, art, caption in stickers:
    canvas = Image.new('RGBA', (408, 408))
    cutout = Image.open(assets / f'lunair/b-{art}.png').convert('RGBA')
    cutout.thumbnail((380, 340), Image.Resampling.LANCZOS)
    canvas.alpha_composite(cutout, ((408 - cutout.width) // 2, 340 - cutout.height))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(str(fonts / 'Manrope-ExtraBold.ttf'), 29)
    lines = textwrap.wrap(caption, 19)
    text = '\n'.join(lines)
    bounds = draw.multiline_textbbox((0, 0), text, font=font, spacing=3, align='center')
    w, h = bounds[2], bounds[3] - bounds[1]
    x, y = (408-w)//2, 365-h//2
    draw.rounded_rectangle((x-18, y-12, x+w+18, y+h+12), radius=15, fill='#7a1a2a', outline='#fffaf1', width=5)
    draw.multiline_text((x, y-bounds[1]), text, font=font, fill='#fffaf1', spacing=3, align='center')
    canvas.save(sticker_dir / f'lunair-sticker-{stem}.png', optimize=True)
# The app embeds the standalone sticker pack as well as the interactive extension.
# Update only existing artwork, keeping both targets' identifiers and behavior intact.
standalone = root / 'app/ios/App/BookishStickers/Stickers.xcassets'
for image in sticker_dir.glob('*.png'):
    target = standalone / 'Sticker Pack.stickerpack' / f'{image.stem}.sticker' / image.name
    if not target.exists():
        raise FileNotFoundError(f'Expected existing standalone sticker: {target}')
    shutil.copyfile(image, target)
for image in icons.glob('*.png'):
    target = standalone / 'iMessage App Icon.stickersiconset' / image.name
    if not target.exists():
        raise FileNotFoundError(f'Expected existing standalone icon: {target}')
    shutil.copyfile(image, target)
print('Prepared approved art and fonts, and synchronized both native sticker targets.')
