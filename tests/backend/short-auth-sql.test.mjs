import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initShortAuthDb } from './support/short-auth-db.mjs';

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
before(() => initShortAuthDb(db));
beforeEach(async () => {
  await db.exec('truncate public.bookish_auth_codes,bookish_private.auth_attempts');
  if ((await db.query("select to_regclass('public.bookish_auth_code_failures') as ledger")).rows[0].ledger) {
    await db.exec('truncate public.bookish_auth_code_failures');
  }
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

const throttle = async (action = 'start_short', ip = 'test-ip') => (await db.query(
  'select public.bookish_auth_throttle($1,$2,$3) as ok', [emailHash, ip, action],
)).rows[0].ok;
const guardedPut = async (codeSalt = salt) => (await db.query(
  "select public.bookish_auth_code_put($1,$2,$3,clock_timestamp()+interval '10 minutes') as ok",
  [emailHash, codeSalt, codeHash],
)).rows[0].ok;

test('ten failures survive replacement and block both a new start and a previously admitted write', async () => {
  for (let generation = 0; generation < 2; generation++) {
    assert.equal(await guardedPut(), true);
    for (let guess = 0; guess < 5; guess++) assert.equal(await consume(false), false);
  }
  assert.equal((await db.query('select count(*)::int as n from public.bookish_auth_code_failures')).rows[0].n, 10);
  assert.equal(await throttle(), false);
  assert.equal(await guardedPut('d'.repeat(32)), false, 'Recheck lockout after throttle admitted an earlier start');
  assert.equal(await throttle('start'), true, 'Legacy starts are not blocked by short-code failures');
  await put(0, '10 minutes', 'e'.repeat(32));
  assert.equal(await consume(false, 'e'.repeat(32)), false);
  assert.equal(await consume(true, 'e'.repeat(32)), false, 'An outstanding code cannot bypass the daily budget');
  assert.equal((await db.query('select count(*)::int as n from public.bookish_auth_code_failures')).rows[0].n, 10);
});

test('failure expiry rolls individually over 24 hours without resetting on a new code or success', async () => {
  await put();
  await consume(false);
  await consume(true);
  await put();
  await consume(false);
  await db.query("update public.bookish_auth_code_failures set created_at=clock_timestamp()-interval '24 hours'+interval '1 minute'");
  for (let generation = 0; generation < 2; generation++) {
    await put();
    for (let guess = 0; guess < 4; guess++) await consume(false);
  }
  assert.equal(await guardedPut(), false);
  await db.query("update public.bookish_auth_code_failures set created_at=created_at-interval '2 minutes' where created_at<clock_timestamp()-interval '23 hours'");
  assert.equal(await guardedPut(), true, 'Only the two oldest failures have left the rolling window');
  await consume(false);
  await consume(false);
  assert.equal(await guardedPut(), false, 'Eight recent failures remain when the oldest expire');
  await db.query("update public.bookish_auth_code_failures set created_at=clock_timestamp()-interval '24 hours'");
  assert.equal(await guardedPut(), true, 'Lockout lifts at the 24-hour boundary');
});

test('short starts allow three per hour and ten per rolling day across IP changes', async () => {
  for (let i = 0; i < 3; i++) assert.equal(await throttle('start_short', `ip-${i}`), true);
  assert.equal(await throttle(), false);
  await db.exec("update bookish_private.auth_attempts set created_at=now()-interval '1 hour'");
  for (let batch = 0; batch < 2; batch++) {
    for (let i = 0; i < 3; i++) assert.equal(await throttle(), true);
    assert.equal(await throttle(), false);
    await db.exec("update bookish_private.auth_attempts set created_at=created_at-interval '1 hour'");
  }
  assert.equal(await throttle(), true);
  assert.equal(await throttle(), false, 'The eleventh short start is refused even below the hourly cap');
  await db.exec("update bookish_private.auth_attempts set created_at=now()-interval '24 hours'");
  assert.equal(await throttle(), true);
});

test('short and hosted starts share the existing total start limits', async () => {
  for (let i = 0; i < 3; i++) assert.equal(await throttle(), true);
  for (let i = 0; i < 2; i++) assert.equal(await throttle('start'), true);
  assert.equal(await throttle('start'), false, 'Five combined starts per email per hour');
  await db.exec('truncate bookish_private.auth_attempts');
  for (let i = 0; i < 15; i++) {
    const { rows } = await db.query('select public.bookish_auth_throttle($1,$2,$3) as ok', [`email-${i}`, 'shared-ip', i % 2 ? 'start' : 'start_short']);
    assert.equal(rows[0].ok, true);
  }
  assert.equal(await throttle('start', 'shared-ip'), false, 'Fifteen combined starts per IP per hour');
  assert.equal(await throttle('start_short', 'shared-ip'), false);
});

test('stale, expired, exhausted, successful, and null-matched finishes do not charge the failure ledger', async () => {
  await put();
  await consume(false, 'd'.repeat(32));
  await consume(null);
  await consume(true);
  await put(0, '-1 second');
  await consume(false);
  await put(5);
  await consume(false);
  assert.equal((await db.query('select count(*)::int as n from public.bookish_auth_code_failures')).rows[0].n, 0);
});

test('failure ledger and guarded put RPC are unavailable to clients', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from public.bookish_auth_code_failures'), /permission denied/);
      await assert.rejects(guardedPut(), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal(await guardedPut(), true); }
  finally { await db.exec('reset role'); }
  await db.exec('grant select on public.bookish_auth_code_failures to anon,authenticated');
  await put(); await consume(false);
  try {
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select * from public.bookish_auth_code_failures')).rows, []);
  } finally { await db.exec('reset role; revoke select on public.bookish_auth_code_failures from anon,authenticated'); }
});

test('rerunning 012 preserves an active daily lockout', async () => {
  for (let i = 0; i < 2; i++) { await put(); for (let j = 0; j < 5; j++) await consume(false); }
  await db.exec(await readFile(new URL('../../supabase/sql/012_bookish_auth_codes.sql', import.meta.url), 'utf8'));
  assert.equal(await throttle(), false);
  assert.equal(await guardedPut(), false);
});


test('no-IP requests retain per-email start, verification, and daily failure limits', async () => {
  for (let i = 0; i < 3; i++) assert.equal(await throttle('start_short', null), true);
  assert.equal(await throttle('start_short', null), false);
  for (let i = 0; i < 2; i++) assert.equal(await throttle('start', null), true);
  assert.equal(await throttle('start', null), false);
  for (let i = 0; i < 10; i++) assert.equal(await throttle(i % 2 ? 'verify' : 'password', null), true);
  assert.equal(await throttle('verify', null), false);
  assert.equal(await throttle('password', null), false);
  await db.exec('truncate bookish_private.auth_attempts');
  await db.query(`insert into public.bookish_auth_code_failures(email_hash)
    select $1 from generate_series(1,10)`, [emailHash]);
  assert.equal(await throttle('start_short', null), false);
  assert.equal(await throttle('start', null), true, 'Live 1.1 remains available during short-code lockout');
});

test('a known IP still has the 100-call hourly cap across different users', async () => {
  for (let i = 0; i < 100; i++) {
    assert.equal((await db.query('select public.bookish_auth_throttle($1,$2,$3) as ok', [`reader-${i}`, 'known-ip', 'refresh'])).rows[0].ok, true);
  }
  assert.equal(await throttle('refresh', 'known-ip'), false);
  assert.equal(await throttle('refresh', null), true, 'An exhausted known IP cannot block a caller without an IP');
});
