import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,reader,other} from './helpers/tea-db.mjs';
const migrate=async f=>{for(const n of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await f.db.exec(await readFile(`supabase/migrations/${n}`,'utf8'));};

test('all migrations rerun without resetting reading consent, backups, or claims',async()=>{
 const f=await fixture();try{
  await f.rpc(reader,'bookish_share_reading',[f.club,true]);
  await f.rpc(reader,'bookish_reminder_preferences',[f.club,false]);
  const take=await f.post(reader,'Keep my sip',0);await f.rpc(other,'bookish_sip',[take.id,true]);
  await migrate(f);
  assert.equal((await f.rpc(reader,'bookish_reading_together',[f.club])).sharing,true);
  assert.equal((await f.q('select meeting_reminders from bookish_members where club_id=$1 and user_id=$2',[f.club,reader]))[0].meeting_reminders,false);
  assert.equal((await f.feed(other)).find(t=>t.id===take.id).sips,1);
 }finally{await f.db.close();}
});

test('legacy backup preserves original names, chapter markers, hides, and reactions across reruns',async()=>{
 const f=await fixture({migrations:false});try{
  const signed=await f.rpc(reader,'bookish_post_take',[f.club,'fourth-wing','Original signed take',true,3]);
  const chapter=await f.rpc(reader,'bookish_post_take',[f.club,'fourth-wing','A chapter marker',false,0,7]);
  const long=await f.rpc(other,'bookish_post_take',[f.club,'fourth-wing','x'.repeat(300),false,0]);
  await f.q("insert into bookish_take_reactions values($1,$2,'🔥')",[signed.id,other]);
  const original=(await f.q('select id,anonymous,signed_name,spoiler_chapter,spoiler_page,hidden from bookish_takes order by id'));
  const preflight=await f.q(await readFile('supabase/checks/bookish-tea-preflight.sql','utf8'));
  assert.deepEqual(preflight,[{signed_takes:1,chapter_tagged_takes:1,over_280_takes:1,reactions:1}]);
  await migrate(f);
  assert.deepEqual(await f.q('select id,anonymous,signed_name,spoiler_chapter,spoiler_page,hidden from bookish_private.tea_migration_backup_20261105 order by id'),original);
  const backup=await f.q('select * from bookish_private.tea_migration_backup_20261105 order by id');
  assert.equal(backup.find(t=>t.id===signed.id).reactions[0].reaction,'🔥');
  assert.equal((await f.q('select hidden,legacy_length_hidden from bookish_takes where id=$1',[long.id]))[0].hidden,false);
  assert.equal((await f.feed(host)).some(t=>t.id===long.id),false);
  await f.q('update bookish_takes set hidden=false where id=$1',[long.id]);assert.ok(!(await f.feed(host)).some(t=>t.id===long.id));
  await migrate(f);assert.deepEqual(await f.q('select * from bookish_private.tea_migration_backup_20261105 order by id'),backup);
  assert.equal((await f.q('select spoiler_chapter from bookish_private.tea_migration_backup_20261105 where id=$1',[chapter.id]))[0].spoiler_chapter,7);
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await f.q("select has_table_privilege($1,'bookish_private.tea_migration_backup_20261105','SELECT') allowed",[role]))[0].allowed,false);
  }
  assert.equal((await f.q("select relrowsecurity from pg_class where oid='bookish_private.tea_migration_backup_20261105'::regclass"))[0].relrowsecurity,true);
 }finally{await f.db.close();}
});

test('voluntary departure keeps anonymous Tea visible, while banned authors remain hidden',async()=>{
 const f=await fixture();try{
  const a=await f.post(reader,'A departing reader thought',0);await f.post(reader,'Another thought',0);
  const before=await f.feed(other);
  // The current API has no leave RPC. Deleting membership is the voluntary leave transition.
  await f.q('delete from bookish_members where club_id=$1 and user_id=$2',[f.club,reader]);
  assert.deepEqual(await f.feed(other),before);
  assert.equal((await f.rpc(other,'bookish_message_card',['take',a.id])).label,'Anonymous');
  await assert.rejects(f.feed(reader),/member|join|club/i);
  assert.equal((await f.q('select count(*)::int n from bookish_private.take_authors where author_id=$1',[reader]))[0].n,2);
  await f.q('update bookish_profiles set banned_at=now() where id=$1',[reader]);assert.equal((await f.feed(other)).length,0);
 }finally{await f.db.close();}
});

test('hidden bring claimants stay occupied without revealing their user ID or name',async()=>{
 const f=await fixture();try{
  const m=await f.rpc(host,'bookish_schedule_meeting',[f.club,new Date(Date.now()+86400000).toISOString(),'Reading','Venue',0]);
  const item=await f.rpc(host,'bookish_add_bring_item',[m,'Tea']);await f.rpc(reader,'bookish_claim_bring_item',[item,true]);
  await f.rpc(other,'bookish_content_action',['member',reader,'hide',null]);
  const hidden=(await f.rpc(other,'bookish_meeting_detail',[m])).bring_items[0];
  assert.equal(hidden.claimed,true);assert.equal(hidden.claimed_by,null);assert.equal(hidden.display_name,null);
  await assert.rejects(f.as(other,'select claimed_by from bookish_bring_items where id=$1',[item]),/permission/i);
  const visible=(await f.rpc(host,'bookish_meeting_detail',[m])).bring_items[0];assert.equal(visible.claimed_by,reader);assert.equal(visible.claimed,true);
 }finally{await f.db.close();}
});

test('notification visibility exposes only an owner-scoped public row check',async()=>{
 const f=await fixture();try{
  await f.post(reader,'An unsealed notice',0);
  const [n]=await f.rpc(other,'bookish_notifications');assert.ok(n);
  assert.equal(await f.rpc(other,'bookish_notification_visible',[n.id]),true);
  assert.equal(await f.rpc(reader,'bookish_notification_visible',[n.id]),false);
  assert.equal(await f.rpc(other,'bookish_notification_visible',[crypto.randomUUID()]),false);
  await assert.rejects(f.as(other,'select bookish_private.notification_visible($1,$2,$3)',[f.club,n.kind,n.target_id]),/permission/i);
  assert.equal((await f.as(other,'select * from bookish_notifications')).length,1);
 }finally{await f.db.close();}
});

test('RPC covers track cover edits without storing a generated book column',async()=>{
 const f=await fixture();try{
  const take=await f.post(reader,'Cover discussion',0);
  for(const cover of [12345,null]){
   await f.q("update bookish_books set cover_id=$1 where id='fourth-wing'",[cover]);
   const expected=cover===null?null:'https://covers.openlibrary.org/b/id/12345-L.jpg';
   assert.equal((await f.rpc(host,'bookish_reading_together',[f.club])).book.cover_url,expected);
   assert.equal((await f.rpc(host,'bookish_club_home',[f.club])).current_book.cover_url,expected);
   assert.equal((await f.rpc(host,'bookish_message_card',['take',take.id])).book.cover_url,expected);
  }
  assert.equal((await f.q("select count(*)::int n from pg_attribute where attrelid='bookish_books'::regclass and attname='cover_url' and attgenerated='s'"))[0].n,0);
 }finally{await f.db.close();}
});

test('notification storage retains explicit service-role CRUD with RLS enabled',async()=>{
 const f=await fixture();try{
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']){
   assert.equal((await f.q("select has_table_privilege('service_role','public.bookish_notifications',$1) allowed",[privilege]))[0].allowed,true,privilege);
  }
  assert.equal((await f.q("select relrowsecurity from pg_class where oid='bookish_notifications'::regclass"))[0].relrowsecurity,true);
 }finally{await f.db.close();}
});
