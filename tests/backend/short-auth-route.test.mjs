import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { bookishAuthHandler } from '../../supabase/functions/_shared/bookish-auth.ts';

// Run the actual edge entry point with local SQL and intercepted HTTPS transports.
// No hosted database, Auth service, or email service is contacted.
test('edge route stores short codes and consumes them before minting a trusted session', async () => {
  const db = new PGlite(), messages = [], authCalls = [], syncCalls = [];
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(await readFile(new URL('../../supabase/sql/012_bookish_auth_codes.sql', import.meta.url), 'utf8'));
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
            upsert: async (row, options) => {
              assert.equal(options.onConflict, 'email_hash');
              const { email_hash, salt, code_hash, expires_at, attempts } = row;
              await db.query(`insert into public.bookish_auth_codes values ($1,$2,$3,$4,$5)
                on conflict(email_hash) do update set salt=excluded.salt,code_hash=excluded.code_hash,
                  expires_at=excluded.expires_at,attempts=excluded.attempts`, [email_hash, salt, code_hash, expires_at, attempts]);
              return { error: null };
            },
            select: columns => ({ eq: (column, key) => ({ maybeSingle: async () => {
              assert.equal(columns, 'email_hash,salt,code_hash,expires_at,attempts');
              assert.equal(column, 'email_hash');
              return { data: (await db.query('select * from public.bookish_auth_codes where email_hash=$1', [key])).rows[0] || null, error: null };
            } }) }),
          };
        },
        rpc: async (name, args) => {
          if (name === 'bookish_auth_throttle') return { data: true, error: null };
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
          return Response.json({ email_otp: '12345678' });
        }
        assert.equal(path, '/auth/v1/verify');
        return Response.json({ access_token: 'access', refresh_token: 'refresh', user: { id: 'reader', app_metadata: { app: 'bookish' } } });
      },
      AbortSignal,
      Deno: { env: { get: name => env[name] }, serve: callback => { handler = callback; } },
    });
    const call = body => handler(new Request('https://local.test/auth', {
      method: 'POST', headers: { origin: 'https://meetbookish.com' },
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
      { path: '/auth/v1/verify', body: { type: 'email', email: 'reader@example.test', token: '12345678' } },
    ]);
    assert.deepEqual(syncCalls, ['Bearer access']);
    assert.equal((await call({ action: 'verify', token: code })).status, 401);
    assert.equal(authCalls.length, 2);
  } finally { await db.close(); }
});
