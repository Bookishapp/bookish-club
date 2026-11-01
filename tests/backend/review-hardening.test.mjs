import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {loadAnonymousVote} from '../../app/src/votes.ts';

const host='82000000-0000-0000-0000-000000000001',reader='82000000-0000-0000-0000-000000000002',outsider='82000000-0000-0000-0000-000000000003';
let db,patch;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function role(name,sql,args=[]){await db.exec(`set role ${name}`);try{return await q(sql,args);}finally{await db.exec('reset role');}}
async function rpc(user,name,args=[]){await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);return (await role('authenticated',`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) v`,args))[0].v;}
async function legacy(ref,visibility='open'){
 const token=crypto.randomUUID();
 await q(`insert into bookish_submissions(kind,email,club_ref,payload,status,confirm_token) values('start','legacy-host@example.test',$1,$2,'confirmed',$3)`,[ref,JSON.stringify({club_name:'Legacy club',city:'Austin',state:'TX',visibility}),token]);
 return token;
}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 grant usage on schema public to anon,authenticated,service_role;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema vault;create table vault.test_secrets(name text,decrypted_secret text);create view vault.decrypted_secrets as select * from vault.test_secrets;
 set bookish.target_ref='tkrsrnlasinmlftkcufi';`);
 for(let i=1;i<=19;i++)await db.exec((await readFile(`.ted/apply-${String(i).padStart(2,'0')}.sql`,'utf8')).replace(/^create extension if not exists supabase_vault with schema vault;$/m,'-- Test-only hosted Vault shim.'));
 try{patch=await readFile('.ted/apply-20.sql','utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(patch){await db.exec(patch);await db.exec(patch);}
 for(const [i,id] of [host,reader,outsider].entries()){
  await q(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"app":"bookish"}')`,[id,`review${i}@example.test`]);
  await rpc(id,'bookish_accept_terms',['2026-10-15',true]);
 }
});
after(()=>db?.close());

test('real app vote loading uses SQL caller-only ballots, with membership and execution restrictions',async()=>{
 const club=await rpc(host,'bookish_create_club',['Ballot privacy','Austin','TX']);
 const invite=await rpc(host,'bookish_create_invite',[club,2,7]);await rpc(reader,'bookish_redeem_invite',[invite]);
 const vote=await rpc(host,'bookish_open_vote',[club,'2099-01-01T00:00:00Z',['fourth-wing','the-women']]);
 const options=await q('select id from bookish_vote_options where vote_id=$1 order by id',[vote]);
 await rpc(host,'bookish_cast_ballot',[vote,options[0].id]);
 // The transport executes the real SQL. Neither vote RPC is mocked.
 // Serialize because PGlite shares one connection across both RPC calls.
 const realTransport=()=>async(name,{p_vote})=> name==='bookish_vote_tally'
  ? q('select * from bookish_vote_tally($1)',[p_vote])
  : q('select bookish_my_vote($1) v',[p_vote]).then(rows=>rows[0].v);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[reader]);await db.exec('set role authenticated');
 try{const empty=await loadAnonymousVote(realTransport(reader),vote);assert.equal(empty.total,1);assert.equal(empty.myOptionId,null);}finally{await db.exec('reset role');}
 await rpc(reader,'bookish_cast_ballot',[vote,options[1].id]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[reader]);await db.exec('set role authenticated');
 try{const own=await loadAnonymousVote(realTransport(reader),vote);assert.equal(own.total,2);assert.equal(own.myOptionId,options[1].id);}finally{await db.exec('reset role');}
 assert.equal(await rpc(host,'bookish_my_vote',[vote]),options[0].id);
 await assert.rejects(rpc(outsider,'bookish_my_vote',[vote]),/Join this club/i);
 await assert.rejects(rpc(reader,'bookish_my_vote',[crypto.randomUUID()]),/Join this club/i);
 for(const r of ['anon','service_role'])await assert.rejects(role(r,'select bookish_my_vote($1)',[vote]),/permission denied/i);
 await assert.rejects(role('authenticated','select * from bookish_vote_ballots'),/permission denied/i);
 const metadata=(await q("select prosecdef,proconfig from pg_proc where oid='public.bookish_my_vote(uuid)'::regprocedure"))[0];
 assert.deepEqual(metadata,{prosecdef:true,proconfig:['search_path=""']});
});

test('automatic public joins never send host contact, while an explicit host approval can',async()=>{
 await legacy('review-open');
 const joined=(await role('service_role',"select bookish_visibility_join('review-open','unverified@example.test','Reader','','','ip-open') v"))[0].v;
 assert.equal(joined.status,'joined');assert.equal(joined.notice.to,'unverified@example.test');
 assert.equal('host_email' in joined.notice,false);
 const cap=await legacy('review-private','private');
 const pending=(await role('service_role',"select bookish_visibility_join('review-private','pending@example.test','Reader','','','ip-private') v"))[0].v;
 assert.equal(pending.status,'pending');
 const approved=(await role('service_role','select bookish_visibility_host($1,\'decide\',\'review-private\',null,(select id from bookish_join_requests where email=\'pending@example.test\'),true) v',[cap]))[0].v;
 assert.equal(approved.notice.host_email,'legacy-host@example.test');
});

test('email-confirmed directory claims retain pending review without ownership or account promotion',async()=>{
 const ref='books-and-brews-book-club-08ae63';
 const before=(await q('select id,name,visibility,owner_submission_id from bookish_clubs where club_ref=$1',[ref]))[0];
 const cap=crypto.randomUUID();
 await q(`insert into bookish_submissions(kind,email,club_ref,payload,confirm_token) values('claim','review2@example.test',$1,'{"club_name":"Taken","club_city":"Austin","state":"TX","visibility":"hidden"}',$2)`,[ref,cap]);
 await q("update bookish_submissions set status='confirmed',confirmed_at=now() where confirm_token=$1",[cap]);
 assert.deepEqual((await q('select id,name,visibility,owner_submission_id from bookish_clubs where club_ref=$1',[ref]))[0],before);
 assert.equal((await q('select claim_review_status from bookish_submissions where confirm_token=$1',[cap]))[0].claim_review_status,'pending');
 await rpc(outsider,'bookish_sync_account');
 assert.equal((await q('select count(*)::int n from bookish_members where club_id=$1 and user_id=$2',[before.id,outsider]))[0].n,0);
 // Even a pre-patch or service-attached claim cannot use sync or its email link to promote itself.
 await q('update bookish_clubs set owner_submission_id=(select id from bookish_submissions where confirm_token=$1) where id=$2',[cap,before.id]);
 await rpc(outsider,'bookish_sync_account');
 assert.equal((await q('select count(*)::int n from bookish_members where club_id=$1 and user_id=$2',[before.id,outsider]))[0].n,0);
 await assert.rejects(role('service_role',"select bookish_visibility_host($1,'get',$2)",[cap,ref]),/unavailable/i);
});

test('web host desk omits account email and retains contact for email-only requests',async()=>{
 const cap=await legacy('review-host-desk','private');
 const club=(await q("select id from bookish_clubs where club_ref='review-host-desk'"))[0].id;
 await q(`insert into bookish_join_requests(club_ref,club_id,club_name,email,first_name,user_id,status) values('review-host-desk',$1,'Legacy club','review1@example.test','App reader',$2,'pending'),('review-host-desk',$1,'Legacy club','web-reader@example.test','Web reader',null,'pending')`,[club,reader]);
 const desk=(await role('service_role',"select bookish_visibility_host($1,'get','review-host-desk') v",[cap]))[0].v;
 assert.equal(desk.requests.find(r=>r.first_name==='App reader').email,null);
 assert.equal(desk.requests.find(r=>r.first_name==='Web reader').email,'web-reader@example.test');
 assert.ok(!JSON.stringify(desk).includes('review1@example.test'));
});

test('service report pagination reaches more than 100 pending rows without resolved reports or account identities',async()=>{
 await q("insert into bookish_private.content_reports(kind,target_id,reason,status) select 'club',gen_random_uuid(),'Pending safety report','pending' from generate_series(1,205)");
 await q("insert into bookish_private.content_reports(kind,target_id,reason,status) values('club',gen_random_uuid(),'Already resolved','resolved')");
 const expected=(await q("select id from bookish_private.content_reports where status='pending' order by id")).map(r=>r.id);
 let after=null;const seen=[];
 for(let page=0;page<4;page++){
  const rows=await role('service_role','select * from bookish_content_report_queue($1::uuid)',[after]);
  assert.ok(rows.length<=100);assert.ok(rows.every(r=>r.reason!=='Already resolved'&&!('reporter_id' in r)));
  seen.push(...rows.map(r=>r.id));if(rows.length<100)break;after=rows.at(-1).id;
 }
 assert.equal(seen.length,205);assert.deepEqual(seen,expected);
 for(const r of ['anon','authenticated'])await assert.rejects(role(r,'select * from bookish_content_report_queue(null::uuid)'),/permission denied/);
 await q("insert into vault.test_secrets values('BOOKISH_REPORT_WORKER_KEY','fixture-worker-secret')");
 assert.equal((await role('service_role',"select bookish_get_secret('BOOKISH_REPORT_WORKER_KEY') v"))[0].v,'fixture-worker-secret');
 for(const r of ['anon','authenticated'])await assert.rejects(role(r,"select bookish_get_secret('BOOKISH_REPORT_WORKER_KEY')"),/permission denied/);
});

test('chunk 20 has target and predecessor guards, is repeatable, and rollback revokes its new access',async()=>{
 assert.ok(patch,'apply-20 must exist');
 await db.exec("set bookish.target_ref='wrong'");await assert.rejects(db.exec(patch),/Confirm the Bookish/);await db.exec('rollback');
 await db.exec("set bookish.target_ref='tkrsrnlasinmlftkcufi'");
 await q("delete from bookish_release_20261101.state where version='dedicated-chunk-19'");await assert.rejects(db.exec(patch),/Apply earlier Bookish chunks/);await db.exec('rollback');
 await q("insert into bookish_release_20261101.state values('dedicated-chunk-19',now())");await db.exec(patch);await db.exec(patch);
 await db.exec(await readFile('.ted/rollback.sql','utf8'));
 await assert.rejects(rpc(reader,'bookish_my_vote',[crypto.randomUUID()]),/permission denied/);
 await assert.rejects(role('service_role','select * from bookish_content_report_queue(null::uuid)'),/permission denied/);
 await db.exec(patch);
});
