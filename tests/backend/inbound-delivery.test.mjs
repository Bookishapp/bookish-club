import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { inboundHandler } from '../../supabase/functions/_shared/inbound.ts';

const id = 'a1b2c3d4-1234-4234-8234-123456789abc';
const timestamp = 1793638800;
const secret = `whsec_${Buffer.from('delivery-test-signing-key').toString('base64')}`;
const email = {
  id, from: 'Reader <reader@example.test>', to: ['hello@meetbookish.com'],
  subject: 'A book question', text: 'Original text', html: '<p>Original HTML</p>',
};
const attachment = { id: 'attachment-one', filename: '<cover>.exe', size: 1, download_url: 'https://download.test/one' };

function request() {
  const body = JSON.stringify({ type: 'email.received', data: { email_id: id } });
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`msg_delivery.${timestamp}.${body}`).digest('base64');
  return new Request('https://local.test/bookish-inbound', {
    method: 'POST', body,
    headers: { 'svix-id': 'msg_delivery', 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` },
  });
}

function fixture(outcomes, options = {}) {
  const attempts = [], completed = [], logs = [];
  const deps = {
    secret: async () => secret, apiKey: async () => 'fixture-api-key',
    forwardTo: async () => 'hello@getkres.com', now: () => timestamp * 1000,
    begin: async () => options.expired ? 'expired' : completed.length ? 'done' : 'send',
    complete: async emailId => { completed.push(emailId); },
    logError: message => { logs.push(message); },
    fetcher: async (url, init) => {
      if (String(url).includes('?html_format=cid')) return Response.json({ ...email, ...options.email });
      if (String(url).includes('/attachments?')) return Response.json({ data: options.noAttachments ? [] : [attachment], has_more: false });
      if (String(url) === attachment.download_url) return new Response('a');
      assert.equal(String(url), 'https://api.resend.com/emails');
      attempts.push({ payload: JSON.parse(init.body), key: init.headers['Idempotency-Key'] });
      const outcome = outcomes[attempts.length - 1] ?? 200;
      if (outcome === 'network') throw Error('fixture-private-provider-detail');
      const status = typeof outcome === 'object' ? outcome.status : outcome;
      return Response.json(status === 200 ? { id: 'outbound-id' } : { name: outcome.name ?? 'validation_error', message: 'fixture-private-provider-detail' }, { status });
    },
  };
  return { deps, attempts, completed, logs, handler: inboundHandler(deps) };
}

test('a permanent attachment rejection forwards once without files and lists escaped filenames', async () => {
  const f = fixture([422, 200]);
  assert.equal((await f.handler(request())).status, 200);
  assert.equal(f.attempts.length, 2);
  const [original, fallback] = f.attempts;
  assert.equal(original.payload.attachments[0].filename, attachment.filename);
  assert.equal(fallback.payload.attachments, undefined);
  assert.equal(fallback.payload.reply_to, 'reader@example.test');
  assert.equal(fallback.payload.subject, original.payload.subject);
  assert.match(fallback.payload.text, /Original text[\s\S]*Attachments omitted[\s\S]*<cover>\.exe/);
  assert.match(fallback.payload.html, /Original HTML[\s\S]*&lt;cover&gt;\.exe/);
  assert.equal(original.key, `bookish-inbound/${id}`);
  assert.equal(fallback.key, `bookish-inbound/${id}/without-attachments`);
  assert.deepEqual(f.completed, [id]);
  assert.equal((await f.handler(request())).status, 200);
  assert.equal(f.attempts.length, 2);
});

test('two permanent rejections send a plain-text notice with the original message and safe headers', async () => {
  const f = fixture([422, 400, 200], { email: { subject: 'Question\r\nInjected: value' } });
  assert.equal((await f.handler(request())).status, 200);
  assert.equal(f.attempts.length, 3);
  const notice = f.attempts[2];
  assert.equal(notice.key, `bookish-inbound/${id}/notice`);
  assert.equal(notice.payload.from, 'Bookish Inbox <inbox@meetbookish.com>');
  assert.deepEqual(notice.payload.to, ['hello@getkres.com']);
  assert.equal(notice.payload.subject, '[Bookish] Inbound delivery notice');
  assert.equal(notice.payload.reply_to, undefined);
  assert.equal(notice.payload.html, undefined);
  assert.equal(notice.payload.attachments, undefined);
  assert.match(notice.payload.text, /From: Reader <reader@example\.test>/);
  assert.match(notice.payload.text, /To: hello@meetbookish\.com/);
  assert.match(notice.payload.text, /Subject: Question\r\nInjected: value/);
  assert.match(notice.payload.text, /Original text/);
  assert.match(notice.payload.text, /<cover>\.exe/);
  assert.deepEqual(f.completed, [id]);
});

test('retryable failures at any send stage return 503 without advancing or marking delivery', async () => {
  for (const stage of [0, 1, 2]) {
    for (const failure of [429, 500, 503, 'network']) {
      const f = fixture([...Array(stage).fill(422), failure]);
      const response = await f.handler(request());
      assert.equal(response.status, 503, `${stage}: ${failure}`);
      assert.equal(f.attempts.length, stage + 1);
      assert.deepEqual(f.completed, []);
      assert.ok(!(await response.text()).includes('fixture-private-provider-detail'));
    }
  }
});

test('permanent 4xx failures without attachments still reach the plain-text notice', async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 422]) {
    const f = fixture([status, status, 200], { noAttachments: true, email: { html: null, text: null, subject: null } });
    assert.equal((await f.handler(request())).status, 200, String(status));
    assert.equal(f.attempts.length, 3);
    assert.match(f.attempts[2].payload.text, /Subject: \(no subject\)/);
    assert.deepEqual(f.completed, [id]);
  }
});

test('fallback retries preserve each variant key and payload after a lost completion marker', async () => {
  const f = fixture([422, 422, 200, 422, 422, 200]);
  let calls = 0;
  f.deps.complete = async emailId => {
    if (++calls === 1) throw Error('fixture-private-provider-detail');
    f.completed.push(emailId);
  };
  const handler = inboundHandler(f.deps);
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(f.attempts.slice(3), f.attempts.slice(0, 3));
  assert.deepEqual(f.completed, [id]);
});

test('a permanently rejected notice logs the received ID without claiming successful delivery', async () => {
  const f = fixture([422, 422, 403]);
  const response = await f.handler(request());
  assert.equal(response.status, 200);
  assert.equal(f.attempts.length, 3);
  assert.deepEqual(f.completed, []);
  assert.equal(f.logs.length, 1);
  assert.match(f.logs[0], /permanent|rejected/i);
  assert.ok(f.logs[0].includes(id));
  assert.ok(!f.logs[0].includes('fixture-private-provider-detail'));
  assert.ok(!f.logs[0].includes(email.from));
});

test('an expired unsent delivery emits a clear error with its received email ID and never sends', async () => {
  const f = fixture([], { expired: true });
  assert.equal((await f.handler(request())).status, 503);
  assert.deepEqual(f.attempts, []);
  assert.deepEqual(f.completed, []);
  assert.equal(f.logs.length, 1);
  assert.match(f.logs[0], /expired.*23 hours/i);
  assert.ok(f.logs[0].includes(id));
  assert.ok(!f.logs[0].includes(email.from));
});

test('the deployed default logger reports expired received IDs through console.error', async t => {
  const f = fixture([], { expired: true });
  delete f.deps.logError;
  const log = t.mock.method(console, 'error', () => {});
  assert.equal((await inboundHandler(f.deps)(request())).status, 503);
  assert.equal(log.mock.callCount(), 1);
  assert.ok(log.mock.calls[0].arguments[0].includes(id));
});

test('a conflicting idempotency payload requires operator review without risking a duplicate fallback', async () => {
  for (const stage of [0, 1, 2]) {
    const f = fixture([...Array(stage).fill(422), { status: 409, name: 'invalid_idempotent_request' }]);
    assert.equal((await f.handler(request())).status, 200);
    assert.equal(f.attempts.length, stage + 1);
    assert.deepEqual(f.completed, []);
    assert.equal(f.logs.length, 1);
    assert.match(f.logs[0], /idempotency.*operator review/i);
    assert.ok(f.logs[0].includes(id));
  }
});

test('concurrent idempotent requests remain retryable at every fallback stage', async () => {
  for (const stage of [0, 1, 2]) {
    const f = fixture([...Array(stage).fill(422), { status: 409, name: 'concurrent_idempotent_requests' }]);
    assert.equal((await f.handler(request())).status, 503);
    assert.equal(f.attempts.length, stage + 1);
    assert.deepEqual(f.completed, []);
  }
});

test('expired attempts log before email or attachment access, even when retrieval is unavailable', async () => {
  const f = fixture([], { expired: true });
  f.deps.status = async () => 'expired';
  f.deps.begin = async () => assert.fail('Expiry checks must not start an attempt');
  f.deps.fetcher = async () => assert.fail('Expired attempts must not retrieve unavailable content');
  assert.equal((await inboundHandler(f.deps)(request())).status, 503);
  assert.equal(f.logs.length, 1);
  assert.ok(f.logs[0].includes(id));
  assert.match(f.logs[0], /expired.*23 hours/i);
});

test('completed attempts stop before content access, and a new attempt starts only after retrieval succeeds', async () => {
  for (const status of ['new', 'done']) {
    const f = fixture([]), states = [];
    f.deps.status = async emailId => { states.push(emailId); return status; };
    f.deps.begin = async () => assert.fail('No new attempt should start');
    f.deps.fetcher = async () => { throw Error('fixture-private-provider-detail'); };
    assert.equal((await inboundHandler(f.deps)(request())).status, status === 'done' ? 200 : 503);
    assert.deepEqual(states, [id]);
    assert.deepEqual(f.completed, []);
  }
});
