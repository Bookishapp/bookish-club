import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { bookishAuthHandler } from '../../supabase/functions/_shared/bookish-auth.ts';

const email = 'reader@example.test';
const request = body => new Request('https://local.test/auth', {
  method: 'POST',
  headers: { origin: 'capacitor://localhost', 'x-forwarded-for': '192.0.2.1' },
  body: JSON.stringify({ email, ...body }),
});
const digest = text => createHash('sha256').update(text).digest('hex');
function fixture(overrides = {}) {
  const rows = new Map(), sent = [], exchanges = [], throttles = [], synced = [];
  let generated = 0;
  const deps = {
    publicKey: 'public-anon', configured: async () => true,
    throttle: async (...args) => { throttles.push(args); return true; },
    lookup: async () => ({ id: 'reader', bookish: true }),
    create: async () => {},
    generate: async () => { generated++; return '12345678'; },
    send: async (recipient, code) => { sent.push({ recipient, code }); return true; },
    verify: async (recipient, token) => {
      exchanges.push({ recipient, token });
      return { access_token: 'access', refresh_token: 'refresh', user: { id: 'reader', app_metadata: { app: 'bookish' } } };
    },
    sync: async token => { synced.push(token); },
    codes: {
      put: async row => { rows.set(row.email_hash, structuredClone(row)); },
      get: async key => structuredClone(rows.get(key) || null),
      finish: async (key, salt, matched) => {
        const row = rows.get(key);
        if (!row || row.salt !== salt || row.attempts >= 5 || Date.parse(row.expires_at) <= Date.now()) return false;
        if (matched) { rows.delete(key); return true; }
        row.attempts++;
        return false;
      },
    },
    ...overrides,
  };
  const call = body => bookishAuthHandler(request(body), deps);
  const start = () => call({ action: 'start', short: true });
  const verify = token => call({ action: 'verify', token });
  return { deps, rows, sent, exchanges, throttles, synced, call, start, verify, generated: () => generated };
}

test('short start sends exactly four digits and stores a salted hash without plaintext', async () => {
  const f = fixture(), before = Date.now();
  const response = await f.start();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(f.sent[0].code, /^\d{4}$/);
  assert.equal(f.generated(), 0, 'Hosted codes are not generated at short start');
  const [row] = f.rows.values();
  assert.equal(row.email_hash, digest('bookish:reader@example.test'));
  assert.match(row.salt, /^[a-f0-9]{32}$/);
  assert.match(row.code_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.code_hash, digest(f.sent[0].code));
  assert.deepEqual(Object.keys(row).sort(), ['attempts', 'code_hash', 'email_hash', 'expires_at', 'salt']);
  assert.equal(row.attempts, 0);
  assert.ok(Date.parse(row.expires_at) >= before + 600_000);
  assert.ok(Date.parse(row.expires_at) <= Date.now() + 600_000);
  assert.ok(!JSON.stringify(row).includes(email));
});

async function isolatedHandler(globals) {
  const source = await readFile(new URL('../../supabase/functions/_shared/bookish-auth.ts', import.meta.url), 'utf8');
  return vm.runInNewContext(stripTypeScriptTypes(source).replace('export async function', 'async function') + '\nbookishAuthHandler;', {
    crypto, Date, Request, Response, TextEncoder, ...globals,
  });
}

test('random generation rejects the biased tail and preserves leading zeroes', async () => {
  const samples = [4294967295, 4294960000, 7];
  let draws = 0;
  const handler = await isolatedHandler({ crypto: {
    subtle: crypto.subtle,
    getRandomValues: array => {
      if (array.BYTES_PER_ELEMENT === 4) array[0] = samples[draws++];
      else array.fill(42);
      return array;
    },
  } });
  const f = fixture();
  assert.equal((await handler(request({ action: 'start', short: true }), f.deps)).status, 200);
  assert.equal(draws, 3);
  assert.deepEqual(f.sent, [{ recipient: email, code: '0007' }]);
});

test('a short code expires exactly ten minutes after start', async () => {
  let now = Date.now();
  class TestDate extends Date { static now() { return now; } }
  const handler = await isolatedHandler({ Date: TestDate });
  const f = fixture();
  await handler(request({ action: 'start', short: true }), f.deps);
  now += 600_000;
  assert.equal((await handler(request({ action: 'verify', token: f.sent[0].code }), f.deps)).status, 401);
  assert.equal(f.generated(), 0);
});

test('four-digit verification consumes the code, exchanges a hosted OTP, syncs, and rejects replay', async () => {
  const f = fixture();
  await f.start();
  const response = await f.verify(f.sent[0].code);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session.access_token, 'access');
  assert.equal(body.public_key, 'public-anon');
  assert.equal(f.generated(), 1);
  assert.deepEqual(f.exchanges, [{ recipient: email, token: '12345678' }]);
  assert.deepEqual(f.synced, ['access']);
  assert.equal(f.rows.size, 0);
  assert.equal((await f.verify(f.sent[0].code)).status, 401);
  assert.equal(f.generated(), 1);
});

test('expired and missing short codes cannot mint a session', async () => {
  const f = fixture();
  assert.equal((await f.verify('1234')).status, 401);
  await f.start();
  for (const row of f.rows.values()) row.expires_at = new Date(Date.now() - 1).toISOString();
  assert.equal((await f.verify(f.sent[0].code)).status, 401);
  assert.equal(f.generated(), 0);
  assert.deepEqual(f.exchanges, []);
});

test('five wrong attempts kill the code, including a later correct attempt', async () => {
  const f = fixture();
  await f.start();
  const wrong = f.sent[0].code === '0000' ? '0001' : '0000';
  for (let i = 1; i <= 5; i++) {
    assert.equal((await f.verify(wrong)).status, 401);
    assert.equal([...f.rows.values()][0].attempts, i);
  }
  assert.equal((await f.verify(f.sent[0].code)).status, 401);
  assert.equal(f.generated(), 0);
});

test('a correct code still works after four wrong attempts', async () => {
  const f = fixture();
  await f.start();
  const wrong = f.sent[0].code === '0000' ? '0001' : '0000';
  for (let i = 0; i < 4; i++) await f.verify(wrong);
  assert.equal((await f.verify(f.sent[0].code)).status, 200);
});

test('a new start replaces the old salt, hash, expiry, and attempt budget', async () => {
  const f = fixture();
  await f.start();
  const old = structuredClone([...f.rows.values()][0]);
  for (const row of f.rows.values()) { row.attempts = 5; row.expires_at = new Date(0).toISOString(); }
  await f.start();
  assert.equal(f.rows.size, 1);
  const [current] = f.rows.values();
  assert.notEqual(current.salt, old.salt);
  assert.notEqual(current.code_hash, old.code_hash);
  assert.equal(current.attempts, 0);
  assert.ok(Date.parse(current.expires_at) > Date.now());
  if (f.sent[0].code !== f.sent[1].code) assert.equal((await f.verify(f.sent[0].code)).status, 401);
  assert.equal((await f.verify(f.sent[1].code)).status, 200);
});

test('concurrent verification produces at most one session', async () => {
  const f = fixture();
  await f.start();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.verify(f.sent[0].code)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401, 401, 401, 401, 401, 401, 401]);
  assert.equal(f.generated(), 1);
});

test('legacy callers still send and verify an eight-digit hosted code unchanged', async () => {
  const f = fixture();
  assert.equal((await f.call({ action: 'start' })).status, 200);
  assert.deepEqual(f.sent, [{ recipient: email, code: '12345678' }]);
  assert.equal(f.rows.size, 0);
  assert.equal((await f.verify('12345678')).status, 200);
  assert.equal(f.generated(), 1);
  assert.deepEqual(f.exchanges, [{ recipient: email, token: '12345678' }]);
});

test('only literal short true opts in, and unsupported token lengths are rejected', async () => {
  for (const short of [false, 'true', 1, null]) {
    const f = fixture();
    await f.call({ action: 'start', short });
    assert.equal(f.sent[0].code, '12345678');
  }
  const f = fixture();
  for (const token of ['123', '12345', '12345678901', '12a4', 1234]) assert.equal((await f.verify(token)).status, 400);
});

test('short start and verify retain per-email and per-IP throttling', async () => {
  const f = fixture();
  await f.start();
  await f.verify(f.sent[0].code);
  assert.deepEqual(f.throttles, ['start', 'verify'].map(action => [digest(`bookish:${email}`), digest('bookish:192.0.2.1'), action]));
  f.deps.throttle = async () => false;
  assert.equal((await f.start()).status, 429);
  assert.equal((await f.verify('1234')).status, 429);
});

test('unmarked shared identities are never mailed, stored, or signed in with short codes', async () => {
  const f = fixture({ lookup: async () => ({ id: 'foreign', bookish: false }) });
  assert.deepEqual(await (await f.start()).json(), { ok: true });
  assert.equal((await f.verify('1234')).status, 401);
  assert.deepEqual(f.sent, []);
  assert.equal(f.rows.size, 0);
  assert.equal(f.generated(), 0);
});

test('short signup rechecks the trusted marker after a create race', async () => {
  let lookups = 0;
  const f = fixture({ lookup: async () => ++lookups === 1 ? null : { id: 'foreign', bookish: false }, create: async () => { throw Error('duplicate'); } });
  assert.deepEqual(await (await f.start()).json(), { ok: true });
  assert.deepEqual(f.sent, []);
  assert.equal(f.rows.size, 0);
});

test('storage and delivery failures fail closed', async () => {
  for (const stage of ['put', 'get', 'finish', 'send']) {
    const f = fixture();
    await f.start();
    if (stage === 'send') f.deps.send = async () => false;
    else f.deps.codes[stage] = async () => { throw Error('unavailable'); };
    const response = stage === 'put' || stage === 'send' ? await f.start() : await f.verify(f.sent[0].code);
    assert.equal(response.status, stage === 'put' || stage === 'send' ? 503 : 401, stage);
    assert.equal(f.generated(), 0, stage);
  }
});

test('failed or throwing delivery invalidates its short code', async () => {
  for (const throws of [false, true]) {
    const f = fixture();
    let undelivered;
    f.deps.send = async (_recipient, code) => {
      undelivered = code;
      if (throws) throw Error('mail unavailable');
      return false;
    };
    assert.equal((await f.start()).status, 503);
    assert.equal((await f.verify(undelivered)).status, 401);
    assert.equal(f.generated(), 0);
    assert.equal(f.rows.size, 0);
  }
});

test('a failed send cannot invalidate the newer code that replaced it', async () => {
  const f = fixture();
  let release;
  f.deps.send = async (_recipient, code) => {
    f.sent.push({ recipient: email, code });
    if (f.sent.length === 1) return new Promise(resolve => { release = resolve; });
    return true;
  };
  const oldStart = f.start();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.start()).status, 200);
  release(false);
  assert.equal((await oldStart).status, 503);
  assert.equal((await f.verify(f.sent[1].code)).status, 200);
});
