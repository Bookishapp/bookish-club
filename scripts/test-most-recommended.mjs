import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
const root = new URL('../dist/', import.meta.url);

test('reader discovery route preserves the frozen shelves and public evidence', () => {
  const route = new URL('most-recommended/index.html', root);
  assert.ok(fs.existsSync(route), 'reader discovery route must be generated');
  const html = fs.readFileSync(route, 'utf8');
  const doc = new JSDOM(html).window.document;
  const base = doc.documentElement.dataset.base;
  const canonical = `${process.env.SITE_URL || 'https://meetbookish.com'}/most-recommended/`;
  assert.equal(doc.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), 'Most Recommended by Real Readers');
  assert.equal(doc.querySelector('link[rel=canonical]').href, canonical);
  for (const key of ['title', 'description', 'url']) assert.ok(doc.querySelector(`meta[property="og:${key}"]`).content);
  assert.equal(doc.querySelector('meta[property="og:url"]').content, canonical);
  assert.equal(doc.querySelector('meta[name=robots]'), null);
  assert.equal(doc.querySelector('#main').getAttribute('tabindex'), '-1', 'skip destination must accept keyboard focus');
  assert.equal(doc.querySelectorAll('.shelf').length, 8);
  assert.equal(doc.querySelectorAll('.book').length, 148);
  assert.equal(new Set([...doc.querySelectorAll('.book')].map(b => b.dataset.key)).size, 128);
  assert.doesNotMatch(html, /\u2014/u);
  assert.equal(doc.querySelectorAll('blockquote,a[download],a[href$=".csv"]').length, 0);
  for (const img of doc.querySelectorAll('.book-cover img')) {
    assert.match(img.src, /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg\?default=false$/);
    assert.equal(img.loading || img.getAttribute('loading'), 'lazy');
    assert.ok(Number(img.width) > 0 && Number(img.height) > 0);
  }
  assert.ok([...doc.querySelectorAll('a')].some(a => a.textContent === 'Covers from Open Library' && a.href === 'https://openlibrary.org/'));
  assert.ok(doc.querySelector(`.foot-site a[href="${base}/most-recommended/"]`));
  assert.ok(fs.readFileSync(new URL('sitemap.xml', root), 'utf8').includes(canonical));
  for (const el of doc.querySelectorAll('a[href],script[src],link[href],img[src]')) {
    const href = el.getAttribute('href') || el.getAttribute('src');
    if (href.startsWith('#')) { assert.ok(doc.getElementById(href.slice(1)), href); continue; }
    if (!href.startsWith('/')) continue;
    assert.ok(href.startsWith(base + '/'), href);
    const relative = href.slice(base.length + 1);
    assert.ok(fs.existsSync(new URL(relative + (href.endsWith('/') ? 'index.html' : ''), root)), href);
  }
});

// These cases catch a low-sample average and the singular rating branch.
test('rating evidence hides averages below five ratings', async () => {
  const { renderMostRecommended } = await import('./most-recommended.mjs');
  const snapshot = JSON.parse(fs.readFileSync(new URL('../data/most-recommended.json', import.meta.url)));
  for (const [count, expected] of [[0, '0 ratings'], [1, '1 rating'], [2, '2 ratings'], [4, '4 ratings'], [5, '4.0 / 5 from 5 ratings']]) {
    const html = renderMostRecommended({ ...snapshot, books: [{ ...snapshot.books[0], ratings_count: count, ratings_average: 4 }] }, { esc: String, fmt: String, url: String });
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelector('.book-evidence > p:nth-child(2)').textContent, expected);
  }
});

test('every published book has at least fifty reading-list additions', () => {
  const { books } = JSON.parse(fs.readFileSync(new URL('../data/most-recommended.json', import.meta.url)));
  assert.ok(books.every(book => book.readinglog_count >= 50));
});

test('search finds titles across apostrophes, punctuation, and extra spaces', () => {
  const html = fs.readFileSync(new URL('most-recommended/index.html', root), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(new URL('../src/most-recommended.js', import.meta.url), 'utf8'));
  const doc = dom.window.document;
  const search = doc.querySelector('#mr-search');
  for (const query of ['ladies detective', "ladies’ detective", 'LADIES   DETECTIVE', 'ladies-detective']) {
    search.value = query;
    search.dispatchEvent(new dom.window.Event('input'));
    assert.ok([...doc.querySelectorAll('.book:not([hidden]) h3')].some(el => el.textContent.includes('Detective Agency')), query);
  }
  dom.window.close();
});
