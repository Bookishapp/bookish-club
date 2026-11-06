import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,reader,other,outside} from './helpers/tea-db.mjs';
let f;before(async()=>{f=await fixture();});after(()=>f?.db.close());
const reminderTime=new Date(Date.now()+24*3600000).toISOString();
const tomorrow=()=>reminderTime;
async function meeting(time=tomorrow()){return f.rpc(host,'bookish_schedule_meeting',[f.club,time,'Reading night','PRIVATE VENUE',100]);}
test('day-before claims include only current Yes and Maybe members with reminders enabled',async()=>{
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);await f.rpc(other,'bookish_rsvp',[m,'maybe']);await f.rpc(host,'bookish_rsvp',[m,'cant']);
 await f.rpc(other,'bookish_reminder_preferences',[f.club,false]);
 const batch=await f.service('bookish_claim_reminders');assert.equal(batch.length,1);assert.equal(batch[0].meeting_id,m);assert.equal(batch[0].email,'tea1@example.test');assert.ok(batch[0].lease);assert.ok(!('author_id' in batch[0]));
 assert.equal((await f.service('bookish_claim_reminders')).length,0);
 const row=await f.service('bookish_prepare_reminder',[batch[0].id,batch[0].lease]);assert.equal(row.meeting_id,m);assert.equal(row.location,'PRIVATE VENUE');
 await f.service('bookish_complete_reminder',[batch[0].id,batch[0].lease]);assert.equal((await f.service('bookish_claim_reminders')).length,0);
 assert.ok((await f.rpc(reader,'bookish_notifications')).some(n=>n.kind==='meeting_reminder'&&n.target_id===m));
 await assert.rejects(f.rpc(reader,'bookish_claim_reminders'),/permission/i);await assert.rejects(f.rpc(reader,'bookish_prepare_reminder',[batch[0].id,batch[0].lease]),/permission/i);
});
test('expired leases retry safely, stale tokens fail, and opt-out is rechecked immediately before delivery',async()=>{
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'maybe']);const [a]=await f.service('bookish_claim_reminders');
 await f.q("update bookish_private.meeting_reminders set leased_at=now()-interval '11 minutes' where id=$1",[a.id]);const [b]=await f.service('bookish_claim_reminders');assert.equal(a.id,b.id);assert.notEqual(a.lease,b.lease);assert.ok(a.calendar_generated_at);assert.equal(a.calendar_generated_at,b.calendar_generated_at);
 assert.equal(await f.service('bookish_prepare_reminder',[a.id,a.lease]),null);
 await assert.rejects(f.service('bookish_complete_reminder',[a.id,a.lease]),/lease/i);
 await f.rpc(reader,'bookish_reminder_preferences',[f.club,false]);assert.equal(await f.service('bookish_prepare_reminder',[b.id,b.lease]),null);await f.rpc(reader,'bookish_reminder_preferences',[f.club,true]);
 await f.q("update bookish_private.meeting_reminders set sent_at=now() where id=$1",[a.id]);
});
test('past, cancelled, distant, and removed members never receive reminders or calendar data',async()=>{
 for(const time of [new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+4*86400000).toISOString()]){const m=await meeting(time);await f.q("insert into bookish_rsvps values($1,$2,$3,'going')",[m,f.club,reader]);}
 const cancelled=await meeting();await f.rpc(reader,'bookish_rsvp',[cancelled,'yes']);await f.rpc(host,'bookish_edit_meeting',[cancelled,tomorrow(),'Cancelled','PRIVATE VENUE',0,true]);
 assert.equal((await f.service('bookish_claim_reminders')).length,0);
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);const [claim]=await f.service('bookish_claim_reminders');await f.rpc(host,'bookish_remove_member',[f.club,reader]);
 assert.equal(await f.service('bookish_prepare_reminder',[claim.id,claim.lease]),null);await assert.rejects(f.rpc(reader,'bookish_meeting_calendar',[m]),/member|join|club/i);await assert.rejects(f.rpc(outside,'bookish_meeting_calendar',[m]),/member|join|club/i);
 assert.ok(!JSON.stringify(await f.rpc(reader,'bookish_notifications')).includes(m));
 await assert.rejects(f.as(host,'select * from bookish_private.meeting_reminders'),/permission/i);
 const calendar=await f.rpc(host,'bookish_meeting_calendar',[m]);assert.equal(calendar.location,'PRIVATE VENUE');await assert.rejects(f.rpc(host,'bookish_meeting_calendar',[cancelled]),/meeting|cancel/i);
});
test('rescheduling invalidates a claimed payload, and retries stop before the provider dedupe window ends',async()=>{
 await f.q("delete from bookish_private.club_removals where club_id=$1 and user_id=$2",[f.club,reader]);const inv=await f.rpc(host,'bookish_create_invite',[f.club,10,7]);await f.rpc(reader,'bookish_redeem_invite',[inv]);
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);const [claim]=await f.service('bookish_claim_reminders');
 await f.rpc(host,'bookish_edit_meeting',[m,new Date(Date.now()+5*86400000).toISOString(),'Moved','New venue',100,false]);assert.equal(await f.service('bookish_prepare_reminder',[claim.id,claim.lease]),null);
 await f.q("update bookish_private.meeting_reminders set first_attempt_at=now()-interval '23 hours',leased_at=now()-interval '1 hour' where id=$1",[claim.id]);assert.equal((await f.service('bookish_claim_reminders')).length,0);
});
test('a batch limit cannot starve the 501st eligible reminder behind existing delivery rows',async()=>{
 const m=await meeting();
 await f.q(`insert into auth.users(id,email,raw_app_meta_data) select gen_random_uuid(),'bulk-'||n||'@example.test','{"app":"bookish"}' from generate_series(1,501) n`);
 await f.q("insert into bookish_members(club_id,user_id) select $1,id from auth.users where email like 'bulk-%'",[f.club]);
 await f.q("insert into bookish_rsvps select $1,$2,id,'going' from auth.users where email like 'bulk-%'",[m,f.club]);
 assert.equal((await f.service('bookish_claim_reminders')).length,50);assert.equal((await f.q('select count(*)::int n from bookish_private.meeting_reminders where meeting_id=$1',[m]))[0].n,500);
 assert.equal((await f.service('bookish_claim_reminders')).length,50);assert.equal((await f.q('select count(*)::int n from bookish_private.meeting_reminders where meeting_id=$1',[m]))[0].n,501);
 await f.q('delete from auth.users where email like \'bulk-%\'');
});
test('last-minute cancellation, RSVP changes, and bans invalidate a claimed reminder',async()=>{
 for(const change of ['cancel','cant','ban']){
  const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);const batch=await f.service('bookish_claim_reminders');const claim=batch.find(x=>x.meeting_id===m);
  if(change==='cancel')await f.rpc(host,'bookish_edit_meeting',[m,tomorrow(),'Cancelled','Venue',100,true]);
  if(change==='cant')await f.rpc(reader,'bookish_rsvp',[m,'cant']);
  if(change==='ban')await f.q('update bookish_profiles set banned_at=now() where id=$1',[reader]);
  assert.equal(await f.service('bookish_prepare_reminder',[claim.id,claim.lease]),null);
  await f.q('update bookish_profiles set banned_at=null where id=$1',[reader]);
  await f.q('update bookish_private.meeting_reminders set sent_at=now() where id=$1',[claim.id]);
 }
});
test('never-attempted queued reminders refresh when the host edits the meeting title',async()=>{
 const m=await meeting();await f.q(`insert into auth.users(id,email,raw_app_meta_data) select gen_random_uuid(),'refresh-'||n||'@example.test','{"app":"bookish"}' from generate_series(1,51) n`);
 await f.q("insert into bookish_members(club_id,user_id) select $1,id from auth.users where email like 'refresh-%'",[f.club]);await f.q("insert into bookish_rsvps select $1,$2,id,'going' from auth.users where email like 'refresh-%'",[m,f.club]);
 const batch=await f.service('bookish_claim_reminders');assert.equal(batch.length,50);
 await f.q('update bookish_private.meeting_reminders set sent_at=now() where meeting_id=$1 and leased_at is not null',[m]);
 await f.rpc(host,'bookish_edit_meeting',[m,tomorrow(),'Updated meeting title','Venue',100,false]);
 const next=await f.service('bookish_claim_reminders');assert.equal(next.length,1);assert.equal(next[0].title,'Updated meeting title');
 await f.q("delete from auth.users where email like 'refresh-%'");
});
test('rescheduling a never-attempted queued row creates one fresh delivery without refreshing the old time',async()=>{
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);
 await f.q('insert into bookish_private.meeting_reminders(meeting_id,club_id,user_id,starts_at,payload) select id,club_id,$2,starts_at,bookish_private.reminder_payload(id,$2) from bookish_meetings where id=$1',[m,reader]);
 await f.rpc(host,'bookish_edit_meeting',[m,new Date(new Date(tomorrow()).getTime()+3600000).toISOString(),'Moved one hour','Venue',100,false]);
 const batch=await f.service('bookish_claim_reminders');assert.equal(batch.filter(x=>x.meeting_id===m).length,1);
});

test('a meeting six hours away never receives a day-before reminder',async()=>{
 const m=await meeting(new Date(Date.now()+6*3600000).toISOString());await f.rpc(reader,'bookish_rsvp',[m,'yes']);
 assert.ok(!(await f.service('bookish_claim_reminders')).some(r=>r.meeting_id===m));
 assert.equal((await f.q('select id from bookish_private.meeting_reminders where meeting_id=$1',[m])).length,0);
});
test('location edits invalidate a leased calendar attachment',async()=>{
 const m=await meeting();await f.rpc(reader,'bookish_rsvp',[m,'yes']);
 const claim=(await f.service('bookish_claim_reminders')).find(r=>r.meeting_id===m);
 await f.rpc(host,'bookish_edit_meeting',[m,tomorrow(),'Reading night','Changed venue',100,false]);
 assert.equal(await f.service('bookish_prepare_reminder',[claim.id,claim.lease]),null);
});

test('reminder eligibility uses a 20 to 30 hour window rather than UTC dates',async()=>{
 for(const hours of [6,19,31,40]){
  const m=await meeting(new Date(Date.now()+hours*3600000).toISOString());await f.rpc(reader,'bookish_rsvp',[m,'yes']);
  assert.ok(!(await f.service('bookish_claim_reminders')).some(r=>r.meeting_id===m),`${hours} hours away`);
 }
});
test('claim scan excludes historical meetings and opted-out members before computing payloads',async()=>{
 const local=await fixture();try{
  const valid=await local.rpc(host,'bookish_schedule_meeting',[local.club,tomorrow(),'Valid','Venue',0]);
  for(const hours of [-24,72])await local.rpc(host,'bookish_schedule_meeting',[local.club,new Date(Date.now()+hours*3600000).toISOString(),'Outside window','Venue',0]);
  const cancelled=await local.rpc(host,'bookish_schedule_meeting',[local.club,tomorrow(),'Cancelled','Venue',0]);await local.q("update bookish_meetings set status='cancelled' where id=$1",[cancelled]);
  await local.rpc(reader,'bookish_rsvp',[valid,'yes']);await local.rpc(other,'bookish_reminder_preferences',[local.club,false]);
  await local.db.exec(`alter function bookish_private.reminder_payload(uuid,uuid) rename to original_reminder_payload;
   create function bookish_private.reminder_payload(mid uuid,uid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
   begin
    if exists(select 1 from public.bookish_meetings where id=mid and (status<>'scheduled' or starts_at<clock_timestamp() or starts_at>clock_timestamp()+interval '2 days'))
     or exists(select 1 from public.bookish_members where user_id=uid and not meeting_reminders)
    then raise exception 'Payload evaluated before candidate filter';end if;
    return bookish_private.original_reminder_payload(mid,uid);
   end $$;`);
  const batch=await local.service('bookish_claim_reminders');assert.equal(batch.length,1);assert.equal(batch[0].meeting_id,valid);
 }finally{await local.db.close();}
});
