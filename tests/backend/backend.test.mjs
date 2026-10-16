import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const postedId = rows => rows[0].bookish_post_take.id;
const users = ['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004'];
const q = async (sql, params=[]) => (await db.query(sql, params)).rows;
async function as(user, sql, params=[]) {
  await db.exec('set role authenticated');
  await q("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  try { return await q(sql, params); } finally { await db.exec('reset role'); }
}
async function rpc(user, name, args=[]) { return as(user, `select * from public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`, args); }
let clubA, clubB;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of (await readdir('supabase/sql')).filter(n=>/^00[1-8]_/.test(n)).sort())
    try { await db.exec(await readFile('supabase/sql/'+name,'utf8')); } catch(e) { throw new Error(name+': '+e.message); }
  for (let i=0;i<users.length;i++) {
    await q('insert into auth.users(id,email) values ($1,$2)', [users[i],`reader${i}@example.com`]);
    await rpc(users[i], 'bookish_accept_terms', ['2026-10-15',true]);
  }
  clubA = (await rpc(users[0], 'bookish_create_club', ['Candlelight Readers','Chicago','IL']))[0].bookish_create_club;
  clubB = (await rpc(users[2], 'bookish_create_club', ['Sunday Stories','Seattle','WA']))[0].bookish_create_club;
  await rpc(users[0], 'bookish_set_current_book', [clubA,'fourth-wing']);
  const invite = (await rpc(users[0], 'bookish_create_invite', [clubA,2,1]))[0].bookish_create_invite;
  await rpc(users[1], 'bookish_redeem_invite', [invite]);
});
after(async()=>{await db?.close();});

test('members see only their clubs and cannot elevate their role', async()=>{
  assert.deepEqual((await as(users[1],'select id from bookish_clubs')).map(r=>r.id),[clubA]);
  assert.equal((await as(users[1],'select * from bookish_members where club_id=$1',[clubB])).length,0);
  await assert.rejects(as(users[1],"update bookish_members set role='host' where user_id=$1",[users[1]]),/permission denied/);
  await assert.rejects(rpc(users[1],'bookish_create_invite',[clubB,2,1]),/host/i);
});

test('all public and private application tables have RLS', async()=>{
  const rows = await q(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and (c.relname like 'bookish_%' or n.nspname='bookish_private') and not c.relrowsecurity`);
  assert.deepEqual(rows,[]);
});

test('invite is bounded, retry-safe and cannot be replayed by another user',async()=>{
  const code=(await rpc(users[0],'bookish_create_invite',[clubA,1,1]))[0].bookish_create_invite;
  await rpc(users[3],'bookish_redeem_invite',[code]);
  await rpc(users[3],'bookish_redeem_invite',[code]);
  await assert.rejects(rpc(users[2],'bookish_redeem_invite',[code]),/invite/i);
});

test('Tea hides anonymous identity, sealed text and cross-club content', async()=>{
  const id=postedId(await rpc(users[0],'bookish_post_take',[clubA,'fourth-wing','I need to talk about this twist!',false,200,null,null]));
  const row=(await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,30,0])).find(r=>r.id===id);
  assert.equal(row.body,null); assert.equal(row.sealed,true); assert.equal(row.signed_name,null);
  assert.equal('author_id' in row,false);
  await assert.rejects(as(users[0],'select * from bookish_private.take_authors'),/permission denied/);
  await assert.rejects(as(users[0],'select * from bookish_takes'),/permission denied/);
  await assert.rejects(rpc(users[2],'bookish_tea',[clubA,'fourth-wing',null,30,0]),/Join this club/i);
  await rpc(users[1],'bookish_log_page',[clubA,'fourth-wing',210,null,false,'20000000-0000-0000-0000-000000000001']);
  assert.equal((await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,30,0])).find(r=>r.id===id).body,'I need to talk about this twist!');
});

test('Tea moderation blocks member references, threats and missing terms but allows book swearing',async()=>{
  await as(users[1],"update bookish_profiles set display_name='Maya' where id=$1",[users[1]]);
  const held=(await rpc(users[0],'bookish_post_take',[clubA,'fourth-wing','Maya is the best',false,0,null,null]))[0].bookish_post_take;
  assert.equal(held.status,'held'); assert.match(held.message,/Spill about the book/);
  assert.equal((await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,30,0])).some(r=>r.id===held.id),false);
  await assert.rejects(rpc(users[0],'bookish_post_take',[clubA,'fourth-wing','I will kill you',false,0,null,null]),/Spill about the book/);
  await rpc(users[0],'bookish_post_take',[clubA,'fourth-wing','This damn twist, I screamed!',false,0,null,null]);
});

test('report hides immediately, host can dismiss without identity, block works for anonymous authors',async()=>{
  const id=postedId(await rpc(users[1],'bookish_post_take',[clubA,'fourth-wing','Theory: the teacup matters',false,0,null,null]));
  await rpc(users[0],'bookish_take_action',[id,'report','Please take a look']);
  assert.equal((await rpc(users[0],'bookish_tea',[clubA,'fourth-wing',null,30,0])).some(r=>r.id===id),false);
  const queue=await rpc(users[0],'bookish_host_reports',[clubA]);
  assert.equal(queue.some(r=>r.take_id===id),true); assert.equal('author_id' in queue[0],false);
  await rpc(users[0],'bookish_moderate_take',[id,'dismiss']);
  await rpc(users[3],'bookish_take_action',[id,'block',null]);
  assert.equal((await rpc(users[3],'bookish_tea',[clubA,'fourth-wing',null,30,0])).some(r=>r.id===id),false);
  const own=postedId(await rpc(users[3],'bookish_post_take',[clubA,'fourth-wing','Theory: a lovely ending',false,0,null,null]));
  await assert.rejects(rpc(users[1],'bookish_react',[own,'🍵']),/available/i);
  await assert.rejects(rpc(users[1],'bookish_post_take',[clubA,'fourth-wing','Tell me more',false,0,null,own]),/available/i);
});

test('chapter spoilers, inherited reply seals, signed posts and shield opt-out stay server-side',async()=>{
 const id=postedId(await rpc(users[0],'bookish_post_take',[clubA,'fourth-wing','Chapter nine made me swoon',true,0,9,null]));
 let row=(await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,100,0])).find(r=>r.id===id);
 assert.equal(row.body,null); assert.equal(row.signed_name,'Reader');
 await rpc(users[1],'bookish_log_page',[clubA,'fourth-wing',210,9,false,'20000000-0000-0000-0000-000000000002']);
 row=(await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,100,0])).find(r=>r.id===id);
 assert.equal(row.body,'Chapter nine made me swoon');
 const reply=postedId(await rpc(users[1],'bookish_post_take',[clubA,'fourth-wing','What a chapter!',false,0,null,id]));
 const sealed=(await rpc(users[0],'bookish_tea',[clubA,'fourth-wing',id,30,0])).find(r=>r.id===reply);
 assert.equal(sealed.body,null);assert.equal(sealed.spoiler_chapter,9);
 await rpc(users[0],'bookish_member_preferences',[clubA,true,false,true]);
 assert.equal((await rpc(users[0],'bookish_tea',[clubA,'fourth-wing',id,30,0]))[0].body,'What a chapter!');
 await rpc(users[0],'bookish_member_preferences',[clubA,true,true,true]);
});


test('meetings, RSVPs, bring claims, progress and votes are isolated by club',async()=>{
  const meeting=(await rpc(users[0],'bookish_schedule_meeting',[clubA,'2026-11-01T20:00:00Z','Our next chapter','Members-only place',100]))[0].bookish_schedule_meeting;
  assert.equal((await as(users[2],'select * from bookish_meetings where id=$1',[meeting])).length,0);
  await as(users[1],"insert into bookish_rsvps(meeting_id,club_id,user_id,response) values ($1,$2,$3,'going')",[meeting,clubA,users[1]]);
  await assert.rejects(as(users[2],"insert into bookish_rsvps(meeting_id,club_id,user_id,response) values ($1,$2,$3,'going')",[meeting,clubA,users[2]]),/row-level security/);
  const item=(await rpc(users[0],'bookish_add_bring_item',[meeting,'Something bubbly']))[0].bookish_add_bring_item;
  await rpc(users[1],'bookish_claim_bring_item',[item,true]);
  await assert.rejects(rpc(users[3],'bookish_claim_bring_item',[item,true]),/claimed/i);
  const vote=(await rpc(users[0],'bookish_open_vote',[clubA,new Date(Date.now()+86400000).toISOString(),['yellowface','lessons-in-chemistry'],false]))[0].bookish_open_vote;
  const options=await as(users[1],'select * from bookish_vote_options where vote_id=$1',[vote]);
  await rpc(users[1],'bookish_cast_ballot',[vote,options[0].id,'app']);
  await assert.rejects(rpc(users[2],'bookish_cast_ballot',[vote,options[0].id,'app']),/Join this club/i);
  assert.equal((await as(users[2],'select * from bookish_vote_ballots where vote_id=$1',[vote])).length,0);
  await rpc(users[0],'bookish_close_vote',[vote,null]);
  assert.equal((await as(users[1],"select book_id from bookish_club_books where club_id=$1 and status='reading'",[clubA]))[0].book_id,'yellowface');
});


test('host approval, verified directory linking and selected club are authorized',async()=>{
 await rpc(users[2],'bookish_set_listing',[clubB,true]);
 const request=(await rpc(users[1],'bookish_request_join',[clubB,'I bring great tea']))[0].bookish_request_join;
 await assert.rejects(rpc(users[0],'bookish_decide_join',[request,true]),/host/);
 await rpc(users[2],'bookish_decide_join',[request,true]);
 await rpc(users[1],'bookish_switch_club',[clubB]);
 assert.equal((await as(users[1],'select active_club_id from bookish_preferences'))[0].active_club_id,clubB);
 await assert.rejects(rpc(users[0],'bookish_link_directory',[clubA,'unverified-directory-club']),/Confirm/);
 await q("insert into bookish_submissions(kind,email,club_ref,status) values ('claim','reader0@example.com','directory-match','confirmed')");
 await rpc(users[0],'bookish_link_directory',[clubA,'directory-match']);
 assert.equal((await as(users[0],'select club_ref from bookish_clubs where id=$1',[clubA]))[0].club_ref,'directory-match');
});

test('directory ownership requires a confirmed Auth email, not just a matching address',async()=>{
 const u='10000000-0000-0000-0000-000000000007';
 await q('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,null)',[u,'unconfirmed@example.com']);
 await rpc(u,'bookish_accept_terms',['2026-10-15',true]);
 const c=(await rpc(u,'bookish_create_club',['Email Readers','Chicago','IL']))[0].bookish_create_club;
 await q("insert into bookish_submissions(kind,email,club_ref,status) values ('claim','unconfirmed@example.com','confirm-first','confirmed')");
 await assert.rejects(rpc(u,'bookish_link_directory',[c,'confirm-first']),/Confirm/);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[u]);
 await rpc(u,'bookish_link_directory',[c,'confirm-first']);
 await q('delete from auth.users where id=$1',[u]);
});

test('every club table rejects reads from outsiders, and anonymous API execution is closed',async()=>{
 await as(users[1],"insert into bookish_nominations(club_id,book_id,user_id) values ($1,'babel',$2)",[clubA,users[1]]);
 const tables=['bookish_clubs','bookish_members','bookish_club_books','bookish_page_log','bookish_meetings','bookish_rsvps','bookish_bring_items','bookish_votes','bookish_vote_options','bookish_vote_ballots','bookish_nominations'];
 for(const table of tables) {
 const key=table==='bookish_clubs'?'id':'club_id';
 assert.ok((await q(`select * from ${table} where ${key}=$1`,[clubA])).length>0,table+' fixture');
 assert.equal((await as(users[2],`select * from ${table} where ${key}=$1`,[clubA])).length,0,table);
 }
 await db.exec('set role anon');
 try { await assert.rejects(q('select bookish_create_club($1,$2,$3)',['Hello','Chicago','IL']),/permission denied/); }
 finally {await db.exec('reset role');}
 await assert.rejects(as(users[0],"select bookish_escalate_author(null,'host','Looking for an author')"),/permission denied/);
});

test('race log retries are idempotent, standings honor opt-out and new books reset progress',async()=>{
 const request='20000000-0000-0000-0000-000000000003';
 const first=(await rpc(users[1],'bookish_log_page',[clubA,'yellowface',42,1,false,request]))[0].bookish_log_page;
 assert.equal((await rpc(users[1],'bookish_log_page',[clubA,'yellowface',42,1,false,request]))[0].bookish_log_page,first);
 assert.equal((await rpc(users[0],'bookish_race',[clubA])).find(r=>r.user_id===users[1]).page,42);
 await rpc(users[1],'bookish_member_preferences',[clubA,false,true,true]);
 assert.equal((await rpc(users[0],'bookish_race',[clubA])).some(r=>r.user_id===users[1]),false);
 await rpc(users[1],'bookish_member_preferences',[clubA,true,true,true]);
 await assert.rejects(rpc(users[2],'bookish_race',[clubA]),/Join this club/);
});

test('votes enforce option ownership, ties, expiry and frozen closed ballots',async()=>{
 const v=(await rpc(users[0],'bookish_open_vote',[clubA,new Date(Date.now()+86400000).toISOString(),['babel','iron-flame'],false]))[0].bookish_open_vote;
 const opts=await as(users[1],'select id from bookish_vote_options where vote_id=$1 order by book_id',[v]);
 const old=(await q('select id from bookish_vote_options where vote_id<>$1 limit 1',[v]))[0].id;
 await assert.rejects(rpc(users[1],'bookish_cast_ballot',[v,old,'app']),/foreign key/);
 await rpc(users[0],'bookish_cast_ballot',[v,opts[0].id,'app']);
 await rpc(users[1],'bookish_cast_ballot',[v,opts[1].id,'app']);
 await assert.rejects(rpc(users[0],'bookish_close_vote',[v,null]),/tie/);
 await q("update bookish_votes set closes_at=now()-interval '1 minute' where id=$1",[v]);
 await assert.rejects(rpc(users[1],'bookish_cast_ballot',[v,opts[0].id,'app']),/next chapter/);
 assert.equal((await rpc(users[0],'bookish_close_vote',[v,opts[1].id]))[0].bookish_close_vote,opts[1].id);
 await assert.rejects(rpc(users[1],'bookish_cast_ballot',[v,opts[0].id,'app']),/next chapter/);
 assert.equal((await rpc(users[0],'bookish_close_vote',[v,null]))[0].bookish_close_vote,opts[1].id);
});

test('terms, role, author and moderation fields cannot be forged by API roles',async()=>{
 await assert.rejects(as(users[1],"update bookish_profiles set terms_version='forged' where id=$1",[users[1]]),/permission denied/);
 await assert.rejects(as(users[1],"update bookish_profiles set banned_at=now() where id=$1",[users[1]]),/permission denied/);
 await assert.rejects(as(users[1],"insert into bookish_members(club_id,user_id,role) values ($1,$2,'host')",[clubB,users[0]]),/permission denied/);
 await assert.rejects(as(users[1],"insert into bookish_takes(club_id,book_id,body) values ($1,'yellowface','A lovely chapter')",[clubA]),/permission denied/);
 await q('update bookish_profiles set terms_accepted_at=null where id=$1',[users[1]]);
 await assert.rejects(rpc(users[1],'bookish_post_take',[clubA,'iron-flame','A lovely chapter',false,0,null,null]),/house rules/);
 await rpc(users[1],'bookish_accept_terms',['2026-10-15',true]);
 await q("insert into bookish_pours(user_id,book_id,club_id,glasses,dnf) values ($1,'fourth-wing',$2,3,true)",[users[1],clubA]);
 assert.equal((await as(users[0],"select * from bookish_pours where user_id=$1",[users[1]])).length,0);
 assert.equal((await rpc(users[0],'bookish_club_pour',[clubA,'fourth-wing']))[0].bookish_club_pour.dnf_count,1);
});

test('community floor suppresses two clubs and suppresses means with fewer than three contributing clubs',async()=>{
 const clubs=[];
 for(let i=0;i<3;i++){
  const c=(await q("insert into bookish_clubs(name,city,state) values ('Privacy Readers','Portland','OR') returning id"))[0].id;clubs.push(c);
  await q('insert into bookish_members(club_id,user_id) values ($1,$2),($1,$3)',[c,users[i],users[(i+1)%3]]);
  await q("insert into bookish_club_books(club_id,book_id,status,finished_at) values ($1,'babel','finished',current_date)",[c]);
  if(i===1)assert.equal((await q("select * from bookish_book_stats where book_id='babel'")).length,0);
 }
 await q("insert into bookish_pours(user_id,book_id,club_id,glasses) values ($1,'babel',$2,4)",[users[0],clubs[0]]);
 assert.equal((await q("select mean_pour from bookish_book_stats where book_id='babel'"))[0].mean_pour,null);
 assert.equal((await q("select mean_pour from bookish_city_book where book_id='babel'"))[0].mean_pour,null);
 for(let i=1;i<3;i++)await q("insert into bookish_pours(user_id,book_id,club_id,glasses) values ($1,'babel',$2,4)",[users[i],clubs[i]]);
 assert.equal(Number((await q("select mean_pour from bookish_book_stats where book_id='babel'"))[0].mean_pour),4);
 await q('update bookish_members set ratings_public=false where club_id=$1 and user_id=$2',[clubs[2],users[2]]);
 assert.equal((await q("select mean_pour from bookish_book_stats where book_id='babel'"))[0].mean_pour,null);
 for(const c of clubs)await q('delete from bookish_clubs where id=$1',[c]);
});

test('host removal rejects stale sessions and invite re-entry',async()=>{
 const code=(await rpc(users[2],'bookish_create_invite',[clubB,2,1]))[0].bookish_create_invite;
 await rpc(users[2],'bookish_remove_member',[clubB,users[1]]);
 assert.equal((await as(users[1],'select * from bookish_clubs where id=$1',[clubB])).length,0);
 await assert.rejects(rpc(users[1],'bookish_redeem_invite',[code]),/host/);
});

test('safety queue access is scoped, author access is audited, and bans stop existing tokens',async()=>{
 const temp='10000000-0000-0000-0000-000000000009';
 await q('insert into auth.users(id,email) values ($1,$2)',[temp,'safety-reader@example.com']);
 await rpc(temp,'bookish_accept_terms',['2026-10-15',true]);
 const c=(await rpc(temp,'bookish_create_club',['Safety Readers','Chicago','IL']))[0].bookish_create_club;
 await rpc(temp,'bookish_set_current_book',[c,'fourth-wing']);
 const t=postedId(await rpc(temp,'bookish_post_take',[c,'fourth-wing','Such a lovely book',false,0,null,null]));
 await db.exec('set role service_role');
 try {
  await assert.rejects(q('select * from bookish_private.take_authors'),/permission denied/);
  assert.equal((await q("select bookish_escalate_author($1,'reviewer-ticket-42','Safety escalation ticket 42')",[t]))[0].bookish_escalate_author,temp);
  await q("select bookish_safety_review($1,'ban','reviewer-ticket-42','Safety review ticket 42')",[t]);
 } finally {await db.exec('reset role');}
 assert.equal((await q("select count(*) n from bookish_private.safety_audit where take_id=$1",[t]))[0].n,2);
 assert.equal((await as(temp,'select * from bookish_clubs')).length,0);
 await q('delete from auth.users where id=$1',[temp]);
 assert.equal((await q('select * from bookish_clubs where id=$1',[c])).length,0);
});

test('lone-host deletion cascades a closed vote, meetings, claims, preferences and private held drafts',async()=>{
 const u='10000000-0000-0000-0000-000000000008';
 await q('insert into auth.users(id,email) values ($1,$2)',[u,'lone-host@example.com']);
 await rpc(u,'bookish_accept_terms',['2026-10-15',true]);
 const c=(await rpc(u,'bookish_create_club',['One Last Chapter','Chicago','IL']))[0].bookish_create_club;
 await rpc(u,'bookish_set_current_book',[c,'fourth-wing']);
 await as(u,"update bookish_profiles set display_name='Jordan' where id=$1",[u]);
 await rpc(u,'bookish_post_take',[c,'fourth-wing','Jordan loves this chapter',false,0,null,null]);
 const m=(await rpc(u,'bookish_schedule_meeting',[c,'2026-11-01T20:00:00Z','Our next chapter','Members-only place',100]))[0].bookish_schedule_meeting;
 const item=(await rpc(u,'bookish_add_bring_item',[m,'Something bubbly']))[0].bookish_add_bring_item;
 await rpc(u,'bookish_claim_bring_item',[item,true]);
 const vote=(await rpc(u,'bookish_open_vote',[c,new Date(Date.now()+86400000).toISOString(),['yellowface','babel'],false]))[0].bookish_open_vote;
 const option=(await as(u,'select id from bookish_vote_options where vote_id=$1 limit 1',[vote]))[0].id;
 await rpc(u,'bookish_close_vote',[vote,option]);
 await q('delete from auth.users where id=$1',[u]);
 for(const table of ['bookish_clubs','bookish_members','bookish_meetings','bookish_bring_items','bookish_votes','bookish_vote_options','bookish_vote_ballots']) {
  const key=table==='bookish_clubs'?'id':'club_id';
  assert.equal((await q(`select * from ${table} where ${key}=$1`,[c])).length,0,table);
 }
 assert.equal((await q('select * from bookish_private.content_holds where author_id=$1',[u])).length,0);
 assert.equal((await q('select * from bookish_preferences where user_id=$1',[u])).length,0);
});

test('account removal deletes owned content and records while preserving other members',async()=>{
  await q("insert into bookish_submissions(kind,email) values ('waitlist','reader3@example.com')");
  await q("insert into bookish_join_requests(club_ref,email,user_id) values ('directory-only','reader3@example.com',$1)",[users[3]]);
  await q("update auth.users set email='new-email@example.com' where id=$1",[users[3]]);
  await q('delete from auth.users where id=$1',[users[3]]);
  assert.equal((await q("select * from bookish_submissions where email='reader3@example.com'")).length,0);
  assert.equal((await q("select * from bookish_join_requests where email='reader3@example.com'")).length,0);
  assert.equal((await q('select * from bookish_profiles where id=$1',[users[3]])).length,0);
  assert.equal((await q('select * from bookish_members where user_id=$1',[users[3]])).length,0);
  assert.equal((await q('select * from bookish_private.take_authors where author_id=$1',[users[3]])).length,0);
  assert.equal((await rpc(users[1],'bookish_tea',[clubA,'fourth-wing',null,30,0])).some(r=>r.body==='Theory: a lovely ending'),false);
  assert.equal((await as(users[3],'select * from bookish_clubs')).length,0);
});

test('deleting a host passes the ribbon to the longest-standing member',async()=>{
 await q('delete from auth.users where id=$1',[users[0]]);
 assert.equal((await as(users[1],"select role from bookish_members where club_id=$1 and user_id=$2",[clubA,users[1]]))[0].role,'host');
 assert.equal((await q('select * from bookish_clubs where id=$1',[clubA])).length,1);
});
