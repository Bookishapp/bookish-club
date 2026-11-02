import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { inboundHandler } from '../../supabase/functions/_shared/inbound.ts';
import { createSecretReader } from '../../supabase/functions/_shared/secrets.ts';

const id = 'a1b2c3d4-1234-4234-8234-123456789abc';
const secret = `whsec_${Buffer.from('inbound-test-signing-key').toString('base64')}`;
const timestamp = 1793638800;
const event = { type: 'email.received', data: { email_id: id } };
const email = {
  id, from: 'Reader <reader@example.test>', to: ['hello@meetbookish.com', 'help@meetbookish.com'],
  subject: 'A book question', text: 'Original text', html: '<p>Original HTML</p>', attachments: [],
};
const limit = 10 * 1024 * 1024;

function request(value = event, options = {}) {
  const body = options.body ?? JSON.stringify(value);
  const time = options.timestamp ?? timestamp;
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`msg_fixture.${time}.${body}`).digest('base64');
  return new Request('https://local.test/bookish-inbound', {
    method: 'POST', body,
    headers: { 'svix-id': 'msg_fixture', 'svix-timestamp': String(time), 'svix-signature': `v1,${signature}`, ...options.headers },
  });
}

function fixture(overrides = {}) {
  const calls = [], sent = [], completed = new Set();
  const deps = {
    secret: async () => secret, apiKey: async () => 'fixture-api-key',
    forwardTo: async () => 'hello@getkres.com', now: () => timestamp * 1000,
    begin: async emailId => { calls.push(['begin', emailId]); return completed.has(emailId) ? 'done' : 'send'; },
    complete: async emailId => { calls.push(['complete', emailId]); completed.add(emailId); },
    fetcher: async (url, options = {}) => {
      calls.push([String(url), options]);
      if (String(url) === `https://api.resend.com/emails/receiving/${id}?html_format=cid`) return Response.json(email);
      if (String(url) === `https://api.resend.com/emails/receiving/${id}/attachments?limit=100`) return Response.json({ data: [], has_more: false });
      if (String(url) === 'https://api.resend.com/emails') { sent.push(JSON.parse(options.body)); return Response.json({ id: 'outbound-id' }); }
      assert.fail(`Unexpected fetch ${url}`);
    },
    ...overrides,
  };
  return { deps, calls, sent, completed, handler: inboundHandler(deps) };
}

test('unsigned, invalid, altered, stale, and future signatures fail before any email access', async () => {
  for (const req of [
    request(event, { headers: { 'svix-signature': '' } }),
    request(event, { headers: { 'svix-signature': 'v1,aW52YWxpZA==' } }),
    request(event, { headers: { 'svix-id': 'changed' } }),
    request(event, { timestamp: timestamp - 301 }),
    request(event, { timestamp: timestamp + 301 }),
  ]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(req)).status, 401);
    assert.deepEqual(calls, []);
  }
});

test('signature verification uses the exact raw body and accepts a matching rotated signature', async () => {
  const { handler, sent } = fixture();
  const raw = ' { "type" : "email.received", "data": { "email_id": "' + id + '" } }\n';
  const req = request(event, { body: raw });
  req.headers.set('svix-signature', `v1,aW52YWxpZA== v2,ignored ${req.headers.get('svix-signature')}`);
  assert.equal((await handler(req)).status, 200);
  assert.equal(sent.length, 1);
  const changed = request();
  const altered = new Request(changed.url, { method: 'POST', headers: changed.headers, body: JSON.stringify(event) + ' ' });
  assert.equal((await handler(altered)).status, 401);
});

test('signed unrelated events are acknowledged, and malformed received events are rejected', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ type: 'email.sent' }))).status, 200);
  for (const value of [null, [], { type: 'email.received' }, { type: 'email.received', data: { email_id: '../escape' } }]) {
    assert.equal((await handler(request(value))).status, 400);
  }
  assert.equal((await handler(request(event, { body: '{' }))).status, 400);
  assert.deepEqual(calls, []);
  assert.equal((await handler(new Request('https://local.test', { method: 'GET' }))).status, 405);
});

test('forwards fetched text and HTML with original reply address, recipients, subject, and stable key', async () => {
  const { handler, calls, sent } = fixture();
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(sent[0], {
    from: 'Bookish Inbox <inbox@meetbookish.com>', to: ['hello@getkres.com'],
    reply_to: 'reader@example.test', subject: '[Bookish] A book question',
    text: 'From: Reader <reader@example.test> To: hello@meetbookish.com, help@meetbookish.com\n\nOriginal text',
    html: '<p>From: Reader &lt;reader@example.test&gt; To: hello@meetbookish.com, help@meetbookish.com</p>\n<p>Original HTML</p>',
  });
  const outbound = calls.find(([url]) => url === 'https://api.resend.com/emails')[1];
  assert.equal(outbound.headers['Idempotency-Key'], `bookish-inbound/${id}`);
  assert.equal(outbound.headers.authorization, 'Bearer fixture-api-key');
  assert.deepEqual(calls.at(-1), ['complete', id]);
});

test('drops own-domain, subdomain, and forward-target senders case-insensitively', async () => {
  for (const from of ['Bookish <INBOX@MEETBOOKISH.COM>', 'test@send.meetbookish.com', 'Sebastian <HELLO@GETKRES.COM>']) {
    const { handler, calls, sent } = fixture({
      fetcher: async () => Response.json({ ...email, from }),
    });
    assert.equal((await handler(request())).status, 200);
    assert.equal(sent.length, 0);
    assert.deepEqual(calls, []);
  }
});

function attachmentFixture(attachments, downloads) {
  const base = fixture();
  const normal = base.deps.fetcher;
  base.deps.fetcher = async (url, options) => {
    if (String(url).includes('?html_format=cid')) return Response.json({ ...email, attachments });
    if (String(url).includes('/attachments?')) return Response.json({ data: attachments, has_more: false });
    if (String(url).startsWith('https://download.test/')) {
      assert.equal(options?.headers?.authorization, undefined);
      return new Response(downloads.get(String(url)));
    }
    return normal(url, options);
  };
  return { ...base, handler: inboundHandler(base.deps) };
}

test('includes attachments totaling exactly 10 MB and preserves inline content IDs', async () => {
  const attachments = [{ id: 'att-1', filename: 'cover.png', size: limit, content_type: 'image/png', content_id: 'cover', download_url: 'https://download.test/one' }];
  const { handler, sent } = attachmentFixture(attachments, new Map([['https://download.test/one', new Uint8Array(limit).fill(42)]]));
  assert.equal((await handler(request())).status, 200);
  assert.equal(sent[0].attachments[0].filename, 'cover.png');
  assert.equal(sent[0].attachments[0].content_type, 'image/png');
  assert.equal(sent[0].attachments[0].content_id, 'cover');
  assert.equal(Buffer.from(sent[0].attachments[0].content, 'base64').length, limit);
});

test('lists all attachment names without downloads when their total exceeds 10 MB', async () => {
  const attachments = [
    { id: 'att-1', filename: '<large>.pdf', size: limit, download_url: 'https://download.test/one' },
    { id: 'att-2', filename: 'extra.pdf', size: 1, download_url: 'https://download.test/two' },
  ];
  const { handler, sent } = attachmentFixture(attachments, new Map());
  assert.equal((await handler(request())).status, 200);
  assert.equal(sent[0].attachments, undefined);
  assert.match(sent[0].text, /Attachments omitted.*10 MB[\s\S]*<large>\.pdf[\s\S]*extra\.pdf/);
  assert.match(sent[0].html, /&lt;large&gt;\.pdf/);
});

test('enforces the byte limit even when download sizes disagree with metadata', async () => {
  const attachments = [{ id: 'att-1', filename: 'large.bin', size: 1, download_url: 'https://download.test/one' }];
  const { handler, sent } = attachmentFixture(attachments, new Map([['https://download.test/one', new Uint8Array(limit + 1)]]));
  assert.equal((await handler(request())).status, 200);
  assert.equal(sent[0].attachments, undefined);
  assert.match(sent[0].text, /large\.bin/);
});

test('completed replays never resend, and expired uncertain attempts are not sent', async () => {
  const { handler, sent } = fixture();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  assert.equal(sent.length, 1);
  const expired = fixture({ begin: async () => 'expired' });
  assert.equal((await expired.handler(request())).status, 503);
  assert.equal(expired.sent.length, 0);
});

test('failed full-email retrieval, send, and durable completion remain retryable without leaking details', async () => {
  for (const failing of ['retrieve', 'send', 'complete']) {
    const base = fixture();
    const normal = base.deps.fetcher;
    base.deps.fetcher = async (url, options) => {
      if ((failing === 'retrieve' && String(url).includes('?html_format')) ||
          (failing === 'send' && String(url) === 'https://api.resend.com/emails')) {
        return new Response('fixture-private-provider-detail', { status: 500 });
      }
      return normal(url, options);
    };
    if (failing === 'complete') base.deps.complete = async () => { throw Error('fixture-private-provider-detail'); };
    const response = await inboundHandler(base.deps)(request());
    assert.equal(response.status, 503, failing);
    assert.ok(!(await response.text()).includes('fixture-private-provider-detail'));
    assert.equal(base.completed.size, 0);
  }
});

test('missing secrets and invalid mailbox configuration fail closed', async () => {
  for (const override of [{ secret: async () => undefined }, { apiKey: async () => undefined }, { forwardTo: async () => undefined }, { forwardTo: async () => 'bad\r\naddress' }]) {
    const { handler, calls } = fixture(override);
    assert.equal((await handler(request())).status, 503);
    assert.deepEqual(calls, []);
  }
});

test('a missing subject or text still forwards a readable message without invented HTML', async () => {
  const base = fixture();
  const normal = base.deps.fetcher;
  base.deps.fetcher = (url, options) => String(url).includes('?html_format=cid')
    ? Promise.resolve(Response.json({ ...email, subject: null, text: null, html: null }))
    : normal(url, options);
  assert.equal((await inboundHandler(base.deps)(request())).status, 200);
  assert.equal(base.sent[0].subject, '[Bookish] (no subject)');
  assert.equal(base.sent[0].html, undefined);
  assert.ok(base.sent[0].text.startsWith('From: Reader <reader@example.test> To:'));
});

test('paginates attachment metadata and includes files from every page', async () => {
  const base = fixture(), seen = [];
  const normal = base.deps.fetcher;
  base.deps.fetcher = async (url, options) => {
    if (String(url).includes('/attachments?')) {
      seen.push(String(url));
      const second = String(url).includes('&after=first');
      return Response.json({ data: [{ id: second ? 'second' : 'first', filename: second ? 'two.txt' : 'one.txt', size: 1, download_url: `https://download.test/${second ? 'two' : 'one'}` }], has_more: !second });
    }
    if (String(url).startsWith('https://download.test/')) return new Response('a');
    return normal(url, options);
  };
  assert.equal((await inboundHandler(base.deps)(request())).status, 200);
  assert.deepEqual(seen, [
    `https://api.resend.com/emails/receiving/${id}/attachments?limit=100`,
    `https://api.resend.com/emails/receiving/${id}/attachments?limit=100&after=first`,
  ]);
  assert.deepEqual(base.sent[0].attachments.map(item => item.filename), ['one.txt', 'two.txt']);
});

test('unavailable attachments and malformed upstream mail stay retryable without forwarding partial content', async () => {
  for (const mode of ['missing-download', 'invalid-size', 'invalid-page', 'repeated-cursor', 'insecure-download', 'wrong-id']) {
    const base = fixture();
    const normal = base.deps.fetcher;
    base.deps.fetcher = async (url, options) => {
      if (String(url).includes('?html_format') && mode === 'wrong-id') return Response.json({ ...email, id: 'wrong' });
      if (String(url).includes('/attachments?')) {
        if (mode === 'invalid-page') return Response.json({ data: [], has_more: true });
        return Response.json({ data: [{ id: 'first', filename: 'one.txt', size: mode === 'invalid-size' ? -1 : 1, download_url: `${mode === 'insecure-download' ? 'http' : 'https'}://download.test/one` }], has_more: mode === 'repeated-cursor' });
      }
      if (String(url).startsWith('https://download.test/')) return new Response('unavailable', { status: 403 });
      return normal(url, options);
    };
    assert.equal((await inboundHandler(base.deps)(request())).status, 503, mode);
    assert.equal(base.sent.length, 0);
    assert.equal(base.completed.size, 0);
  }
});

test('retries a concurrent provider conflict with the same send key and payload', async () => {
  const base = fixture(), attempts = [];
  const normal = base.deps.fetcher;
  base.deps.fetcher = (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') {
      attempts.push({ key: options.headers['Idempotency-Key'], body: options.body });
      if (attempts.length === 1) return Promise.resolve(Response.json({ name: 'concurrent_idempotent_requests' }, { status: 409 }));
    }
    return normal(url, options);
  };
  const handler = inboundHandler(base.deps);
  assert.equal((await handler(request())).status, 503);
  assert.equal(base.completed.size, 0);
  assert.equal((await handler(request())).status, 200);
  assert.equal(base.sent.length, 1);
  assert.equal(attempts[0].key, `bookish-inbound/${id}`);
  assert.deepEqual(attempts[1], attempts[0]);
});

test('a lost completion marker retries the identical provider request before recording success', async () => {
  const base = fixture(), attempts = [];
  const normal = base.deps.fetcher;
  let completeCalls = 0;
  base.deps.complete = async emailId => {
    if (++completeCalls === 1) throw Error('Database temporarily unavailable');
    base.completed.add(emailId);
  };
  base.deps.fetcher = (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') attempts.push({ key: options.headers['Idempotency-Key'], body: options.body });
    return normal(url, options);
  };
  const handler = inboundHandler(base.deps);
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(request())).status, 200);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal((await handler(request())).status, 200);
  assert.equal(attempts.length, 2);
});

test('deployed entrypoint reads allowed inbound secrets and wires service RPCs to the received ID', async () => {
  const base = fixture(), reads = [], rpc = [];
  const env = { RESEND_INBOUND_WEBHOOK_SECRET: secret, RESEND_API_KEY: 'fixture-api-key', BOOKISH_INBOX_FORWARD_TO: 'hello@getkres.com' };
  const reader = createSecretReader({ env: name => { reads.push(name); return env[name]; }, fetcher: () => assert.fail('Environment configuration must avoid Vault') });
  let handler;
  const source = await readFile(new URL('../../supabase/functions/bookish-inbound/index.ts', import.meta.url), 'utf8');
  vm.runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;$/gm, ''), {
    inboundHandler: deps => inboundHandler({ ...deps, fetcher: base.deps.fetcher, now: base.deps.now }),
    readBookishSecret: reader,
    sb: { rpc: async (name, args) => {
      rpc.push({ name, args });
      return { data: name === 'bookish_inbound_status' ? 'new' : name === 'bookish_inbound_begin' ? 'send' : null, error: null };
    } },
    Deno: { serve: callback => { handler = callback; } },
  });
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(reads.sort(), ['BOOKISH_INBOX_FORWARD_TO', 'RESEND_API_KEY', 'RESEND_INBOUND_WEBHOOK_SECRET']);
  assert.deepEqual(JSON.parse(JSON.stringify(rpc)), [
    { name: 'bookish_inbound_status', args: { p_email_id: id } },
    { name: 'bookish_inbound_begin', args: { p_email_id: id } },
    { name: 'bookish_inbound_complete', args: { p_email_id: id } },
  ]);
  assert.equal(base.sent[0].to[0], 'hello@getkres.com');
});

test('forwards Bcc-only and Cc deliveries using the original Bookish recipient', async () => {
  for (const recipients of [
    { to: [], cc: [], bcc: [], received_for: ['support@meetbookish.com'] },
    { to: ['another@example.test'], cc: ['support@meetbookish.com'], bcc: [] },
    { to: [], cc: [], bcc: ['support@meetbookish.com'] },
  ]) {
    const base = fixture(), normal = base.deps.fetcher;
    base.deps.fetcher = (url, options) => String(url).includes('?html_format')
      ? Promise.resolve(Response.json({ ...email, ...recipients })) : normal(url, options);
    assert.equal((await inboundHandler(base.deps)(request())).status, 200);
    assert.ok(base.sent[0].text.startsWith('From: Reader <reader@example.test> To: support@meetbookish.com\n\n'));
  }
});

test('ignores account-wide receiving events with no Bookish-domain recipient', async () => {
  const base = fixture(), normal = base.deps.fetcher;
  base.deps.fetcher = (url, options) => String(url).includes('?html_format')
    ? Promise.resolve(Response.json({ ...email, to: ['private@another-project.test'], received_for: ['private@another-project.test'] })) : normal(url, options);
  assert.equal((await inboundHandler(base.deps)(request())).status, 200);
  assert.equal(base.sent.length, 0);
  assert.equal(base.calls.some(([name]) => name === 'begin'), false);
});
