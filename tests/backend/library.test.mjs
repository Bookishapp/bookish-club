import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,reader,other,outside} from './helpers/tea-db.mjs';
let f;before(async()=>{f=await fixture();});after(()=>f?.db.close());
const library=u=>f.rpc(u,'bookish_library',[f.club]);
const rate=(u,hearts=4,take='',anonymous=true)=>f.rpc(u,'bookish_rate_book',[f.club,'fourth-wing',hearts,take,anonymous]);
test('ratings persist once per member and book, with an explicit attribution choice',async()=>{
 for(const hearts of [0,6,null])await assert.rejects(rate(reader,hearts),/heart|choose/i);
 await assert.rejects(rate(reader,4,'x',null),/attribution|anonymous|choose/i);
 await assert.rejects(rate(reader,4,'x'.repeat(281)),/280/i);
 await assert.rejects(rate(reader,4,'Email me at hello@example.com'),/personal|book/i);
 const row=await rate(reader,4,'A lovely book',true);assert.deepEqual(row.my_rating,{hearts:4,take:'A lovely book',anonymous:true});
 assert.equal((await library(reader)).books[0].my_rating.hearts,4);
 await rate(reader,5,'An updated thought',false);assert.equal((await library(reader)).books[0].my_rating.hearts,5);
 assert.equal((await f.q('select count(*)::int n from bookish_private.book_ratings where user_id=$1',[reader]))[0].n,1);
});
test('only members can use library APIs, anonymous and raw data access are denied',async()=>{
 for(const name of ['bookish_library','bookish_recommendations'])await assert.rejects(f.rpc(outside,name,[f.club]),/join|club|member/i);
 await assert.rejects(rate(outside),/join|club|member/i);
 await assert.rejects(f.rpc(reader,'bookish_rate_book',[f.club,'yellowface',4,'',true]),/club book/i);
 for(const u of [reader,host])await assert.rejects(f.as(u,'select * from bookish_private.book_ratings'),/permission/i);
 await f.db.exec('set role anon');try{await assert.rejects(f.q('select public.bookish_library($1)',[f.club]),/permission/i);}finally{await f.db.exec('reset role');}
});
test('shelf keeps current and historical books, returns only own score, and protects small aggregates',async()=>{
 let shelf=await library(host);assert.equal(shelf.books[0].mean_hearts,null);assert.equal(shelf.books[0].my_rating,null);assert.equal(shelf.books[0].favorite_take,null);
 await f.rpc(host,'bookish_finish_book',[f.club,'fourth-wing']);await f.rpc(host,'bookish_set_current_book',[f.club,'yellowface']);
 shelf=await library(host);assert.equal(shelf.books[0].book.id,'yellowface');const old=shelf.books.find(b=>b.book.id==='fourth-wing');assert.equal(old.status,'finished');assert.equal(old.favorite_take.body,'An updated thought');assert.equal(old.favorite_take.attribution,'Reader');
 const serialized=JSON.stringify(shelf);assert.ok(!serialized.includes(reader));assert.ok(!serialized.includes('user_id'));assert.ok(!serialized.includes('"hearts":5'));
 await rate(reader,4,'An anonymous thought',true);assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take.attribution,'Anonymous');
});
test('blocked, banned, and departed members cannot surface shelf takes',async()=>{
 await f.rpc(host,'bookish_content_action',['member',reader,'block',null]);assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 await f.q('delete from bookish_private.actor_blocks');await f.q('delete from bookish_private.content_hides');
 await f.q('update bookish_profiles set banned_at=now() where id=$1',[reader]);assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);await assert.rejects(library(reader),/join|club/i);
 await f.q('update bookish_profiles set banned_at=null where id=$1',[reader]);await f.q('delete from bookish_members where club_id=$1 and user_id=$2',[f.club,reader]);assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 await f.q("insert into bookish_members(club_id,user_id) values($1,$2)",[f.club,reader]);
});
test('rating take safety actions stay scoped and support moderation without exposing authors',async()=>{
 const row=await rate(reader,4,'A shelf thought',true);const tid=row.favorite_take.id;
 await assert.rejects(f.rpc(outside,'bookish_rating_action',[tid,'block',null]),/join|club|member/i);
 await f.rpc(host,'bookish_rating_action',[tid,'report','Please review this take']);
 assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 let report;await f.db.exec('set role service_role');try{report=(await f.q("select * from public.bookish_content_report_queue() where kind='rating' and target_id=$1",[tid]))[0];}finally{await f.db.exec('reset role');}
 assert.ok(report);assert.ok(!JSON.stringify(report).includes(reader));
 await f.service('bookish_review_content',[report.id,'hide','Safety reviewer','Reviewed the reported shelf take.']);
 assert.equal((await library(other)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 // Updating a moderated take preserves its identity and cannot escape removal.
 await rate(reader,4,'An edited shelf thought',true);assert.equal((await library(other)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 await f.q("delete from bookish_private.content_removals where kind='rating' and target_id=$1",[tid]);
 await f.q("delete from bookish_private.content_hides where kind='rating' and target_id=$1",[tid]);
 await f.rpc(host,'bookish_rating_action',[tid,'block',null]);
 await rate(reader,5,'A later thought',false);assert.equal((await library(host)).books.find(b=>b.book.id==='fourth-wing').favorite_take,null);
 await f.q('delete from bookish_private.actor_blocks');await f.q("delete from bookish_private.content_hides where kind='rating'");
});
test('recommendations are honestly empty without established independent rating cohorts',async()=>{
 assert.deepEqual(await f.rpc(host,'bookish_recommendations',[f.club]),[]);
});
async function addReaders(club,prefix,count=5){
 const ids=[];for(let i=0;i<count;i++){const id=`${prefix}00000-0000-0000-0000-00000000000${i}`;ids.push(id);await f.q(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"app":"bookish"}')`,[id,`${prefix}-${i}@example.test`]);await f.rpc(id,'bookish_accept_terms',['2026-10-15',true]);await f.q("insert into bookish_members(club_id,user_id,joined_at) values($1,$2,now()-interval '30 days')",[club,id]);}return ids;
}
test('recommendations use opted-in ratings from three independent established clubs, without identities',async()=>{
 const own=await addReaders(f.club,'920');for(const u of own)await rate(u,4);
 const summary=(await library(host)).books.find(b=>b.book.id==='fourth-wing');assert.equal(summary.rated_count,6);assert.equal(summary.mean_hearts,4.2);
 const clubs=[];for(const [i,prefix] of ['930','940','950'].entries()){
 const cid=crypto.randomUUID();clubs.push(cid);await f.q("insert into bookish_clubs(id,name,city,state,visibility) values($1,$2,'Austin','TX','open')",[cid,`Cohort ${i}`]);
 const ids=await addReaders(cid,prefix);await f.q("insert into bookish_club_books(club_id,book_id,status,finished_at) values($1,'fourth-wing','finished',current_date),($1,'yellowface','finished',current_date)",[cid]);
 for(const u of ids){await f.rpc(u,'bookish_rate_book',[cid,'fourth-wing',4,'',true]);await f.rpc(u,'bookish_rate_book',[cid,'yellowface',5,'',true]);}
 }
 // Our current/history books are excluded even if a cohort loves them.
 assert.deepEqual(await f.rpc(host,'bookish_recommendations',[f.club]),[]);
 await f.q("delete from bookish_club_books where club_id=$1 and book_id='yellowface'",[f.club]);
 const recs=await f.rpc(host,'bookish_recommendations',[f.club]);assert.equal(recs.length,1);assert.equal(recs[0].book.id,'yellowface');assert.equal(recs[0].mean_hearts,5);assert.equal(recs[0].clubs,3);assert.equal(recs[0].because_book.id,'fourth-wing');
 const serialized=JSON.stringify(recs);for(const id of [...clubs,...own])assert.ok(!serialized.includes(id));assert.ok(!serialized.includes('user_id'));
 // Removing one club from public sharing drops the aggregate below the floor.
 await f.q('update bookish_members set ratings_public=false where club_id=$1',[clubs[0]]);assert.deepEqual(await f.rpc(host,'bookish_recommendations',[f.club]),[]);
 await f.q('update bookish_members set ratings_public=true where club_id=$1',[clubs[0]]);
 // Shared membership cannot manufacture an independent club.
 await f.q('insert into bookish_members(club_id,user_id) values($1,$2)',[clubs[0],own[0]]);assert.deepEqual(await f.rpc(host,'bookish_recommendations',[f.club]),[]);
});
test('profile deletion cascades rating text and attribution data',async()=>{
 await f.q('delete from auth.users where id=$1',[reader]);assert.equal((await f.q('select count(*)::int n from bookish_private.book_ratings where user_id=$1',[reader]))[0].n,0);
});
