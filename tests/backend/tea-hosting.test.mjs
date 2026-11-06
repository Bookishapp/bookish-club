import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,reader,other,outside} from './helpers/tea-db.mjs';
let f;before(async()=>{f=await fixture();});after(()=>f?.db.close());
const noAuthor=value=>{const s=JSON.stringify(value);for(const key of ['author_id','signed_name','display_name','email','mine'])assert.ok(!s.includes(`"${key}"`),key);for(const id of [host,reader,other])assert.ok(!s.includes(id),'Author identifier');};
test('Tea requires a page or DNF, anonymous legacy posting, and at most 280 characters',async()=>{
 await assert.rejects(f.post(reader,'x',null,false),/page|finish/i);
 for(const [page,dnf] of [[-1,false],[100001,false],[20,true]])await assert.rejects(f.post(reader,'x',page,dnf),/page|finish/i);
 for(const body of ['', ' '.repeat(3),'x'.repeat(281)])await assert.rejects(f.post(reader,body),/280|text|take/i);
 await assert.rejects(f.rpc(reader,'bookish_post_take',[f.club,'fourth-wing','Signed',true,1]),/anonymous/i);
 noAuthor(await f.post(reader,'x'.repeat(280),0));noAuthor(await f.post(other,'Did not finish',null,true));
});
test('filter rejects slurs, email, phone, street addresses, and invisible-character evasions',async()=>{
 for(const body of ['you faggot','contact me at tea@example.com','Call +1 (415) 555-0123','123 Main Street','42B North Oak Avenue','t\u200bea@example.com','４１５５５５０１２３'])await assert.rejects(f.post(reader,body),/book|personal|filter/i,body);
});
test('filter allows ordinary page, chapter, year-range, and ISBN discussion',async()=>{
 for(const body of ['I read 50 pages of the court scenes and cried','At 120 pages in the way she lies is wild','Chapter 3 of the place','I was 3 chapters into the drive home','The 1999-2005 timeline confused me','ISBN 9780593099322 edition','ISBN 9791234567896 edition'])await f.post(other,body,0);
 await f.q('delete from bookish_private.tea_post_events');
});
test('spoilers use the caller page even with shield disabled and all Tea surfaces omit identity',async()=>{
 const {id}=await f.post(reader,'The secret at the wall',100);
 await f.rpc(other,'bookish_member_preferences',[f.club,false,false,false]);
 let t=(await f.feed(other)).find(t=>t.id===id);assert.equal(t.body,null);assert.equal(t.sealed,true);noAuthor(t);
 await assert.rejects(f.rpc(other,'bookish_sip',[id,true]),/conversation|sealed/i);
 await f.rpc(other,'bookish_log_page',[f.club,'fourth-wing',100]);
 t=(await f.feed(other)).find(t=>t.id===id);assert.equal(t.body,'The secret at the wall');noAuthor(t);
 const legacy=await f.as(other,'select * from bookish_tea($1,$2)',[f.club,'fourth-wing']);assert.ok(legacy.every(t=>t.signed_name===null&&t.anonymous));assert.ok(!JSON.stringify(legacy).includes(reader));
 const reply=await f.post(other,'A reply at this page',0,false,id);await f.rpc(host,'bookish_moderate_take',[id,'hide']);assert.equal((await f.feed(other,id)).length,0);noAuthor(reply);
});
test('one sip per member has aggregate counts and supports idempotent removal',async()=>{
 const {id}=await f.post(reader,'A sip-worthy thought',0);
 await f.rpc(other,'bookish_sip',[id,true]);await f.rpc(other,'bookish_sip',[id,true]);let t=(await f.feed(other)).find(t=>t.id===id);assert.equal(t.sips,1);assert.equal(t.sipped,true);
 await f.rpc(host,'bookish_sip',[id,true]);assert.equal((await f.feed(reader)).find(t=>t.id===id).sips,2);
 await f.rpc(other,'bookish_sip',[id,false]);assert.equal((await f.feed(other)).find(t=>t.id===id).sips,1);
});
test('content actions hide, report, and block anonymous authors without disclosing them',async()=>{
 const a=await f.post(host,'Report this thought',0);await f.rpc(reader,'bookish_content_action',['take',a.id,'report','Unsafe']);assert.ok(!(await f.feed(reader)).some(t=>t.id===a.id));noAuthor(await f.rpc(host,'bookish_host_reports',[f.club]));
 await f.rpc(other,'bookish_content_action',['take',a.id,'block',null]);const b=await f.post(host,'Later thought',0);assert.ok(!(await f.feed(other)).some(t=>t.id===b.id));
 await assert.rejects(f.rpc(reader,'bookish_moderate_take',[b.id,'hide']),/host/i);
 await f.rpc(host,'bookish_moderate_take',[b.id,'hide']);assert.ok(!(await f.feed(reader)).some(t=>t.id===b.id));
});
test('raw tables, private helpers, escalation, outsiders, and anonymous sessions cannot leak Tea authors',async()=>{
 for(const table of ['bookish_takes','bookish_take_reactions','bookish_private.take_authors'])await assert.rejects(f.as(host,`select * from ${table}`),/permission/i);
 await assert.rejects(f.service('bookish_escalate_author',[crypto.randomUUID(),'reviewer','A legitimate safety reason']),/does not exist|permission/i);
 await assert.rejects(f.as(reader,'select bookish_private.content_verdict($1,$2)',[f.club,'hello']),/permission/i);
 await assert.rejects(f.feed(outside),/member|join|club/i);await assert.rejects(f.post(outside),/member|join|club/i);
 const {id}=await f.post(host,'Safe card example',0);noAuthor(await f.rpc(reader,'bookish_message_card',['take',id]));
 await f.db.exec('set role anon');try{await assert.rejects(f.q('select bookish_tea_feed($1,$2)',[f.club,'fourth-wing']),/permission/i);}finally{await f.db.exec('reset role');}
});
test('rate limit survives deleting takes and is shared by legacy and new posting RPCs',async()=>{
 await f.q('delete from bookish_private.tea_post_events');
 for(let i=0;i<10;i++){const {id}=await f.post(reader,`Rate example ${i}`,0);await f.rpc(reader,'bookish_take_action',[id,'delete']);}
 await assert.rejects(f.post(reader,'Too many',0),/settle|moment|limit/i);
 await assert.rejects(f.rpc(reader,'bookish_post_take',[f.club,'fourth-wing','Legacy bypass',false,0]),/settle|moment|limit/i);
 await f.q('delete from bookish_private.tea_post_events');
});
test('sharing is optional, page logs remain private, and the shared shelf has no competitive fields',async()=>{
 await f.rpc(reader,'bookish_log_page',[f.club,'fourth-wing',73]);
 assert.ok(!(await f.rpc(host,'bookish_reading_together',[f.club])).members.some(m=>m.user_id===reader));
 await f.rpc(reader,'bookish_share_reading',[f.club,true]);const shelf=await f.rpc(host,'bookish_reading_together',[f.club]);assert.equal(shelf.members.find(m=>m.user_id===reader).page,73);for(const key of ['rank','score','streak','position'])assert.ok(!JSON.stringify(shelf).includes(`"${key}"`));assert.ok('cover_id' in shelf.book);assert.ok('cover_url' in shelf.book);
 assert.equal((await f.as(host,'select * from bookish_page_log where user_id=$1',[reader])).length,0);
 await f.rpc(reader,'bookish_share_reading',[f.club,false]);assert.ok(!(await f.rpc(host,'bookish_reading_together',[f.club])).members.some(m=>m.user_id===reader));await assert.rejects(f.rpc(outside,'bookish_reading_together',[f.club]),/member|join|club/i);
});
test('RSVP counts map Yes, Maybe, and Can’t, and bring items have one atomic claim',async()=>{
 const meeting=await f.rpc(host,'bookish_schedule_meeting',[f.club,new Date(Date.now()+2*86400000).toISOString(),'Club night','Members only',100]);
 await f.rpc(reader,'bookish_rsvp',[meeting,'yes']);await f.rpc(reader,'bookish_rsvp',[meeting,'maybe']);await f.rpc(other,'bookish_rsvp',[meeting,'cant']);
 const summary=await f.rpc(host,'bookish_meeting_detail',[meeting]);assert.deepEqual(summary.counts,{yes:0,maybe:1,cant:1});assert.equal((await f.rpc(reader,'bookish_meeting_detail',[meeting])).my_rsvp,'maybe');
 const item=await f.rpc(host,'bookish_add_bring_item',[meeting,'Cheese']);await f.rpc(reader,'bookish_claim_bring_item',[item,true]);await assert.rejects(f.rpc(other,'bookish_claim_bring_item',[item,true]),/claimed/i);await assert.rejects(f.rpc(other,'bookish_claim_bring_item',[item,false]),/claimed/i);
 await f.rpc(reader,'bookish_claim_bring_item',[item,false]);await f.rpc(other,'bookish_claim_bring_item',[item,true]);
 await assert.rejects(f.rpc(outside,'bookish_rsvp',[meeting,'yes']),/member|join|club/i);await assert.rejects(f.rpc(outside,'bookish_meeting_detail',[meeting]),/member|join|club/i);await assert.rejects(f.rpc(reader,'bookish_rsvp',[meeting,'invalid']),/response|choose/i);
 await f.rpc(host,'bookish_edit_meeting',[meeting,new Date(Date.now()+2*86400000).toISOString(),'Cancelled','Venue',null,true]);await assert.rejects(f.rpc(reader,'bookish_rsvp',[meeting,'yes']),/meeting|cancel/i);
});
test('new takes, votes, and join requests produce private, body-free notification rows',async()=>{
 await f.q('delete from bookish_private.actor_blocks');await f.q('delete from bookish_private.tea_post_events');await f.rpc(other,'bookish_log_page',[f.club,'fourth-wing',50]);
 const low=await f.post(reader,'NEVER INCLUDE BODY IN NOTIFICATION',40);const high=await f.post(reader,'SEALED BODY',90);
 const vote=await f.rpc(host,'bookish_open_vote',[f.club,new Date(Date.now()+86400000).toISOString(),['fourth-wing','yellowface'],false]);
 await f.q("insert into bookish_city_centers values('Austin','TX',30,-97) on conflict do nothing");await f.rpc(host,'bookish_set_visibility',[f.club,'private']);const request=await f.rpc(outside,'bookish_join_club',[f.club,'Hello']);
 const notifications=await f.rpc(other,'bookish_notifications');assert.ok(notifications.some(n=>n.kind==='new_take'&&n.target_id===low.id));assert.ok(!notifications.some(n=>n.target_id===high.id));assert.ok(notifications.some(n=>n.kind==='vote_opened'&&n.target_id===vote));assert.ok(!JSON.stringify(notifications).includes('BODY'));
 assert.ok((await f.rpc(host,'bookish_notifications')).some(n=>n.kind==='join_request'&&n.target_id===request.request_id));assert.ok(!(await f.rpc(reader,'bookish_notifications')).some(n=>n.kind==='join_request'));
 await f.rpc(other,'bookish_mark_notifications_read',[null]);assert.ok((await f.rpc(other,'bookish_notifications')).every(n=>n.read_at));
 assert.equal((await f.as(outside,'select * from bookish_notifications')).length,0);
 await f.rpc(other,'bookish_content_action',['take',low.id,'hide',null]);assert.ok(!(await f.rpc(other,'bookish_notifications')).some(n=>n.target_id===low.id));
});
test('DNF content and replies remain sealed until finished, and a new reading cycle resets spoiler access',async()=>{
 await f.q('delete from bookish_private.tea_post_events');
 const dnf=await f.post(reader,'A whole-book DNF thought',null,true);assert.equal((await f.feed(other)).find(t=>t.id===dnf.id).body,null);
 await f.rpc(other,'bookish_log_reading',[f.club,'fourth-wing',100,true,false]);assert.equal((await f.feed(other)).find(t=>t.id===dnf.id).body,'A whole-book DNF thought');
 const reply=await f.post(other,'Reply inherits whole-book seal',0,false,dnf.id);assert.equal((await f.feed(host,dnf.id)).find(t=>t.id===reply.id).body,null);
 await f.rpc(host,'bookish_finish_book',[f.club,'fourth-wing']);await f.rpc(host,'bookish_set_current_book',[f.club,'fourth-wing']);assert.equal((await f.feed(other)).find(t=>t.id===dnf.id).body,null);
});
test('page logging retries do not mutate DNF status, reject cross-book reuse, and never share DNF status',async()=>{
 const request=crypto.randomUUID();const args=[f.club,'fourth-wing',10,false,true,request];const first=await f.rpc(reader,'bookish_log_reading',args);assert.equal(await f.rpc(reader,'bookish_log_reading',args),first);
 await assert.rejects(f.rpc(reader,'bookish_log_reading',[f.club,'fourth-wing',20,false,false,request]),/request|retry|same/i);
 assert.equal((await f.q('select did_not_finish from bookish_page_log where id=$1',[first]))[0].did_not_finish,true);
 await f.rpc(reader,'bookish_share_reading',[f.club,true]);assert.ok(!(await f.rpc(host,'bookish_reading_together',[f.club])).members.some(m=>'did_not_finish' in m));
});
test('all club tables and RPCs deny outsiders, and removed or banned readers lose access immediately',async()=>{
 for(const table of ['bookish_club_books','bookish_members','bookish_meetings','bookish_rsvps','bookish_votes','bookish_vote_options','bookish_page_log','bookish_notifications'])assert.equal((await f.as(outside,`select * from ${table} where club_id=$1`,[f.club])).length,0,table);
 await assert.rejects(f.as(outside,'select * from bookish_bring_items'),/permission/i);
 const ids=(await f.q("select id from bookish_takes where club_id=$1 and not hidden limit 1",[f.club]));await assert.rejects(f.rpc(outside,'bookish_message_card',['take',ids[0].id]),/unavailable/i);
 await f.q('update bookish_profiles set banned_at=now() where id=$1',[other]);await assert.rejects(f.feed(other),/club|member|join/i);assert.equal((await f.as(other,'select * from bookish_notifications')).length,0);
 await f.q('update bookish_profiles set banned_at=null where id=$1',[other]);
});
test('service moderation queues and card envelopes contain no take-author mappings',async()=>{
 await f.db.exec('set role service_role');try{for(const fn of ['bookish_review_queue','bookish_held_queue','bookish_content_report_queue'])noAuthor(await f.q(`select * from ${fn}()`));}finally{await f.db.exec('reset role');}
 const views=await f.q("select schemaname,viewname,definition from pg_views where schemaname='public' and viewname like 'bookish_%'");assert.ok(views.every(v=>!v.definition.includes('take_authors')));
 const functions=await f.q("select proname,pg_get_function_result(oid) result from pg_proc where pronamespace='public'::regnamespace and proname like 'bookish_%'");assert.ok(functions.every(x=>!x.result.includes('author_id')));
 const vote=(await f.q('select id from bookish_votes where club_id=$1 limit 1',[f.club]))[0].id;noAuthor(await f.rpc(host,'bookish_message_card',['vote',vote]));
});

test('upgrading historical signed takes clears names and removes every legacy author escape hatch',async()=>{
 const old=await fixture({migrations:false});try{
  await old.rpc(reader,'bookish_post_take',[old.club,'fourth-wing','A signed thought',true,0]);
  await old.rpc(other,'bookish_post_take',[old.club,'fourth-wing','x'.repeat(300),false,0]);
  const chapter=await old.rpc(reader,'bookish_post_take',[old.club,'fourth-wing','Legacy chapter secret',false,0,7]);
  for(const n of (await readdir('supabase/migrations')).sort())await old.db.exec(await readFile(`supabase/migrations/${n}`,'utf8'));
  const feed=await old.feed(host);assert.equal(feed.length,2);assert.equal(feed.find(t=>t.id===chapter.id).body,null);assert.equal(feed.find(t=>t.id===chapter.id).sealed,true);assert.equal(feed.find(t=>t.id===chapter.id).did_not_finish,false);assert.equal(feed.find(t=>t.id===chapter.id).page,(await old.q("select pages from bookish_books where id='fourth-wing'"))[0].pages);noAuthor(feed);assert.ok((await old.q('select anonymous,signed_name from bookish_takes')).every(t=>t.anonymous&&t.signed_name===null));
  await assert.rejects(old.service('bookish_escalate_author',[feed[0].id,'reviewer','Legal and safety access reason']),/does not exist|permission/i);
 }finally{await old.db.close();}
});
