import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const host='81000000-0000-0000-0000-000000000001',reader='81000000-0000-0000-0000-000000000002',outsider='81000000-0000-0000-0000-000000000003';
let db,club;
const q=async(s,p=[])=>(await db.query(s,p)).rows;
async function as(u,s,p=[]){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[u]);try{return await q(s,p);}finally{await db.exec('reset role');}}
const rpc=async(u,n,p=[])=>(await as(u,`select public.${n}(${p.map((_,i)=>'$'+(i+1)).join(',')}) as v`,p))[0].v;
before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const n of (await readdir('supabase/sql')).filter(n=>/^0(0[1-9]|10)_/.test(n)).sort())await db.exec(await readFile('supabase/sql/'+n,'utf8'));
 for(const [i,id] of [host,reader,outsider].entries()){await q(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"app":"bookish"}')`,[id,`integrate${i}@example.test`]);await rpc(id,'bookish_accept_terms',['2026-10-15',true]);}
 await q("insert into bookish_city_centers values ('Austin','TX',30.2672,-97.7431) on conflict do nothing");
 club=await rpc(host,'bookish_create_club',['Integration readers','Austin','TX']);
});
after(()=>db?.close());
test('integrated private approval grants membership, while open joins immediately and hidden only accepts a fresh invite',async()=>{
 await rpc(host,'bookish_set_visibility',[club,'private']);
 const detail=await rpc(reader,'bookish_club_detail',[club]);assert.equal(detail.club_id,club);
 assert.equal((await rpc(reader,'bookish_join_club',[club,'Hello'])).status,'pending');
 const queue=(await as(host,'select * from bookish_join_queue($1)',[club]));assert.equal(queue.length,1);
 await rpc(host,'bookish_decide_join',[queue[0].id,true]);
 assert.equal((await rpc(reader,'bookish_my_clubs')).length,1);
 assert.equal((await as(reader,'select * from bookish_clubs where id=$1',[club])).length,1);
 await rpc(host,'bookish_set_visibility',[club,'hidden']);
 assert.equal(await rpc(outsider,'bookish_club_detail',[club]),null);
 await assert.rejects(rpc(outsider,'bookish_join_club',[club,'']),/host|unavailable/i);
 const a=await rpc(host,'bookish_rotate_invite',[club]),b=await rpc(host,'bookish_rotate_invite',[club]);
 await assert.rejects(rpc(outsider,'bookish_redeem_invite',[a]),/invite/i);
 assert.equal(await rpc(outsider,'bookish_redeem_invite',[b]),club);
 const open=await rpc(host,'bookish_create_club',['Open readers','Austin','TX']);await rpc(host,'bookish_set_visibility',[open,'open']);
 assert.equal((await rpc(reader,'bookish_join_club',[open,''])).status,'joined');
});
test('public directory contains city-center coordinates, no hidden clubs, and no meeting addresses',async()=>{
 await rpc(host,'bookish_set_visibility',[club,'private']);
 await rpc(host,'bookish_schedule_meeting',[club,'2026-12-01T20:00:00Z','Next meeting','PRIVATE HOME ADDRESS',100]);
 const d=(await q('select bookish_visibility_directory() as v'))[0].v;const c=d.find(c=>c.club_id===club);assert.equal(c.lat,30.2672);assert.equal(c.lng,-97.7431);assert.ok(!JSON.stringify(d).includes('PRIVATE HOME ADDRESS'));
 assert.ok((await rpc(reader,'bookish_club_home',[club])).meetings.length);
});
test('content reports and blocks cover meetings, member profiles, clubs, and future anonymous author posts',async()=>{
 await rpc(host,'bookish_set_current_book',[club,'fourth-wing']);
 const take=(await rpc(reader,'bookish_post_take',[club,'fourth-wing','First anonymous thought',false,0,null,null])).id;
 const second=(await rpc(reader,'bookish_post_take',[club,'fourth-wing','Second anonymous thought',false,0,null,null])).id;
 await rpc(host,'bookish_take_action',[take,'block',null]);
 assert.equal((await as(host,"select * from bookish_tea($1,'fourth-wing',null,100,0)",[club])).some(t=>t.id===second),false);
 const home=await rpc(reader,'bookish_club_home',[club]);const mid=home.meetings[0].id;
 await rpc(reader,'bookish_content_action',['meeting',mid,'report','Unsafe location']);
 assert.equal((await rpc(reader,'bookish_club_home',[club])).meetings.length,0);
 await rpc(reader,'bookish_content_action',['member',host,'block',null]);
 assert.equal((await rpc(reader,'bookish_club_home',[club])).members.some(m=>m.user_id===host),false);
 assert.ok((await q('select count(*)::int n from bookish_private.content_reports'))[0].n>0);
 await assert.rejects(rpc(reader,'bookish_content_action',['request',crypto.randomUUID(),'report','x']),/unavailable/i);
});
test('unverified and foreign users cannot use Bookish RPCs, and auth throttle functions are service-only',async()=>{
 const id='81000000-0000-0000-0000-000000000099';await q(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,'unverified@example.test',null,'{"app":"bookish"}')`,[id]);
 await assert.rejects(rpc(id,'bookish_accept_terms',['2026-10-15',true]),/house rules/i);
 await assert.rejects(as(reader,"select bookish_auth_lookup('integrate0@example.test')"),/permission denied/);
 await assert.rejects(as(reader,"select bookish_auth_throttle('email','ip','start')"),/permission denied/);
});
test('all ten SQL files can rerun without changing memberships or identities',async()=>{
 const before=(await q('select count(*)::int n from bookish_members'))[0].n;
 for(const n of (await readdir('supabase/sql')).filter(n=>/^0(0[1-9]|10)_/.test(n)).sort())await db.exec(await readFile('supabase/sql/'+n,'utf8'));
 assert.equal((await q('select count(*)::int n from bookish_members'))[0].n,before);
 assert.equal((await rpc(reader,'bookish_club_home',[club])).club.id,club);
});
test('confirmed claims cannot capture an account-hosted club and legacy invite rotation remains native-redeemable',async()=>{
 const c=await rpc(host,'bookish_create_club',['No takeover readers','Austin','TX']);await rpc(host,'bookish_set_visibility',[c,'private']);
 await q(`insert into bookish_submissions(kind,email,club_ref,payload,status) values('claim','attacker@example.test',$1,'{"club_name":"Stolen","club_city":"Austin","state":"TX","visibility":"hidden"}','confirmed')`,[c]);
 assert.equal((await q('select owner_submission_id from bookish_clubs where id=$1',[c]))[0].owner_submission_id,null);
 const token=crypto.randomUUID();await q(`insert into bookish_submissions(kind,email,club_ref,payload,status,confirm_token) values('start','integrate0@example.test','legacy-native','{"club_name":"Legacy readers","city":"Austin","state":"TX","visibility":"hidden"}','confirmed',$1)`,[token]);
 await rpc(host,'bookish_sync_account');
 const invite=(await q("select bookish_visibility_host($1,'rotate','legacy-native') as v",[token]))[0].v.invite;
 const id=await rpc(reader,'bookish_redeem_invite',[invite]);assert.ok(id);
 const pending=await rpc(outsider,'bookish_create_club',['Private email approval','Austin','TX']);await rpc(outsider,'bookish_set_visibility',[pending,'private']);
 const request=await rpc(reader,'bookish_join_club',[pending,'Hi']);
 const decision=(await q('select decision_token from bookish_join_requests where id=$1',[request.request_id]))[0].decision_token;
 assert.equal((await q('select bookish_visibility_decide($1,true) as v',[decision]))[0].v.ok,true);
 assert.ok((await rpc(reader,'bookish_my_clubs')).some(x=>x.id===pending));
});
test('account deletion also removes legacy join-attempt emails and hashed auth traces without touching a foreign identity',async()=>{
 const id='81000000-0000-0000-0000-000000000088',email='delete-traces@example.test';
 await q(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),'{"app":"bookish"}')`,[id,email]);
 await q('insert into bookish_join_attempts(ip_hash,email) values($1,$2)',['private-ip',email]);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('bookish:'+email)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 await q("select bookish_auth_throttle($1,'private-ip','start')",[hash]);
 await q('delete from auth.users where id=$1',[id]);
 assert.equal((await q('select count(*)::int n from bookish_join_attempts where email=$1',[email]))[0].n,0);
 assert.equal((await q('select count(*)::int n from bookish_private.auth_attempts where email_hash=$1',[hash]))[0].n,0);
});
test('deleting a legacy host clears its submission without deleting the transferred club',async()=>{
 const id='81000000-0000-0000-0000-000000000077',email='legacy-delete@example.test';
 await q(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),'{"app":"bookish"}')`,[id,email]);await rpc(id,'bookish_accept_terms',['2026-10-15',true]);
 await q(`insert into bookish_submissions(kind,email,club_ref,payload,status) values('start',$1,'legacy-delete','{"club_name":"Transferred legacy","city":"Austin","state":"TX","visibility":"open"}','confirmed')`,[email]);
 await rpc(id,'bookish_sync_account');const joined=await rpc(reader,'bookish_join_club',['legacy-delete','']);
 await q('delete from auth.users where id=$1',[id]);
 assert.equal((await q('select owner_submission_id from bookish_clubs where id=$1',[joined.club_id]))[0].owner_submission_id,null);
 assert.equal((await rpc(reader,'bookish_club_home',[joined.club_id])).role,'host');
});
test('reported request notes and blocked request authors stay absent from a refreshed host queue',async()=>{
 const c=await rpc(host,'bookish_create_club',['Request safety readers','Austin','TX']);await rpc(host,'bookish_set_visibility',[c,'private']);
 const result=await rpc(outsider,'bookish_join_club',[c,'A request note']);
 assert.equal((await as(host,'select * from bookish_join_queue($1)',[c])).length,1);
 await rpc(host,'bookish_content_action',['request',result.request_id,'block',null]);
 assert.equal((await as(host,'select * from bookish_join_queue($1)',[c])).length,0);
 await q("update bookish_join_requests set status='declined' where id=$1",[result.request_id]);
 await rpc(outsider,'bookish_join_club',[c,'A later note from the same reader']);
 assert.equal((await as(host,'select * from bookish_join_queue($1)',[c])).length,0);
});
test('host city corrections validate supported areas and reject nonhosts',async()=>{
 const c=await rpc(host,'bookish_create_club',['Location correction','Unsupported Place','TX']);
 await assert.rejects(rpc(host,'bookish_set_visibility',[c,'open']),/supported city/i);
 await assert.rejects(rpc(reader,'bookish_set_club_city',[c,'Austin','TX']),/host/i);
 await assert.rejects(rpc(host,'bookish_set_club_city',[c,'A home address','TX']),/supported/i);
 await rpc(host,'bookish_set_club_city',[c,'austin','tx']);await rpc(host,'bookish_set_visibility',[c,'open']);
 const d=(await q('select bookish_visibility_directory() as v'))[0].v.find(x=>x.club_id===c);assert.equal(d.city,'Austin');assert.equal(d.lat,30.2672);
});
test('blocked member profiles, reported meetings, and hidden clubs are filtered on direct Data API reads too',async()=>{
 const c=await rpc(host,'bookish_create_club',['Filtered reads','Austin','TX']);const inv=await rpc(host,'bookish_create_invite',[c,2,7]);await rpc(reader,'bookish_redeem_invite',[inv]);
 const m=await rpc(host,'bookish_schedule_meeting',[c,'2026-12-01T20:00:00Z','Member title','Private location',100]);
 await rpc(reader,'bookish_content_action',['meeting',m,'report','Please review']);
 assert.equal((await as(reader,'select * from bookish_meetings where id=$1',[m])).length,0);
 await rpc(reader,'bookish_content_action',['member',host,'block',null]);
 assert.equal((await as(reader,'select display_name from bookish_profiles where id=$1',[host])).length,0);
 await rpc(reader,'bookish_content_action',['club',c,'hide',null]);
 assert.equal((await as(reader,'select * from bookish_clubs where id=$1',[c])).length,0);
});
test('host notices are atomically claimed, failed sends retry after five minutes, and successful sends stay acknowledged',async()=>{
 const c=await rpc(reader,'bookish_create_club',['Notice throttles','Austin','TX']);await rpc(reader,'bookish_set_visibility',[c,'private']);
 const result=await rpc(outsider,'bookish_join_club',[c,'Hello']);
 const notice=()=>q('select bookish_join_notice($1,$2) as v',[result.request_id,outsider]);
 const first=(await notice())[0].v;assert.equal(first.kind,'request');
 assert.equal((await notice())[0].v,null);
 await q("update bookish_join_requests set notice_attempted_at=now()-interval '6 minutes' where id=$1",[result.request_id]);assert.ok((await notice())[0].v);
 await q('select bookish_join_notice_done($1,$2)',[result.request_id,outsider]);
 await q("update bookish_join_requests set notice_attempted_at=now()-interval '6 minutes' where id=$1",[result.request_id]);assert.equal((await notice())[0].v,null);
});
test('service moderation resolves generic reports with an audit and removes unsafe public content for everyone',async()=>{
 const c=await rpc(reader,'bookish_create_club',['Reported directory content','Austin','TX']);await rpc(reader,'bookish_set_visibility',[c,'open']);
 await rpc(outsider,'bookish_content_action',['club',c,'report','Unsafe club name']);
 const report=(await q("select id from bookish_private.content_reports where kind='club' and target_id=$1",[c]))[0].id;
 await assert.rejects(rpc(host,'bookish_review_content',[report,'hide','reviewer-42','Reviewed against the house rules']),/permission denied/);
 await db.exec('set role service_role');try{await q('select bookish_review_content($1,$2,$3,$4)',[report,'hide','reviewer-42','Reviewed against the house rules']);}finally{await db.exec('reset role');}
 assert.equal((await q('select bookish_visibility_directory() as v'))[0].v.some(x=>x.club_id===c),false);
 assert.equal((await q('select count(*)::int n from bookish_private.content_moderation_audit where report_id=$1',[report]))[0].n,1);
 assert.equal((await q('select status from bookish_private.content_reports where id=$1',[report]))[0].status,'resolved');
});
