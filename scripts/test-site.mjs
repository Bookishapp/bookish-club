// Read-only checks of the actual generated pages. Build with local fixtures first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
const root = new URL('../dist/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const document = new JSDOM(html).window.document;
const base = document.documentElement.dataset.base;

test('approved landing has a single semantic hero and all four product sections', () => {
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('h1').textContent, 'Your book club, just more fun.');
  for (const copy of ['Say it without your name on it.', 'Spoilers stay sealed.', 'Read together, at your own pace.', 'DNF is welcome here.']) {
    assert.ok([...document.querySelectorAll('h2,h3')].some(h => h.textContent === copy), copy);
  }
  assert.match(html, /Bricolage Grotesque/);
  assert.match(html, /Shantell Sans/);
  assert.ok(!html.includes('@import'), 'all landing fonts must be self-contained');
  assert.ok(!html.includes('\u2014'));
});

test('landing links, fragments, and artwork resolve without placeholder actions', () => {
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    assert.notEqual(href, '#', link.textContent);
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    const [pathname, fragment] = href.split('#');
    const rel = pathname ? pathname.slice(base.length).replace(/^\//, '') : '';
    let file = new URL(rel || 'index.html', root);
    if (pathname?.endsWith('/')) file = new URL(rel + 'index.html', root);
    assert.ok(fs.existsSync(file), href);
    if (fragment) {
      const target = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
      assert.ok(target.getElementById(fragment), href);
    }
  }
  for (const [, asset] of html.matchAll(/url\(([^)]+)\)/g)) {
    if (asset.startsWith('/')) assert.ok(fs.existsSync(new URL(asset.slice(base.length).replace(/^\//, ''), root)), asset);
  }
  for (const img of document.querySelectorAll('img')) {
    assert.ok(img.hasAttribute('alt'), img.src);
    assert.ok(fs.existsSync(new URL(img.getAttribute('src').slice(base.length).replace(/^\//, ''), root)), img.src);
  }
});

test('existing search contract, directory, app routes, and forms remain available', () => {
  for (const selector of ['#search', '#q', '#genre', '#suggest', '#results']) assert.ok(document.querySelector(selector), selector);
  for (const route of ['book-clubs', 'read-next', 'resources', 'start', 'claim', 'join', 'privacy', 'terms', 'hosts', 'press', 'about']) {
    assert.ok(fs.existsSync(new URL(route + '/index.html', root)), route);
  }
  const hosts = new JSDOM(fs.readFileSync(new URL('hosts/index.html', root), 'utf8')).window.document;
  assert.equal(hosts.querySelector('form[data-kind="waitlist"]'), null);
  assert.ok(hosts.querySelector(`a[href="${base}/start/"]`));
  assert.ok(hosts.querySelector(`a[href="${base}/claim/"]`));
  for (const route of ['start','claim']) {
    const page = new JSDOM(fs.readFileSync(new URL(route + '/index.html', root), 'utf8')).window.document;
    assert.ok(page.querySelector(`form[data-kind="${route}"]`));
    assert.ok(page.querySelector('[name="show_on_map"]'));
  }
});
