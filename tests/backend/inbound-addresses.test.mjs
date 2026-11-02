import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { inboundHandler } from '../../supabase/functions/_shared/inbound.ts';

const id = 'a1b2c3d4-1234-4234-8234-123456789abc';
const secret = `whsec_${Buffer.from('inbound-address-test-key').toString('base64')}`;
const timestamp = 1793638800;
const email = {
  id, from: 'Reader <reader@example.test>', to: ['hello@meetbookish.com'],
  subject: 'A book question', text: 'Original text', html: '<p>Original HTML</p>', attachments: [],
};

function request() {
  const body = JSON.stringify({ type: 'email.received', data: { email_id: id } });
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`msg_addresses.${timestamp}.${body}`).digest('base64');
  return new Request('https://local.test/bookish-inbound', {
    method: 'POST', body,
    headers: { 'svix-id': 'msg_addresses', 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` },
  });
}

function fixture(overrides = {}, forwardTo = 'hello@getkres.com') {
  const sent = [], completed = [], begun = [];
  const handler = inboundHandler({
    secret: async () => secret, apiKey: async () => 'fixture-api-key',
    forwardTo: async () => forwardTo, now: () => timestamp * 1000,
    begin: async emailId => { begun.push(emailId); return 'send'; },
    complete: async emailId => { completed.push(emailId); },
    fetcher: async (url, options) => {
      if (String(url) === `https://api.resend.com/emails/receiving/${id}?html_format=cid`) return Response.json({ ...email, ...overrides });
      if (String(url) === `https://api.resend.com/emails/receiving/${id}/attachments?limit=100`) return Response.json({ data: [], has_more: false });
      if (String(url) === 'https://api.resend.com/emails') { sent.push(JSON.parse(options.body)); return Response.json({ id: 'outbound-id' }); }
      assert.fail(`Unexpected fetch ${url}`);
    },
  });
  return { handler, sent, completed, begun };
}

test('invalid recipient entries do not block a valid Bookish delivery in any recipient field', async () => {
  for (const field of ['received_for', 'to', 'cc', 'bcc']) {
    const recipients = {
      to: ['undisclosed-recipients:;', null, 42, { address: 'fake@meetbookish.com' }],
      cc: ['broken address', 'injected@meetbookish.com\r\nBcc: other@example.test'],
      bcc: ['reader@example.xn--p1ai'],
      received_for: ['reader@example.test'],
    };
    recipients[field].push('Support <SUPPORT@MEETBOOKISH.COM>');
    const { handler, sent, completed } = fixture(recipients);
    assert.equal((await handler(request())).status, 200, field);
    assert.equal(sent.length, 1, field);
    assert.equal(sent[0].text, 'From: Reader <reader@example.test> To: support@meetbookish.com\n\nOriginal text', field);
    assert.equal(sent[0].reply_to, 'reader@example.test', field);
    assert.deepEqual(completed, [id], field);
  }
});

test('unparseable senders remain visible in the body without creating a Reply-To header', async () => {
  for (const from of ['undisclosed-recipients:;', 'Reader <reader@example.test>\r\nBcc: injected@example.test']) {
    const { handler, sent, completed } = fixture({ from });
    assert.equal((await handler(request())).status, 200);
    assert.equal(sent.length, 1);
    assert.equal(Object.hasOwn(sent[0], 'reply_to'), false);
    assert.equal(sent[0].from, 'Bookish Inbox <inbox@meetbookish.com>');
    assert.equal(sent[0].text, `From: ${from} To: hello@meetbookish.com\n\nOriginal text`);
    assert.ok(sent[0].html.includes(from.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
    assert.deepEqual(completed, [id]);
  }
});

test('valid DNS labels, including punycode, remain available for Reply-To and forward targets', async () => {
  for (const [from, target, replyTo] of [
    ['Reader <READER@EXAMPLE.XN--P1AI>', 'hello@getkres.com', 'reader@example.xn--p1ai'],
    [`reader@${'a'.repeat(63)}.${'b'.repeat(63)}`, 'hello@getkres.com', `reader@${'a'.repeat(63)}.${'b'.repeat(63)}`],
    ['reader@example.a1-b2', 'hello@destination.xn--p1ai', 'reader@example.a1-b2'],
    ['reader@example.z', 'hello@getkres.com', 'reader@example.z'],
  ]) {
    const { handler, sent } = fixture({ from }, target);
    assert.equal((await handler(request())).status, 200, from);
    assert.equal(sent[0].reply_to, replyTo);
    assert.deepEqual(sent[0].to, [target]);
  }
});

test('invalid DNS labels never reach the outbound Reply-To header', async () => {
  for (const from of [
    'reader@-example.test', 'reader@example-.test', 'reader@example..test',
    'reader@example.-test', 'reader@example.test-', `reader@example.${'a'.repeat(64)}`,
  ]) {
    const { handler, sent } = fixture({ from });
    assert.equal((await handler(request())).status, 200, from);
    assert.equal(Object.hasOwn(sent[0], 'reply_to'), false, from);
    assert.ok(sent[0].text.includes(from));
  }
});

test('loop prevention still applies after invalid recipient entries are skipped', async () => {
  for (const [from, target] of [
    ['Bookish <INBOX@MEETBOOKISH.COM>', 'hello@getkres.com'],
    ['Reader <reader@send.meetbookish.com>', 'hello@getkres.com'],
    ['Reader <READER@EXAMPLE.XN--P1AI>', 'reader@example.xn--p1ai'],
  ]) {
    const { handler, sent, begun } = fixture({ from, to: ['undisclosed-recipients:;', 'hello@meetbookish.com'] }, target);
    const response = await handler(request());
    assert.equal(response.status, 200, from);
    assert.equal((await response.json()).message, 'Loop ignored.');
    assert.deepEqual(sent, []);
    assert.deepEqual(begun, []);
  }
});

test('only valid Bookish recipient addresses can start a forward', async () => {
  const { handler, sent, begun } = fixture({ to: ['undisclosed-recipients:;', 'private@another.test', 'injected@meetbookish.com\r\n'] });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, 'Recipient ignored.');
  assert.deepEqual(sent, []);
  assert.deepEqual(begun, []);
});
