import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

import {buildPacket} from '../../scripts/stage-dedicated-sql.mjs';
const packet=buildPacket().files;
const target='tkrsrnlasinmlftkcufi';
const read=async name=>packet[name]??readFile(`supabase/packets/${name}`,'utf8');
// Hosted-service shims, not a simulation of Vault encryption or GoTrue.
// PGlite has no supabase_vault binary. Only CREATE EXTENSION is omitted;
// the remaining production packet, including the RPC, runs unchanged.
const localSQL=sql=>sql.replace(/^create extension if not exists supabase_vault with schema vault;$/m,'-- Hosted Vault extension is replaced by the test-only view.');
async function fresh(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 grant usage on schema public to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema vault;create table vault.test_secrets(name text primary key,decrypted_secret text);
 create view vault.decrypted_secrets as select name,decrypted_secret from vault.test_secrets;
 insert into vault.test_secrets values('RESEND_API_KEY','test-only-value'),('UNRELATED_SECRET','unrelated-test-value');`);
 return db;
}
const one=async(db,sql,params=[])=>((await db.query(sql,params)).rows)[0];
async function as(db,role,sql,params=[]){
 await db.exec(`set role ${role}`);
 try{return await db.query(sql,params);}finally{await db.exec('reset role');}
}
async function verifyRelease(db){
 assert.equal((await one(db,'select count(*)::int n from bookish_clubs')).n,2538);
 assert.equal((await one(db,'select jsonb_array_length(bookish_visibility_directory()) n')).n,2538);
 assert.equal((await one(db,'select count(*)::int n from bookish_city_centers')).n,32113);
 assert.equal((await one(db,"select count(*)::int n from pg_tables where schemaname='public' and tablename like 'bookish\\_%' escape '\\' and not rowsecurity")).n,0);
 assert.deepEqual(await one(db,"select has_function_privilege('anon','public.bookish_get_secret(text)','execute') a,has_function_privilege('authenticated','public.bookish_get_secret(text)','execute') u,has_function_privilege('service_role','public.bookish_get_secret(text)','execute') s"),{a:false,u:false,s:true});
 assert.deepEqual(await one(db,"select p.prosecdef,p.proconfig from pg_proc p where p.oid='public.bookish_get_secret(text)'::regprocedure"),{prosecdef:true,proconfig:['search_path=""']});
 for(const role of ['anon','authenticated']){
  await assert.rejects(as(db,role,"select bookish_get_secret('RESEND_API_KEY')"),/permission denied/);
  await assert.rejects(as(db,role,'select * from vault.decrypted_secrets'),/permission denied/);
 }
 await assert.rejects(as(db,'service_role','select * from vault.decrypted_secrets'),/permission denied/);
 assert.equal((await as(db,'service_role',"select bookish_get_secret('RESEND_API_KEY') v")).rows[0].v,'test-only-value');
 for(const name of ['BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID','BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL','BOOKISH_MODERATION_EMAIL']){
  assert.equal((await as(db,'service_role','select bookish_get_secret($1) v',[name])).rows[0].v,null);
 }
 for(const name of ['UNRELATED_SECRET','SUPABASE_SERVICE_ROLE_KEY','resend_api_key','',null])await assert.rejects(as(db,'service_role','select bookish_get_secret($1)',[name]),/not allowed/);
}

test('dedicated preflight runs before any Bookish relation exists and rejects a wrong target',async()=>{
 const db=await fresh();try{
  const sql=await read('preflight.sql');
  await assert.rejects(db.exec(sql),/Confirm the Bookish/);await db.exec('rollback');
  await db.exec(`set bookish.target_ref='${target}'`);await db.exec(sql);
  assert.equal((await one(db,"select to_regclass('public.bookish_clubs') t")).t,null);
 }finally{await db.close();}
});

test('fresh full packet guards the dedicated target and exposes only allowlisted service-role Vault lookups',async()=>{
 const db=await fresh();try{
  const sql=localSQL(await read('apply.sql'));
  await assert.rejects(db.exec(sql),/Confirm the Bookish/);await db.exec('rollback');
  await db.exec("set bookish.target_ref='wqnrortftkffmbeugjky'");
  await assert.rejects(db.exec(sql),/Confirm the Bookish/);await db.exec('rollback');
  await db.exec(`set bookish.target_ref='${target}'`);await db.exec(sql);await verifyRelease(db);
  // A user-controlled marker does not create a Bookish identity or profile.
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('71000000-0000-0000-0000-000000000001','unmarked@example.test',now(),'{"app":"bookish"}');
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('71000000-0000-0000-0000-000000000002','reader@example.test',now(),'{"app":"bookish"}');`);
  assert.equal((await one(db,'select count(*)::int n from bookish_profiles')).n,1);
  await db.exec("update bookish_clubs set visibility='hidden',listed=false where club_ref='books-and-brews-book-club-08ae63'");
  await db.exec(sql);
  assert.equal((await one(db,"select visibility from bookish_clubs where club_ref='books-and-brews-book-club-08ae63'")).visibility,'hidden');
  assert.equal((await one(db,'select count(*)::int n from bookish_clubs')).n,2538);
  await db.exec(await read('preflight.sql'));
  await db.exec(await read('rollback.sql'));
  await db.exec(await read('rollback.sql'));
  assert.equal((await one(db,'select count(*)::int n from bookish_clubs')).n,2538);
  assert.equal((await one(db,'select count(*)::int n from auth.users')).n,2);
  assert.deepEqual((await one(db,'select bookish_visibility_directory() v')).v,[]);
  assert.equal((await one(db,"select has_column_privilege('authenticated','bookish_profiles','display_name','UPDATE') v")).v,false);
  assert.equal((await one(db,"select bookish_auth_throttle('email','ip','start') v")).v,false);
  assert.equal((await as(db,'service_role',"select bookish_get_secret('RESEND_API_KEY') v")).rows[0].v,'test-only-value');
  await assert.rejects(as(db,'authenticated',"select bookish_get_secret('RESEND_API_KEY')"),/permission denied/);
  await db.exec(sql);
  assert.equal((await one(db,"select has_column_privilege('authenticated','bookish_profiles','display_name','UPDATE') v")).v,true);
 }finally{await db.close();}
});

test('ordered chunks fit 200KB, refuse missing predecessors, and reapply without erasing host changes',async()=>{
 const names=[...Object.keys(packet).filter(n=>/^apply-\d\d\.sql$/.test(n)),'apply-20.sql'].sort();
 assert.ok(names.length>1,'the dedicated packet must be split into ordered chunks');
 const chunks=await Promise.all(names.map(read));
 for(let i=0;i<chunks.length;i++)assert.ok(Buffer.byteLength(chunks[i])<=200_000,`${names[i]} exceeds 200KB`);
 const db=await fresh();try{
  await db.exec(`set bookish.target_ref='${target}'`);
  await assert.rejects(db.exec(localSQL(chunks[1])),/Apply earlier Bookish chunks/);await db.exec('rollback');
  for(const chunk of chunks){await db.exec(localSQL(chunk));await db.exec(localSQL(chunk));}
  await verifyRelease(db);
  await db.exec("update bookish_clubs set name='Host changed this',visibility='hidden',listed=false where club_ref='books-and-brews-book-club-08ae63'");
  for(const chunk of chunks)await db.exec(localSQL(chunk));
  assert.deepEqual(await one(db,"select name,visibility,listed from bookish_clubs where club_ref='books-and-brews-book-club-08ae63'"),{name:'Host changed this',visibility:'hidden',listed:false});
  assert.equal((await one(db,'select count(*)::int n from bookish_clubs')).n,2538);
  assert.equal((await one(db,"select count(*)::int n from bookish_release_20261101.state where version like 'dedicated-chunk-%'")).n,names.length);
 }finally{await db.close();}
});
