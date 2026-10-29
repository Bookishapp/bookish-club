import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
const root = new URL('../dist/', import.meta.url);

test('every generated Bookish page offers working routes without launch placeholders', () => {
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    if (!entry.endsWith('.html') || entry.startsWith('lunair/')) continue;
    const body = fs.readFileSync(new URL(entry, root), 'utf8');
    const content = body.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    assert.equal(content.match(/coming soon|waitlist/i)?.[0] ?? null, null, entry);
  }
  const doc = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8')).window.document;
  assert.ok(doc.querySelector('a[href$="/app/"]'), 'landing must open the functional web app');
  assert.equal(doc.querySelector('a[href*="apps.apple.com"]'), null, 'do not advertise an unreleased app');
});

test('deployed web app has its own bundle and all local assets resolve under its prefix', () => {
  const file = new URL('app/index.html', root);
  assert.ok(fs.existsSync(file), 'web app must be deployed');
  const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const base = doc.querySelector('meta[name="bookish-base"]').content;
  assert.ok(base.endsWith('/app/'));
  for (const el of doc.querySelectorAll('script[src],link[href]')) {
    const asset = el.getAttribute('src') || el.getAttribute('href');
    if (/^https?:/.test(asset)) continue;
    assert.ok(asset.startsWith(base), `local asset escapes app prefix: ${asset}`);
    assert.ok(fs.existsSync(new URL('app/' + asset.slice(base.length), root)), asset);
  }
  for (const file of fs.readdirSync(new URL('app/assets/', root))) {
    if (!file.endsWith('.css')) continue;
    const css = fs.readFileSync(new URL('app/assets/' + file, root), 'utf8');
    for (const [, value] of css.matchAll(/url\(([^)]+)\)/g)) {
      const asset = value.replace(/^['"]|['"]$/g, '');
      if (asset.startsWith('data:') || /^https?:/.test(asset)) continue;
      assert.ok(asset.startsWith(base), `CSS asset escapes app prefix: ${asset}`);
      assert.ok(fs.existsSync(new URL('app/' + asset.slice(base.length), root)), asset);
    }
  }
  for (const name of ['clubs', 'books', 'community']) {
    assert.ok(fs.existsSync(new URL(`app/data/${name}.json`, root)), name);
  }
});
