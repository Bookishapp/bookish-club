import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
const root = new URL('../dist/', import.meta.url);

test('every generated Bookish page offers working routes without launch placeholders', () => {
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    if (!entry.endsWith('.html')) continue;
    const body = fs.readFileSync(new URL(entry, root), 'utf8');
    const content = body.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    assert.equal(content.match(/coming soon|waitlist/i)?.[0] ?? null, null, entry);
    assert.doesNotMatch(content, /\$\d|data-checkout|stripe\.com|buy\.stripe/i, entry);
  }
  const doc = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8')).window.document;
  assert.ok(doc.querySelector('a[href$="/app/"]'), 'landing must open the functional web app');
  const storeLinks = [...doc.querySelectorAll('a[href*="apps.apple.com"]')];
  assert.equal(storeLinks.length, 2, 'offer the released iOS app in the hero and footer');
  for (const link of storeLinks) {
    assert.equal(link.href, 'https://apps.apple.com/us/app/bookish-book-club-night/id6823470101');
    assert.equal(link.querySelector('img')?.alt, 'Download on the App Store');
  }
  assert.ok(storeLinks[0].closest('.hero-actions'), 'download belongs next to the main action');
  assert.ok(storeLinks[1].closest('footer'), 'download is also available in the footer');
  assert.equal(doc.querySelector('meta[name="apple-itunes-app"]')?.content, 'app-id=6823470101');
  assert.equal(doc.querySelector('a[href*="play.google.com"]'), null, 'no Android app is available');
});

test('landing small-print links and the hero badge match the page instead of browser defaults', () => {
  const doc = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8')).window.document;
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  // The hero "Open Bookish on the web." and the how-it-works "Open Bookish" links sit in .sm on oxblood.
  const smallLinks = [...doc.querySelectorAll('.sm a')].filter(a => !a.getAttribute('style'));
  assert.ok(smallLinks.length >= 2, 'landing keeps its small-print web app links');
  assert.match(css, /\.sm a\{[^}]*color:var\(--on\)/, 'small-print links use the page ink, not default link blue');
  // Clear space stays as padding, but the visible badge lines up with the buttons above it.
  assert.match(css, /\.hero-actions>\.app-store-badge\{[^}]*margin-left:-12px/, 'hero badge artwork aligns with the hero buttons');
});

test('deployed web app has its own bundle and all local assets resolve under its prefix', () => {
  const file = new URL('app/index.html', root);
  assert.ok(fs.existsSync(file), 'web app must be deployed');
  const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const base = doc.querySelector('meta[name="bookish-base"]').content;
  const site = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8')).window.document;
  assert.equal(base, site.documentElement.dataset.base + '/app/', 'app assets must use the deployed site prefix');
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
