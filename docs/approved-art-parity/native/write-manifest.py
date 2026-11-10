#!/usr/bin/env python3
"""Record dimensions, hashes, and scope for the native simulator capture set."""
from pathlib import Path
import datetime
import hashlib
import json
import struct

base = Path(__file__).resolve().parent
files = []
for folder in ['actual', 'cards']:
    for path in sorted((base / folder).glob('*.png')):
        data = path.read_bytes()
        width, height = struct.unpack('>II', data[16:24])
        if folder == 'actual':
            assert (width, height) == (390, 844), path
        files.append({'path': str(path.relative_to(base)), 'width': width, 'height': height,
                      'sha256': hashlib.sha256(data).hexdigest()})
manifest = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'device': 'iPhone 13 Pro', 'runtime': 'iOS 26.5 (23F77)', 'xcode': '27.1 (27A9275)',
    'screenSizePoints': [390, 844],
    'captureMethod': 'simctl screenshot, normalized from 3x to 1x using sips',
    'host': 'Review-only standalone UIKit host, compiled from production native source files',
    'limitations': ['Not captured inside Apple Messages chrome',
                    'No live conversation, send, cancel, sticker peeling, or delivery validation',
                    'Drawer image is a bundled resource preview', 'No native invite or Tea card exists'],
    'screenshots': files,
}
(base / 'capture-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'{len(files)} verified native PNG files recorded in capture-manifest.json.')
