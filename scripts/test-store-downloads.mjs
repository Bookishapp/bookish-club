import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';
import { renderStoreDownloads, STORE_URLS } from './store-downloads.mjs';
import { checkStorePages } from './check-store-pages.mjs';

test('one Play URL switches the Android state to an official badge without a template edit', () => {
  const stores = { ...STORE_URLS, googlePlay: 'https://play.google.com/store/apps/details?id=com.meetbookish.app&hl=en' };
  const dom = new JSDOM(renderStoreDownloads('/bookish-club', stores));
  const doc = dom.window.document;
  const links = [...doc.querySelectorAll('a')];
  assert.deepEqual(links.map(link => link.href), [stores.appStore, stores.googlePlay]);
  assert.equal(links[1].querySelector('img').alt, 'Get it on Google Play');
  assert.equal(links[1].querySelector('img').getAttribute('src'), '/bookish-club/img/get-it-on-google-play.png');
  assert.doesNotMatch(doc.body.textContent, /coming soon/i);
  assert.ok(fs.existsSync(new URL('../public/img/get-it-on-google-play.png', import.meta.url)));
  dom.window.close();
});

test('build guard rejects a missing block, duplicate blocks, and unconfigured store links', () => {
  const directory = fs.mkdtempSync(path.join(process.env.BOOKISH_TEST_TMP || os.tmpdir(), 'bookish-stores-'));
  try {
    const file = path.join(directory, 'index.html');
    fs.writeFileSync(file, '<h1>A page without an install handoff</h1>');
    assert.throws(() => checkStorePages(directory), /expected one Get the app block/);
    fs.writeFileSync(file, renderStoreDownloads() + renderStoreDownloads());
    assert.throws(() => checkStorePages(directory), /expected one Get the app block/);
    for (const href of ['https://apps.apple.com/app/id000000', 'https://play.google.com/store/apps/details?id=wrong', '//apps.apple.com/app/id000000', 'https://apps&#46;apple.com/app/id000000']) {
      fs.writeFileSync(file, renderStoreDownloads() + `<a href="${href}">Store</a>`);
      assert.throws(() => checkStorePages(directory), /store destination is not in STORE_URLS/);
    }
    fs.writeFileSync(file, renderStoreDownloads());
    assert.equal(checkStorePages(directory), 1);
    const stores = { ...STORE_URLS, googlePlay: 'https://play.google.com/store/apps/details?id=com.meetbookish.app&hl=en' };
    fs.writeFileSync(file, renderStoreDownloads('', stores));
    assert.equal(checkStorePages(directory, stores), 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
