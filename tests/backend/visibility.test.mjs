// Contract test against the exact PR21 visibility migration, never a server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const host='91000000-0000-0000-0000-000000000001', reader='91000000-0000-0000-0000-000000000002';
async function fixture(visibilityFirst) {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const sql=async n=>db.exec(await readFile(new URL('../../supabase/sql/'+n,import.meta.url),'utf8'));
  const names=(await readdir(new URL('../../supabase/sql/',import.meta.url))).sort();
  for(const n of names.filter(n=>/^00[1-4]_/.test(n)))await sql(n);
  if(visibilityFirst)await db.exec(await readFile(new URL('fixtures/visibility-009.sql',import.meta.url),'utf8'));
  for(const n of names.filter(n=>/^00[5-8]_/.test(n)))await sql(n);
  if(!visibilityFirst)await db.exec(await readFile(new URL('fixtures/visibility-009.sql',import.meta.url),'utf8'));
  for(const [id,email] of [[host,'host@example.com'],[reader,'reader@example.com']]) {
    await db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"app":"bookish"}')`,[id,email]);
    await as(db,id,"select public.bookish_accept_terms('2026-10-15',true)");
  }
  return db;
}
async function as(db,user,sql,args=[]) {
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}
}
for(const visibilityFirst of [true,false]) {
  test(`Hidden excludes discovery and guessed-ID join after ${visibilityFirst?'visibility then backend':'backend then visibility'}`,async()=>{
    const db=await fixture(visibilityFirst);
    try {
      const club=(await as(db,host,"select public.bookish_create_club('Private readers','Chicago','IL') as id"))[0].id;
      await as(db,host,'select public.bookish_set_listing($1,true)',[club]);
      for(const visibility of ['open','private','hidden']) {
        await db.query('update public.bookish_clubs set visibility=$1 where id=$2',[visibility,club]);
        const rows=await as(db,reader,"select * from public.bookish_discover_clubs('Chicago','IL')");
        assert.equal(rows.some(r=>r.id===club),visibility!=='hidden',visibility);
        if(visibility==='hidden') {
          await assert.rejects(as(db,reader,"select public.bookish_request_join($1,'hello')",[club]),/host can help/i);
          assert.equal((await db.query('select count(*)::int as n from public.bookish_join_requests where club_id=$1',[club])).rows[0].n,0);
          const invite=(await as(db,host,'select public.bookish_create_invite($1,2,1) as code',[club]))[0].code;
          assert.equal((await as(db,reader,'select public.bookish_redeem_invite($1) as id',[invite]))[0].id,club,'Hidden remains invite-only');
        }
      }
      await as(db,host,'select public.bookish_set_listing($1,false)',[club]);
      assert.equal((await as(db,reader,"select * from public.bookish_discover_clubs('Chicago','IL')")).length,0);
    } finally {await db.close();}
  });
}

test('backend aggregate hardening retains Hidden exclusion after visibility runs first',async()=>{
 const db=await fixture(true);
 try {
  const club=(await as(db,host,"select public.bookish_create_club('Hidden readers','Chicago','IL') as id"))[0].id;
  await db.query("update public.bookish_clubs set visibility='hidden' where id=$1",[club]);
  for(const [n,id] of [[1,host],[2,reader],[3,'91000000-0000-0000-0000-000000000003']]) {
    if(n===3)await db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,'third@example.com','{"app":"bookish"}')`,[id]);
    await db.query("insert into public.bookish_members(club_id,user_id,joined_at) values($1,$2,now()-interval '20 days') on conflict(club_id,user_id) do update set joined_at=excluded.joined_at",[club,id]);
  }
  await as(db,host,"select public.bookish_set_current_book($1,'fourth-wing')",[club]);
  await db.query("update public.bookish_club_books set status='finished' where club_id=$1",[club]);
  assert.equal((await db.query('select * from public.bookish_active_clubs where id=$1',[club])).rows.length,0,'Hidden contributes no public aggregate facts');
  await db.query("update public.bookish_clubs set visibility='private' where id=$1",[club]);
  assert.equal((await db.query('select * from public.bookish_active_clubs where id=$1',[club])).rows.length,1,'qualified Private clubs still contribute');
 }finally{await db.close();}
});
