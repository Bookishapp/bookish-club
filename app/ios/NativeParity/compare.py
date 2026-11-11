from pathlib import Path
from PIL import Image
import os
base=Path(os.environ.get('BOOKISH_NATIVE_EVIDENCE','/Users/vahallo/ted-ops/oneshots/1106-bookish-v3art'))
approved=Path('/Users/vahallo/biz/bookish/design/approved-v3-1021')
destination=base/'parity/comparisons'
destination.mkdir(parents=True,exist_ok=True)
for number in range(20,25):
    source=next(approved.glob(f'app-{number:02d}-*.png'))
    left=Image.open(source).convert('RGB').resize((390,844),Image.Resampling.LANCZOS)
    right=Image.open(base/f'parity/built/{number}.png').convert('RGB')
    canvas=Image.new('RGB',(780,844),'white');canvas.paste(left,(0,0));canvas.paste(right,(390,0))
    canvas.save(destination/f'{number}.png')
