import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from '../app/node_modules/jsdom/lib/api.js';

const root = new URL('../', import.meta.url);
const apiUrl = 'https://library-test.supabase.co/functions/v1/lunair-library';
const token = 'a'.repeat(43);
const bearer = 'b'.repeat(43);
const future = () => new Date(Date.now() + 3600000).toISOString();
const storageUrl = 'https://library-test.supabase.co/storage/v1/object/sign/lunair-packs-test/packs/vol1.zip?token=signed-download';
const pack = () => ({ id: 'vol1', title: 'Spells for Grown-Ups, Vol. 1', downloadUrl: storageUrl, expiresAt: future() });
const payload = () => ({ accessToken: bearer, expiresAt: future(), packs: [pack()], grimoire: true });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
async function render(options = {}) {
  const renderer = new URL('scripts/build-lunair-library.mjs', root);
  assert.ok(fs.existsSync(renderer), 'Library renderer exists');
  return (await import(renderer)).renderLunairLibrary({ siteUrl: 'https://meetbookish.com', config: { apiUrl, testMode: true }, ...options });
}
async function start(t, { hash = '', search = '', response = payload(), status = 200, saved, config, fetcher } = {}) {
  const html = await render(config ? { config } : {});
  const dom = new JSDOM(html, { url: `https://meetbookish.com/lunair/library/${search}${hash}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const calls = [];
  dom.window.fetch = async (url, options) => {
    calls.push({ url, options, location: dom.window.location.href });
    const data = JSON.parse(options.body).action === 'redeem' ? { accessToken: response.accessToken, expiresAt: response.expiresAt } : response;
    return fetcher ? fetcher(url, options, calls.length) : { ok: status < 400, status, json: async () => data };
  };
  if (saved) dom.window.sessionStorage.setItem('lunair-library-session', JSON.stringify(saved));
  dom.window.eval(fs.readFileSync(new URL('src/lunair-library.js', root), 'utf8'));
  await flush();
  return { dom, document: dom.window.document, calls };
}

// Catches missing page output, leaked referrers, or a search-indexable access page.
test('library output is private, accessible, and supports project base paths', async () => {
  const html = await render({ siteUrl: 'https://fictora.github.io/bookish-club' });
  const document = new JSDOM(html).window.document;
  assert.match(document.querySelector('meta[name="robots"]').content, /noindex/);
  assert.equal(document.querySelector('meta[name="referrer"]').content, 'no-referrer');
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('label[for="library-email"]').textContent, 'Email address');
  assert.equal(document.querySelector('#library-email').type, 'email');
  assert.equal(document.querySelector('#library-email').required, true);
  for (const node of document.querySelectorAll('script[src],link[rel="stylesheet"],img[src]')) {
    assert.match(node.getAttribute('src') || node.getAttribute('href'), /^\/bookish-club\//);
  }
  assert.equal(document.querySelector('[data-library-home]').getAttribute('href'), '/bookish-club/lunair/');
});

test('unsafe API configuration fails the build before any customer token can be sent', async () => {
  for (const apiUrl of ['http://library-test.supabase.co/functions/v1/lunair-library', 'https://attacker.example/functions/v1/lunair-library', 'https://library-test.supabase.co.evil.test/functions/v1/lunair-library', 'https://user:pass@library-test.supabase.co/functions/v1/lunair-library', 'https://library-test.supabase.co/functions/v1/lunair-library?token=secret']) {
    await assert.rejects(render({ config: { apiUrl } }), /library API/i);
  }
});

test('unconfigured library gives a useful unavailable state and makes no requests', async t => {
  const { document, calls } = await start(t, { config: { apiUrl: '', testMode: true } });
  assert.equal(document.querySelector('#library-submit').disabled, true);
  assert.match(document.querySelector('#library-status').textContent, /not open yet/i);
  assert.equal(document.querySelector('#library-test-mode').hidden, false);
  assert.equal(calls.length, 0);
});

test('email submission sends only the request contract and gives an enumeration-safe reply', async t => {
  const { dom, document, calls } = await start(t, { status: 202, response: { message: 'Do not display untrusted response text' } });
  document.querySelector('#library-email').value = 'reader@example.com';
  document.querySelector('#library-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, apiUrl);
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'request_link', email: 'reader@example.com' });
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(document.querySelector('#library-status').textContent, 'If this email owns a Lunair pack, a library link is on its way. Check your inbox and spam folder.');
});

test('token redemption removes URL secrets before fetch and renders owned downloads', async t => {
  const { document, calls, dom } = await start(t, { hash: `#token=${token}`, search: '?email=reader%40example.com' });
  assert.equal(calls[0].location, 'https://meetbookish.com/lunair/library/');
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'redeem', token });
  assert.equal(document.querySelector('#library-form').hidden, true);
  const link = document.querySelector('#library-packs a');
  assert.equal(link.href, storageUrl);
  assert.equal(link.referrerPolicy, 'no-referrer');
  assert.match(link.rel, /noreferrer/);
  assert.match(document.querySelector('#library-grimoire').textContent, /future packs/i);
  assert.equal(document.querySelector('#library-grimoire').hidden, false);
  assert.equal(JSON.parse(dom.window.sessionStorage.getItem('lunair-library-session')).accessToken, bearer);
  assert.equal(dom.window.localStorage.length, 0);
});

test('reload refreshes signed links with bearer auth, without putting the bearer in a URL or JSON body', async t => {
  const { calls, document } = await start(t, { saved: { accessToken: bearer, expiresAt: future() }, response: { packs: [pack()], grimoire: false } });
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'list' });
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${bearer}`);
  assert.equal(calls[0].url, apiUrl);
  assert.equal(document.querySelectorAll('#library-packs a').length, 1);
  assert.equal(document.querySelector('#library-grimoire').hidden, true);
});

test('pack titles render as text and foreign, public, or malformed download URLs are withheld', async t => {
  const badUrls = ['javascript:alert(1)', 'https://evil.example/storage/v1/object/sign/lunair-packs-test/packs/vol1.zip', 'https://library-test.supabase.co.evil.test/storage/v1/object/sign/lunair-packs-test/packs/vol1.zip', 'https://library-test.supabase.co/storage/v1/object/public/lunair-packs-test/packs/vol1.zip', 'https://user:pass@library-test.supabase.co/storage/v1/object/sign/lunair-packs-test/packs/vol1.zip', 'https://library-test.supabase.co:444/storage/v1/object/sign/lunair-packs-test/packs/vol1.zip'];
  const { document } = await start(t, { hash: `#token=${token}`, response: { ...payload(), packs: [{ ...pack(), title: '<img src=x onerror=alert(1)>' }, ...badUrls.map((downloadUrl, index) => ({ ...pack(), id: `bad-${index}`, downloadUrl }))] } });
  assert.match(document.querySelector('#library-packs').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(document.querySelectorAll('#library-packs img').length, 0);
  assert.equal(document.querySelectorAll('#library-packs a').length, 1);
  assert.match(document.querySelector('#library-packs').textContent, /Refresh downloads/);
});

test('expired download links remain unavailable until refreshed', async t => {
  const { document } = await start(t, { hash: `#token=${token}`, response: { ...payload(), packs: [{ ...pack(), expiresAt: '2020-01-01T00:00:00.000Z' }] } });
  assert.equal(document.querySelectorAll('#library-packs a').length, 0);
  assert.match(document.querySelector('#library-packs').textContent, /expired/i);
});

test('expired saved sessions are erased without making an authenticated request', async t => {
  const { dom, document, calls } = await start(t, { saved: { accessToken: bearer, expiresAt: '2020-01-01T00:00:00.000Z' } });
  assert.equal(calls.length, 0);
  assert.equal(dom.window.sessionStorage.getItem('lunair-library-session'), null);
  assert.match(document.querySelector('#library-status').textContent, /expired/i);
  assert.equal(document.querySelector('#library-form').hidden, false);
});

test('expired or reused magic links return to the email form without exposing backend text', async t => {
  const { document, dom } = await start(t, { hash: `#token=${token}`, status: 401, response: { error: '<script>private server trace</script>' } });
  assert.equal(document.querySelector('#library-form').hidden, false);
  assert.match(document.querySelector('#library-status').textContent, /expired|already been used/i);
  assert.doesNotMatch(document.body.textContent, /private server trace/);
  assert.equal(dom.window.sessionStorage.getItem('lunair-library-session'), null);
});

test('empty ownership produces a clear empty state with a way back to the shop', async t => {
  const { document } = await start(t, { hash: `#token=${token}`, response: { ...payload(), packs: [] } });
  assert.equal(document.querySelector('#library-empty').hidden, false);
  assert.equal(document.querySelector('#library-empty a').getAttribute('href'), '/lunair/');
});

test('refresh replaces signed download URLs and sign-out clears all owned content and the session', async t => {
  const refreshedUrl = storageUrl.replace('signed-download', 'refreshed-download');
  const { document, calls, dom } = await start(t, { hash: `#token=${token}`, fetcher: async (_url, _options, count) => ({ ok: true, status: 200, json: async () => count <= 2 ? payload() : { packs: [{ ...pack(), downloadUrl: refreshedUrl }], grimoire: true } }) });
  document.querySelector('#library-refresh').click();
  await flush();
  assert.equal(document.querySelector('#library-packs a').href, refreshedUrl);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${bearer}`);
  document.querySelector('#library-sign-out').click();
  assert.equal(document.querySelectorAll('#library-packs a').length, 0);
  assert.equal(document.querySelector('#library-owned').hidden, true);
  assert.equal(document.querySelector('#library-form').hidden, false);
  assert.equal(dom.window.sessionStorage.getItem('lunair-library-session'), null);
});

test('a delayed refresh cannot restore downloads after sign-out', async t => {
  let finish;
  const { document, dom } = await start(t, { hash: `#token=${token}`, fetcher: async (_url, _options, count) => count <= 2 ? { ok: true, status: 200, json: async () => payload() } : new Promise(resolve => { finish = resolve; }) });
  document.querySelector('#library-refresh').click();
  await flush();
  document.querySelector('#library-sign-out').click();
  finish({ ok: true, status: 200, json: async () => ({ packs: [pack()], grimoire: true }) });
  await flush();
  assert.equal(document.querySelectorAll('#library-packs a').length, 0);
  assert.equal(dom.window.sessionStorage.getItem('lunair-library-session'), null);
});

test('query-only tokens are removed and never redeemed', async t => {
  const { dom, calls } = await start(t, { search: `?token=${token}` });
  assert.equal(dom.window.location.search, '');
  assert.equal(calls.length, 0);
});

test('site build emits the library with local assets and keeps it out of the sitemap', () => {
  const output = new URL('dist/lunair/library/index.html', root);
  assert.ok(fs.existsSync(output), 'Build emits /lunair/library/');
  const document = new JSDOM(fs.readFileSync(output, 'utf8')).window.document;
  for (const element of document.querySelectorAll('img[src],script[src],link[rel="stylesheet"]')) {
    const asset = element.getAttribute('src') || element.getAttribute('href');
    assert.ok(fs.existsSync(new URL('dist' + asset, root)), asset);
  }
  assert.doesNotMatch(fs.readFileSync(new URL('dist/sitemap.xml', root), 'utf8'), /\/lunair\/library\//);
});

test('Lunair shop gives existing buyers a direct library link', async () => {
  const { renderLunair } = await import('./build-lunair.mjs');
  const { html } = renderLunair({ siteUrl: 'https://meetbookish.com', checkout: { vol1: '', grimoire: '' } });
  const document = new JSDOM(html).window.document;
  const link = document.querySelector('a[href="/lunair/library/"]');
  assert.ok(link, 'Existing buyers can open their library from the shop');
  assert.match(link.textContent, /library/i);
});

test('invalid email never sends a request and focuses the correction', async t => {
  const { dom, document, calls } = await start(t);
  document.querySelector('#library-email').value = 'not-an-email';
  document.querySelector('#library-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(document.activeElement.id, 'library-email');
  assert.equal(document.querySelector('#library-email').getAttribute('aria-invalid'), 'true');
});

test('request-link rate limits retain the email form and offer a safe retry', async t => {
  const { dom, document } = await start(t, { status: 429 });
  document.querySelector('#library-email').value = 'reader@example.com';
  document.querySelector('#library-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.match(document.querySelector('#library-status').textContent, /Wait a few minutes/);
  assert.equal(document.querySelector('#library-submit').disabled, false);
});

test('an expired server session clears cached access and asks for a fresh email link', async t => {
  const { document, dom } = await start(t, { saved: { accessToken: bearer, expiresAt: future() }, status: 401 });
  assert.equal(dom.window.sessionStorage.getItem('lunair-library-session'), null);
  assert.equal(document.querySelector('#library-form').hidden, false);
  assert.match(document.querySelector('#library-status').textContent, /expired/);
});

test('network failure keeps owned packs available and enables another refresh', async t => {
  const { document } = await start(t, { hash: `#token=${token}`, fetcher: async (_url, _options, count) => {
    if (count > 2) throw new Error('Simulated offline connection');
    return { ok: true, status: 200, json: async () => payload() };
  } });
  document.querySelector('#library-refresh').click();
  await flush();
  assert.equal(document.querySelectorAll('#library-packs a').length, 1);
  assert.equal(document.querySelector('#library-refresh').disabled, false);
  assert.match(document.querySelector('#library-status').textContent, /connection/);
});

test('a stale refresh cannot unlock a newer email request after sign-out', async t => {
  let finishRefresh;
  let finishEmail;
  const { document, dom, calls } = await start(t, { hash: `#token=${token}`, fetcher: async (_url, _options, count) => {
    if (count <= 2) return { ok: true, status: 200, json: async () => payload() };
    if (count === 3) return new Promise(resolve => { finishRefresh = resolve; });
    return new Promise(resolve => { finishEmail = resolve; });
  } });
  document.querySelector('#library-refresh').click();
  await flush();
  document.querySelector('#library-sign-out').click();
  document.querySelector('#library-email').value = 'reader@example.com';
  const submitForm = () => document.querySelector('#library-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  submitForm();
  await flush();
  finishRefresh({ ok: true, status: 200, json: async () => ({ packs: [pack()], grimoire: true }) });
  await flush();
  submitForm();
  assert.equal(calls.length, 4, 'Only one email request remains in flight');
  finishEmail({ ok: true, status: 202, json: async () => ({ message: 'Accepted' }) });
  await flush();
});

test('successful redemption saves access before a failed download listing and retries without another email', async t => {
  const { document, dom, calls } = await start(t, { hash: `#token=${token}`, fetcher: async (_url, options, count) => {
    const action = JSON.parse(options.body).action;
    if (action === 'redeem') return { ok: true, status: 200, json: async () => ({ accessToken: bearer, expiresAt: future() }) };
    assert.equal(action, 'list');
    if (count === 2) return { ok: false, status: 503, json: async () => ({ error: 'Temporary signing failure' }) };
    return { ok: true, status: 200, json: async () => ({ expiresAt: future(), packs: [pack()], grimoire: true }) };
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${bearer}`);
  assert.equal(JSON.parse(dom.window.sessionStorage.getItem('lunair-library-session')).accessToken, bearer);
  assert.equal(document.querySelector('#library-form').hidden, true);
  assert.equal(document.querySelector('#library-owned').hidden, false);
  assert.equal(document.querySelector('#library-refresh').disabled, false);
  assert.match(document.querySelector('#library-status').textContent, /Refresh downloads/);
  document.querySelector('#library-refresh').click();
  await flush();
  assert.equal(document.querySelector('#library-packs a').href, storageUrl);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => JSON.parse(call.options.body).action), ['redeem', 'list', 'list']);
});
