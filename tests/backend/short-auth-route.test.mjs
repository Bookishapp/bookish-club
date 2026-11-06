import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { initShortAuthDb } from './support/short-auth-db.mjs';
import { bookishAuthHandler } from '../../supabase/functions/_shared/bookish-auth.ts';

// Run the actual edge entry point with local SQL and intercepted HTTPS transports.
// No hosted database, Auth service, or email service is contacted.
test('edge route stores short codes and consumes them before minting a trusted session', async () => {
  const db = new PGlite(), messages = [], authCalls = [], syncCalls = [];
  try {
    await initShortAuthDb(db);
    const env = { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'public' };
    let handler;
    const source = await readFile(new URL('../../supabase/functions/bookish-auth/index.ts', import.meta.url), 'utf8');
    vm.runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;$/gm, ''), {
      bookishAuthHandler,
      authAdmin: () => ({}),
      readBookishSecret: async name => ({ BOOKISH_EMAIL_FROM: 'Bookish <hello@example.test>', RESEND_API_KEY: 'local-resend' })[name],
      sendEmail: async (...args) => { messages.push(args); return true; },
      sb: {
        from: table => {
          assert.equal(table, 'bookish_auth_codes');
          return {
            select: columns => ({ eq: (column, key) => ({ maybeSingle: async () => {
              assert.equal(columns, 'email_hash,salt,code_hash,expires_at,attempts');
              assert.equal(column, 'email_hash');
              return { data: (await db.query('select * from public.bookish_auth_codes where email_hash=$1', [key])).rows[0] || null, error: null };
            } }) }),
          };
        },
        rpc: async (name, args) => {
          if (name === 'bookish_auth_throttle') {
            const { rows } = await db.query('select public.bookish_auth_throttle($1,$2,$3) as ok', [args.p_email, args.p_ip, args.p_action]);
            return { data: rows[0].ok, error: null };
          }
          if (name === 'bookish_auth_code_put') {
            const { rows } = await db.query('select public.bookish_auth_code_put($1,$2,$3,$4) as ok', [args.p_email_hash, args.p_salt, args.p_code_hash, args.p_expires_at]);
            return { data: rows[0].ok, error: null };
          }
          if (name === 'bookish_auth_lookup') return { data: { id: 'reader', bookish: true }, error: null };
          assert.equal(name, 'bookish_auth_code_finish');
          const { p_email_hash, p_salt, p_matched } = args;
          const { rows } = await db.query('select public.bookish_auth_code_finish($1,$2,$3) as ok', [p_email_hash, p_salt, p_matched]);
          return { data: rows[0].ok, error: null };
        },
      },
      fetch: async (url, options) => {
        const path = new URL(url).pathname, body = JSON.parse(options.body);
        if (path === '/rest/v1/rpc/bookish_sync_account') {
          syncCalls.push(options.headers.authorization);
          return Response.json({});
        }
        assert.equal(options.headers.apikey, 'service');
        assert.equal(options.headers.authorization, 'Bearer service');
        authCalls.push({ path, body });
        if (path === '/auth/v1/admin/generate_link') {
          assert.equal((await db.query('select count(*)::int as n from public.bookish_auth_codes')).rows[0].n, 0, 'Consume before minting');
          return Response.json({ email_otp: '123456' });
        }
        assert.equal(path, '/auth/v1/verify');
        return Response.json({ access_token: 'access', refresh_token: 'refresh', user: { id: 'reader', app_metadata: { app: 'bookish' } } });
      },
      AbortSignal,
      Deno: { env: { get: name => env[name] }, serve: callback => { handler = callback; } },
    });
    const call = body => handler(new Request('https://local.test/auth', {
      method: 'POST', headers: { origin: 'https://meetbookish.com', 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '198.51.100.7, 192.0.2.1' },
      body: JSON.stringify({ email: 'reader@example.test', ...body }),
    }));
    assert.equal((await call({ action: 'start', short: true })).status, 200);
    assert.equal(messages.length, 1);
    assert.equal(messages[0][0], 'reader@example.test');
    assert.equal(messages[0][1], 'Your Bookish sign-in code');
    const code = messages[0][2].match(/^Your Bookish code is (\d{4})\./)[1];
    assert.deepEqual(authCalls, [], 'Short start does not mint a hosted code');
    const wrong = code === '0000' ? '0001' : '0000';
    assert.equal((await call({ action: 'verify', token: wrong })).status, 401);
    assert.equal((await db.query('select attempts from public.bookish_auth_codes')).rows[0].attempts, 1);
    const response = await call({ action: 'verify', token: code });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).session.access_token, 'access');
    assert.deepEqual(authCalls, [
      { path: '/auth/v1/admin/generate_link', body: { type: 'magiclink', email: 'reader@example.test' } },
      { path: '/auth/v1/verify', body: { type: 'email', email: 'reader@example.test', token: '123456' } },
    ]);
    assert.deepEqual(syncCalls, ['Bearer access']);
    assert.equal((await call({ action: 'verify', token: code })).status, 401);
    assert.equal(authCalls.length, 2);

    // Exercise actual start/verify transports and SQL through code replacements.
    // Age database timestamps to model elapsed time without contacting production.
    await db.exec('truncate public.bookish_auth_codes,public.bookish_auth_code_failures,bookish_private.auth_attempts');
    messages.length = 0; authCalls.length = 0;
    const advance = async interval => {
      await db.query('update public.bookish_auth_code_failures set created_at=created_at-$1::interval', [interval]);
      await db.query('update bookish_private.auth_attempts set created_at=created_at-$1::interval', [interval]);
      await db.query('update public.bookish_auth_codes set expires_at=expires_at-$1::interval', [interval]);
    };
    for (let cycle = 0; cycle < 2; cycle++) {
      assert.equal((await call({ action: 'start', short: true })).status, 200);
      const code = messages.at(-1)[2].match(/^Your Bookish code is (\d{4})\./)[1];
      const wrong = code === '0000' ? '0001' : '0000';
      for (let guess = 0; guess < 5; guess++) assert.equal((await call({ action: 'verify', token: wrong })).status, 401);
      if (cycle === 0) await advance('61 minutes');
    }
    assert.equal((await db.query('select count(*)::int as n from public.bookish_auth_code_failures')).rows[0].n, 10);
    const blocked = await call({ action: 'start', short: true });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { ok: false, message: 'Please wait a little before trying again.' });
    assert.equal(messages.length, 2, 'Lockout cannot send a replacement or silently send six digits');
    assert.deepEqual(authCalls, [], 'Short lockout cannot mint a hosted OTP');

    // Live iOS 1.1 can still request and verify exactly six digits during lockout.
    await db.exec('delete from public.bookish_auth_codes');
    assert.equal((await call({ action: 'start' })).status, 200);
    assert.match(messages.at(-1)[2], /^Your Bookish code is 123456\./);
    assert.equal((await call({ action: 'verify', token: '123456' })).status, 200);
    await advance('22 hours 58 minutes');
    assert.equal((await call({ action: 'start', short: true })).status, 429, 'Lockout outlives the hourly throttle and code expiry');
    assert.equal(messages.length, 3);
    await advance('2 minutes');
    assert.equal((await call({ action: 'start', short: true })).status, 200, 'Lockout lifts when the oldest five failures leave the rolling window');
    const fresh = messages.at(-1)[2].match(/^Your Bookish code is (\d{4})\./)[1];
    assert.equal((await call({ action: 'verify', token: fresh })).status, 200);

  } finally { await db.close(); }
});
