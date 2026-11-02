import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

let db,patch;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function role(name,sql,args=[]){
 await db.exec(`set role ${name}`);
 try{return await q(sql,args);}finally{await db.exec('reset role');}
}
const begin=async id=>(await role('service_role','select public.bookish_inbound_begin($1) v',[id]))[0].v;
const complete=id=>role('service_role','select public.bookish_inbound_complete($1)',[id]);

before(async()=>{
 db=new PGlite();
 // Only the hosted schemas, roles, Vault view, and release marker needed by 011.
 // Broad defaults expose missing revokes instead of concealing them in this shim.
 await db.exec(`
  create role anon;create role authenticated;create role service_role bypassrls;
  grant usage on schema public to anon,authenticated,service_role;
  alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  create schema auth;create table auth.users(id uuid primary key);create table auth.identities(user_id uuid);
  create schema bookish_private;grant usage on schema bookish_private to public,anon,authenticated,service_role;
  alter default privileges in schema bookish_private grant all on tables to public,anon,authenticated,service_role;
  create schema bookish_release_20261101;
  create table bookish_release_20261101.state(version text primary key,applied_at timestamptz);
  insert into bookish_release_20261101.state values('dedicated-chunk-20',now());
  create schema vault;create table vault.test_secrets(name text,decrypted_secret text);
  create view vault.decrypted_secrets as select * from vault.test_secrets;
  set bookish.target_ref='tkrsrnlasinmlftkcufi';
 `);
 try{patch=await readFile('supabase/sql/011_bookish_inbound.sql','utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(patch)await db.exec(patch);
});
after(()=>db?.close());

test('inbound begin preserves one first-attempt time across provider retries',async()=>{
 const id=crypto.randomUUID();
 assert.equal(await begin(id),'send');
 const first=(await q('select first_attempt_at,sent_at from bookish_private.inbound_emails where email_id=$1',[id]))[0];
 assert.ok(first.first_attempt_at instanceof Date);assert.equal(first.sent_at,null);
 assert.equal(await begin(id),'send');
 assert.deepEqual((await q('select first_attempt_at,sent_at from bookish_private.inbound_emails where email_id=$1',[id]))[0],first);
 assert.equal((await q('select count(*)::int n from bookish_private.inbound_emails where email_id=$1',[id]))[0].n,1);
});

test('inbound completion remains done indefinitely and preserves its first sent timestamp',async()=>{
 const id=crypto.randomUUID();await begin(id);await complete(id);
 const sent=(await q('select sent_at from bookish_private.inbound_emails where email_id=$1',[id]))[0].sent_at;
 assert.ok(sent instanceof Date);
 await q("update bookish_private.inbound_emails set first_attempt_at=now()-interval '2 years' where email_id=$1",[id]);
 assert.equal(await begin(id),'done');
 await complete(id);
 assert.deepEqual((await q('select sent_at from bookish_private.inbound_emails where email_id=$1',[id]))[0].sent_at,sent);
});

test('unsent inbound retries expire at 23 hours without resetting their clock',async()=>{
 for(const [age,want] of [['22 hours 59 minutes','send'],['23 hours','expired'],['2 years','expired']]){
  const id=crypto.randomUUID();
  await q('insert into bookish_private.inbound_emails(email_id,first_attempt_at) values($1,now()-$2::interval)',[id,age]);
  const first=(await q('select first_attempt_at from bookish_private.inbound_emails where email_id=$1',[id]))[0].first_attempt_at;
  assert.equal(await begin(id),want);
  assert.deepEqual((await q('select first_attempt_at,sent_at from bookish_private.inbound_emails where email_id=$1',[id]))[0],{first_attempt_at:first,sent_at:null});
 }
});

test('completion requires a recorded attempt and null identifiers cannot create state',async()=>{
 const id=crypto.randomUUID();
 await assert.rejects(complete(id),/attempt.*missing|no.*attempt|not.*found/i);
 assert.equal((await q('select count(*)::int n from bookish_private.inbound_emails where email_id=$1',[id]))[0].n,0);
 await assert.rejects(begin(null));
 await assert.rejects(complete(null));
});

test('only service-role RPCs can access inbound state and every RPC has a fixed empty search path',async()=>{
 const id=crypto.randomUUID();await begin(id);
 for(const r of ['anon','authenticated']){
  await assert.rejects(role(r,'select public.bookish_inbound_begin($1)',[id]),/permission denied/i);
  await assert.rejects(role(r,'select public.bookish_inbound_complete($1)',[id]),/permission denied/i);
 }
 for(const r of ['anon','authenticated','service_role']){
  await assert.rejects(role(r,'select * from bookish_private.inbound_emails'),/permission denied/i);
  await assert.rejects(role(r,'insert into bookish_private.inbound_emails(email_id) values($1)',[crypto.randomUUID()]),/permission denied/i);
  await assert.rejects(role(r,'update bookish_private.inbound_emails set sent_at=now() where email_id=$1',[id]),/permission denied/i);
  await assert.rejects(role(r,'delete from bookish_private.inbound_emails where email_id=$1',[id]),/permission denied/i);
 }
 assert.equal((await q("select relrowsecurity from pg_class where oid='bookish_private.inbound_emails'::regclass"))[0].relrowsecurity,true);
 for(const name of ['bookish_inbound_begin(uuid)','bookish_inbound_complete(uuid)','bookish_get_secret(text)']){
  assert.deepEqual((await q('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[`public.${name}`]))[0],{prosecdef:true,proconfig:['search_path=""']});
 }
});

test('the Vault RPC preserves every existing Bookish secret and allows only the two new inbound names',async()=>{
 const names=['BOOKISH_SITE_URL','BOOKISH_EMAIL_FROM','RESEND_API_KEY','BOOKISH_APPLE_CLIENT_ID','BOOKISH_APPLE_TEAM_ID','BOOKISH_APPLE_KEY_ID','BOOKISH_APPLE_PRIVATE_KEY','BOOKISH_TERMS_URL','BOOKISH_PRIVACY_URL','BOOKISH_MODERATION_EMAIL','BOOKISH_REPORT_WORKER_KEY','RESEND_INBOUND_WEBHOOK_SECRET','BOOKISH_INBOX_FORWARD_TO'];
 for(const name of names){
  await q('insert into vault.test_secrets values($1,$2)',[name,`fixture-${name}`]);
  assert.equal((await role('service_role','select public.bookish_get_secret($1) v',[name]))[0].v,`fixture-${name}`);
 }
 for(const name of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','DATABASE_URL','RESEND_INBOUND_WEBHOOK_SECRET_EXTRA','RESEND_INBOUND_WEBHOOK_SECRE','bookish_inbox_forward_to',null]){
  await assert.rejects(role('service_role','select public.bookish_get_secret($1)',[name]),/not allowed/i);
 }
 for(const r of ['anon','authenticated'])await assert.rejects(role(r,"select public.bookish_get_secret('RESEND_INBOUND_WEBHOOK_SECRET')"),/permission denied/i);
 await q("delete from vault.test_secrets where name='BOOKISH_INBOX_FORWARD_TO'");
 assert.equal((await role('service_role',"select public.bookish_get_secret('BOOKISH_INBOX_FORWARD_TO') v"))[0].v,null);
});

test('inbound SQL rejects the wrong target or missing chunk 20 before changing existing state',async()=>{
 assert.ok(patch,'The inbound SQL patch must exist.');
 const id=crypto.randomUUID();await begin(id);await complete(id);
 const before=await q('select * from bookish_private.inbound_emails where email_id=$1',[id]);
 await db.exec("set bookish.target_ref='wrong'");
 await assert.rejects(db.exec(patch),/Confirm the Bookish dedicated project/i);await db.exec('rollback');
 assert.deepEqual(await q('select * from bookish_private.inbound_emails where email_id=$1',[id]),before);
 await db.exec("set bookish.target_ref='tkrsrnlasinmlftkcufi'");
 await q("delete from bookish_release_20261101.state where version='dedicated-chunk-20'");
 await assert.rejects(db.exec(patch),/Apply.*20|Apply earlier Bookish chunks/i);await db.exec('rollback');
 assert.deepEqual(await q('select * from bookish_private.inbound_emails where email_id=$1',[id]),before);
 await db.exec('alter table bookish_release_20261101.state rename to state_saved');
 await assert.rejects(db.exec(patch),/Apply.*20|Apply earlier Bookish chunks/i);await db.exec('rollback');
 await db.exec('alter table bookish_release_20261101.state_saved rename to state');
 await q("insert into bookish_release_20261101.state values('dedicated-chunk-20',now())");
});

test('reapplying inbound SQL preserves sent and unsent rows while restoring restricted grants',async()=>{
 assert.ok(patch,'The inbound SQL patch must exist.');
 const sent=crypto.randomUUID(),pending=crypto.randomUUID();
 await begin(sent);await complete(sent);await begin(pending);
 const before=await q('select * from bookish_private.inbound_emails where email_id=any($1::uuid[]) order by email_id',[[sent,pending]]);
 await db.exec('grant all on bookish_private.inbound_emails to public,anon,authenticated,service_role;grant execute on function public.bookish_inbound_begin(uuid),public.bookish_inbound_complete(uuid),public.bookish_get_secret(text) to public,anon,authenticated');
 await db.exec(patch);await db.exec(patch);
 assert.deepEqual(await q('select * from bookish_private.inbound_emails where email_id=any($1::uuid[]) order by email_id',[[sent,pending]]),before);
 assert.equal(await begin(sent),'done');assert.equal(await begin(pending),'send');
 for(const r of ['anon','authenticated','service_role'])await assert.rejects(role(r,'select * from bookish_private.inbound_emails'),/permission denied/i);
 for(const r of ['anon','authenticated']){
  await assert.rejects(role(r,'select public.bookish_inbound_begin($1)',[sent]),/permission denied/i);
  await assert.rejects(role(r,'select public.bookish_inbound_complete($1)',[sent]),/permission denied/i);
  await assert.rejects(role(r,"select public.bookish_get_secret('RESEND_API_KEY')"),/permission denied/i);
 }
});
