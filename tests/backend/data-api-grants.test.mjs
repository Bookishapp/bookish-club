import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('new public tables retain service CRUD without inherited Data API grants', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
      create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to authenticated;`);
    const files = (await readdir('supabase/sql')).filter(n => /^00[1-8]_/.test(n)).sort();
    for (const file of files.filter(n => /^00[1-4]_/.test(n)))
      await db.exec(await readFile('supabase/sql/' + file, 'utf8'));
    await db.exec('alter default privileges in schema public revoke all on tables from anon,authenticated,service_role');
    const tables = async () => (await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r => r.tablename);
    const existing = new Set(await tables());
    for (const file of files.filter(n => /^00[5-8]_/.test(n))) {
      await db.exec(await readFile('supabase/sql/' + file, 'utf8'));
      const created = (await tables()).filter(name => !existing.has(name));
      for (const table of created) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const [{ allowed }] = (await db.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role', 'public.' + table, privilege])).rows;
          assert.equal(allowed, true, `${file}: service_role needs ${privilege} on ${table}`);
          const [{ exposed }] = (await db.query('select has_table_privilege($1,$2,$3) as exposed', ['anon', 'public.' + table, privilege])).rows;
          assert.equal(exposed, false, `${file}: anon must not receive ${privilege} on ${table}`);
        }
        await db.exec('set role service_role');
        try { assert.deepEqual((await db.query(`select * from public.${table}`)).rows, []); }
        finally { await db.exec('reset role'); }
        existing.add(table);
      }
    }
    for (const table of ['bookish_take_reactions', 'bookish_vote_ballots', 'bookish_takes']) {
      await db.exec('set role authenticated');
      try { await assert.rejects(db.query(`select * from public.${table}`), /permission denied/); }
      finally { await db.exec('reset role'); }
    }
  } finally { await db.close(); }
});
