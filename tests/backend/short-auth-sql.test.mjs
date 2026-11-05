import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const emailHash = 'a'.repeat(64), salt = 'b'.repeat(32), codeHash = 'c'.repeat(64);
const consume = async (matched, codeSalt = salt) => (await db.query(
  'select public.bookish_auth_code_finish($1,$2,$3) as ok', [emailHash, codeSalt, matched],
)).rows[0].ok;
const put = async (attempts = 0, expiry = '10 minutes', codeSalt = salt) => db.query(`
  insert into public.bookish_auth_codes(email_hash,salt,code_hash,expires_at,attempts)
  values ($1,$2,$3,clock_timestamp()+$4::interval,$5)
  on conflict (email_hash) do update set salt=excluded.salt,code_hash=excluded.code_hash,
    expires_at=excluded.expires_at,attempts=excluded.attempts`, [emailHash, codeSalt, codeHash, expiry, attempts]);
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated;`);
  await db.exec(await readFile(new URL('../../supabase/sql/012_bookish_auth_codes.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

test('short-code storage and RPC are service-only despite inherited grants', async () => {
  const [{ relrowsecurity }] = (await db.query("select relrowsecurity from pg_class where oid='public.bookish_auth_codes'::regclass")).rows;
  assert.equal(relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const [{ allowed }] = (await db.query("select has_table_privilege($1,'public.bookish_auth_codes',$2) as allowed", [role, privilege])).rows;
      assert.equal(allowed, false, `${role}: ${privilege}`);
    }
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from public.bookish_auth_codes'), /permission denied/);
      await assert.rejects(consume(true), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { await put(); assert.equal(await consume(true), true); }
  finally { await db.exec('reset role'); }
});

test('RLS hides code rows even if SELECT is accidentally granted to clients', async () => {
  await put();
  await db.exec('grant select on public.bookish_auth_codes to anon,authenticated');
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try { assert.deepEqual((await db.query('select * from public.bookish_auth_codes')).rows, []); }
      finally { await db.exec('reset role'); }
    }
  } finally { await db.exec('revoke select on public.bookish_auth_codes from anon,authenticated'); }
});

test('five atomic failures lock out the correct code', async () => {
  await put();
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => consume(false)));
  assert.ok(outcomes.every(ok => ok === false));
  assert.equal((await db.query('select attempts from public.bookish_auth_codes where email_hash=$1', [emailHash])).rows[0].attempts, 5);
  assert.equal(await consume(true), false);
});

test('correct code after four failures is consumed once even with competing requests', async () => {
  await put(4);
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => consume(true)));
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.deepEqual((await db.query('select * from public.bookish_auth_codes')).rows, []);
});

test('expiry is enforced at the atomic operation, even for a correct match', async () => {
  await put(0, '-1 second');
  assert.equal(await consume(true), false);
  assert.equal(await consume(false), false);
});

test('replacement resets the budget and rejects stale reads without charging the new code', async () => {
  await put(5);
  const nextSalt = 'd'.repeat(32);
  await put(0, '10 minutes', nextSalt);
  assert.equal(await consume(true), false);
  assert.equal(await consume(false), false);
  const { rows } = await db.query('select salt,attempts from public.bookish_auth_codes');
  assert.deepEqual(rows, [{ salt: nextSalt, attempts: 0 }]);
  assert.equal(await consume(true, nextSalt), true);
});

test('schema rejects plaintext codes and malformed hashes', async () => {
  await assert.rejects(db.query(`insert into public.bookish_auth_codes(email_hash,salt,code_hash,expires_at)
    values ($1,$2,'1234',now()+interval '10 minutes')`, [emailHash, salt]), /check constraint/);
  const columns = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='bookish_auth_codes' order by column_name")).rows.map(r => r.column_name);
  assert.deepEqual(columns, ['attempts', 'code_hash', 'email_hash', 'expires_at', 'salt']);
});
