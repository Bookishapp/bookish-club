import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('reviewed single apply is target-guarded, idempotent, preserves Fictora, and rolls back without data loss',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.fictora_sentinel(id int primary key,value text);insert into public.fictora_sentinel values(1,'unchanged');grant select on fictora_sentinel to authenticated;
 insert into auth.users(id,email) values('71000000-0000-0000-0000-000000000001','fictora@example.test');`);
 const apply=await readFile('.ted/apply.sql','utf8'),rollback=await readFile('.ted/rollback.sql','utf8');
 await assert.rejects(db.exec(apply),/Confirm the Bookish/);await db.exec('rollback');
 await db.exec("set bookish.target_ref='wqnrortftkffmbeugjky'");await db.exec(apply);
 assert.equal((await db.query("select count(*)::int n from bookish_profiles")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from bookish_clubs where listed")).rows[0].n,2538);
 assert.equal((await db.query('select jsonb_array_length(bookish_visibility_directory()) n')).rows[0].n,2538);
 assert.equal((await db.query("select has_column_privilege('authenticated','bookish_profiles','display_name','UPDATE') as v")).rows[0].v,true);
 await db.exec("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('71000000-0000-0000-0000-000000000002','reader@example.test',now(),'{\"app\":\"bookish\"}')");
 const count=(await db.query('select count(*)::int n from bookish_clubs')).rows[0].n;
 await db.exec(apply);assert.equal((await db.query('select count(*)::int n from bookish_clubs')).rows[0].n,count);
 await db.exec(await readFile('.ted/preflight.sql','utf8'));
 await db.exec(rollback);
 assert.equal((await db.query('select count(*)::int n from bookish_clubs')).rows[0].n,count);
 assert.equal((await db.query('select count(*)::int n from bookish_profiles')).rows[0].n,1);
 assert.deepEqual((await db.query('select bookish_visibility_directory() as v')).rows[0].v,[]);
 assert.equal((await db.query("select has_column_privilege('authenticated','bookish_profiles','display_name','UPDATE') as v")).rows[0].v,false);
 assert.equal((await db.query("select has_column_privilege('authenticated','bookish_profiles','display_name','SELECT') as v")).rows[0].v,false);
 assert.equal((await db.query("select bookish_auth_throttle('email','ip','start') as v")).rows[0].v,false);
 assert.equal((await db.query('select value from fictora_sentinel')).rows[0].value,'unchanged');
 assert.equal((await db.query("select has_table_privilege('authenticated','fictora_sentinel','select') as v")).rows[0].v,true);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
 await db.exec(apply);assert.equal((await db.query("select has_table_privilege('service_role','bookish_profiles','insert') as v")).rows[0].v,true);
 }finally{await db.close();}
});
