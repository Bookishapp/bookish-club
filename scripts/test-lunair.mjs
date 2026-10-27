import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';

const root = new URL('../', import.meta.url);
const pageFile = new URL('dist/lunair/index.html', root);
const checkout = { vol1: '', grimoire: '' };
async function render(options = {}) {
  const file = new URL('scripts/build-lunair.mjs', root);
  assert.ok(fs.existsSync(file), 'Lunair renderer exists');
  return (await import(file)).renderLunair({ siteUrl: 'https://meetbookish.com', checkout, ...options });
}

test('shop build produces an accessible page with configured checkout states and real local assets', () => {
  assert.ok(fs.existsSync(pageFile), 'build emits /lunair/index.html');
  const document = new JSDOM(fs.readFileSync(pageFile, 'utf8')).window.document;
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.match(document.querySelector('h1').textContent, /Lunair.*Midnight/s);
  const configured = JSON.parse(fs.readFileSync(new URL('public/lunair/checkout.json', root), 'utf8'));
  for (const key of ['vol1', 'grimoire']) {
    const button = document.querySelector(`[data-checkout="${key}"]`);
    if (configured[key]) {
      assert.equal(button.tagName, 'A');
      assert.equal(button.href, new URL(configured[key]).href);
    } else {
      assert.equal(button.tagName, 'BUTTON');
      assert.equal(button.disabled, true);
    }
  }
  assert.match(document.body.textContent, /30 wallpapers/);
  assert.match(document.body.textContent, /\$9/);
  assert.match(document.body.textContent, /\$19/);
  for (const element of document.querySelectorAll('img[src],script[src],link[rel="stylesheet"]')) {
    const asset = element.getAttribute('src') || element.getAttribute('href');
    assert.ok(fs.existsSync(new URL('dist' + asset, root)), asset);
    if (element.tagName === 'IMG') assert.ok(element.alt.trim());
  }
});

test('empty checkout renders two distinctly named unavailable buttons', async () => {
  const { html } = await render();
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('button[disabled][data-checkout]').length, 2);
  assert.equal(document.querySelectorAll('a[data-checkout]').length, 0);
  assert.equal(document.querySelector('[data-checkout="vol1"]').getAttribute('aria-label'), 'Spells for Grown-Ups, Vol. 1, coming soon');
  assert.equal(document.querySelector('[data-checkout="grimoire"]').getAttribute('aria-label'), 'The Grimoire, coming soon');
});

test('one live product does not appear under a shop-opening-soon notice', async () => {
  for (const configured of [{ vol1: 'https://merchant.example/pack', grimoire: '' }, { vol1: '', grimoire: 'https://merchant.example/grimoire' }]) {
    const { html } = await render({ checkout: configured });
    const document = new JSDOM(html).window.document;
    assert.equal(document.querySelectorAll('a[data-checkout]').length, 1);
    assert.equal(document.querySelectorAll('button[disabled][data-checkout]').length, 1);
    assert.equal(document.querySelector('.opening-note'), null);
  }
});

test('two offers cannot silently sell the same checkout product', async () => {
  await assert.rejects(render({ checkout: { vol1: 'https://merchant.example/product', grimoire: 'https://merchant.example/product' } }), /checkout.*different/i);
});

test('mixed-case UTM keys override defaults without duplicating campaign dimensions', async () => {
  const { html } = await render();
  const dom = new JSDOM(html, { url: 'https://meetbookish.com/lunair/?UTM_Source=story&utm_source=last&UTM_Campaign=moon', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(new URL('src/lunair.js', root), 'utf8'));
  const link = new URL(dom.window.document.querySelector('[data-pass-utm]').href);
  assert.equal(link.searchParams.get('utm_source'), 'story');
  assert.equal(link.searchParams.get('utm_campaign'), 'moon');
  assert.deepEqual([...link.searchParams.keys()], ['utm_source', 'utm_campaign']);
});

test('configured checkout opens the correct products without requiring JavaScript', async () => {
  const { html } = await render({ checkout: { vol1: 'https://merchant.example/pack?offer=vol1', grimoire: 'https://merchant.example/vault' } });
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('a[data-checkout="vol1"]').href, 'https://merchant.example/pack?offer=vol1');
  assert.equal(document.querySelector('a[data-checkout="grimoire"]').href, 'https://merchant.example/vault');
  assert.equal(document.querySelectorAll('button[disabled][data-checkout]').length, 0);
});

test('unsafe or malformed checkout URLs fail the build instead of shipping a payment link', async () => {
  for (const url of ['javascript:alert(1)', 'http://merchant.example/pack', 'https://user:password@merchant.example/pack', 'not a url']) {
    await assert.rejects(render({ checkout: { vol1: url, grimoire: '' } }), /checkout.*https/i);
  }
});

test('Fictora receives default bio attribution with JavaScript disabled', async () => {
  const { html } = await render();
  const document = new JSDOM(html).window.document;
  const link = new URL(document.querySelector('[data-pass-utm]').href);
  assert.equal(link.origin, 'https://fictora.co');
  assert.equal(link.searchParams.get('utm_source'), 'instagram');
  assert.equal(link.searchParams.get('utm_campaign'), 'lunairandmidnight');
});

test('inbound UTMs survive forwarding, with missing defaults filled and unrelated parameters excluded', async () => {
  const { html } = await render();
  const file = new URL('src/lunair.js', root);
  assert.ok(fs.existsSync(file), 'attribution script exists');
  const dom = new JSDOM(html, { url: 'https://meetbookish.com/lunair/?utm_source=story&utm_source=last&utm_content=moon%2Bcat&utm_term=cozy+witch&email=private#shop', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(file, 'utf8'));
  const link = new URL(dom.window.document.querySelector('[data-pass-utm]').href);
  assert.equal(link.searchParams.get('utm_source'), 'story');
  assert.equal(link.searchParams.get('utm_campaign'), 'lunairandmidnight');
  assert.equal(link.searchParams.get('utm_content'), 'moon+cat');
  assert.equal(link.searchParams.get('utm_term'), 'cozy witch');
  assert.equal(link.searchParams.has('email'), false);
  assert.equal(link.searchParams.getAll('utm_source').length, 1);
  assert.equal(dom.window.location.hash, '#shop');
});

test('shop and assets support the existing GitHub Pages project base path', async () => {
  const { html, redirect } = await render({ siteUrl: 'https://bookishapp.github.io/bookish-club' });
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://bookishapp.github.io/bookish-club/lunair/');
  for (const element of document.querySelectorAll('img[src],script[src],link[rel="stylesheet"]')) {
    assert.match(element.getAttribute('src') || element.getAttribute('href'), /^\/bookish-club\//);
  }
  const target = new JSDOM(redirect).window.document.querySelector('a').getAttribute('href');
  assert.equal(target, '/bookish-club/lunair/');
});

test('Midnight redirect preserves the exact query and fragment', async () => {
  const { redirect } = await render();
  const document = new JSDOM(redirect).window.document;
  const source = document.querySelector('script').textContent;
  let destination;
  vm.runInNewContext(source, { location: { search: '?utm_source=instagram&utm_campaign=lunairandmidnight&x=a%2Bb', hash: '#shop', replace: value => { destination = value; } } });
  assert.equal(destination, '/lunair/?utm_source=instagram&utm_campaign=lunairandmidnight&x=a%2Bb#shop');
  assert.equal(document.querySelector('a').getAttribute('href'), '/lunair/');
});
