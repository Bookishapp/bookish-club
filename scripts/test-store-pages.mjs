import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
import { STORE_URLS } from './store-downloads.mjs';
const root = new URL('../dist/', import.meta.url);

test('every generated page includes one accessible store block and only configured store destinations', async () => {
  const home = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8'));
  const base = home.window.document.documentElement.dataset.base;
  home.window.close();
  const allowed = new Set(Object.values(STORE_URLS).filter(Boolean));
  let pages = 0;
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    if (!entry.endsWith('.html')) continue;
    const html = fs.readFileSync(new URL(entry, root), 'utf8');
    assert.match(html, /data-store-downloads/, `${entry} needs the shared Get the app block`);
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const blocks = doc.querySelectorAll('[data-store-downloads]');
    assert.equal(blocks.length, 1, entry);
    assert.equal(blocks[0].getAttribute('aria-label'), 'Get the app', entry);
    if (entry === 'app/index.html') assert.equal(blocks[0].parentElement, doc.body, 'app rerenders must preserve the web-only install block');
    if (!STORE_URLS.googlePlay) assert.match(blocks[0].textContent, /Android is coming soon\./, entry);
    const apple = blocks[0].querySelector('a[href*="apps.apple.com"]');
    assert.equal(apple?.href, STORE_URLS.appStore, entry);
    assert.equal(apple.querySelector('img')?.alt, 'Download on the App Store', entry);
    assert.equal(doc.querySelectorAll('a[href*="apps.apple.com"]').length, 1, entry);
    for (const link of doc.querySelectorAll('a[href]')) {
      if (/apps\.apple\.com|play\.google\.com/.test(link.href)) assert.ok(allowed.has(link.href), `${entry}: ${link.href}`);
    }
    for (const image of blocks[0].querySelectorAll('img')) {
      const src = image.getAttribute('src');
      assert.ok(src.startsWith(`${base}/img/`), `${entry}: ${src}`);
      assert.ok(fs.existsSync(new URL(src.slice(base.length).replace(/^\//, ''), root)), src);
    }
    assert.equal(doc.querySelector('a[href*="play.google.com"]')?.href ?? '', STORE_URLS.googlePlay, entry);
    dom.window.close();
    pages++;
  }
  assert.ok(pages >= 936, `expected full route inventory, found ${pages}`);
});
