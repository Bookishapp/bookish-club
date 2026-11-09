"""Extract approved v3 sticker art and copy existing approved native textures."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageFilter
import json, os

root = Path(__file__).resolve().parents[3]
assets = root / 'app/ios/App/BookishMessages/Assets.xcassets'
source = Path(os.environ.get('BOOKISH_V3_SOURCE',root/'.cache/approved-art/approved-v3-1021'))
stickers = root / 'app/ios/App/BookishMessages/Stickers'

def asset(name, im):
    dest = assets / (name + '.imageset')
    dest.mkdir(exist_ok=True)
    im.save(dest / (name + '.png'))
    (dest / 'Contents.json').write_text(json.dumps({'images':[{'filename': name + '.png','idiom':'universal'}],'info':{'author':'xcode','version':1}}, indent=2) + '\n')

def remove_background(im, tolerance=28):
    im = im.convert('RGBA')
    pixels = im.load()
    background = pixels[0,0][:3]
    queue = deque((x, y) for x in range(im.width) for y in (0, im.height-1))
    queue.extend((x,y) for y in range(im.height) for x in (0, im.width-1))
    seen = set()
    while queue:
        x,y = queue.popleft()
        if (x,y) in seen or not (0 <= x < im.width and 0 <= y < im.height): continue
        seen.add((x,y))
        if max(abs(pixels[x,y][c]-background[c]) for c in range(3)) > tolerance: continue
        pixels[x,y] = (0,0,0,0)
        queue.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
    return im.crop(im.getbbox())

image = Image.open(source / 'app-23-20-imessage-stickers.png')
rects = [(25,1046,241,1271),(258,1046,475,1271),(492,1046,720,1271),(25,1280,241,1510),(258,1280,475,1510),(492,1280,720,1510)]
for i, rect in enumerate(rects):
    name = sorted(stickers.glob('*.png'))[i].name
    remove_background(image.crop(rect), 20).save(stickers / name)
    pack = root / 'app/ios/App/BookishStickers/Stickers.xcassets/Sticker Pack.stickerpack'
    for dest in pack.rglob(name):
        remove_background(image.crop(rect), 20).save(dest)
def outlined_pose(name):
    im = Image.open(root / ('app/public/art/' + name + '.webp')).convert('RGBA')
    canvas = Image.new('RGBA', (im.width + 18, im.height + 18))
    canvas.alpha_composite(im, (9,9))
    outline = Image.new('RGBA', canvas.size, (255,253,247,255))
    outline.putalpha(canvas.getchannel('A').filter(ImageFilter.MaxFilter(15)))
    outline.alpha_composite(canvas)
    return outline
asset('LunairRSVP', outlined_pose('calendar'))
asset('LunairVote', outlined_pose('point'))
asset('LunairBookmarks', outlined_pose('peek'))
asset('BookishOxblood', Image.open(root / 'app/public/img/bg-oxblood-m.webp'))
asset('BookishPaper', Image.open(root / 'app/public/img/tx-paper-900.webp').resize((600,804), Image.Resampling.LANCZOS))
# Decorative cup is isolated from the approved Tea widget.
widget = Image.open(source / 'app-24-21-widgets.png')
asset('TeaCup', remove_background(widget.crop((574,757,674,864)), 24))
